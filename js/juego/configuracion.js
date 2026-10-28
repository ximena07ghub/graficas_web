export const CONFIG_DEFECTO = {
    rival: "online",
    modo: "rafaga",
    mapa: "playa",
    dificultad: "normal"
};

export function obtenerConfiguracion() {
    try {
        const guardada = JSON.parse(localStorage.getItem("fleetCommandConfig") || "null");
        return guardada ? { ...CONFIG_DEFECTO, ...guardada } : { ...CONFIG_DEFECTO };
    } catch (_error) {
        return { ...CONFIG_DEFECTO };
    }
}

export function obtenerTamanoTablero(dificultad) {
    return dificultad === "dificil" ? 12 : 10;
}

export function obtenerCantidadBarcos(dificultad) {
    return dificultad === "dificil" ? 3 : 5;
}

export function describirConfiguracion(config) {
    const nombres = {
        rival: { online: "ONLINE", ia: "CONTRA IA" },
        modo: { clasico: "CLÁSICO", rafaga: "RÁFAGA" },
        mapa: { playa: "PLAYA", tormenta: "TORMENTA", artico: "MAR ÁRTICO" },
        dificultad: { normal: "NORMAL", dificil: "DIFÍCIL" }
    };

    return ["rival", "modo", "mapa", "dificultad"]
        .map((grupo) => nombres[grupo][config[grupo]] || config[grupo])
        .join(" // ");
}
