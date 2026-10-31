const estadoApi = document.getElementById("estadoApi");
const cuerpo = document.getElementById("cuerpoPuntuaciones");

function escaparTexto(valor) {
    return String(valor ?? "");
}

async function cargarPuntuaciones() {
    estadoApi.className = "estado-api";
    estadoApi.textContent = `Consultando ${FleetAPI.API_BASE}...`;

    try {
        const datos = await FleetAPI.obtenerPuntuaciones();
        cuerpo.innerHTML = "";

        if (!datos.puntuaciones.length) {
            cuerpo.innerHTML =
            '<tr><td colspan="5">' +
            'Todavía no hay puntuaciones oficiales registradas.' +
            '</td></tr>';
                } else {
            datos.puntuaciones.forEach((fila, indice) => {
                const tr = document.createElement("tr");
                [
                    indice + 1,
                    escaparTexto(fila.nombre),
                    Number(fila.puntos) || 0,
                    Number(fila.partidas) || 0,
                    Number(fila.victorias) || 0
                ].forEach((valor) => {
                    const td = document.createElement("td");
                    td.textContent = valor;
                    tr.appendChild(td);
                });
                cuerpo.appendChild(tr);
            });
        }

        estadoApi.classList.add("ok");
        estadoApi.textContent = "Conexion exitosa.";
    } catch (error) {
        console.error(error);
        estadoApi.classList.add("error");
        estadoApi.textContent = "Error de conexion.";
        cuerpo.innerHTML = '<tr><td colspan="5">Sin conexión.</td></tr>';
    }
}

function volver() {
    const origen = new URLSearchParams(window.location.search).get("from");
    window.location.href = origen === "dashboard" ? "dashboard.html" : "index.html";
}

document.getElementById("btnCerrarPuntuaciones").addEventListener("click", volver);
document.getElementById("btnReintentarPuntuaciones").addEventListener("click", cargarPuntuaciones);

cargarPuntuaciones();
