// Conexion centralizada con el Web Service de Fleet Command.
(function () {
    "use strict";

    const API_BASE = localStorage.getItem("fleetApiBaseUrl") || "http://localhost/WebServices";

    async function leerJSON(respuesta) {
        const datos = await respuesta.json().catch(() => null);

        if (!respuesta.ok || !datos?.ok) {
            throw new Error(datos?.mensaje || `Error HTTP ${respuesta.status}`);
        }

        return datos;
    }

    async function guardarPuntuacion({ nombre, score, resultado, modo, mapa, dificultad }) {
        const datos = new URLSearchParams({
            nombre: String(nombre || "").trim(),
            score: String(Number(score) || 0),
            resultado: resultado === "victoria" ? "victoria" : "derrota",
            modo: String(modo || "clasico"),
            mapa: String(mapa || "playa"),
            dificultad: String(dificultad || "normal")
        });

        const respuesta = await fetch(`${API_BASE}/guardar_puntaje.php`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            },
            body: datos.toString()
        });

        return leerJSON(respuesta);
    }

    async function obtenerPuntuaciones() {
        const respuesta = await fetch(`${API_BASE}/obtener_puntajes.php`, {
            cache: "no-store"
        });

        return leerJSON(respuesta);
    }

    async function obtenerPerfil(nombre) {
        const parametro = encodeURIComponent(String(nombre || "").trim());
        const respuesta = await fetch(`${API_BASE}/obtener_perfil.php?nombre=${parametro}`, {
            cache: "no-store"
        });

        return leerJSON(respuesta);
    }

    async function comprobarConexion() {
        const respuesta = await fetch(`${API_BASE}/health.php`, {
            cache: "no-store"
        });

        return leerJSON(respuesta);
    }

    window.FleetAPI = {
        API_BASE,
        guardarPuntuacion,
        obtenerPuntuaciones,
        obtenerPerfil,
        comprobarConexion
    };
})();
