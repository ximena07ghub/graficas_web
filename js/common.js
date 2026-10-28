// Utilidades compartidas de Fleet Command.
(function () {
    "use strict";

    const CLAVES = {
        ajustes: "fleetAjustes",
        sesion: "fleetSesion"
    };

    try {
        localStorage.removeItem("fleetUsuarios");
    } catch (_error) {
        // Limpieza de datos locales antiguos del primer avance.
    }

    const AJUSTES_DEFECTO = {
        musica: true,
        efectos: true,
        volumenMusica: 0.32,
        volumenEfectos: 0.55
    };

    let contextoAudio = null;
    let musica = null;
    let temporizadorMusica = null;

    function leerJSON(clave, respaldo) {
        try {
            const valor = localStorage.getItem(clave);
            return valor ? JSON.parse(valor) : respaldo;
        } catch (_error) {
            return respaldo;
        }
    }

    function guardarJSON(clave, valor) {
        localStorage.setItem(clave, JSON.stringify(valor));
    }

    function obtenerAjustes() {
        return {
            ...AJUSTES_DEFECTO,
            ...leerJSON(CLAVES.ajustes, {})
        };
    }

    function guardarAjustes(nuevos) {
        const ajustes = {
            ...obtenerAjustes(),
            ...nuevos
        };

        guardarJSON(CLAVES.ajustes, ajustes);
        aplicarVolumenMusica();
        return ajustes;
    }

    function crearBeep() {
        const ajustes = obtenerAjustes();
        if (!ajustes.efectos) return;

        try {
            contextoAudio = contextoAudio || new (window.AudioContext || window.webkitAudioContext)();
            const ahora = contextoAudio.currentTime;
            const oscilador = contextoAudio.createOscillator();
            const ganancia = contextoAudio.createGain();

            oscilador.type = "triangle";
            oscilador.frequency.setValueAtTime(330, ahora);
            oscilador.frequency.exponentialRampToValueAtTime(170, ahora + 0.065);

            const volumen = Math.max(0.001, ajustes.volumenEfectos * 0.11);
            ganancia.gain.setValueAtTime(volumen, ahora);
            ganancia.gain.exponentialRampToValueAtTime(0.001, ahora + 0.075);

            oscilador.connect(ganancia);
            ganancia.connect(contextoAudio.destination);
            oscilador.start(ahora);
            oscilador.stop(ahora + 0.08);
        } catch (_error) {
            // El navegador puede bloquear Web Audio antes de una interacción.
        }
    }

    function sonidoClick() {
        const ajustes = obtenerAjustes();
        if (!ajustes.efectos) return;

        const audio = new Audio("assets/audio/click-source.mp3");
        audio.preload = "auto";
        audio.volume = Math.min(1, Math.max(0, 0.9 * ajustes.volumenEfectos));
        audio.play().catch(() => crearBeep());
    }

    function instalarSonidosUI() {
        document.addEventListener("click", (evento) => {
            if (evento.target.closest("button, a, [data-sonido-ui]")) sonidoClick();
        });
    }

    function aplicarVolumenMusica() {
        if (!musica) return;

        const ajustes = obtenerAjustes();
        const pagina = document.body.dataset.page || "otra";
        const multiplicadorPagina = pagina === "index" ? 1 : pagina === "juego" ? 0.32 : 0.42;

        musica.volume = ajustes.musica
            ? Math.min(1, ajustes.volumenMusica * multiplicadorPagina)
            : 0;

        if (!ajustes.musica) musica.pause();
    }

    function iniciarMusica() {
        const pagina = document.body.dataset.page || "otra";
        if (!["index", "dashboard", "juego"].includes(pagina)) return;

        const ajustes = obtenerAjustes();
        if (!ajustes.musica) return;
        if (musica && !musica.paused) return;

        if (!musica) {
            musica = new Audio("assets/audio/music-source.mp3");
            musica.preload = "auto";
            musica.loop = false;

            musica.addEventListener("loadedmetadata", () => {
                if (Number.isFinite(musica.duration) && musica.duration > 458) {
                    musica.currentTime = 458;
                }
            });
        }

        aplicarVolumenMusica();

        if (musica.currentTime < 458 || musica.currentTime >= 636) {
            try {
                musica.currentTime = 458;
            } catch (_error) {
                // Se reintenta después de que el audio cargue.
            }
        }

        musica.play().catch(() => {});

        if (!temporizadorMusica) {
            temporizadorMusica = window.setInterval(() => {
                if (!musica) return;
                if (musica.currentTime >= 636) {
                    musica.currentTime = 458;
                    musica.play().catch(() => {});
                }
            }, 250);
        }
    }

    function instalarInicioMusica() {
        iniciarMusica();

        const activar = () => {
            iniciarMusica();
            document.removeEventListener("pointerdown", activar);
            document.removeEventListener("keydown", activar);
        };

        document.addEventListener("pointerdown", activar);
        document.addEventListener("keydown", activar);
    }

    async function alternarPantallaCompleta() {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (_error) {
            mostrarToast("El navegador bloqueó la pantalla completa. También puedes usar F11.");
        }
    }

    function guardarSesion(perfil) {
        sessionStorage.setItem(CLAVES.sesion, JSON.stringify(perfil));
    }

    function obtenerPerfil() {
        try {
            const valor = sessionStorage.getItem(CLAVES.sesion);
            if (!valor) return null;

            try {
                const perfil = JSON.parse(valor);
                return perfil?.nombre ? perfil : null;
            } catch (_error) {
                // Compatibilidad con sesiones antiguas que solo guardaban el nombre.
                return { nombre: valor, proveedor: "local" };
            }
        } catch (_error) {
            return null;
        }
    }

    function usuarioActual() {
        return obtenerPerfil()?.nombre || "";
    }

    function iniciarSesion(usuario, password) {
        const nombre = String(usuario || "").trim();
        const clave = String(password || "");

        if (nombre.length < 3) {
            return { ok: false, mensaje: "El usuario debe tener al menos 3 caracteres." };
        }

        if (clave.length < 4) {
            return { ok: false, mensaje: "La contraseña debe tener al menos 4 caracteres." };
        }

        const perfil = { nombre, proveedor: "local" };
        guardarSesion(perfil);
        return { ok: true, usuario: perfil, nuevo: false };
    }

    function iniciarSesionExterna({ nombre, proveedor, idExterno = "", email = "" }) {
        const nombreLimpio = String(nombre || "").trim();

        if (nombreLimpio.length < 2) {
            return { ok: false, mensaje: "No fue posible obtener un nombre válido del proveedor externo." };
        }

        const perfil = {
            nombre: nombreLimpio,
            proveedor: String(proveedor || "externo"),
            idExterno: String(idExterno || ""),
            email: String(email || "")
        };

        guardarSesion(perfil);
        return { ok: true, usuario: perfil };
    }

    function cerrarSesion() {
        sessionStorage.removeItem(CLAVES.sesion);
    }

    function registrarResultado() {
        console.warn("Los puntajes oficiales se registran mediante FleetAPI y MySQL.");
        return false;
    }

    function irConLoading(destino, mensaje) {
        sessionStorage.setItem("fleetDestino", destino);
        sessionStorage.setItem("fleetMensajeCarga", mensaje || "Preparando sistema...");
        window.location.href = "loading.html";
    }

    function mostrarToast(mensaje, duracion = 2200) {
        let toast = document.getElementById("fleetToast");

        if (!toast) {
            toast = document.createElement("div");
            toast.id = "fleetToast";
            toast.className = "toast-fleet";
            document.body.appendChild(toast);
        }

        toast.textContent = mensaje;
        toast.classList.add("visible");

        window.clearTimeout(toast._timer);
        toast._timer = window.setTimeout(() => {
            toast.classList.remove("visible");
        }, duracion);
    }

    window.FleetApp = {
        obtenerAjustes,
        guardarAjustes,
        sonidoClick,
        iniciarMusica,
        alternarPantallaCompleta,
        iniciarSesion,
        iniciarSesionExterna,
        cerrarSesion,
        usuarioActual,
        obtenerPerfil,
        registrarResultado,
        irConLoading,
        mostrarToast
    };

    document.addEventListener("DOMContentLoaded", () => {
        instalarSonidosUI();
        instalarInicioMusica();
    });
})();
