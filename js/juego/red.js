
function obtenerClienteId() {
    const clave = "fleetClienteSala";

    let id = sessionStorage.getItem(clave);

    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(clave, id);
    }

    return id;
}

export function crearClienteRed(callbacks = {}) {
    if (typeof window.io !== "function") {
        throw new Error(
            "Socket.IO no está disponible. Inicia con npm start."
        );
    }

    const socket = window.io();
    const clienteId = obtenerClienteId();

    let salaActual =
        sessionStorage.getItem("fleetSalaActual") || "";

    let slot = null;

    let nombreActual =
        sessionStorage.getItem("fleetNombreSala") || "";

    function guardarSala() {
        if (salaActual) {
            sessionStorage.setItem(
                "fleetSalaActual",
                salaActual
            );
        }

        if (nombreActual) {
            sessionStorage.setItem(
                "fleetNombreSala",
                nombreActual
            );
        }
    }

    function limpiarSala() {
        sessionStorage.removeItem("fleetSalaActual");
        sessionStorage.removeItem("fleetNombreSala");
    }

    function procesarRespuestaSala(respuesta) {
        if (respuesta?.ok) {
            salaActual = respuesta.codigo || salaActual;
            slot = respuesta.slot ?? slot;
            guardarSala();
        }

        return respuesta || {
            ok: false,
            mensaje: "Respuesta inválida."
        };
    }

    function emitirConRespuesta(evento, datos = {}) {
        return new Promise(resolve => {
            if (!socket.connected) {
                resolve({
                    ok: false,
                    mensaje: "Sin conexión con Node.js."
                });
                return;
            }

            socket.timeout(8000).emit(
                evento,
                { ...datos, clienteId },
                (error, respuesta) => {
                    if (error) {
                        resolve({
                            ok: false,
                            mensaje: "El servidor no respondió."
                        });
                        return;
                    }

                    resolve(respuesta || {
                        ok: false,
                        mensaje: "Respuesta vacía."
                    });
                }
            );
        });
    }

    async function recuperarSala() {
        if (!salaActual || !nombreActual) return;

        const respuesta = procesarRespuestaSala(
            await emitirConRespuesta(
                "sala:unirse",
                {
                    codigo: salaActual,
                    nombre: nombreActual
                }
            )
        );

        if (respuesta.ok) {
            callbacks.reconexionSala?.(respuesta);
            return;
        }

        salaActual = "";
        slot = null;
        limpiarSala();

        callbacks.salaPerdida?.(
            respuesta.mensaje || "La sala ya no existe."
        );
    }

    socket.on("connect", () => {
        callbacks.conexion?.(true, socket.id);
        void recuperarSala();
    });

    socket.on("disconnect", () => {
        callbacks.conexion?.(false, socket.id);
    });

    socket.on("sala:estado", datos => {
        callbacks.sala?.(datos);
    });

    socket.on("juego:estado", estado => {
        callbacks.estadoJuego?.(estado);
    });

    socket.on("juego:disparo", evento => {
        callbacks.disparo?.(evento);
    });

    socket.on("juego:terminada", resultado => {
        callbacks.terminada?.(resultado);
    });

    socket.on("juego:guardado", datos => {
        callbacks.guardado?.(datos);
    });

    socket.on("juego:pausaRival", estado => {
        callbacks.pausaRival?.(estado);
    });

    return {
        get sala() {
            return salaActual;
        },

        get slot() {
            return slot;
        },

        async crearSala(nombre, configuracion) {
            nombreActual = nombre;

            const respuesta = await emitirConRespuesta(
                "sala:crear",
                { nombre, configuracion }
            );

            return procesarRespuestaSala(respuesta);
        },

        async unirseSala(codigo, nombre) {
            nombreActual = nombre;

            const respuesta = await emitirConRespuesta(
                "sala:unirse",
                { codigo, nombre }
            );

            return procesarRespuestaSala(respuesta);
        },

        salirSala() {
            if (socket.connected) {
                socket.emit("sala:salir", {});
            }

            salaActual = "";
            slot = null;
            nombreActual = "";
            limpiarSala();
        },

        confirmarFlota(flota) {
            return emitirConRespuesta(
                "juego:listo",
                { flota }
            );
        },

        disparar(columna, fila) {
            return emitirConRespuesta(
                "juego:disparar",
                { columna, fila }
            );
        },

        reintentarGuardado() {
            return emitirConRespuesta(
                "juego:reintentarGuardado"
            );
        },

        enviarPausa(pausado) {
            if (salaActual && socket.connected) {
                socket.emit("juego:pausa", pausado);
            }
        }
    };
}
