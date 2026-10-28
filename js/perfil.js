// Perfil de sesión; las estadísticas oficiales vienen del Web Service.
const perfil = FleetApp.obtenerPerfil();

if (!perfil) {
    window.location.href = "index.html";
} else {
    document.getElementById("nombrePerfil").textContent = perfil.nombre.toUpperCase();

    const partidas = document.getElementById("partidasPerfil");
    const victorias = document.getElementById("victoriasPerfil");
    const derrotas = document.getElementById("derrotasPerfil");
    const efectividad = document.getElementById("efectividadPerfil");
    const lista = document.getElementById("listaHistorial");

    function mostrarHistorial(historial) {
        lista.innerHTML = "";

        if (!historial.length) {
            lista.innerHTML = '<div class="historial-vacio">Todavía no hay partidas terminadas para este jugador.</div>';
            return;
        }

        historial.forEach((partida) => {
            const item = document.createElement("article");
            item.className = `item-historial ${partida.resultado}`;

            const resultado = document.createElement("span");
            resultado.className = "resultado";
            resultado.textContent = String(partida.resultado).toUpperCase();

            const detalle = document.createElement("span");
            detalle.className = "detalle";
            detalle.textContent = `${Number(partida.score) || 0} pts · ${partida.modo} · ${partida.mapa} · ${partida.dificultad}`;

            const fecha = document.createElement("time");
            fecha.textContent = partida.fecha || "";

            item.append(resultado, detalle, fecha);
            lista.appendChild(item);
        });
    }

    async function cargarResumenRemoto() {
        try {
            const datos = await FleetAPI.obtenerPerfil(perfil.nombre);
            const resumen = datos.perfil;

            partidas.textContent = Number(resumen.partidas) || 0;
            victorias.textContent = Number(resumen.victorias) || 0;
            derrotas.textContent = Number(resumen.derrotas) || 0;
            efectividad.textContent = `${Number(resumen.efectividad) || 0}%`;
            mostrarHistorial(datos.historial || []);
        } catch (error) {
            console.error(error);
            [partidas, victorias, derrotas, efectividad].forEach((elemento) => {
                elemento.textContent = "—";
            });

            lista.innerHTML = `
                <div class="historial-vacio">
                    No se pudo consultar MySQL. Revisa Apache, MySQL y el Web Service.
                </div>
            `;
        }
    }

    document.getElementById("btnCerrarPanelSistema").addEventListener("click", () => {
        const origen = new URLSearchParams(window.location.search).get("from");
        window.location.href = origen === "index" ? "index.html" : "dashboard.html";
    });

    cargarResumenRemoto();
}
