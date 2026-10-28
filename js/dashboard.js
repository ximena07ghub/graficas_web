// Configuración de partida desde el puente de mando.
const perfilActual = FleetApp.obtenerPerfil();

if (!perfilActual) {
    sessionStorage.setItem("fleetAviso", "Inicia sesión para entrar a NAVE.");
    window.location.href = "index.html";
}

if (perfilActual) {
    document.getElementById("nombreUsuarioDashboard").textContent = perfilActual.nombre;
    document.getElementById("nivelUsuarioDashboard").textContent = perfilActual.proveedor === "facebook" ? "Sesión con Facebook" : "Sesión local";
}

const CONFIG_DEFECTO = {
    rival: "online",
    modo: "rafaga",
    mapa: "playa",
    dificultad: "normal"
};

let configuracion = { ...CONFIG_DEFECTO };

try {
    const guardada = JSON.parse(localStorage.getItem("fleetCommandConfig") || "null");
    if (guardada) configuracion = { ...CONFIG_DEFECTO, ...guardada };
} catch (_error) {
    configuracion = { ...CONFIG_DEFECTO };
}

const opciones = document.querySelectorAll("[data-grupo]");
const btnIniciar = document.getElementById("btnIniciar");
const textoEstado = document.getElementById("textoEstado");

function aplicarSeleccionVisual() {
    Object.entries(configuracion).forEach(([grupo, valor]) => {
        document.querySelectorAll(`[data-grupo="${grupo}"]`).forEach((elemento) => {
            elemento.classList.toggle("seleccionada", elemento.dataset.valor === valor);
        });
    });
}

opciones.forEach((boton) => {
    boton.addEventListener("click", () => {
        const grupo = boton.dataset.grupo;
        const valor = boton.dataset.valor;

        document.querySelectorAll(`[data-grupo="${grupo}"]`).forEach((elemento) => {
            elemento.classList.remove("seleccionada");
        });

        boton.classList.add("seleccionada");
        configuracion[grupo] = valor;
        localStorage.setItem("fleetCommandConfig", JSON.stringify(configuracion));
        actualizarEstado();
    });
});

function actualizarEstado() {
    const nombres = {
        rival: { online: "Online", ia: "Contra IA" },
        modo: { clasico: "Clásico", rafaga: "Ráfaga" },
        mapa: { playa: "Playa", tormenta: "Tormenta", artico: "Mar Ártico" },
        dificultad: { normal: "Normal", dificil: "Difícil" }
    };

    textoEstado.textContent = ["rival", "modo", "mapa", "dificultad"]
        .map((grupo) => nombres[grupo][configuracion[grupo]])
        .join(" · ");
}

btnIniciar.addEventListener("click", () => {
    localStorage.setItem("fleetCommandConfig", JSON.stringify(configuracion));
    btnIniciar.disabled = true;

    const mensaje = configuracion.rival === "online"
        ? "Preparando enlace multijugador..."
        : "Preparando simulación contra IA...";

    FleetApp.mostrarToast("Preparando Fleet Command 3D.");
    setTimeout(() => FleetApp.irConLoading("juego.html", mensaje), 650);
});

// Ajustes rápidos dentro del dashboard.
const modalAjustes = document.getElementById("modalAjustesDashboard");
const btnAjustes = document.getElementById("btnAjustesDashboard");
const btnCerrarAjustes = document.getElementById("btnCerrarAjustesDashboard");
const btnSalirDesdeAjustes = document.getElementById("btnSalirDesdeAjustes");
const dashMusicaActiva = document.getElementById("dashMusicaActiva");
const dashEfectosActivos = document.getElementById("dashEfectosActivos");
const dashVolumenMusica = document.getElementById("dashVolumenMusica");
const dashVolumenEfectos = document.getElementById("dashVolumenEfectos");
const dashValorMusica = document.getElementById("dashValorMusica");
const dashValorEfectos = document.getElementById("dashValorEfectos");

function cargarAjustesDashboard() {
    const ajustes = FleetApp.obtenerAjustes();
    dashMusicaActiva.checked = ajustes.musica;
    dashEfectosActivos.checked = ajustes.efectos;
    dashVolumenMusica.value = Math.round(ajustes.volumenMusica * 100);
    dashVolumenEfectos.value = Math.round(ajustes.volumenEfectos * 100);
    dashValorMusica.textContent = `${dashVolumenMusica.value}%`;
    dashValorEfectos.textContent = `${dashVolumenEfectos.value}%`;
}

function guardarAjustesDashboard() {
    FleetApp.guardarAjustes({
        musica: dashMusicaActiva.checked,
        efectos: dashEfectosActivos.checked,
        volumenMusica: Number(dashVolumenMusica.value) / 100,
        volumenEfectos: Number(dashVolumenEfectos.value) / 100
    });

    dashValorMusica.textContent = `${dashVolumenMusica.value}%`;
    dashValorEfectos.textContent = `${dashVolumenEfectos.value}%`;
    if (dashMusicaActiva.checked) FleetApp.iniciarMusica();
}

function abrirAjustesDashboard() {
    cargarAjustesDashboard();
    modalAjustes.classList.add("abierto");
}

function cerrarAjustesDashboard() {
    modalAjustes.classList.remove("abierto");
}

btnAjustes.addEventListener("click", abrirAjustesDashboard);
btnCerrarAjustes.addEventListener("click", cerrarAjustesDashboard);

[dashMusicaActiva, dashEfectosActivos, dashVolumenMusica, dashVolumenEfectos].forEach((control) => {
    control.addEventListener("input", guardarAjustesDashboard);
    control.addEventListener("change", guardarAjustesDashboard);
});

modalAjustes.addEventListener("click", (evento) => {
    if (evento.target === modalAjustes) cerrarAjustesDashboard();
});

document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && modalAjustes.classList.contains("abierto")) {
        evento.stopImmediatePropagation();
        cerrarAjustesDashboard();
    }
}, true);

btnSalirDesdeAjustes.addEventListener("click", () => {
    window.location.href = "index.html";
});

aplicarSeleccionVisual();
actualizarEstado();
cargarAjustesDashboard();
