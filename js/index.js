
// Elementos principales del menú.
const opciones = document.querySelectorAll(".opcion-menu");
const opcionesLista = Array.from(opciones);
const tituloPanel = document.getElementById("tituloPanel");
const descripcionPanel = document.getElementById("descripcionPanel");
const btnAccionPrincipal = document.getElementById("btnAccionPrincipal");
const textoAccionPrincipal = document.getElementById("textoAccionPrincipal");
const estadoSesion = document.getElementById("estadoSesion");
const textoSesion = document.getElementById("textoSesion");
const perfilPanel = document.getElementById("perfilPanel");
const estadoAudioPie = document.getElementById("estadoAudioPie");

// Modal de acceso del jugador.
const modalLogin = document.getElementById("modalLogin");
const formLogin = document.getElementById("formLogin");
const usuarioInput = document.getElementById("usuario");
const passwordInput = document.getElementById("password");
const errorLogin = document.getElementById("errorLogin");

let accionSeleccionada = "nave";

// Refresca sesión y audio visibles.
function actualizarSesionVisual() {
    const perfil = FleetApp.obtenerPerfil();

    if (perfil) {
        if (estadoSesion) estadoSesion.classList.add("con-sesion");
        if (textoSesion) textoSesion.textContent = `SESIÓN // ${perfil.nombre.toUpperCase()}`;
        if (perfilPanel) perfilPanel.textContent = perfil.nombre.toUpperCase();
    } else {
        if (estadoSesion) estadoSesion.classList.remove("con-sesion");
        if (textoSesion) textoSesion.textContent = "SIN SESIÓN";
        if (perfilPanel) perfilPanel.textContent = "NO IDENTIFICADO";
    }

    if (estadoAudioPie) {
        const ajustes = FleetApp.obtenerAjustes();
        if (!ajustes.musica && !ajustes.efectos) {
            estadoAudioPie.textContent = "AUDIO // OFF";
        } else if (!ajustes.musica) {
            estadoAudioPie.textContent = "AUDIO // SOLO FX";
        } else if (!ajustes.efectos) {
            estadoAudioPie.textContent = "AUDIO // SOLO MÚSICA";
        } else {
            estadoAudioPie.textContent = "AUDIO // CONFIGURADO";
        }
    }
}

// Marca opción activa del menú.
function seleccionarOpcion(boton) {
    if (!boton) return;

    opciones.forEach((opcion) => opcion.classList.remove("seleccionada"));
    boton.classList.add("seleccionada");

    accionSeleccionada = boton.dataset.accion;
    tituloPanel.textContent = boton.dataset.titulo;
    descripcionPanel.textContent = boton.dataset.descripcion;

    const textosBoton = {
        nave: "INICIAR SESIÓN",
        puntuaciones: "VER TABLA",
        reglas: "ABRIR REGLAS",
        ajustes: "ABRIR AJUSTES",
        salir: "DESCONECTAR"
    };

    textoAccionPrincipal.textContent = textosBoton[accionSeleccionada];
}

// Mueve selección con teclado.
function moverSeleccion(delta) {
    const indiceActual = Math.max(0, opcionesLista.findIndex((opcion) => opcion.classList.contains("seleccionada")));
    const nuevoIndice = (indiceActual + delta + opcionesLista.length) % opcionesLista.length;
    const nuevaOpcion = opcionesLista[nuevoIndice];
    seleccionarOpcion(nuevaOpcion);
    nuevaOpcion.focus({ preventScroll: true });
}

// Abre un modal HUD.
function abrirModal(modal) {
    modal.classList.add("abierto");
}

// Cierra un modal HUD.
function cerrarModal(modal) {
    modal.classList.remove("abierto");
}

// Ejecuta la opción elegida.
function ejecutarAccion(accion) {
    switch (accion) {
        case "nave": {
            if (!FleetApp.usuarioActual()) {
                errorLogin.textContent = "Inicia sesión para entrar al puente de mando.";
                abrirModal(modalLogin);
                usuarioInput.focus();
                return;
            }

            FleetApp.irConLoading("dashboard.html", "Preparando puente de mando...");
            break;
        }

        case "login": {
            errorLogin.textContent = "";
            abrirModal(modalLogin);
            usuarioInput.focus();
            break;
        }

        case "puntuaciones":
            window.location.href = "puntuaciones.html?from=index";
            break;

        case "reglas":
            window.location.href = "reglas.html?from=index";
            break;

        case "ajustes":
            window.location.href = "ajustes.html?from=index";
            break;

        case "salir":
            abrirModal(document.getElementById("modalSalir"));
            break;
    }
}

// Eventos del menú principal.
opciones.forEach((boton) => {
    boton.addEventListener("mouseenter", () => seleccionarOpcion(boton));
    boton.addEventListener("focus", () => seleccionarOpcion(boton));
    boton.addEventListener("click", () => ejecutarAccion(boton.dataset.accion));
});

btnAccionPrincipal.addEventListener("click", () => ejecutarAccion(accionSeleccionada));

// Botones genéricos para cerrar modales.
document.querySelectorAll("[data-cerrar-modal]").forEach((boton) => {
    boton.addEventListener("click", () => {
        const modal = document.getElementById(boton.dataset.cerrarModal);
        if (modal) cerrarModal(modal);
    });
});

// Cierra modal al tocar fondo.
document.querySelectorAll(".modal-overlay").forEach((modal) => {
    modal.addEventListener("click", (evento) => {
        if (evento.target === modal) cerrarModal(modal);
    });
});

// Controla navegación por teclado.
document.addEventListener("keydown", (evento) => {
    const modalAbierto = document.querySelector(".modal-overlay.abierto");

    if (evento.key === "Escape" && modalAbierto) {
        evento.stopImmediatePropagation();
        cerrarModal(modalAbierto);
        return;
    }

    if (modalAbierto) return;

    if (evento.key === "ArrowDown") {
        evento.preventDefault();
        moverSeleccion(1);
        return;
    }

    if (evento.key === "ArrowUp") {
        evento.preventDefault();
        moverSeleccion(-1);
        return;
    }

    if (evento.key === "Enter") {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        evento.preventDefault();
        ejecutarAccion(accionSeleccionada);
    }
}, true);

// Valida login y entra al dashboard.
formLogin.addEventListener("submit", (evento) => {
    evento.preventDefault();
    errorLogin.textContent = "";

    const resultado = FleetApp.iniciarSesion(usuarioInput.value, passwordInput.value);

    if (!resultado.ok) {
        errorLogin.textContent = resultado.mensaje;
        return;
    }

    cerrarModal(modalLogin);
    actualizarSesionVisual();
    FleetApp.mostrarToast(`Sesión iniciada: ${resultado.usuario.nombre}`);

    window.setTimeout(() => {
        FleetApp.irConLoading("dashboard.html", "Validando credenciales y preparando la nave...");
    }, 850);
});

// Facebook usa el mismo flujo visual después de obtener el perfil externo.
document.addEventListener("fleet:sesion-iniciada", (evento) => {
    const usuario = evento.detail;
    cerrarModal(modalLogin);
    actualizarSesionVisual();
    FleetApp.mostrarToast(`Sesión de Facebook iniciada: ${usuario.nombre}`);

    window.setTimeout(() => {
        FleetApp.irConLoading("dashboard.html", "Conectando perfil de Facebook con Fleet Command...");
    }, 700);
});

// Muestra salida si no cierra pestaña.
document.getElementById("confirmarSalir").addEventListener("click", () => {
    cerrarModal(document.getElementById("modalSalir"));

    window.close();

    window.setTimeout(() => {
        const pantalla = document.getElementById("pantallaDesconexion");
        pantalla.classList.add("visible");
        pantalla.setAttribute("aria-hidden", "false");
    }, 120);
});

// Regresa desde pantalla desconectada.
document.getElementById("volverSistema").addEventListener("click", () => {
    const pantalla = document.getElementById("pantallaDesconexion");
    pantalla.classList.remove("visible");
    pantalla.setAttribute("aria-hidden", "true");
});

seleccionarOpcion(document.querySelector('.opcion-menu[data-accion="nave"]'));
actualizarSesionVisual();

const avisoPendiente = sessionStorage.getItem("fleetAviso");
if (avisoPendiente) {
    sessionStorage.removeItem("fleetAviso");
    window.setTimeout(() => FleetApp.mostrarToast(avisoPendiente), 180);
}
