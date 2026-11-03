import * as THREE from "three";

import { crearEscena } from "./escena.js";
import { crearTableros } from "./tableros.js";
import { crearVistaFlota } from "./barcos.js";
import { crearAudioAmbiente } from "./audioAmbiente.js";

import {
    obtenerConfiguracion,
    describirConfiguracion
} from "./configuracion.js";

import {
    dispararConEspera,
    enviarRafagaConEspera
} from "./tiemposCombate.js";

import { crearClienteRed } from "./red.js";
import { cargarModeloFBX } from "./modelos.js";

import {
    obtenerReglas,
    celdasBarco,
    validarFlota,
    crearFlotaAleatoria,
    crearMotorPartida,
    registrarFlota,
    estadoPublico,
    disparar,
    terminarTurno,
    enviarRafaga,
    elegirDisparoIA
} from "./reglasCombate.js";

const $ = id => document.getElementById(id);

const perfil = window.FleetApp?.obtenerPerfil();

if (!perfil) {
    window.location.replace("index.html");
    throw new Error("Inicia sesion para jugar.");
}

const configuracion = obtenerConfiguracion();
const reglas = obtenerReglas(configuracion);

const online = configuracion.rival === "online";
const rafaga = reglas.modo === "rafaga";

$("hudConfiguracion").textContent =
    describirConfiguracion(configuracion);

const mundo = crearEscena({
    mapa: configuracion.mapa,
    tamanoTablero: reglas.tamano,
    contenedor: $("contenedorThree")
});

const tableros = crearTableros(
    mundo,
    reglas.tamano
);

const vista = crearVistaFlota(
    tableros.propio
);

const ambiente = crearAudioAmbiente(
    configuracion.mapa
);

const modal = id =>
    window.bootstrap.Modal.getOrCreateInstance(
        $(id)
    );

const modalSala = modal("modalSala");
const modalPausa = modal("modalPausa");
const modalResultado = modal("modalResultado");

const rayo = new THREE.Raycaster();
const puntero = new THREE.Vector2();

let red = null;
let motor = null;
let estado = null;
let slotLocal = null;

let flota = [];
let seleccionado = null;
let herramienta = "seleccionar";
let objetivos = [];

let disparoActivado = false;

let ocupado = false;
let pausado = false;
let terminado = false;
let destruido = false;

let conectado = false;
let conectados = 0;

let arrastre = null;
let inicioPuntero = null;

let timerIA = null;
let ultimoRender = 0;

let ultimoGuardado = {
    estado: "pendiente"
};

function aviso(texto) {
    window.FleetApp.mostrarToast(texto);
}

function mensaje(texto) {
    $("mensajeJuego").textContent = texto;
}

const hayRival = () =>
    !online ||
    (conectado && conectados === 2);

const preparando = () =>
    !!slotLocal &&
    estado?.fase === "colocando" &&
    !estado.listos[slotLocal] &&
    !ocupado &&
    !pausado;

const puedeAtacar = () =>
    !!slotLocal &&
    estado?.fase === "en_curso" &&
    !ocupado &&
    !pausado &&
    !estado.disparoPendiente &&
    hayRival() &&
    (
        rafaga
            ? !estado.rafagasListas[slotLocal]
            : estado.turno === slotLocal &&
              estado.restantes > 0
    );

// Renderizado de la escena, sin animaciones nuevas de combate.
mundo.renderer.setAnimationLoop(tiempo => {
    if (
        tiempo - ultimoRender <
        1000 / 30
    ) {
        return;
    }

    ultimoRender = tiempo;

    mundo.renderer.render(
        mundo.scene,
        mundo.camera
    );
});

// El juego funciona con barcos de respaldo mientras carga el FBX.
void cargarModeloFBX(
    "/public/models/yamato.fbx",
    "Yamato",
    2.35
)
.then(modelo => {
    if (!destruido) {
        vista.aplicarModelo(modelo);
    }
})
.catch(error => {
    console.warn(
        "Se conservan los barcos geometricos de respaldo.",
        error
    );
});

function refrescarControles() {
    const prep = preparando();

    const turnoPropio =
        estado?.fase === "en_curso" &&
        estado.turno === slotLocal;

    if (!puedeAtacar()) {
        disparoActivado = false;
        tableros.apuntar(null);
    }

    for (
        const id of
        ["btnSeleccionar", "btnMover", "selectorBarco"]
    ) {
        $(id).disabled = !prep;
    }

    $("btnRotar").disabled =
        !prep || !seleccionado;

    $("btnIniciarPartida").disabled =
        !prep || !hayRival();

    $("btnIniciarPartida").hidden =
        estado?.fase !== "colocando";

    $("btnDisparar").hidden = false;

    $("btnDisparar").disabled =
        !puedeAtacar();

    $("btnDisparar").textContent =
        disparoActivado
            ? "APUNTANDO"
            : "DISPARAR";

    $("btnDisparar").setAttribute(
        "aria-pressed",
        disparoActivado
    );

    $("btnTerminarTurno").disabled = rafaga
        ? !puedeAtacar() ||
          objetivos.length !== 10
        : !turnoPropio ||
          estado.restantes !== 0 ||
          !!estado.disparoPendiente ||
          ocupado ||
          pausado ||
          !hayRival();

    $("btnTerminarTurno").textContent = rafaga
        ? `TERMINAR TURNO (${objetivos.length}/10)`
        : "TERMINAR TURNO";

    $("btnMover").setAttribute(
        "aria-pressed",
        herramienta === "mover"
    );

    $("btnSeleccionar").setAttribute(
        "aria-pressed",
        herramienta === "seleccionar"
    );

    $("selectorBarco").value =
        seleccionado || "";

    $("btnFlotaLista").hidden = true;

    mundo.renderer.domElement.style.cursor =
        disparoActivado
            ? "crosshair"
            : "default";
}

function mostrarGuardado(datos) {
    ultimoGuardado = datos || ultimoGuardado;

    if (!online) {
        $("estadoGuardadoResultado").textContent =
            "Partida local contra IA. " +
            "El resultado no se envia a MySQL.";

        $("btnReintentarGuardado").hidden = true;
        return;
    }

    const textos = {
        pendiente:
            "Resultado validado. Esperando el guardado.",
        guardando:
            "Guardando resultado...",
        guardado:
            "Partida registrada en MySQL.",
        error:
            "No se pudo guardar. Puedes reintentar."
    };

    $("estadoGuardadoResultado").textContent =
        textos[ultimoGuardado.estado] ||
        textos.pendiente;

    $("btnReintentarGuardado").hidden =
        ultimoGuardado.estado !== "error";
}

function mostrarResultado(resultado) {
    if (!resultado || terminado) return;

    terminado = true;

    ambiente.detener();

    clearTimeout(timerIA);
    timerIA = null;

    modalPausa.hide();

    $("textoResultado").textContent =
        resultado.empate
            ? "EMPATE"
            : resultado.ganador === slotLocal
                ? "VICTORIA"
                : "DERROTA";

    const rival = slotLocal === 1 ? 2 : 1;

    $("puntosResultado").textContent =
        `${resultado.puntuaciones[slotLocal]} PUNTOS` +
        ` · DAÑO: ${resultado.danos[slotLocal]}` +
        ` / ${resultado.danos[rival]}`;

    mostrarGuardado(ultimoGuardado);

    modalResultado.show();
}

function aplicarEstado(nuevo) {
    if (!nuevo || !slotLocal) return;

    estado = nuevo;

    for (const tiro of estado.historial) {
        tableros.disparo(tiro, slotLocal);
    }

    const rival = slotLocal === 1 ? 2 : 1;

    const propiosRestantes =
        reglas.longitudes.length -
        estado.hundidos[rival];

    const enemigosRestantes =
        reglas.longitudes.length -
        estado.hundidos[slotLocal];

    $("estadoJugador").textContent =
        `JUGADOR ${slotLocal} // ` +
        `${perfil.nombre.toUpperCase()}` +
        ` · TU FLOTA: ${propiosRestantes}` +
        ` · RIVAL: ${enemigosRestantes}`;

    tableros.mostrarPendiente(
    estado.disparoPendiente,
    slotLocal
);

if (
    estado.fase === "en_curso" &&
    estado.disparoPendiente
) {
    mensaje(
        estado.disparoPendiente.tipo === "rafaga"
            ? "Resolviendo las rafagas..."
            : estado.disparoPendiente.jugador === slotLocal
                ? "Disparo en curso..."
                : "El rival esta disparando..."
    );

    refrescarControles();
    return;
}

    if (estado.fase === "colocando") {
        mensaje(
            estado.listos[slotLocal]
                ? "Flota confirmada. Esperando al rival."
                : "Selecciona un barco; activa MOVER " +
                  "para arrastrarlo. Gíralo antes de " +
                  "INICIAR PARTIDA."
        );

    } else if (estado.fase === "en_curso") {
        if (rafaga) {
            mensaje(
                estado.rafagasListas[slotLocal]
                    ? "Ráfaga enviada. Esperando los diez " +
                      "disparos del rival."
                    : "Marca diez casillas del tablero " +
                      "enemigo y presiona TERMINAR TURNO. " +
                      "Clic de nuevo para desmarcar."
            );
        } else {
            const ultimo =
                estado.historial[
                    estado.historial.length - 1
                ];

            const impacto = ultimo?.hundido
                ? "BARCO HUNDIDO"
                : ultimo?.acierto
                    ? "IMPACTO"
                    : "AGUA";

            mensaje(
                estado.turno !== slotLocal
                    ? "TURNO DEL RIVAL"
                    : estado.restantes
                        ? "TU TURNO: selecciona una casilla " +
                          "del tablero enemigo"
                        : `${impacto}. Pulsa TERMINAR TURNO.`
            );
        }

    } else if (estado.fase === "cancelada") {
        mensaje(
            "Partida cancelada por abandono. " +
            "Regresa al menú para crear otra."
        );

        ambiente.detener();

    } else if (estado.fase === "finalizada") {
        mensaje("PARTIDA TERMINADA");

        objetivos = [];
        tableros.mostrarObjetivos([]);

        mostrarResultado(estado.resultado);
    }

    refrescarControles();
}

function prepararVista() {
    const selector = $("selectorBarco");

    selector.replaceChildren(
        new Option("Selecciona un barco", "")
    );

    flota.forEach((barco, indice) => {
        selector.add(
            new Option(
                `Barco ${indice + 1}: ` +
                `${barco.longitud} casillas`,
                barco.barcoId
            )
        );
    });

    vista.actualizar(flota);

    seleccionar(null);

    $("estadoJugador").textContent =
        `JUGADOR ${slotLocal} // ` +
        perfil.nombre.toUpperCase();
}

function seleccionar(id) {
    seleccionado = id;

    vista.seleccionar(id);

    refrescarControles();
}

function colocar(
    id,
    columna,
    fila,
    rotacion,
    notificar = true
) {
    if (!preparando()) return false;

    const candidata = flota.map(barco =>
        barco.barcoId === id
            ? {
                ...barco,
                columna,
                fila,
                rotacion
            }
            : { ...barco }
    );

    const respuesta = validarFlota(
        candidata,
        slotLocal,
        reglas
    );

    if (!respuesta.ok) {
        if (notificar) {
            aviso(respuesta.mensaje);
        }

        return false;
    }

    flota = respuesta.flota;

    vista.actualizar(flota);
    vista.seleccionar(seleccionado);

    return true;
}

function girar() {
    if (!preparando() || !seleccionado) {
        return;
    }

    const barco = flota.find(
        item => item.barcoId === seleccionado
    );

    colocar(
        barco.barcoId,
        barco.columna,
        barco.fila,
        (barco.rotacion + 90) % 360
    );
}

function localizar(evento) {
    const rect =
        mundo.renderer.domElement.getBoundingClientRect();

    puntero.set(
        (evento.clientX - rect.left) /
            rect.width * 2 - 1,

        -(evento.clientY - rect.top) /
            rect.height * 2 + 1
    );

    rayo.setFromCamera(
        puntero,
        mundo.camera
    );

    return tableros.localizar(rayo);
}

function barcoEn(celda) {
    return flota.find(barco =>
        celdasBarco(barco).some(c =>
            c.columna === celda.columna &&
            c.fila === celda.fila
        )
    );
}

function clic(evento) {
    const celda = localizar(evento);

    if (
        !celda ||
        pausado ||
        terminado
    ) {
        return;
    }

    if (
        preparando() &&
        celda.tablero === tableros.propio
    ) {
        seleccionar(
            barcoEn(celda)?.barcoId || null
        );

        return;
    }

    if (
        celda.tablero !== tableros.enemigo ||
        !puedeAtacar() ||
        !disparoActivado
    ) {
        return;
    }

    const repetido = estado.historial.some(
        tiro =>
            tiro.jugador === slotLocal &&
            tiro.columna === celda.columna &&
            tiro.fila === celda.fila
    );

    if (repetido) {
        return aviso(
            "Ya atacaste esa casilla."
        );
    }

    const destino = {
        columna: celda.columna,
        fila: celda.fila
    };

    // Clasico: el clic dispara directamente.
    if (!rafaga) {
        disparoActivado = false;

        tableros.apuntar(null);

        tableros.mostrarPendiente(
            {
                tipo: "clasico",
                jugador: slotLocal,
                ...destino
            },
            slotLocal
        );

        mensaje("Disparo en curso...");

        void ejecutar(() =>
            online
                ? red.disparar(
                    destino.columna,
                    destino.fila
                )
                : dispararConEspera(
                    motor,
                    1,
                    destino,
                    { alIniciar: aplicarEstado }
                )
        );

        return;
    }

    // Rafaga: el clic marca una de sus diez casillas.
    const indice = objetivos.findIndex(
        objetivo =>
            objetivo.columna === destino.columna &&
            objetivo.fila === destino.fila
    );

    if (indice >= 0) {
        objetivos.splice(indice, 1);

    } else if (objetivos.length < 10) {
        objetivos.push(destino);

    } else {
        return aviso(
            "Ya seleccionaste diez casillas."
        );
    }

    tableros.mostrarObjetivos(objetivos);

    refrescarControles();
}

const canvas = mundo.renderer.domElement;

canvas.addEventListener(
    "pointermove",
    evento => {
        if (
            !disparoActivado ||
            !puedeAtacar() ||
            arrastre
        ) {
            tableros.apuntar(null);
            return;
        }

        const celda = localizar(evento);

        const repetida = celda &&
            estado.historial.some(
                tiro =>
                    tiro.jugador === slotLocal &&
                    tiro.columna === celda.columna &&
                    tiro.fila === celda.fila
            );

        tableros.apuntar(
            celda?.tablero === tableros.enemigo &&
            !repetida
                ? celda
                : null
        );
    }
);

canvas.addEventListener(
    "pointerleave",
    () => tableros.apuntar(null)
);

canvas.addEventListener(
    "pointerdown",
    evento => {
        if (
            evento.button !== 0 ||
            pausado ||
            terminado
        ) {
            return;
        }

        inicioPuntero = {
            x: evento.clientX,
            y: evento.clientY
        };

        // Al apuntar, el clic no comienza un arrastre de camara.
        if (
            disparoActivado &&
            puedeAtacar() &&
            localizar(evento)?.tablero === tableros.enemigo
        ) {
            evento.preventDefault();
            evento.stopImmediatePropagation();
            return;
        }

        if (
            !preparando() ||
            herramienta !== "mover"
        ) {
            return;
        }

        const celda = localizar(evento);

        if (
            celda?.tablero !== tableros.propio
        ) {
            return;
        }

        const barco =
            barcoEn(celda) ||
            flota.find(
                item =>
                    item.barcoId === seleccionado
            );

        if (!barco) return;

        const sobreBarco = celdasBarco(barco).some(
            c =>
                c.columna === celda.columna &&
                c.fila === celda.fila
        );

        seleccionar(barco.barcoId);

        arrastre = {
            id: barco.barcoId,
            puntero: evento.pointerId,

            dx: sobreBarco
                ? celda.columna - barco.columna
                : 0,

            dy: sobreBarco
                ? celda.fila - barco.fila
                : 0,

            original: flota.map(
                item => ({ ...item })
            )
        };

        mundo.controlesCamara.enabled = false;

        canvas.setPointerCapture(
            evento.pointerId
        );

        if (!sobreBarco) {
            colocar(
                barco.barcoId,
                celda.columna,
                celda.fila,
                barco.rotacion
            );
        }

        evento.preventDefault();
        evento.stopImmediatePropagation();
    },
    true
);

canvas.addEventListener(
    "pointermove",
    evento => {
        if (
            !arrastre ||
            arrastre.puntero !== evento.pointerId ||
            !preparando()
        ) {
            return;
        }

        const celda = localizar(evento);

        if (
            celda?.tablero !== tableros.propio
        ) {
            return;
        }

        const barco = flota.find(
            item =>
                item.barcoId === arrastre.id
        );

        const columna =
            celda.columna - arrastre.dx;

        const fila =
            celda.fila - arrastre.dy;

        if (
            columna !== barco.columna ||
            fila !== barco.fila
        ) {
            colocar(
                barco.barcoId,
                columna,
                fila,
                barco.rotacion,
                false
            );
        }
    },
    true
);

function finalizarArrastre(cancelar = false) {
    if (!arrastre) return;

    const previo = arrastre;

    arrastre = null;

    if (cancelar) {
        flota = previo.original;
        vista.actualizar(flota);
    }

    if (
        canvas.hasPointerCapture(previo.puntero)
    ) {
        canvas.releasePointerCapture(
            previo.puntero
        );
    }

    mundo.controlesCamara.enabled =
        !pausado;

    inicioPuntero = null;
}

canvas.addEventListener(
    "pointerup",
    evento => {
        if (evento.button !== 0) return;

        if (arrastre) {
            finalizarArrastre();
            evento.stopImmediatePropagation();
            return;
        }

        const inicio = inicioPuntero;

        inicioPuntero = null;

        if (
            inicio &&
            Math.hypot(
                evento.clientX - inicio.x,
                evento.clientY - inicio.y
            ) <= 6
        ) {
            clic(evento);
        }
    },
    true
);

canvas.addEventListener(
    "pointercancel",
    () => finalizarArrastre(true),
    true
);

canvas.addEventListener(
    "lostpointercapture",
    () => finalizarArrastre(true),
    true
);

async function ejecutar(accion) {
    if (ocupado) return;

    ocupado = true;

    refrescarControles();

    try {
        const respuesta = await accion();

        if (!respuesta?.ok) {
            return aviso(
                respuesta?.mensaje ||
                "La acción no se pudo completar."
            );
        }

        objetivos = [];

        tableros.mostrarObjetivos([]);

        aplicarEstado(respuesta.estado);

    } catch (error) {
        console.error(error);

        aviso(
            "No se pudo completar la acción."
        );

    } finally {
        if (!estado?.disparoPendiente) {
            tableros.mostrarPendiente(null);
        }

        ocupado = false;

        refrescarControles();

        planificarIA();
    }
}

function planificarIA() {
    if (
        online ||
        timerIA ||
        pausado ||
        terminado ||
        motor?.fase !== "en_curso" ||
        motor.disparoPendiente
    ) {
        return;
    }

    const noCorresponde = rafaga
        ? !motor.rafagas[1] || motor.rafagas[2]
        : motor.turno !== 2;

    if (noCorresponde) return;

    timerIA = setTimeout(async () => {
        try {
            if (
                pausado ||
                destruido ||
                terminado
            ) {
                return;
            }

            if (rafaga) {
                const tiros = [];

                while (tiros.length < 10) {
                    tiros.push({
                        ...elegirDisparoIA(
                            tiros,
                            reglas.tamano
                        )
                    });
                }

                await enviarRafagaConEspera(
                    motor,
                    2,
                    tiros,
                    { alIniciar: aplicarEstado }
                );

            } else {
                const historial =
                    motor.historial.filter(
                        tiro => tiro.jugador === 2
                    );

                const celda = elegirDisparoIA(
                    historial,
                    reglas.tamano,
                    configuracion.dificultad === "dificil"
                );

                if (celda) {
                    const respuesta =
                        await dispararConEspera(
                            motor,
                            2,
                            celda,
                            { alIniciar: aplicarEstado }
                        );

                    if (
                        respuesta.ok &&
                        motor.fase === "en_curso"
                    ) {
                        terminarTurno(motor, 2);
                    }
                }
            }

            if (!destruido) {
                aplicarEstado(
                    estadoPublico(motor)
                );
            }

        } catch (error) {
            console.error(error);

            aviso(
                "No se pudo completar el disparo de la IA."
            );

        } finally {
            timerIA = null;
        }
    }, 450);
}

$("selectorBarco").addEventListener(
    "change",
    evento => {
        if (preparando()) {
            seleccionar(
                evento.target.value || null
            );
        }
    }
);

$("btnSeleccionar").onclick = () => {
    if (!preparando()) return;

    herramienta = "seleccionar";

    refrescarControles();
};

$("btnMover").onclick = () => {
    if (!preparando()) return;

    herramienta = "mover";

    mensaje(
        "Arrastra un barco en TU FLOTA o selecciona " +
        "uno y pulsa su nueva ubicación. " +
        "Se conserva la última posición válida."
    );

    refrescarControles();
};

$("btnRotar").onclick = girar;

$("btnIniciarPartida").onclick = () => {
    if (
        !preparando() ||
        !hayRival()
    ) {
        return;
    }

    finalizarArrastre();

    void ejecutar(async () => {
        const validacion = validarFlota(
            flota,
            slotLocal,
            reglas
        );

        if (!validacion.ok) {
            return validacion;
        }

        const respuesta = online
            ? await red.confirmarFlota(
                validacion.flota
            )
            : registrarFlota(
                motor,
                1,
                validacion.flota
            );

        if (!respuesta.ok) {
            return respuesta;
        }

        seleccionar(null);

        if (!online) {
            registrarFlota(
                motor,
                2,
                crearFlotaAleatoria(2, reglas)
            );
        }

        return online
            ? respuesta
            : {
                ok: true,
                estado: estadoPublico(motor)
            };
    });
};

$("btnDisparar").onclick = () => {
    if (!puedeAtacar()) return;

    disparoActivado = !disparoActivado;

    if (!disparoActivado) {
        tableros.apuntar(null);
    }

    mensaje(
        disparoActivado
            ? rafaga
                ? "Marca diez casillas enemigas y termina el turno."
                : "Apunta y haz clic izquierdo sobre una casilla enemiga."
            : "Disparo desactivado."
    );

    refrescarControles();
};

$("btnTerminarTurno").onclick = () => {
    if (rafaga) {
        if (
            !puedeAtacar() ||
            objetivos.length !== 10
        ) {
            return;
        }

        const celdas = objetivos.map(
            celda => ({ ...celda })
        );

        void ejecutar(() =>
            online
                ? red.enviarRafaga(celdas)
                : enviarRafagaConEspera(
                    motor,
                    1,
                    celdas,
                { alIniciar: aplicarEstado }
                )
        );

    } else if (
        estado?.turno === slotLocal &&
        estado.restantes === 0 &&
        !pausado &&
        hayRival()
    ) {
        void ejecutar(() =>
            online
                ? red.terminarTurno()
                : terminarTurno(motor, 1)
        );
    }
};

function pausar() {
    if (terminado || pausado) return;

    finalizarArrastre();

    pausado = true;

    mundo.controlesCamara.enabled = false;

    ambiente.pausar();

    red?.enviarPausa(true);

    refrescarControles();

    modalPausa.show();
}

function continuar() {
    if (terminado) return;

    pausado = false;

    mundo.controlesCamara.enabled = true;

    ambiente.reanudar();

    red?.enviarPausa(false);

    modalPausa.hide();

    refrescarControles();

    planificarIA();
}

$("btnPausa").onclick = pausar;
$("btnContinuar").onclick = continuar;

$("btnPantallaCompleta").onclick = () => {
    window.FleetApp.alternarPantallaCompleta();
};

function salir() {
    red?.salirSala();
    ambiente.detener();

    window.location.href = "dashboard.html";
}

$("btnVolverDashboard").onclick = salir;
$("btnResultadoDashboard").onclick = salir;

$("btnVerPuntuaciones").onclick = () => {
    red?.salirSala();

    window.location.href =
        "puntuaciones.html?from=dashboard";
};

$("btnReintentarGuardado").onclick = async () => {
    const respuesta =
        await red?.reintentarGuardado();

    if (!respuesta?.ok) {
        aviso(
            respuesta?.mensaje ||
            "No se pudo reintentar."
        );
    }
};

document.addEventListener(
    "keydown",
    evento => {
        if (
            ["INPUT", "TEXTAREA", "SELECT"].includes(
                evento.target?.tagName
            )
        ) {
            return;
        }

        if (evento.key === "Escape") {
            if (
                $("modalSala").classList.contains("show") ||
                terminado
            ) {
                return;
            }

            evento.preventDefault();

            pausado
                ? continuar()
                : pausar();

            return;
        }

        if (
            !preparando() ||
            !seleccionado ||
            arrastre
        ) {
            return;
        }

        const tecla =
            evento.key.toLowerCase();

        if (tecla === "r") {
            evento.preventDefault();
            girar();
            return;
        }

        if (herramienta !== "mover") {
            return;
        }

        const delta = {
            w: [0, -1],
            arrowup: [0, -1],

            s: [0, 1],
            arrowdown: [0, 1],

            a: [-1, 0],
            arrowleft: [-1, 0],

            d: [1, 0],
            arrowright: [1, 0]
        }[tecla];

        if (!delta) return;

        evento.preventDefault();

        const barco = flota.find(
            item => item.barcoId === seleccionado
        );

        colocar(
            barco.barcoId,
            barco.columna + delta[0],
            barco.fila + delta[1],
            barco.rotacion
        );
    },
    true
);

function aceptarSala(respuesta) {
    if (!respuesta?.ok) return;

    const distinta = [
        "modo",
        "mapa",
        "dificultad"
    ].some(campo =>
        configuracion[campo] !==
        respuesta.configuracion[campo]
    );

    if (distinta) {
        localStorage.setItem(
            "fleetCommandConfig",
            JSON.stringify({
                ...respuesta.configuracion,
                rival: "online"
            })
        );

        window.location.replace("juego.html");
        return;
    }

    const conservar =
        respuesta.recuperada &&
        slotLocal === respuesta.slot &&
        flota.length;

    slotLocal = respuesta.slot;

    flota = respuesta.flotaPropia || (
        conservar
            ? flota
            : crearFlotaAleatoria(
                slotLocal,
                reglas
            )
    );

    prepararVista();

    mostrarGuardado({
        estado: respuesta.guardado
    });

    aplicarEstado(
        respuesta.estadoJuego
    );

    $("codigoSala").value =
        respuesta.codigo;

    $("estadoSala").textContent =
        `SALA ${respuesta.codigo} / ${conectados}/2`;

    if (conectados === 2) {
        modalSala.hide();
    }
}

async function entrarSala(accion) {
    $("btnCrearSala").disabled = true;
    $("btnUnirseSala").disabled = true;

    try {
        const respuesta = accion === "crear"
            ? await red.crearSala(
                perfil.nombre,
                configuracion
            )
            : await red.unirseSala(
                $("codigoSala").value,
                perfil.nombre
            );

        if (respuesta.ok) {
            aceptarSala(respuesta);
        } else {
            $("estadoLobby").textContent =
                respuesta.mensaje;
        }

    } finally {
        $("btnCrearSala").disabled = false;
        $("btnUnirseSala").disabled = false;
    }
}

$("btnCrearSala").onclick = () => {
    void entrarSala("crear");
};

$("btnUnirseSala").onclick = () => {
    void entrarSala("unir");
};

$("btnSala").onclick = () => {
    modalSala.show();
};

$("codigoSala").addEventListener(
    "input",
    evento => {
        evento.target.value =
            evento.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "");
    }
);

if (online) {
    red = crearClienteRed({
        conexion(valor) {
            conectado = valor;

            $("estadoConexion").textContent =
                valor
                    ? "SERVIDOR CONECTADO"
                    : "SIN CONEXIÓN";

            refrescarControles();
        },

        sala(datos) {
            conectados =
                datos.jugadores.length;

            $("estadoSala").textContent =
                `SALA ${datos.codigo} / ${conectados}/2`;

            $("estadoLobby").textContent =
                datos.jugadores.map(
                    jugador =>
                        `J${jugador.slot}: ${jugador.nombre}`
                ).join(" · ") +
                (
                    conectados < 2
                        ? " · Esperando rival."
                        : ""
                );

            aplicarEstado(
                datos.estadoJuego
            );

            if (
                conectados === 2 &&
                slotLocal
            ) {
                modalSala.hide();
            }

            refrescarControles();
        },

        salaPerdida(texto) {
            mensaje(texto);

            slotLocal = null;

            refrescarControles();

            modalSala.show();
        },

        reconexionSala: aceptarSala,

        estadoJuego: aplicarEstado,

        disparo(evento) {
            if (slotLocal) {
                tableros.disparo(
                    evento,
                    slotLocal
                );
            }
        },

        terminada: mostrarResultado,

        guardado: mostrarGuardado,

        pausaRival(valor) {
            aviso(
                valor
                    ? "El rival pausó sus controles."
                    : "El rival reanudó."
            );
        }
    });

    $("estadoJugador").textContent =
        "ONLINE // CREA O ÚNETE A UNA SALA";

    refrescarControles();

    setTimeout(() => {
        if (!slotLocal) {
            modalSala.show();
        }
    }, 300);

} else {
    slotLocal = 1;

    motor = crearMotorPartida(
        configuracion
    );

    flota = crearFlotaAleatoria(
        1,
        reglas
    );

    $("btnSala").hidden = true;

    $("estadoConexion").textContent =
        "MODO LOCAL";

    $("estadoSala").textContent =
        "RIVAL // IA";

    estado = estadoPublico(motor);

    prepararVista();

    aplicarEstado(estado);
}

window.addEventListener(
    "beforeunload",
    () => {
        destruido = true;

        clearTimeout(timerIA);

        ambiente.dispose();

        mundo.renderer.setAnimationLoop(null);

        vista.dispose();
        tableros.dispose();
        mundo.dispose();
    }
);