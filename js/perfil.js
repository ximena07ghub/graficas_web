
const perfil = FleetApp.obtenerPerfil();

if (!perfil) {
    window.location.href = "index.html";
} else {
    const nombrePerfil =
        document.getElementById("nombrePerfil");

    const partidas =
        document.getElementById("partidasPerfil");

    const victorias =
        document.getElementById("victoriasPerfil");

    const derrotas =
        document.getElementById("derrotasPerfil");

    const efectividad =
        document.getElementById("efectividadPerfil");

    const lista =
        document.getElementById("listaHistorial");

    nombrePerfil.textContent =
        perfil.nombre.toUpperCase();

    function mostrarResumen(resumen) {
        partidas.textContent = Number(resumen.partidas) || 0;
        victorias.textContent = Number(resumen.victorias) || 0;
        derrotas.textContent = Number(resumen.derrotas) || 0;

        efectividad.textContent =
            `${Number(resumen.efectividad) || 0}%`;
    }

    function mostrarSinPartidas(mensaje) {
        mostrarResumen({
            partidas: 0,
            victorias: 0,
            derrotas: 0,
            efectividad: 0
        });

        lista.replaceChildren();

        const aviso = document.createElement("div");
        aviso.className = "historial-vacio";
        aviso.textContent = mensaje;

        lista.appendChild(aviso);
    }

    function mostrarHistorial(historial) {
        lista.replaceChildren();

        if (!historial.length) {
            mostrarSinPartidas(
                "Todavía no hay partidas terminadas."
            );
            return;
        }

        historial.forEach((partida) => {
            const item = document.createElement("article");

            item.className =
                `item-historial ${partida.resultado}`;

            const resultado = document.createElement("span");
            resultado.className = "resultado";
            resultado.textContent =
                String(partida.resultado).toUpperCase();

            const detalle = document.createElement("span");
            detalle.className = "detalle";

            detalle.textContent =
                `${Number(partida.score) || 0} pts · ` +
                `${partida.modo} · ` +
                `${partida.mapa} · ` +
                `${partida.dificultad}`;

            const fecha = document.createElement("time");
            fecha.textContent = partida.fecha || "";

            item.append(resultado, detalle, fecha);
            lista.appendChild(item);
        });
    }

    async function cargarResumenRemoto() {
        try {
            const datos = await FleetAPI.obtenerPerfil(
                perfil.nombre
            );

            mostrarResumen(datos.perfil);
            mostrarHistorial(datos.historial || []);

        } catch (error) {
            console.error(error);

            if (error.status === 404) {
                mostrarSinPartidas(
                    "Este perfil todavía no tiene un registro " +
                    "en la base de datos oficial."
                );
                return;
            }

            if (error.status === 409) {
                mostrarSinPartidas(
                    "Hay varios jugadores con este nombre. " +
                    "Es necesario identificar la cuenta."
                );
                return;
            }

            [partidas, victorias, derrotas, efectividad]
                .forEach((elemento) => {
                    elemento.textContent = "—";
                });

            lista.replaceChildren();

            const aviso = document.createElement("div");
            aviso.className = "historial-vacio";
            aviso.textContent =
                "No fue posible consultar las estadísticas. " +
                "Comprueba la conexión con el servicio.";

            lista.appendChild(aviso);
        }
    }

    document
        .getElementById("btnCerrarPanelSistema")
        .addEventListener("click", () => {
            const origen = new URLSearchParams(
                window.location.search
            ).get("from");

            window.location.href =
                origen === "index"
                    ? "index.html"
                    : "dashboard.html";
        });

    cargarResumenRemoto();
}
