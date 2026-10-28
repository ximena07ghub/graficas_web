import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

const paginas = new Set([
    "index.html",
    "dashboard.html",
    "loading.html",
    "juego.html",
    "ajustes.html",
    "perfil.html",
    "reglas.html",
    "puntuaciones.html",
    "privacidad.html",
    "eliminacion-datos.html",
    "terminos.html"
]);

app.disable("x-powered-by");
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/public", express.static(path.join(__dirname, "public"))); // aqui esta mi carpeta publica donde estann los modelos jj
app.use("/vendor/three", express.static(path.join(__dirname, "node_modules", "three")));



app.get("/api/status", (_req, res) => {
    res.json({
        ok: true,
        proyecto: "Fleet Command",
        servidor: "Express + Socket.IO",
        puerto: PORT
    });
});

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/:pagina", (req, res, next) => {
    if (!paginas.has(req.params.pagina)) return next();
    res.sendFile(path.join(__dirname, req.params.pagina));
});

app.use((_req, res) => {
    res.status(404).send("Recurso no encontrado.");
});

const salas = new Map();
const TIEMPO_RECONEXION_MS = 30 * 1000;
const RETENCION_SALA_MS = 2 * 60 * 1000;

// Una sala replica el mode de jugador al que se une a la sala

const CONFIGURACION_DEFECTO = Object.freeze({
    rival: "online",
    modo: "rafaga",
    mapa: "playa",
    dificultad: "normal"
});

function normalizarConfiguracion(valor = {}) {
    const configuracion = valor && typeof valor === "object" ? valor : {};

    return {
        //  sala

        rival: "online",
        modo: ["clasico", "rafaga"].includes(configuracion.modo)
            ? configuracion.modo
            : CONFIGURACION_DEFECTO.modo,
        mapa: ["playa", "tormenta", "artico"].includes(configuracion.mapa)
            ? configuracion.mapa
            : CONFIGURACION_DEFECTO.mapa,
        dificultad: ["normal", "dificil"].includes(configuracion.dificultad)
            ? configuracion.dificultad
            : CONFIGURACION_DEFECTO.dificultad
    };
}

function crearCodigoSala() {
    const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let codigo = "";

    do {
        codigo = Array.from({ length: 5 }, () =>
            alfabeto[Math.floor(Math.random() * alfabeto.length)]
        ).join("");
    } while (salas.has(codigo));

    return codigo;
}

function normalizarCodigo(valor) {
    return String(valor || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function normalizarClienteId(valor, socketId) {
    return String(valor || socketId).trim().slice(0, 80) || socketId;
}

function datosSala(codigo) {
    const sala = salas.get(codigo);
    if (!sala) return null;

    return {
        codigo,
        configuracion: { ...sala.configuracion },
        jugadores: [...sala.jugadores.values()]
            .filter((jugador) => jugador.conectado)
            .map((jugador) => ({
                socketId: jugador.socketId,
                nombre: jugador.nombre,
                slot: jugador.slot,
                listo: true
            }))
    };
}

function publicarSala(codigo) {
    const datos = datosSala(codigo);
    if (datos) io.to(codigo).emit("sala:estado", datos);
}

function cancelarEliminacionSala(sala) {
    if (!sala?.timerEliminacion) return;
    clearTimeout(sala.timerEliminacion);
    sala.timerEliminacion = null;
}

function programarEliminacionSala(codigo, sala) {
    cancelarEliminacionSala(sala);
    sala.timerEliminacion = setTimeout(() => {
        const actual = salas.get(codigo);
        if (actual && actual.jugadores.size === 0) {
            salas.delete(codigo);
            console.log(`[SALA] ${codigo} eliminada por inactividad.`);
        }
    }, RETENCION_SALA_MS);
}

function cancelarSalidaJugador(jugador) {
    if (!jugador?.timerSalida) return;
    clearTimeout(jugador.timerSalida);
    jugador.timerSalida = null;
}

function programarSalidaJugador(codigo, clienteId, jugador) {
    cancelarSalidaJugador(jugador);

    jugador.timerSalida = setTimeout(() => {
        const sala = salas.get(codigo);
        const actual = sala?.jugadores.get(clienteId);
        if (!sala || !actual || actual.conectado) return;

        sala.jugadores.delete(clienteId);
        publicarSala(codigo);

        if (sala.jugadores.size === 0) {
            programarEliminacionSala(codigo, sala);
        }
    }, TIEMPO_RECONEXION_MS);
}

function salirDeSala(socket, inmediato = false) {
    const codigo = socket.data.sala;
    const clienteId = socket.data.clienteId;
    if (!codigo || !clienteId || !salas.has(codigo)) return;

    const sala = salas.get(codigo);
    const jugador = sala.jugadores.get(clienteId);

    socket.leave(codigo);
    socket.data.sala = null;
    socket.data.slot = null;

    if (!jugador || jugador.socketId !== socket.id) return;

    if (inmediato) {
        cancelarSalidaJugador(jugador);
        sala.jugadores.delete(clienteId);
    } else {
        jugador.conectado = false;
        jugador.socketId = null;
        programarSalidaJugador(codigo, clienteId, jugador);
    }

    publicarSala(codigo);

    if (sala.jugadores.size === 0) {
        programarEliminacionSala(codigo, sala);
    }
}

function unirJugador(socket, codigo, nombre, clienteIdRecibido) {
    const sala = salas.get(codigo);
    if (!sala) {
        return { ok: false, mensaje: "La sala no existe. Verifica el código y vuelve a intentarlo." };
    }

    const clienteId = normalizarClienteId(clienteIdRecibido, socket.id);
    const existente = sala.jugadores.get(clienteId);

    // Si la misma pestaña se reconecta, recupera su mismo lugar en la sala

    if (existente) {
        cancelarSalidaJugador(existente);
        cancelarEliminacionSala(sala);

        const socketAnterior = existente.socketId ? io.sockets.sockets.get(existente.socketId) : null;
        if (socketAnterior && socketAnterior.id !== socket.id) {
            socketAnterior.leave(codigo);
            socketAnterior.data.sala = null;
            socketAnterior.data.slot = null;
        }

        existente.socketId = socket.id;
        existente.nombre = String(nombre || existente.nombre).trim().slice(0, 24) || existente.nombre;
        existente.conectado = true;

        socket.join(codigo);
        socket.data.sala = codigo;
        socket.data.slot = existente.slot;
        socket.data.clienteId = clienteId;

        publicarSala(codigo);
        console.log(`[SALA] ${codigo}: J${existente.slot} reconectado.`);
        return {
            ok: true,
            codigo,
            slot: existente.slot,
            socketId: socket.id,
            recuperada: true,
            configuracion: { ...sala.configuracion }
        };
    }

    if (sala.jugadores.size >= 2) {
        return { ok: false, mensaje: "La sala ya tiene dos jugadores." };
    }

    // Si estaba en otra sala sale de ella antes de entrar a la nueva

    if (socket.data.sala && socket.data.sala !== codigo) {
        salirDeSala(socket, true);
    }

    cancelarEliminacionSala(sala);

    const slotsUsados = new Set([...sala.jugadores.values()].map((j) => j.slot));
    const slot = slotsUsados.has(1) ? 2 : 1;
    const jugador = {
        clienteId,
        socketId: socket.id,
        nombre: String(nombre || `Jugador ${slot}`).trim().slice(0, 24) || `Jugador ${slot}`,
        slot,
        conectado: true,
        timerSalida: null
    };

    sala.jugadores.set(clienteId, jugador);
    socket.join(codigo);
    socket.data.sala = codigo;
    socket.data.slot = slot;
    socket.data.clienteId = clienteId;

    publicarSala(codigo);
    console.log(`[SALA] ${codigo}: J${slot} conectado (${jugador.nombre}).`);
    return {
        ok: true,
        codigo,
        slot,
        socketId: socket.id,
        configuracion: { ...sala.configuracion }
    };
}

//NUESTRA CONEXION SOCEKT 

io.on("connection", (socket) => {
    socket.emit("servidor:conectado", { socketId: socket.id });

    socket.on("sala:crear", (datos = {}, responder = () => {}) => {
        const codigo = crearCodigoSala();
        salas.set(codigo, {
            jugadores: new Map(),
            timerEliminacion: null,
            configuracion: normalizarConfiguracion(datos.configuracion)
        });
        console.log(`[SALA] creada ${codigo}.`);
        responder(unirJugador(socket, codigo, datos.nombre, datos.clienteId));
    });

    socket.on("sala:unirse", (datos = {}, responder = () => {}) => {
        const codigo = normalizarCodigo(datos.codigo);
        if (!codigo) {
            responder({ ok: false, mensaje: "Escribe un código de sala." });
            return;
        }

        responder(unirJugador(socket, codigo, datos.nombre, datos.clienteId));
    });

    socket.on("sala:salir", (_datos, responder = () => {}) => {
        salirDeSala(socket, true);
        responder({ ok: true });
    });

    socket.on("juego:estadoBarco", (estado = {}) => {
        const codigo = socket.data.sala;
        if (!codigo) return;

        const limpio = {
            propietario: socket.data.slot,
            barcoId: String(estado.barcoId || "").slice(0, 40),
            x: Number(estado.x) || 0,
            y: Number(estado.y) || 0,
            z: Number(estado.z) || 0,
            rotY: Number(estado.rotY) || 0
        };

        socket.to(codigo).emit("juego:estadoBarco", limpio);
    });

    socket.on("juego:sincronizarFlota", (flota = []) => {
        const codigo = socket.data.sala;
        if (!codigo || !Array.isArray(flota)) return;

        const limpia = flota.slice(0, 8).map((estado) => ({
            propietario: socket.data.slot,
            barcoId: String(estado.barcoId || "").slice(0, 40),
            x: Number(estado.x) || 0,
            y: Number(estado.y) || 0,
            z: Number(estado.z) || 0,
            rotY: Number(estado.rotY) || 0
        }));

        socket.to(codigo).emit("juego:sincronizarFlota", limpia);
    });

    socket.on("juego:seleccionCasilla", (datos = {}) => {
        const codigo = socket.data.sala;
        if (!codigo) return;

        socket.to(codigo).emit("juego:seleccionCasilla", {
            propietario: socket.data.slot,
            columna: Number(datos.columna) || 0,
            fila: Number(datos.fila) || 0
        });
    });

    socket.on("juego:pausa", (pausado) => {
        const codigo = socket.data.sala;
        if (!codigo) return;
        socket.to(codigo).emit("juego:pausaRival", Boolean(pausado));
    });

    socket.on("disconnect", () => salirDeSala(socket, false));
});

httpServer.listen(PORT, () => {
    console.log(`Fleet Command disponible en http://localhost:${PORT}`);
});
