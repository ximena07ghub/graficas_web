
(function () {
    "use strict";

    const API_BASE =
        localStorage.getItem("fleetApiBaseUrl") ||
        "http://localhost/WebServices";

    async function leerJSON(respuesta) {
        let datos;

        try {
            datos = await respuesta.json();
        } catch {
            throw new Error(
                "El servidor no devolvió un JSON válido."
            );
        }

        if (!respuesta.ok || !datos?.ok) {
            const error = new Error(
                datos?.mensaje ||
                `Error HTTP ${respuesta.status}`
            );

            error.status = respuesta.status;
            throw error;
        }

        return datos;
    }

    async function guardarPuntuacion({
        nombre,
        score,
        resultado,
        modo,
        mapa,
        dificultad
    }) {
        const datos = new URLSearchParams({
            nombre: String(nombre || "").trim(),
            score: String(Number(score) || 0),
            resultado: String(resultado || ""),
            modo: String(modo || ""),
            mapa: String(mapa || ""),
            dificultad: String(dificultad || "")
        });

        const respuesta = await fetch(
            `${API_BASE}/guardar_puntaje.php`,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded;charset=UTF-8"
                },
                body: datos.toString()
            }
        );

        return leerJSON(respuesta);
    }

    async function obtenerPuntuaciones() {
        const respuesta = await fetch(
            `${API_BASE}/obtener_puntajes.php`,
            { cache: "no-store" }
        );

        return leerJSON(respuesta);
    }

    async function obtenerPerfil(nombre) {
        const parametro = encodeURIComponent(
            String(nombre || "").trim()
        );

        const respuesta = await fetch(
            `${API_BASE}/obtener_perfil.php?nombre=${parametro}`,
            { cache: "no-store" }
        );

        return leerJSON(respuesta);
    }

    async function comprobarConexion() {
        const respuesta = await fetch(
            `${API_BASE}/health.php`,
            { cache: "no-store" }
        );

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
