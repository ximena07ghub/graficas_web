// Este modulo se importa solamente desde js/juego/main.js.
// Copia el MP3 de Downloads a assets/audio/ambientes/playa.mp3.
const SONIDOS_POR_MAPA = {
    playa: "/assets/audio/ambientes/playa.mp3",
    tormenta: "/assets/audio/ambientes/tormenta.mp3",
    artico: "/assets/audio/ambientes/artico.mp3"
};

export function crearAudioAmbiente(mapa) {
    const ruta = SONIDOS_POR_MAPA[mapa];

    // Un mapa sin archivo configurado permanece en silencio, sin provocar 404.
    if (!ruta) {
        return { pausar() {}, reanudar() {}, detener() {}, dispose() {} };
    }

    const audio = new Audio(ruta);
    audio.loop = true;
    audio.preload = "auto";

    let suspendido = false;
    let destruido = false;
    let fallo = false;
    let intentando = false;

    // Se reutilizan el interruptor Musica y su volumen para el audio de fondo.
    function ajustes() {
        return window.FleetApp.obtenerAjustes();
    }

    function permitido() {
        return !destruido && !fallo && !suspendido &&
            !document.hidden && ajustes().musica;
    }

    function actualizarVolumen() {
        const valor = Number(ajustes().volumenMusica);
        audio.volume = Number.isFinite(valor)
            ? Math.min(1, Math.max(0, valor))
            : 0.32;
    }

    async function reproducir() {
        if (destruido) return;
        actualizarVolumen();

        if (!permitido()) {
            audio.pause();
            return;
        }

        if (intentando || !audio.paused) return;
        intentando = true;

        try {
            await audio.play();
            // El usuario pudo pausar o salir mientras play() estaba pendiente.
            if (!permitido()) audio.pause();
        } catch (error) {
            // Si el navegador exige un clic, los eventos de abajo reintentan.
            if (!destruido && error.name !== "NotAllowedError" && error.name !== "AbortError") {
                console.warn("No se pudo reproducir el ambiente:", error);
            }
        } finally {
            intentando = false;
        }
    }

    function sincronizar() {
        void reproducir();
    }

    function alCambiarAlmacenamiento(evento) {
        if (evento.key === "fleetAjustes" || evento.key === null) sincronizar();
    }

    function alSalirDePagina() {
        audio.pause();
    }

    function alError() {
        fallo = true;
        console.warn("Revisa que exista el archivo de ambiente:", ruta);
    }

    document.addEventListener("pointerdown", sincronizar);
    document.addEventListener("keydown", sincronizar);
    document.addEventListener("visibilitychange", sincronizar);
    document.addEventListener("fleet:ajustes-cambiados", sincronizar);
    window.addEventListener("storage", alCambiarAlmacenamiento);
    window.addEventListener("pagehide", alSalirDePagina);
    window.addEventListener("pageshow", sincronizar);
    audio.addEventListener("error", alError);

    sincronizar();

    return {
        pausar() {
            suspendido = true;
            audio.pause();
        },
        reanudar() {
            if (destruido) return;
            suspendido = false;
            sincronizar();
        },
        detener() {
            suspendido = true;
            audio.pause();
            audio.currentTime = 0;
        },
        dispose() {
            if (destruido) return;
            destruido = true;
            audio.pause();
            document.removeEventListener("pointerdown", sincronizar);
            document.removeEventListener("keydown", sincronizar);
            document.removeEventListener("visibilitychange", sincronizar);
            document.removeEventListener("fleet:ajustes-cambiados", sincronizar);
            window.removeEventListener("storage", alCambiarAlmacenamiento);
            window.removeEventListener("pagehide", alSalirDePagina);
            window.removeEventListener("pageshow", sincronizar);
            audio.removeEventListener("error", alError);
            audio.removeAttribute("src");
            audio.load();
        }
    };
}
