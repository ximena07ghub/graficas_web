import * as THREE from "three";
import { crearEscena } from "./escena.js";
import {
    aplicarEstadoBarco,
    crearBarcoProvisional,
    crearFlotaProvisional,
    encontrarBarcoDesdeObjeto,
    marcarSeleccion,
    moverBarcoSeguro,
    serializarBarco,
    serializarFlota
} from "./barcos.js";
import {
    describirConfiguracion,
    obtenerCantidadBarcos,
    obtenerConfiguracion,
    obtenerTamanoTablero
} from "./configuracion.js";
import { crearClienteRed } from "./red.js";
import { cargarModeloFBX, clonarModeloBarco } from "./modelos.js";

const perfil = window.FleetApp?.obtenerPerfil();
if (!perfil) {
    sessionStorage.setItem("fleetAviso", "Inicia sesión antes de entrar a una partida.");
    window.location.href = "index.html";
    throw new Error("No hay sesión activa.");
}

const configuracion = obtenerConfiguracion();

// La configuración de una sala pertenece a quien la creó, asi ambos tableros tienen misma dificultad y cantidad de barcos.

function sincronizarConfiguracionSala(configuracionSala) {
    if (!configuracionSala) return false;

    const claves = ["rival", "modo", "mapa", "dificultad"];
    const esDistinta = claves.some((clave) => configuracion[clave] !== configuracionSala[clave]);

    if (!esDistinta) return false;

    localStorage.setItem(
        "fleetCommandConfig",
        JSON.stringify({ ...configuracion, ...configuracionSala, rival: "online" })
    );
    sessionStorage.setItem(
        "fleetAviso",
        "La sala usa la configuración elegida por quien la creó. Se actualizó tu partida."
    );
    window.location.replace("juego.html");
    return true;
}

const tamanoTablero = obtenerTamanoTablero(configuracion.dificultad);
const cantidadBarcos = obtenerCantidadBarcos(configuracion.dificultad);
const contenedor = document.getElementById("contenedorThree");
const mundo = crearEscena({
    mapa: configuracion.mapa,
    tamanoTablero,
    contenedor
});

// En modo IA la opcion de sala no aplica

if (configuracion.rival === "ia") {
    document.getElementById("btnSala")?.setAttribute("hidden", "");
    const estadoSalaInicial = document.getElementById("estadoSala");
    if (estadoSalaInicial) estadoSalaInicial.textContent = "RIVAL // IA";
}

let modeloEstandar = null;
let modeloEnemigoDificil = null;

try {
    modeloEstandar = await cargarModeloFBX(
        "/public/models/fleet/yamato.fbx",
        "Yamato",
        2.35
    );
} catch (error) {
    console.warn("Yamato no pudo cargarse. Se usara el barco provisional.", error);
}

if (configuracion.rival === "ia" && configuracion.dificultad === "dificil") {
    try {
        modeloEnemigoDificil = await cargarModeloFBX(
            "/public/models/fleet/enemigo_dificil.fbx",
            "Enemigo dificil",
            2.35
        );
    } catch (error) {
        console.warn("El modelo especial no pudo cargarse. La IA dificil usara Yamato.", error);
    }
}

const hudConfiguracion = document.getElementById("hudConfiguracion");
const estadoConexion = document.getElementById("estadoConexion");
const estadoSala = document.getElementById("estadoSala");
const estadoJugador = document.getElementById("estadoJugador");
const mensajeJuego = document.getElementById("mensajeJuego");
const codigoSala = document.getElementById("codigoSala");
const estadoLobby = document.getElementById("estadoLobby");
const btnSala = document.getElementById("btnSala");
const btnCrearSala = document.getElementById("btnCrearSala");
const btnUnirseSala = document.getElementById("btnUnirseSala");
const btnPausa = document.getElementById("btnPausa");
const btnContinuar = document.getElementById("btnContinuar");
const btnPantallaCompleta = document.getElementById("btnPantallaCompleta");
const btnVolverDashboard = document.getElementById("btnVolverDashboard");
const textoResultado = document.getElementById("textoResultado");
const puntosResultado = document.getElementById("puntosResultado");
const estadoGuardadoResultado = document.getElementById("estadoGuardadoResultado");
const btnReintentarGuardado = document.getElementById("btnReintentarGuardado");
const btnVerPuntuaciones = document.getElementById("btnVerPuntuaciones");
const btnResultadoDashboard = document.getElementById("btnResultadoDashboard");

hudConfiguracion.textContent = describirConfiguracion(configuracion);

const modalSala = window.bootstrap.Modal.getOrCreateInstance(document.getElementById("modalSala"), {
    backdrop: "static",
    keyboard: false
});
const modalPausa = window.bootstrap.Modal.getOrCreateInstance(document.getElementById("modalPausa"), {
    backdrop: "static",
    keyboard: false
});
const modalResultado = window.bootstrap.Modal.getOrCreateInstance(document.getElementById("modalResultado"), {
    backdrop: "static",
    keyboard: false
});

const raycaster = new THREE.Raycaster();
const puntero = new THREE.Vector2();
let flotaLocal = [];
let flotaRemota = [];
let barcoSeleccionado = null;
let slotLocal = null;
let pausado = false;
let salaConDosJugadores = false;
let red = null;
let temporizadorIA = null;
let ultimoRender = 0;
let partidaFinalizada = false;
let ultimoResultado = null;
let inicioPuntero = null;

function limpiarFlota(flota) {
    flota.forEach((barco) => mundo.scene.remove(barco));
    flota.length = 0;
}

function seleccionarBarco(barco) {
    // Clic sobre el mismo barco: lo deselecciona sin elegir otro.

    if (barcoSeleccionado === barco && barco) {
        marcarSeleccion(barcoSeleccionado, false);
        barcoSeleccionado = null;
        mundo.marcador.visible = false;
        mensajeJuego.textContent = "Barco deseleccionado. Selecciona uno cuando quieras moverlo.";
        return;
    }

    marcarSeleccion(barcoSeleccionado, false);
    barcoSeleccionado = barco || null;
    marcarSeleccion(barcoSeleccionado, true);
    mundo.marcador.visible = false;

    if (barcoSeleccionado) {
        mensajeJuego.textContent = `Seleccionado: ${barcoSeleccionado.userData.barcoId}. Usa WASD, flechas o elige una casilla.`;
        window.FleetApp.sonidoClick();
    }
}

function colocarModeloEnBarco(barco, plantilla) {
    if (!barco || !plantilla) return;

    const modelo = clonarModeloBarco(plantilla);
    if (!modelo) return;

    barco.clear();
    barco.add(modelo);

    const materiales = [];
    modelo.traverse((objeto) => {
        if (!objeto.isMesh) return;
        const lista = Array.isArray(objeto.material) ? objeto.material : [objeto.material];
        lista.forEach((material) => {
            if (material && !materiales.includes(material)) materiales.push(material);
        });
    });

    barco.userData.materiales = materiales;
    barco.userData.modelo3D = plantilla.name;
}

function colocarModeloEnFlota(flota, plantilla) {
    if (!plantilla) return;
    flota.forEach((barco) => colocarModeloEnBarco(barco, plantilla));
}

function prepararFlotaLocal(slot) {
    limpiarFlota(flotaLocal);
    seleccionarBarco(null);
    slotLocal = slot;

    flotaLocal = crearFlotaProvisional({
        slot,
        cantidad: cantidadBarcos,
        scene: mundo.scene,
        boardHalf: mundo.boardHalf,
        cellSize: mundo.cellSize
    });

    colocarModeloEnFlota(flotaLocal, modeloEstandar);

    estadoJugador.textContent = `JUGADOR ${slot} // ${perfil.nombre.toUpperCase()}`;
    mensajeJuego.textContent = "Selecciona un barco. Puedes moverlo con WASD, flechas o clic en una casilla.";
}

function asegurarBarcoRemoto(estado) {
    let barco = flotaRemota.find((item) => item.userData.barcoId === estado.barcoId);
    if (barco) return barco;

    const color = estado.propietario === 1 ? 0x00d9cf : 0xff9c38;
    barco = crearBarcoProvisional({
        id: estado.barcoId,
        propietario: estado.propietario,
        color
    });
    barco.userData.seleccionable = false;
    colocarModeloEnBarco(barco, modeloEstandar);
    mundo.scene.add(barco);
    flotaRemota.push(barco);
    return barco;
}

function aplicarFlotaRemota(estados) {
    estados.forEach((estado) => {
        if (!estado?.barcoId) return;
        const barco = asegurarBarcoRemoto(estado);
        aplicarEstadoBarco(barco, estado);
    });
}

function estadoActualBarco(barco) {
    return serializarBarco(barco);
}

function notificarMovimiento(barco) {
    if (!barco || configuracion.rival !== "online") return;
    red?.enviarBarco(estadoActualBarco(barco));
}

function puntoACelda(punto) {
    const columna = THREE.MathUtils.clamp(
        Math.floor((punto.x + mundo.boardHalf) / mundo.cellSize),
        0,
        tamanoTablero - 1
    );
    const fila = THREE.MathUtils.clamp(
        Math.floor((punto.z + mundo.boardHalf) / mundo.cellSize),
        0,
        tamanoTablero - 1
    );

    return {
        columna,
        fila,
        x: -mundo.boardHalf + mundo.cellSize * (columna + 0.5),
        z: -mundo.boardHalf + mundo.cellSize * (fila + 0.5)
    };
}

function marcarCasilla(celda, color = 0x69ffd7) {
    mundo.marcador.material.color.setHex(color);
    mundo.marcador.position.x = celda.x;
    mundo.marcador.position.z = celda.z;
    mundo.marcador.visible = true;
}

function intentarMoverSeleccionado(x, z) {
    if (!barcoSeleccionado || pausado) return false;

    const valido = moverBarcoSeguro(
        barcoSeleccionado,
        { x, z },
        flotaLocal,
        mundo.boardHalf
    );

    if (!valido) {
        mensajeJuego.textContent = "Movimiento bloqueado: mantén el barco dentro de tu mitad y evita otros barcos.";
        window.FleetApp.mostrarToast("Esa casilla no está disponible para tu flota.", 1300);
        return false;
    }

    notificarMovimiento(barcoSeleccionado);
    mensajeJuego.textContent = `Movimiento sincronizado: ${barcoSeleccionado.userData.barcoId}.`;
    return true;
}

function alPulsarCanvas(evento) {
    if (pausado) return;

    const rect = mundo.renderer.domElement.getBoundingClientRect();
    puntero.x = ((evento.clientX - rect.left) / rect.width) * 2 - 1;
    puntero.y = -((evento.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(puntero, mundo.camera);

    const impactoLocal = raycaster.intersectObjects(flotaLocal, true)[0];
    if (impactoLocal) {
        const barco = encontrarBarcoDesdeObjeto(impactoLocal.object);
        seleccionarBarco(barco);
        return;
    }

    const impactoRemoto = raycaster.intersectObjects(flotaRemota, true)[0];
    if (impactoRemoto) {
        mensajeJuego.textContent = "Ese barco pertenece al rival y no puede ser controlado desde esta ventana.";
        return;
    }

    const impactoTablero = raycaster.intersectObject(mundo.tableroRaycast, false)[0];
    if (!impactoTablero) return;

    if (!barcoSeleccionado) {
        mundo.marcador.visible = false;
        mensajeJuego.textContent = "Primero selecciona uno de tus barcos.";
        return;
    }

    const celda = puntoACelda(impactoTablero.point);
    marcarCasilla(celda);
    red?.enviarCasilla({ columna: celda.columna, fila: celda.fila });
    intentarMoverSeleccionado(celda.x, celda.z);
}

function alPulsarTecla(evento) {
    if (partidaFinalizada) return;

    if (evento.key === "Escape") {
        const salaVisible = document.getElementById("modalSala").classList.contains("show");
        if (salaVisible) return;
        evento.preventDefault();
        pausado ? continuarPartida() : pausarPartida();
        return;
    }

    const objetivo = evento.target?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(objetivo) || pausado || !barcoSeleccionado) return;

    const tecla = evento.key.toLowerCase();
    const paso = mundo.cellSize;
    let x = barcoSeleccionado.position.x;
    let z = barcoSeleccionado.position.z;
    let manejada = true;

    if (tecla === "w" || evento.key === "ArrowUp") z -= paso;
    else if (tecla === "s" || evento.key === "ArrowDown") z += paso;
    else if (tecla === "a" || evento.key === "ArrowLeft") x -= paso;
    else if (tecla === "d" || evento.key === "ArrowRight") x += paso;
    else {
        manejada = false;
    }

    if (manejada) {
        evento.preventDefault();
        intentarMoverSeleccionado(x, z);
    }
}

function registrarInicioPuntero(evento) {
    if (evento.button !== 0) return;
    inicioPuntero = { x: evento.clientX, y: evento.clientY };
}

function procesarFinPuntero(evento) {
    if (!inicioPuntero || evento.button !== 0) return;

    const distancia = Math.hypot(
        evento.clientX - inicioPuntero.x,
        evento.clientY - inicioPuntero.y
    );
    inicioPuntero = null;

  

    if (distancia > 6) return;
    alPulsarCanvas(evento);
}

function renderLoop(tiempoMs) {

    if (tiempoMs - ultimoRender < 1000 / 30) return;
    ultimoRender = tiempoMs;
    mundo.renderer.render(mundo.scene, mundo.camera);
}

function pausarPartida() {
    if (pausado || partidaFinalizada) return;
    pausado = true;
    mundo.renderer.setAnimationLoop(null);
    red?.enviarPausa(true);
    modalPausa.show();
}

function continuarPartida() {
    if (!pausado || partidaFinalizada) return;
    pausado = false;
    modalPausa.hide();
    mundo.renderer.setAnimationLoop(renderLoop);
    red?.enviarPausa(false);
}

function calcularPuntuacionFinal(resultado, detalles = {}) {
    const barcosHundidos = Math.max(0, Number(detalles.barcosHundidos) || 0);
    const puntosExtra = Math.max(0, Number(detalles.puntosExtra) || 0);

    let puntos = barcosHundidos * 100 + puntosExtra;
    if (resultado === "victoria") puntos += 500;
    if (configuracion.dificultad === "dificil") puntos += 150;
    if (configuracion.modo === "rafaga") puntos += 50;

    return puntos;
}

async function guardarUltimoResultado() {
    if (!ultimoResultado) return;

    estadoGuardadoResultado.textContent = "Guardando puntuación...";
    btnReintentarGuardado.hidden = true;

    try {
        if (!window.FleetAPI) throw new Error("Fleet no está disponible");
        await window.FleetAPI.guardarPuntuacion(ultimoResultado);
        estadoGuardadoResultado.textContent = "Puntuación guardada correctamente ";
    } catch (error) {
        console.error("No se pudo guardar la puntuación:", error);
        estadoGuardadoResultado.textContent = "No se pudo guardar todavía.";
        btnReintentarGuardado.hidden = false;
    }
}

async function finalizarPartida(resultado, detalles = {}) {
    if (partidaFinalizada) return;

    const resultadoLimpio = resultado === "victoria" ? "victoria" : "derrota";
    const score = calcularPuntuacionFinal(resultadoLimpio, detalles);

    partidaFinalizada = true;
    pausado = true;
    if (temporizadorIA) window.clearInterval(temporizadorIA);
    mundo.renderer.setAnimationLoop(null);
    modalPausa.hide();

    ultimoResultado = {
        nombre: perfil.nombre,
        score,
        resultado: resultadoLimpio,
        modo: configuracion.modo,
        mapa: configuracion.mapa,
        dificultad: configuracion.dificultad
    };

    textoResultado.textContent = resultadoLimpio === "victoria" ? "VICTORIA" : "DERROTA";
    puntosResultado.textContent = `${score} PUNTOS`;
    estadoGuardadoResultado.textContent = "Preparando registro de la partida...";
    modalResultado.show();

    await guardarUltimoResultado();
}

// Punto de conexion para logica de disparos y hundimientos.

window.FleetGame = {
    finalizarPartida,
    calcularPuntuacionFinal
};

function iniciarModoIA() {
    estadoConexion.textContent = "MODO LOCAL // ACTIVO";
    estadoConexion.classList.add("ok");
    estadoSala.textContent = "RIVAL // IA";
    btnSala.hidden = true;

    prepararFlotaLocal(1);
    flotaRemota = crearFlotaProvisional({
        slot: 2,
        cantidad: cantidadBarcos,
        scene: mundo.scene,
        boardHalf: mundo.boardHalf,
        cellSize: mundo.cellSize
    });
    flotaRemota.forEach((barco) => { barco.userData.seleccionable = false; });

    const modeloIA = configuracion.dificultad === "dificil"
        ? (modeloEnemigoDificil || modeloEstandar)
        : modeloEstandar;
    colocarModeloEnFlota(flotaRemota, modeloIA);

    mensajeJuego.textContent = configuracion.dificultad === "dificil"
        ? "IA dificil activa: la flota rival utiliza el modelo especial."
        : "Modo IA activo: selecciona tu barco y muévelo con teclado o mouse.";

    temporizadorIA = window.setInterval(() => {
        if (pausado || !flotaRemota.length) return;
        const barco = flotaRemota[Math.floor(Math.random() * flotaRemota.length)];
        const opciones = [
            { x: barco.position.x + mundo.cellSize, z: barco.position.z },
            { x: barco.position.x - mundo.cellSize, z: barco.position.z },
            { x: barco.position.x, z: barco.position.z + mundo.cellSize },
            { x: barco.position.x, z: barco.position.z - mundo.cellSize }
        ];
        const destino = opciones[Math.floor(Math.random() * opciones.length)];
        moverBarcoSeguro(barco, destino, flotaRemota, mundo.boardHalf);
    }, 2400);
}

function actualizarSala(datos) {
    if (sincronizarConfiguracionSala(datos?.configuracion)) return;

    const jugadores = datos?.jugadores || [];
    const codigo = datos?.codigo || red?.sala || "--";
    estadoSala.textContent = `SALA ${codigo} / ${jugadores.length}/2`;
    estadoSala.classList.toggle("ok", jugadores.length === 2);
    estadoSala.classList.toggle("alerta", jugadores.length < 2);
    if (jugadores.length === 2) {
        estadoLobby.textContent = `Sala ${codigo} · J1 ${jugadores.find((j) => j.slot === 1)?.nombre || ""} · J2 ${jugadores.find((j) => j.slot === 2)?.nombre || ""}`;
    } else {
        estadoLobby.textContent = `Sala ${codigo} · ${jugadores[0]?.nombre || "Jugador"} · esperando jugador 2`;
    }

    salaConDosJugadores = jugadores.length === 2;

    if (salaConDosJugadores && slotLocal) {
        red.enviarFlota(serializarFlota(flotaLocal));
        modalSala.hide();
        mensajeJuego.textContent = "Replicacion correcta";
    } else if (slotLocal) {
        limpiarFlota(flotaRemota);
        mensajeJuego.textContent = "Sala creada. Comparte el código.";
    }
}

async function entrarSala(accion) {
    btnCrearSala.disabled = true;
    btnUnirseSala.disabled = true;
    estadoLobby.textContent = "Contactando...";

    const respuesta = accion === "crear"
        ? await red.crearSala(perfil.nombre, configuracion)
        : await red.unirseSala(codigoSala.value, perfil.nombre);

    btnCrearSala.disabled = false;
    btnUnirseSala.disabled = false;

    if (!respuesta?.ok) {
        estadoLobby.textContent = respuesta?.mensaje || "No fue posible entrar a la sala.";
        return;
    }

    if (sincronizarConfiguracionSala(respuesta.configuracion)) return;

    codigoSala.value = respuesta.codigo;
    prepararFlotaLocal(respuesta.slot);
    estadoSala.textContent = `SALA ${respuesta.codigo} / 1/2`;
    estadoLobby.textContent = `Conectado como Jugador ${respuesta.slot}. Código: ${respuesta.codigo}`;
    red.enviarFlota(serializarFlota(flotaLocal));
}

function iniciarModoOnline() {
    red = crearClienteRed({
        conexion(conectado) {
            estadoConexion.textContent = conectado ? "SERVIDOR // CONECTADO" : "SERVIDOR // DESCONECTADO";
            estadoConexion.classList.toggle("ok", conectado);
            estadoConexion.classList.toggle("alerta", !conectado);
        },
        salaPerdida(mensaje) {
            estadoSala.textContent = "SALA -- / 0/2";
            estadoLobby.textContent = mensaje;
            modalSala.show();
        },
        reconexionSala(respuesta) {
            if (sincronizarConfiguracionSala(respuesta.configuracion)) return;
            if (!slotLocal) prepararFlotaLocal(respuesta.slot);
            red.enviarFlota(serializarFlota(flotaLocal));
            estadoLobby.textContent = `Sala ${respuesta.codigo} recuperada.`;
        },
        sala: actualizarSala,
        estadoBarco(estado) {
            if (!estado?.barcoId) return;
            const barco = asegurarBarcoRemoto(estado);
            aplicarEstadoBarco(barco, estado);
        },
        flota: aplicarFlotaRemota,
        seleccionCasilla(datos) {
            const celda = {
                x: -mundo.boardHalf + mundo.cellSize * (datos.columna + 0.5),
                z: -mundo.boardHalf + mundo.cellSize * (datos.fila + 0.5)
            };
            marcarCasilla(celda, 0xffb14a);
        },
        pausaRival(rivalPausado) {
            window.FleetApp.mostrarToast(rivalPausado ? "El rival pausó su control ." : "El rival reanudó la partida.");
        }
    });

    btnSala.hidden = false;
    estadoSala.textContent = "SALA -- / 0/2";
    estadoJugador.textContent = "MULTIJUGADOR // SIN SALA";
    window.setTimeout(() => {
        if (!red.sala) modalSala.show();
    }, 220);
}

mundo.renderer.domElement.addEventListener("pointerdown", registrarInicioPuntero);
mundo.renderer.domElement.addEventListener("pointerup", procesarFinPuntero);
document.addEventListener("keydown", alPulsarTecla, true);
btnSala.addEventListener("click", () => modalSala.show());
btnCrearSala.addEventListener("click", () => entrarSala("crear"));
btnUnirseSala.addEventListener("click", () => entrarSala("unir"));
btnPausa.addEventListener("click", pausarPartida);
btnContinuar.addEventListener("click", continuarPartida);
btnPantallaCompleta.addEventListener("click", () => window.FleetApp.alternarPantallaCompleta());
btnVolverDashboard.addEventListener("click", () => {
    red?.salirSala();
    window.location.href = "dashboard.html";
});

btnReintentarGuardado.addEventListener("click", guardarUltimoResultado);
btnVerPuntuaciones.addEventListener("click", () => {
    window.location.href = "puntuaciones.html?from=dashboard";
});
btnResultadoDashboard.addEventListener("click", () => {
    red?.salirSala();
    window.location.href = "dashboard.html";
});

codigoSala.addEventListener("input", () => {
    codigoSala.value = codigoSala.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});

window.addEventListener("beforeunload", () => {
    if (temporizadorIA) window.clearInterval(temporizadorIA);
    // No se borra la sala aquí: Socket.IO puede reconectar la pestaña y recuperar su lugar.
    mundo.dispose();
});

mundo.renderer.setAnimationLoop(renderLoop);

if (configuracion.rival === "online") iniciarModoOnline();
else iniciarModoIA();
