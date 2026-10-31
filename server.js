
import express from "express";
import http from "node:http";
import path from "node:path";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

import {
    crearMotorPartida,
    estadoPublico,
    flotaPropia,
    registrarFlota,
    disparar,
    resultadoPartida
} from "./motorPartida.js";

const __dirname = path.dirname(
    fileURLToPath(import.meta.url)
);

const PORT = Number(process.env.PORT) || 3000;

const PHP_URL = process.env.FLEET_PHP_URL ||
    "http://127.0.0.1/WebServices/guardar_puntaje.php";

const INTERNAL_KEY = process.env.FLEET_INTERNAL_KEY || "";

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// Páginas permitidas del sitio.
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

// Carpetas públicas necesarias para el frontend.
for (const carpeta of ["css", "js", "assets", "public"]) {
    app.use(
        `/${carpeta}`,
        express.static(path.join(__dirname, carpeta))
    );
}

app.use(
    "/vendor/three",
    express.static(
        path.join(__dirname, "node_modules", "three")
    )
);

app.get("/api/status", (_req, res) => {
    res.json({
        ok: true,
        proyecto: "Fleet Command",
        servidor: "Express + Socket.IO"
    });
});

app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/:pagina", (req, res, next) => {
    if (!paginas.has(req.params.pagina)) {
        return next();
    }

    res.sendFile(
        path.join(__dirname, req.params.pagina)
    );
});

app.use((_req, res) => {
    res.status(404).send("Recurso no encontrado.");
});

// Salas activas almacenadas en memoria.
const salas = new Map();

const TIEMPO_RECONEXION_MS = 30_000;
const RETENCION_SALA_MS = 120_000;

const CONFIG_DEFECTO = {
    rival: "online",
    modo: "clasico",
    mapa: "playa",
    dificultad: "normal"
};

function normalizarConfiguracion(valor = {}) {
    return {
        rival: "online",

        modo: ["clasico", "rafaga"].includes(valor?.modo)
            ? valor.modo
            : CONFIG_DEFECTO.modo,

        mapa: ["playa", "tormenta", "artico"].includes(valor?.mapa)
            ? valor.mapa
            : CONFIG_DEFECTO.mapa,

        dificultad: ["normal", "dificil"].includes(
            valor?.dificultad
        )
            ? valor.dificultad
            : CONFIG_DEFECTO.dificultad
    };
}

function crearCodigoSala() {
    const caracteres =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let codigo;

    do {
        codigo = Array.from(
            { length: 5 },
            () => caracteres[randomInt(caracteres.length)]
        ).join("");
    } while (salas.has(codigo));

    return codigo;
}

function normalizarNombre(nombre) {
    if (typeof nombre !== "string") return null;

    const limpio = nombre.trim();

    return /^[\p{L}\p{N}_ .-]{3,24}$/u.test(limpio)
        ? limpio
        : null;
}

function normalizarClienteId(valor) {
    return typeof valor === "string" &&
        /^[a-zA-Z0-9-]{20,80}$/.test(valor)
            ? valor
            : null;
}

// Datos públicos de la sala.
function estadoSala(sala) {
    return {
        codigo: sala.codigo,
        configuracion: { ...sala.configuracion },

        jugadores: [...sala.jugadores.values()]
            .filter(jugador => jugador.conectado)
            .map(({ nombre, slot }) => ({
                nombre,
                slot,
                listo: Boolean(sala.partida.flotas[slot])
            })),

        estadoJuego: estadoPublico(sala.partida),
        guardado: sala.guardado
    };
}

function publicarSala(sala) {
    io.to(sala.codigo).emit(
        "sala:estado",
        estadoSala(sala)
    );
}

function cancelarTemporizador(jugador) {
    if (jugador?.timerSalida) {
        clearTimeout(jugador.timerSalida);
    }

    if (jugador) {
        jugador.timerSalida = null;
    }
}

function programarEliminarSala(sala) {
    if (sala.timerEliminacion) {
        clearTimeout(sala.timerEliminacion);
    }

    sala.timerEliminacion = setTimeout(() => {
        if (sala.jugadores.size === 0) {
            salas.delete(sala.codigo);
        }
    }, RETENCION_SALA_MS);
}

function cancelarPartidaPorAbandono(sala) {
    if (sala.partida.fase !== "en_curso") return;

    sala.partida.fase = "cancelada";

    io.to(sala.codigo).emit(
        "juego:estado",
        estadoPublico(sala.partida)
    );
}

function salirDeSala(socket, inmediato = false) {
    const sala = salas.get(socket.data.sala);

    const jugador = sala?.jugadores.get(
        socket.data.clienteId
    );

    if (
        !sala ||
        !jugador ||
        jugador.socketId !== socket.id
    ) {
        return;
    }

    socket.leave(sala.codigo);
    socket.data.sala = null;
    socket.data.slot = null;

    if (inmediato) {
        cancelarTemporizador(jugador);
        sala.jugadores.delete(jugador.clienteId);
        cancelarPartidaPorAbandono(sala);
    } else {
        jugador.conectado = false;
        jugador.socketId = null;

        cancelarTemporizador(jugador);

        jugador.timerSalida = setTimeout(() => {
            if (jugador.conectado) return;

            sala.jugadores.delete(jugador.clienteId);
            cancelarPartidaPorAbandono(sala);
            publicarSala(sala);

            if (sala.jugadores.size === 0) {
                programarEliminarSala(sala);
            }
        }, TIEMPO_RECONEXION_MS);
    }

    publicarSala(sala);

    if (sala.jugadores.size === 0) {
        programarEliminarSala(sala);
    }
}

// Admite o reconecta un jugador.
function unirJugador(
    socket,
    codigo,
    nombreRecibido,
    idRecibido
) {
    const sala = salas.get(codigo);

    const nombre = normalizarNombre(nombreRecibido);
    const clienteId = normalizarClienteId(idRecibido);

    if (!sala) {
        return {
            ok: false,
            mensaje: "La sala no existe."
        };
    }

    if (!nombre || !clienteId) {
        return {
            ok: false,
            mensaje: "Nombre o sesión inválidos."
        };
    }

    const existente = sala.jugadores.get(clienteId);

    if (
        !existente &&
        sala.partida.fase !== "colocando"
    ) {
        return {
            ok: false,
            mensaje: "La partida ya comenzó."
        };
    }

    if (!existente && sala.jugadores.size >= 2) {
        return {
            ok: false,
            mensaje: "La sala está llena."
        };
    }

    const nombreDuplicado = [
        ...sala.jugadores.values()
    ].some(jugador =>
        jugador.clienteId !== clienteId &&
        jugador.nombre.toLowerCase() === nombre.toLowerCase()
    );

    if (nombreDuplicado) {
        return {
            ok: false,
            mensaje: "Cada jugador necesita otro nombre."
        };
    }

    if (existente && existente.nombre !== nombre) {
        return {
            ok: false,
            mensaje: "Reconecta con el mismo nombre."
        };
    }

    // Abandona la sala anterior, si corresponde.
    if (
        socket.data.sala &&
        socket.data.sala !== codigo
    ) {
        salirDeSala(socket, true);
    }

    if (sala.timerEliminacion) {
        clearTimeout(sala.timerEliminacion);
    }

    sala.timerEliminacion = null;

    let jugador = existente;

    if (jugador) {
        cancelarTemporizador(jugador);

        const anterior = jugador.socketId
            ? io.sockets.sockets.get(jugador.socketId)
            : null;

        if (anterior && anterior.id !== socket.id) {
            anterior.leave(codigo);
            anterior.data.sala = null;
            anterior.data.slot = null;
        }
    } else {
        const primerSlotOcupado = [
            ...sala.jugadores.values()
        ].some(j => j.slot === 1);

        const slot = primerSlotOcupado ? 2 : 1;

        jugador = {
            clienteId,
            nombre,
            slot,
            socketId: null,
            conectado: false,
            timerSalida: null
        };

        sala.jugadores.set(clienteId, jugador);
    }

    jugador.socketId = socket.id;
    jugador.conectado = true;

    socket.join(codigo);

    socket.data.sala = codigo;
    socket.data.clienteId = clienteId;
    socket.data.slot = jugador.slot;

    publicarSala(sala);

    return {
        ok: true,
        codigo,
        slot: jugador.slot,
        recuperada: Boolean(existente),
        configuracion: { ...sala.configuracion },
        estadoJuego: estadoPublico(sala.partida),
        flotaPropia: flotaPropia(
            sala.partida,
            jugador.slot
        ),
        guardado: sala.guardado
    };
}

// Comprueba quién envía una acción.
function contextoJugador(socket) {
    const sala = salas.get(socket.data.sala);

    const jugador = sala?.jugadores.get(
        socket.data.clienteId
    );

    if (
        jugador?.socketId !== socket.id ||
        !jugador.conectado
    ) {
        return null;
    }

    return { sala, jugador };
}

// Envía resultados validados al servicio PHP privado.
async function persistirResultado(sala) {
    if (sala.partida.fase !== "finalizada") return;

    if (
        sala.guardado === "guardado" ||
        sala.guardado === "guardando"
    ) {
        return;
    }

    sala.guardado = "guardando";

    io.to(sala.codigo).emit(
        "juego:guardado",
        { estado: "guardando" }
    );

    try {
        if (!/^[a-f0-9]{64}$/i.test(INTERNAL_KEY)) {
            throw new Error(
                "Falta configurar FLEET_INTERNAL_KEY."
            );
        }

        const resultado = resultadoPartida(sala.partida);

        const participantes = sala.participantesPartida;
        
        if (
            !Array.isArray(participantes) ||
            participantes.length !== 2
        ) {
            throw new Error(
                "No se conservaron los participantes del combate."
            );
        }
        
        const jugadores = participantes.map((participante) => {
            const slot = participante.slot;
        
            return {
                nombre: participante.nombre,
                posicion: slot,
                puntos: resultado.puntuaciones[slot],
                resultado: resultado.ganador === slot
                    ? "victoria"
                    : "derrota"
            };
        });

        const respuesta = await fetch(PHP_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Fleet-Internal-Key": INTERNAL_KEY
            },
            body: JSON.stringify({
                codigo_sala: sala.codigo,
                ...sala.configuracion,
                jugadores
            }),
            signal: AbortSignal.timeout(8000)
        });

        const datos = await respuesta.json();

        if (!respuesta.ok || !datos?.ok) {
            throw new Error(
                datos?.mensaje ||
                `Error HTTP ${respuesta.status}`
            );
        }

        sala.guardado = "guardado";

        io.to(sala.codigo).emit(
            "juego:guardado",
            {
                estado: "guardado",
                partidaId: datos.partida_id
            }
        );
    } catch (error) {
        console.error(
            "No se pudo guardar la partida:",
            error.message
        );

        sala.guardado = "error";

        io.to(sala.codigo).emit(
            "juego:guardado",
            {
                estado: "error",
                mensaje: "No se pudo guardar la partida."
            }
        );
    }
}

// Comunicación Socket.IO.
io.on("connection", socket => {
    socket.emit(
        "servidor:conectado",
        { socketId: socket.id }
    );

    socket.on(
        "sala:crear",
        (datos = {}, responder = () => {}) => {
            const configuracion = normalizarConfiguracion(
                datos.configuracion
            );

            const codigo = crearCodigoSala();

            const sala = {
                codigo,
                configuracion,
                jugadores: new Map(),
                timerEliminacion: null,
                partida: crearMotorPartida(configuracion),
                guardado: "pendiente",
                participantesPartida: null
            };

            salas.set(codigo, sala);

            const respuesta = unirJugador(
                socket,
                codigo,
                datos.nombre,
                datos.clienteId
            );

            if (!respuesta.ok) {
                salas.delete(codigo);
            }

            responder(respuesta);
        }
    );

    socket.on(
        "sala:unirse",
        (datos = {}, responder = () => {}) => {
            const codigo = String(
                datos.codigo || ""
            ).trim().toUpperCase();

            responder(
                unirJugador(
                    socket,
                    codigo,
                    datos.nombre,
                    datos.clienteId
                )
            );
        }
    );

    socket.on(
        "sala:salir",
        (_datos, responder = () => {}) => {
            salirDeSala(socket, true);
            responder({ ok: true });
        }
    );

    // Confirmación privada de la flota.
    socket.on(
        "juego:listo",
        (datos = {}, responder = () => {}) => {
            const contexto = contextoJugador(socket);

            if (!contexto) {
                return responder({
                    ok: false,
                    mensaje: "Sala no válida."
                });
            }

            const { sala, jugador } = contexto;

            const conectados = [
                ...sala.jugadores.values()
            ].filter(j => j.conectado);

            if (conectados.length !== 2) {
                return responder({
                    ok: false,
                    mensaje: "Espera al segundo jugador."
                });
            }

            const respuesta = registrarFlota(
                sala.partida,
                jugador.slot,
                datos.flota
            );
            
            // Cuando ambas flotas están listas, comienza el combate.
            if (
                respuesta.ok &&
                sala.partida.fase === "en_curso"
            ) {
                sala.participantesPartida = [1, 2].map((slot) => {
                    const participante = [...sala.jugadores.values()]
                        .find((item) => item.slot === slot);
            
                    return {
                        slot,
                        nombre: participante.nombre
                    };
                });
            }
            
            responder(respuesta);

            if (respuesta.ok) {
                io.to(sala.codigo).emit(
                    "juego:estado",
                    estadoPublico(sala.partida)
                );

                publicarSala(sala);
            }
        }
    );

    // Disparo validado en el servidor.
    socket.on(
        "juego:disparar",
        (datos = {}, responder = () => {}) => {
            const contexto = contextoJugador(socket);

            if (!contexto) {
                return responder({
                    ok: false,
                    mensaje: "Sala no válida."
                });
            }

            const { sala, jugador } = contexto;

            const conectados = [
                ...sala.jugadores.values()
            ].filter(j => j.conectado);

            if (conectados.length !== 2) {
                return responder({
                    ok: false,
                    mensaje: "Espera a que el rival se reconecte."
                });
            }

            const respuesta = disparar(
                sala.partida,
                jugador.slot,
                datos
            );

            responder(respuesta);

            if (!respuesta.ok) return;

            io.to(sala.codigo).emit(
                "juego:disparo",
                respuesta.evento
            );

            io.to(sala.codigo).emit(
                "juego:estado",
                respuesta.estado
            );

            if (sala.partida.fase === "finalizada") {
                io.to(sala.codigo).emit(
                    "juego:terminada",
                    resultadoPartida(sala.partida)
                );

                void persistirResultado(sala);
            }
        }
    );

    socket.on(
        "juego:reintentarGuardado",
        (_datos, responder = () => {}) => {
            const contexto = contextoJugador(socket);

            if (
                !contexto ||
                contexto.sala.partida.fase !== "finalizada"
            ) {
                return responder({
                    ok: false,
                    mensaje: "No hay partida terminada."
                });
            }

            responder({
                ok: true,
                estado: contexto.sala.guardado
            });

            void persistirResultado(contexto.sala);
        }
    );

    socket.on("juego:pausa", pausado => {
        const contexto = contextoJugador(socket);

        if (contexto) {
            socket.to(contexto.sala.codigo).emit(
                "juego:pausaRival",
                Boolean(pausado)
            );
        }
    });

    socket.on("disconnect", () => {
        salirDeSala(socket, false);
    });
});

httpServer.listen(PORT, () => {
    console.log(
        `Fleet Command: http://localhost:${PORT}`
    );
});
