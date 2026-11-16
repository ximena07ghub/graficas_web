const sonidos = new Map();
const activos = new Set();

export function reproducirEfecto(nombre) {
    const { efectos, volumenEfectos } = window.FleetApp.obtenerAjustes();
    if (!efectos || volumenEfectos <= 0) return;

    let original = sonidos.get(nombre);
    if (!original) {
        original = new Audio(`/assets/audio/efectos/${nombre}.mp3`);
        sonidos.set(nombre, original);
    }

    const audio = original.cloneNode(true);
    audio.volume = Math.min(1, Math.max(0, volumenEfectos));
    activos.add(audio);

    const liberar = () => activos.delete(audio);
    audio.addEventListener("ended", liberar, { once: true });
    audio.addEventListener("error", liberar, { once: true });
    void audio.play().catch(liberar);
}

export function detenerEfectos() {
    for (const audio of activos) audio.pause();
    activos.clear();
}
