function obtenerClienteId() {
    const clave = "fleetClienteSala";
    let id = sessionStorage.getItem(clave);

    if (!id) {
        id = window.crypto?.randomUUID?.() || `cliente-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        sessionStorage.setItem(clave, id);
    }

    return id;
}

export function crearClienteRed(callbacks = {}) {
    if (typeof window.io !== "function") {
        throw new Error("Socket.IO no está disponible. Inicia el proyecto con node server.js.");
    }

    const socket = window.io();
    const clienteId = obtenerClienteId();
    let salaActual = sessionStorage.getItem("fleetSalaActual") || "";
    let slot = null;
    let nombreActual = sessionStorage.getItem("fleetNombreSala") || "";

    function guardarSala() {
        if (salaActual) sessionStorage.setItem("fleetSalaActual", salaActual);
        if (nombreActual) sessionStorage.setItem("fleetNombreSala", nombreActual);
    }

    function limpiarSalaGuardada() {
        sessionStorage.removeItem("fleetSalaActual");
        sessionStorage.removeItem("fleetNombreSala");
    }

    function intentarRecuperarSala() {
        if (!salaActual || !nombreActual) return;

        socket.emit("sala:unirse", {
            codigo: salaActual,
            nombre: nombreActual,
            clienteId
        }, (respuesta) => {
            if (respuesta?.ok) {
                salaActual = respuesta.codigo || salaActual;
                slot = respuesta.slot ?? slot;
                guardarSala();
                callbacks.reconexionSala?.(respuesta);
                return;
            }

            salaActual = "";
            slot = null;
            limpiarSalaGuardada();
            callbacks.salaPerdida?.(respuesta?.mensaje || "La sala ya no está disponible.");
        });
    }

    socket.on("connect", () => {
        callbacks.conexion?.(true, socket.id);
        intentarRecuperarSala();
    });

    socket.on("disconnect", () => callbacks.conexion?.(false, socket.id));
    socket.on("sala:estado", (datos) => callbacks.sala?.(datos));
    socket.on("juego:estadoBarco", (estado) => callbacks.estadoBarco?.(estado));
    socket.on("juego:sincronizarFlota", (flota) => callbacks.flota?.(flota));
    socket.on("juego:seleccionCasilla", (datos) => callbacks.seleccionCasilla?.(datos));
    socket.on("juego:pausaRival", (pausado) => callbacks.pausaRival?.(pausado));

    function solicitar(evento, datos) {
        return new Promise((resolve) => {
            let respondido = false;
            const timer = window.setTimeout(() => {
                if (!respondido) resolve({ ok: false, mensaje: "El servidor no respondió a tiempo." });
            }, 5000);

            socket.emit(evento, { ...datos, clienteId }, (respuesta) => {
                respondido = true;
                window.clearTimeout(timer);

                if (respuesta?.ok) {
                    salaActual = respuesta.codigo || salaActual;
                    slot = respuesta.slot ?? slot;
                    guardarSala();
                }

                resolve(respuesta || { ok: false, mensaje: "Respuesta inválida del servidor." });
            });
        });
    }

    return {
        socket,
        get sala() { return salaActual; },
        get slot() { return slot; },
        crearSala(nombre, configuracion) {
            nombreActual = String(nombre || "Jugador");
            guardarSala();
            return solicitar("sala:crear", {
                nombre: nombreActual,
                configuracion
            });
        },
        unirseSala(codigo, nombre) {
            nombreActual = String(nombre || "Jugador");
            return solicitar("sala:unirse", { codigo, nombre: nombreActual });
        },
        salirSala() {
            socket.emit("sala:salir", { clienteId }, () => {});
            salaActual = "";
            slot = null;
            nombreActual = "";
            limpiarSalaGuardada();
        },
        enviarBarco(estado) {
            if (salaActual) socket.emit("juego:estadoBarco", estado);
        },
        enviarFlota(flota) {
            if (salaActual) socket.emit("juego:sincronizarFlota", flota);
        },
        enviarCasilla(datos) {
            if (salaActual) socket.emit("juego:seleccionCasilla", datos);
        },
        enviarPausa(pausado) {
            if (salaActual) socket.emit("juego:pausa", pausado);
        }
    };
}
