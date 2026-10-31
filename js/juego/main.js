
import * as THREE from "three";

import { crearEscena } from "./escena.js";

import {
    crearFlotaProvisional,
    encontrarBarcoDesdeObjeto,
    marcarSeleccion,
    moverBarcoSeguro,
    serializarFlota
} from "./barcos.js";

import {
    describirConfiguracion,
    obtenerCantidadBarcos,
    obtenerConfiguracion,
    obtenerTamanoTablero
} from "./configuracion.js";

import { crearClienteRed } from "./red.js";

import {
    cargarModeloFBX,
    clonarModeloBarco
} from "./modelos.js";

// 1. Obtener usuario y configuración.
const perfil = window.FleetApp?.obtenerPerfil();

if (!perfil) {
    sessionStorage.setItem(
        "fleetAviso",
        "Inicia sesión para jugar."
    );

    window.location.replace("index.html");

    throw new Error("No hay sesión activa.");
}

const configuracion = obtenerConfiguracion();

const tamanoTablero =
    obtenerTamanoTablero(configuracion.dificultad);

const cantidadBarcos =
    obtenerCantidadBarcos(configuracion.dificultad);

const $ = (id) => document.getElementById(id);

// 2. Referencias a los elementos HTML.
const hudConfiguracion = $("hudConfiguracion");
const estadoConexion = $("estadoConexion");
const estadoSala = $("estadoSala");
const estadoJugador = $("estadoJugador");
const estadoLobby = $("estadoLobby");
const mensajeJuego = $("mensajeJuego");
const codigoSala = $("codigoSala");

const btnFlotaLista = $("btnFlotaLista");
const btnCrearSala = $("btnCrearSala");
const btnUnirseSala = $("btnUnirseSala");

const btnReintentarGuardado =
    $("btnReintentarGuardado");

const textoResultado = $("textoResultado");
const puntosResultado = $("puntosResultado");

const estadoGuardadoResultado =
    $("estadoGuardadoResultado");

// Actualizar el HTML antes de cargar modelos pesados.
hudConfiguracion.textContent =
    describirConfiguracion(configuracion);

estadoConexion.textContent = "PREPARANDO ESCENA";

// 3. Crear la escena WebGL.
const mundo = crearEscena({
    mapa: configuracion.mapa,
    tamanoTablero,
    contenedor: $("contenedorThree")
});

// 4. Modales Bootstrap.
const modal = (id) =>
    window.bootstrap.Modal.getOrCreateInstance($(id));

const modalSala = modal("modalSala");
const modalPausa = modal("modalPausa");
const modalResultado = modal("modalResultado");

// 5. Variables del juego.
const raycaster = new THREE.Raycaster();
const puntero = new THREE.Vector2();

let red = null;
let slotLocal = null;

let flotaLocal = [];
let flotaIA = [];

let barcoSeleccionado = null;

let modeloEstandar = null;
let modeloDificil = null;

let faseOnline = "colocando";
let flotaConfirmada = false;

let pausado = false;
let partidaFinalizada = false;
let disparoPendiente = false;

let inicioPuntero = null;
let ultimoRender = 0;

const tirosDibujados = new Set();
const marcadores = [];

// 6. Dibujar continuamente la escena.
function renderLoop(tiempo) {
    if (tiempo - ultimoRender < 1000 / 30) {
        return;
    }

    ultimoRender = tiempo;

    mundo.renderer.render(
        mundo.scene,
        mundo.camera
    );
}

mundo.renderer.setAnimationLoop(renderLoop);

// 7. Reemplazar modelo geométrico por un FBX.
function aplicarModelo(barco, plantilla) {
    if (!plantilla || !barco) return;

    const copia = clonarModeloBarco(plantilla);

    if (!copia) return;

    barco.clear();
    barco.add(copia);

    const materiales = [];

    copia.traverse((objeto) => {
        if (!objeto.isMesh) return;

        const lista = Array.isArray(objeto.material)
            ? objeto.material
            : [objeto.material];

        for (const material of lista) {
            if (
                material &&
                !materiales.includes(material)
            ) {
                materiales.push(material);
            }
        }
    });

    barco.userData.materiales = materiales;
}

function aplicarModeloFlota(flota, plantilla) {
    for (const barco of flota) {
        aplicarModelo(barco, plantilla);
    }
}

// La carga de modelos no bloquea la escena.
void cargarModeloFBX(
    "/public/models/yamato.fbx",
    "Yamato",
    2.35
)
.then((modelo) => {
    modeloEstandar = modelo;

    aplicarModeloFlota(flotaLocal, modelo);

    if (configuracion.dificultad !== "dificil") {
        aplicarModeloFlota(flotaIA, modelo);
    }
})
.catch((error) => {
    console.warn(
        "Se usa el barco geométrico de respaldo.",
        error
    );
});

// Modelo especial para el modo IA difícil.
if (
    configuracion.rival === "ia" &&
    configuracion.dificultad === "dificil"
) {
    void cargarModeloFBX(
        "/public/models/enemigo_dificil.fbx",
        "Enemigo difícil",
        2.35
    )
    .then((modelo) => {
        modeloDificil = modelo;
        aplicarModeloFlota(flotaIA, modelo);
    })
    .catch((error) => {
        console.warn(
            "No se cargó el modelo difícil.",
            error
        );
    });
}

// 8. Seleccionar un barco.
function seleccionarBarco(barco) {
    if (barcoSeleccionado === barco) {
        barco = null;
    }

    marcarSeleccion(barcoSeleccionado, false);

    barcoSeleccionado = barco;

    marcarSeleccion(barcoSeleccionado, true);

    mundo.marcador.visible = false;

    if (barco) {
        mensajeJuego.textContent =
            `Seleccionado ${barco.userData.barcoId}. ` +
            "Usa WASD o clic en una casilla.";
    }
}

// 9. Preparar los barcos del jugador.
function prepararFlota(slot) {
    for (const barco of flotaLocal) {
        mundo.scene.remove(barco);
    }

    seleccionarBarco(null);

    slotLocal = slot;
    flotaConfirmada = false;

    flotaLocal = crearFlotaProvisional({
        slot,
        cantidad: cantidadBarcos,
        scene: mundo.scene,
        boardHalf: mundo.boardHalf,
        cellSize: mundo.cellSize
    });

    aplicarModeloFlota(
        flotaLocal,
        modeloEstandar
    );

    estadoJugador.textContent =
        `JUGADOR ${slot} // ` +
        perfil.nombre.toUpperCase();

    btnFlotaLista.hidden =
        configuracion.rival !== "online";
}

// Restaurar posiciones tras una reconexión.
function restaurarFlota(estados) {
    if (!Array.isArray(estados)) return;

    for (const estado of estados) {
        const barco = flotaLocal.find(
            (item) =>
                item.userData.barcoId === estado.barcoId
        );

        if (!barco) continue;

        barco.position.x = estado.x;
        barco.position.z = estado.z;
        barco.rotation.y = estado.rotY;
    }
}

// 10. Convertir un punto 3D en una casilla.
function puntoACelda(punto) {
    const columna = THREE.MathUtils.clamp(
        Math.floor(
            (punto.x + mundo.boardHalf) /
            mundo.cellSize
        ),
        0,
        tamanoTablero - 1
    );

    const fila = THREE.MathUtils.clamp(
        Math.floor(
            (punto.z + mundo.boardHalf) /
            mundo.cellSize
        ),
        0,
        tamanoTablero - 1
    );

    return {
        columna,
        fila,

        x: -mundo.boardHalf +
            mundo.cellSize * (columna + 0.5),

        z: -mundo.boardHalf +
            mundo.cellSize * (fila + 0.5)
    };
}

// 11. Dibujar un acierto o fallo.
function dibujarDisparo(datos) {
    const clave =
        `${datos.jugador}:${datos.columna}:${datos.fila}`;

    if (tirosDibujados.has(clave)) {
        return;
    }

    tirosDibujados.add(clave);

    const marcador = new THREE.Mesh(
        new THREE.PlaneGeometry(
            mundo.cellSize * 0.7,
            mundo.cellSize * 0.7
        ),

        new THREE.MeshBasicMaterial({
            color: datos.acierto
                ? 0xff554d
                : 0xe9f5ff,

            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide
        })
    );

    marcador.rotation.x = -Math.PI / 2;

    marcador.position.set(
        -mundo.boardHalf +
            mundo.cellSize * (datos.columna + 0.5),

        0.12,

        -mundo.boardHalf +
            mundo.cellSize * (datos.fila + 0.5)
    );

    mundo.scene.add(marcador);
    marcadores.push(marcador);
}

// 12. Mostrar el resultado validado por Node.
function mostrarResultadoOnline(resultado) {
    if (
        partidaFinalizada ||
        !slotLocal ||
        !resultado
    ) {
        return;
    }

    partidaFinalizada = true;
    pausado = true;

    mundo.renderer.setAnimationLoop(null);

    modalPausa.hide();

    textoResultado.textContent =
        resultado.ganador === slotLocal
            ? "VICTORIA"
            : "DERROTA";

    const puntos = Number(
        resultado.puntuaciones?.[slotLocal] ?? 0
    );

    puntosResultado.textContent =
        `${puntos} PUNTOS`;

    estadoGuardadoResultado.textContent =
        "Resultado validado; esperando " +
        "confirmación de MySQL.";

    btnReintentarGuardado.hidden = true;

    modalResultado.show();
}

// 13. Reflejar el estado del guardado.
function actualizarGuardado(datos) {
    if (!datos) return;

    if (datos.estado === "guardado") {
        estadoGuardadoResultado.textContent =
            "Partida registrada en MySQL.";

        btnReintentarGuardado.hidden = true;

    } else if (datos.estado === "guardando") {
        estadoGuardadoResultado.textContent =
            "Guardando resultado...";

        btnReintentarGuardado.hidden = true;

    } else if (datos.estado === "error") {
        estadoGuardadoResultado.textContent =
            "No se pudo guardar la partida.";

        btnReintentarGuardado.hidden = false;
    }
}

// 14. Actualizar turno y fase desde el servidor.
function actualizarEstadoJuego(estado) {
    if (!estado || !slotLocal) return;

    faseOnline = estado.fase;

    flotaConfirmada = Boolean(
        estado.listos?.[slotLocal]
    );

    btnFlotaLista.hidden =
        flotaConfirmada ||
        faseOnline !== "colocando";

    for (const tiro of estado.historial || []) {
        dibujarDisparo(tiro);
    }

    if (faseOnline === "colocando") {
        mensajeJuego.textContent =
            flotaConfirmada
                ? "Flota confirmada. Esperando a tu rival."
                : "Coloca tus barcos y " +
                  "presiona CONFIRMAR FLOTA.";

    } else if (faseOnline === "en_curso") {
        mensajeJuego.textContent =
            estado.turno === slotLocal
                ? `TU TURNO: ${estado.restantes} disparo(s).`
                : "TURNO DEL RIVAL";

    } else if (faseOnline === "cancelada") {
        mensajeJuego.textContent =
            "Partida cancelada. Crea otra sala.";

        btnFlotaLista.hidden = true;

    } else if (faseOnline === "finalizada") {
        mostrarResultadoOnline(
            estado.resultado
        );
    }
}

// 15. La configuración pertenece al creador.
function sincronizarConfiguracion(configuracionSala) {
    if (!configuracionSala) return false;

    const coincide = [
        "modo",
        "mapa",
        "dificultad"
    ].every(
        (campo) =>
            configuracion[campo] ===
            configuracionSala[campo]
    );

    if (coincide) return false;

    localStorage.setItem(
        "fleetCommandConfig",
        JSON.stringify({
            ...configuracionSala,
            rival: "online"
        })
    );

    sessionStorage.setItem(
        "fleetAviso",
        "Se aplicó la configuración de la sala."
    );

    window.location.replace("juego.html");

    return true;
}

// 16. Mostrar integrantes de la sala.
function actualizarSala(datos) {
    if (
        sincronizarConfiguracion(
            datos?.configuracion
        )
    ) {
        return;
    }

    const jugadores = datos?.jugadores || [];

    const codigo =
        datos?.codigo || red?.sala || "--";

    estadoSala.textContent =
        `SALA ${codigo} / ${jugadores.length}/2`;

    estadoLobby.textContent =
        jugadores.length === 2
            ? "Conectados: " +
              jugadores.map(
                  (j) => `J${j.slot}: ${j.nombre}`
              ).join(" · ")
            : "Esperando al segundo jugador.";

    actualizarEstadoJuego(
        datos?.estadoJuego
    );

    if (jugadores.length === 2) {
        modalSala.hide();
    }
}

// 17. Crear sala o unirse.
async function entrarSala(accion) {
    btnCrearSala.disabled = true;
    btnUnirseSala.disabled = true;

    try {
        const respuesta = accion === "crear"
            ? await red.crearSala(
                perfil.nombre,
                configuracion
            )
            : await red.unirseSala(
                codigoSala.value,
                perfil.nombre
            );

        if (!respuesta?.ok) {
            estadoLobby.textContent =
                respuesta?.mensaje ||
                "No fue posible entrar a la sala.";

            return;
        }

        if (
            sincronizarConfiguracion(
                respuesta.configuracion
            )
        ) {
            return;
        }

        codigoSala.value = respuesta.codigo;

        prepararFlota(respuesta.slot);

        restaurarFlota(
            respuesta.flotaPropia
        );

        actualizarEstadoJuego(
            respuesta.estadoJuego
        );

        if (respuesta.guardado !== "pendiente") {
            actualizarGuardado({
                estado: respuesta.guardado
            });
        }

        estadoSala.textContent =
            `SALA ${respuesta.codigo}`;

        estadoLobby.textContent =
            `Conectado como Jugador ${respuesta.slot}.`;

    } catch (error) {
        console.error(error);

        estadoLobby.textContent =
            "No se pudo establecer la conexión.";

    } finally {
        btnCrearSala.disabled = false;
        btnUnirseSala.disabled = false;
    }
}

// 18. Conectar Socket.IO.
function iniciarOnline() {
    red = crearClienteRed({
        conexion(conectado) {
            estadoConexion.textContent =
                conectado
                    ? "SERVIDOR CONECTADO"
                    : "SERVIDOR DESCONECTADO";
        },

        sala: actualizarSala,

        salaPerdida(mensaje) {
            estadoLobby.textContent = mensaje;
            modalSala.show();
        },

        reconexionSala(respuesta) {
            if (
                sincronizarConfiguracion(
                    respuesta.configuracion
                )
            ) {
                return;
            }

            if (!slotLocal) {
                prepararFlota(respuesta.slot);
            }

            restaurarFlota(
                respuesta.flotaPropia
            );

            actualizarEstadoJuego(
                respuesta.estadoJuego
            );

            if (respuesta.guardado !== "pendiente") {
                actualizarGuardado({
                    estado: respuesta.guardado
                });
            }

            estadoLobby.textContent =
                `Sala ${respuesta.codigo} recuperada.`;
        },

        estadoJuego: actualizarEstadoJuego,

        disparo: dibujarDisparo,

        terminada: mostrarResultadoOnline,

        guardado: actualizarGuardado,

        pausaRival(rivalPausado) {
            window.FleetApp.mostrarToast(
                rivalPausado
                    ? "El rival pausó sus controles."
                    : "El rival reanudó."
            );
        }
    });

    $("btnSala").hidden = false;

    btnFlotaLista.hidden = true;

    estadoJugador.textContent =
        "MULTIJUGADOR // SIN SALA";

    setTimeout(() => {
        if (!red.sala) {
            modalSala.show();
        }
    }, 220);
}

// 19. Modo IA visual para ampliación posterior.
function iniciarIAVisual() {
    estadoConexion.textContent = "MODO LOCAL";
    estadoSala.textContent = "RIVAL // IA";

    $("btnSala").hidden = true;
    btnFlotaLista.hidden = true;

    prepararFlota(1);
    btnFlotaLista.hidden = true;

    flotaIA = crearFlotaProvisional({
        slot: 2,
        cantidad: cantidadBarcos,
        scene: mundo.scene,
        boardHalf: mundo.boardHalf,
        cellSize: mundo.cellSize
    });

    aplicarModeloFlota(
        flotaIA,
        modeloDificil || modeloEstandar
    );

    mensajeJuego.textContent =
        "Visualización contra IA. " +
        "Su combate se incorporará después.";
}

// 20. Mover barcos en la preparación.
function moverSeleccionado(x, z) {
    if (
        !barcoSeleccionado ||
        pausado ||
        flotaConfirmada ||
        (
            configuracion.rival === "online" &&
            faseOnline !== "colocando"
        )
    ) {
        return;
    }

    const valido = moverBarcoSeguro(
        barcoSeleccionado,
        { x, z },
        flotaLocal,
        mundo.boardHalf
    );

    if (!valido) {
        window.FleetApp.mostrarToast(
            "Esa posición no está disponible."
        );

        return;
    }

    mensajeJuego.textContent =
        "Ubicación actualizada: " +
        barcoSeleccionado.userData.barcoId;
}

// 21. Interpretar clics sobre la escena.
async function pulsarCanvas(evento) {
    if (pausado || partidaFinalizada) return;

    const rect =
        mundo.renderer.domElement.getBoundingClientRect();

    puntero.x =
        ((evento.clientX - rect.left) / rect.width) *
        2 - 1;

    puntero.y =
        -((evento.clientY - rect.top) / rect.height) *
        2 + 1;

    raycaster.setFromCamera(
        puntero,
        mundo.camera
    );

    const tablero =
        raycaster.intersectObject(
            mundo.tableroRaycast,
            false
        )[0];

    // Combate multijugador.
    if (
        configuracion.rival === "online" &&
        faseOnline === "en_curso"
    ) {
        if (
            !tablero ||
            disparoPendiente ||
            !red?.sala
        ) {
            return;
        }

        const celda = puntoACelda(
            tablero.point
        );

        disparoPendiente = true;

        try {
            const respuesta = await red.disparar(
                celda.columna,
                celda.fila
            );

            if (!respuesta?.ok) {
                window.FleetApp.mostrarToast(
                    respuesta?.mensaje ||
                    "Disparo rechazado."
                );
            }

        } finally {
            disparoPendiente = false;
        }

        return;
    }

    // Impedir cambios después de confirmar la flota.
    if (
        configuracion.rival === "online" &&
        (
            flotaConfirmada ||
            faseOnline !== "colocando"
        )
    ) {
        return;
    }

    const impacto =
        raycaster.intersectObjects(
            flotaLocal,
            true
        )[0];

    if (impacto) {
        seleccionarBarco(
            encontrarBarcoDesdeObjeto(
                impacto.object
            )
        );

        return;
    }

    if (!tablero || !barcoSeleccionado) {
        return;
    }

    const celda = puntoACelda(
        tablero.point
    );

    mundo.marcador.position.set(
        celda.x,
        0.08,
        celda.z
    );

    mundo.marcador.visible = true;

    moverSeleccionado(
        celda.x,
        celda.z
    );
}

// 22. Controles de teclado.
function tecla(evento) {
    if (evento.key === "Escape") {
        const salaAbierta =
            $("modalSala").classList.contains("show");

        if (partidaFinalizada || salaAbierta) {
            return;
        }

        evento.preventDefault();

        if (pausado) {
            continuar();
        } else {
            pausar();
        }

        return;
    }

    if (
        pausado ||
        partidaFinalizada ||
        flotaConfirmada ||
        !barcoSeleccionado ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
            evento.target?.tagName
        )
    ) {
        return;
    }

    const paso = mundo.cellSize;

    let x = barcoSeleccionado.position.x;
    let z = barcoSeleccionado.position.z;

    switch (evento.key.toLowerCase()) {
        case "w":
        case "arrowup":
            z -= paso;
            break;

        case "s":
        case "arrowdown":
            z += paso;
            break;

        case "a":
        case "arrowleft":
            x -= paso;
            break;

        case "d":
        case "arrowright":
            x += paso;
            break;

        default:
            return;
    }

    evento.preventDefault();

    moverSeleccionado(x, z);
}

// 23. Diferenciar clic de arrastre de cámara.
mundo.renderer.domElement.addEventListener(
    "pointerdown",
    (evento) => {
        if (evento.button === 0) {
            inicioPuntero = {
                x: evento.clientX,
                y: evento.clientY
            };
        }
    }
);

mundo.renderer.domElement.addEventListener(
    "pointerup",
    (evento) => {
        if (
            evento.button !== 0 ||
            !inicioPuntero
        ) {
            return;
        }

        const distancia = Math.hypot(
            evento.clientX - inicioPuntero.x,
            evento.clientY - inicioPuntero.y
        );

        inicioPuntero = null;

        if (distancia <= 6) {
            void pulsarCanvas(evento);
        }
    }
);

document.addEventListener(
    "keydown",
    tecla,
    true
);

// 24. Pausa.
function pausar() {
    if (pausado || partidaFinalizada) return;

    pausado = true;
    red?.enviarPausa(true);

    modalPausa.show();
}

function continuar() {
    if (!pausado || partidaFinalizada) return;

    pausado = false;
    red?.enviarPausa(false);

    modalPausa.hide();
}

// 25. Eventos de botones.
$("btnSala").addEventListener(
    "click",
    () => modalSala.show()
);

btnCrearSala.addEventListener(
    "click",
    () => void entrarSala("crear")
);

btnUnirseSala.addEventListener(
    "click",
    () => void entrarSala("unir")
);

btnFlotaLista.addEventListener(
    "click",
    async () => {
        if (!red?.sala || flotaConfirmada) return;

        btnFlotaLista.disabled = true;

        try {
            const respuesta = await red.confirmarFlota(
                serializarFlota(flotaLocal)
            );

            if (respuesta?.ok) {
                seleccionarBarco(null);

                actualizarEstadoJuego(
                    respuesta.estado
                );

            } else {
                window.FleetApp.mostrarToast(
                    respuesta?.mensaje ||
                    "No se pudo confirmar la flota."
                );
            }

        } finally {
            btnFlotaLista.disabled = false;
        }
    }
);

$("btnPausa").addEventListener(
    "click",
    pausar
);

$("btnContinuar").addEventListener(
    "click",
    continuar
);

$("btnPantallaCompleta").addEventListener(
    "click",
    () => window.FleetApp.alternarPantallaCompleta()
);

$("btnVolverDashboard").addEventListener(
    "click",
    () => {
        red?.salirSala();
        window.location.href = "dashboard.html";
    }
);

btnReintentarGuardado.addEventListener(
    "click",
    async () => {
        const respuesta =
            await red?.reintentarGuardado();

        if (!respuesta?.ok) {
            window.FleetApp.mostrarToast(
                respuesta?.mensaje ||
                "No se pudo reintentar."
            );
        }
    }
);

$("btnVerPuntuaciones").addEventListener(
    "click",
    () => {
        window.location.href =
            "puntuaciones.html?from=dashboard";
    }
);

$("btnResultadoDashboard").addEventListener(
    "click",
    () => {
        red?.salirSala();
        window.location.href = "dashboard.html";
    }
);

codigoSala.addEventListener(
    "input",
    () => {
        codigoSala.value =
            codigoSala.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "");
    }
);

// 26. Liberar recursos gráficos.
window.addEventListener(
    "beforeunload",
    () => {
        for (const marcador of marcadores) {
            marcador.geometry.dispose();
            marcador.material.dispose();
        }

        mundo.dispose();
    }
);

// 27. Iniciar modo de juego.
if (configuracion.rival === "online") {
    iniciarOnline();
} else {
    iniciarIAVisual();
}
