
export const TAMANO_CELDA = 1.65;

// Crea los datos de una partida nueva.
export function crearMotorPartida(configuracion) {
    const tamano =
        configuracion.dificultad === "dificil" ? 12 : 10;

    const cantidadBarcos =
        configuracion.dificultad === "dificil" ? 3 : 5;

    const disparosPorTurno =
        configuracion.modo === "rafaga" ? 3 : 1;

    return {
        configuracion: { ...configuracion },
        fase: "colocando",
        tamano,
        cantidadBarcos,
        disparosPorTurno,
        turno: 1,
        restantes: disparosPorTurno,
        flotas: {
            1: null,
            2: null
        },
        disparos: {
            1: new Set(),
            2: new Set()
        },
        aciertos: {
            1: 0,
            2: 0
        },
        historial: [],
        ganador: null
    };
}

// Calcula los puntos usando los resultados del servidor.

export function resultadoPartida(partida) {
    // Solo calcular cuando exista una victoria válida.
    if (
        partida.fase !== "finalizada" ||
        ![1, 2].includes(partida.ganador)
    ) {
        return null;
    }

    // Cada barco vale según la dificultad.
    const puntosPorBarco =
        partida.configuracion.dificultad === "dificil"
            ? 200
            : 100;

    // Recompensa fija por ganar la partida.
    const bonoVictoria = 300;

    // Calcular los puntos de un jugador.
    function puntuar(slot) {
        const barcosDestruidos = partida.aciertos[slot];

        const puntosDestruccion =
            barcosDestruidos * puntosPorBarco;

        const puntosVictoria =
            partida.ganador === slot ? bonoVictoria : 0;

        return puntosDestruccion + puntosVictoria;
    }

    // Devolver los puntos de los dos jugadores.
    return {
        ganador: partida.ganador,

        puntuaciones: {
            1: puntuar(1),
            2: puntuar(2)
        }
    };
}


// Información que ambos jugadores pueden recibir.
export function estadoPublico(partida) {
    return {
        fase: partida.fase,
        tamano: partida.tamano,
        turno: partida.turno,
        restantes: partida.restantes,
        listos: {
            1: partida.flotas[1] !== null,
            2: partida.flotas[2] !== null
        },
        historial: partida.historial.map(
            evento => ({ ...evento })
        ),
        ganador: partida.ganador,
        resultado: resultadoPartida(partida)
    };
}

// Información privada que solamente recibe el dueño.
export function flotaPropia(partida, slot) {
    const flota = partida.flotas[slot];

    if (!flota) return null;

    return [...flota.values()].map(barco => ({
        barcoId: barco.barcoId,
        x: barco.x,
        z: barco.z,
        rotY: barco.rotY
    }));
}

// Transforma una posición 3D en un índice de casilla.
function celdaDeCoordenada(posicion, tamano) {
    if (
        typeof posicion !== "number" ||
        !Number.isFinite(posicion)
    ) {
        return null;
    }

    const mitad = (tamano * TAMANO_CELDA) / 2;

    const indice = Math.round(
        (posicion + mitad) / TAMANO_CELDA - 0.5
    );

    const centro =
        -mitad + (indice + 0.5) * TAMANO_CELDA;

    const alineado =
        Math.abs(posicion - centro) < 0.12;

    if (
        indice < 0 ||
        indice >= tamano ||
        !alineado
    ) {
        return null;
    }

    return indice;
}

// Confirma y valida la posición de una flota.
export function registrarFlota(partida, slot, flota) {
    if (![1, 2].includes(slot)) {
        return {
            ok: false,
            mensaje: "Jugador inválido."
        };
    }

    if (partida.fase !== "colocando") {
        return {
            ok: false,
            mensaje: "La colocación ya terminó."
        };
    }

    if (partida.flotas[slot]) {
        return {
            ok: false,
            mensaje: "La flota ya fue confirmada."
        };
    }

    if (
        !Array.isArray(flota) ||
        flota.length !== partida.cantidadBarcos
    ) {
        return {
            ok: false,
            mensaje: `Se necesitan ${partida.cantidadBarcos} barcos.`
        };
    }

    const barcos = new Map();
    const casillasOcupadas = new Set();

    for (const barco of flota) {
        const identificadorValido =
            barco &&
            typeof barco.barcoId === "string" &&
            new RegExp(
                `^p${slot}-b[1-${partida.cantidadBarcos}]$`
            ).test(barco.barcoId);

        if (
            !identificadorValido ||
            barcos.has(barco.barcoId)
        ) {
            return {
                ok: false,
                mensaje: "Identificadores de barcos inválidos."
            };
        }

        const columna = celdaDeCoordenada(
            barco.x,
            partida.tamano
        );

        const fila = celdaDeCoordenada(
            barco.z,
            partida.tamano
        );

        const mitad = partida.tamano / 2;

        const ladoCorrecto = slot === 1
            ? fila >= mitad
            : fila < mitad;

        if (
            columna === null ||
            fila === null ||
            !ladoCorrecto
        ) {
            return {
                ok: false,
                mensaje: "Coloca los barcos en tu mitad."
            };
        }

        const clave = `${columna},${fila}`;

        if (casillasOcupadas.has(clave)) {
            return {
                ok: false,
                mensaje: "Hay barcos en la misma casilla."
            };
        }

        casillasOcupadas.add(clave);

        barcos.set(barco.barcoId, {
            barcoId: barco.barcoId,
            columna,
            fila,
            x: barco.x,
            z: barco.z,
            rotY: Number.isFinite(barco.rotY)
                ? barco.rotY
                : 0
        });
    }

    partida.flotas[slot] = barcos;

    if (partida.flotas[1] && partida.flotas[2]) {
        partida.fase = "en_curso";
    }

    return {
        ok: true,
        estado: estadoPublico(partida)
    };
}

// Valida y ejecuta un disparo.
export function disparar(partida, slot, celda) {
    if (![1, 2].includes(slot)) {
        return {
            ok: false,
            mensaje: "Jugador inválido."
        };
    }

    if (partida.fase !== "en_curso") {
        return {
            ok: false,
            mensaje: "La partida no está activa."
        };
    }

    if (slot !== partida.turno) {
        return {
            ok: false,
            mensaje: "Es turno del rival."
        };
    }

    const columna = celda?.columna;
    const fila = celda?.fila;
    const mitad = partida.tamano / 2;

    const casillaValida =
        Number.isInteger(columna) &&
        Number.isInteger(fila) &&
        columna >= 0 &&
        columna < partida.tamano &&
        fila >= 0 &&
        fila < partida.tamano &&
        (
            slot === 1
                ? fila < mitad
                : fila >= mitad
        );

    if (!casillaValida) {
        return {
            ok: false,
            mensaje: "Selecciona una casilla del campo rival."
        };
    }

    const clave = `${columna},${fila}`;

    if (partida.disparos[slot].has(clave)) {
        return {
            ok: false,
            mensaje: "Esa casilla ya fue atacada."
        };
    }

    partida.disparos[slot].add(clave);

    const rival = slot === 1 ? 2 : 1;

    const acierto = [
        ...partida.flotas[rival].values()
    ].some(barco =>
        barco.columna === columna &&
        barco.fila === fila
    );

    if (acierto) {
        partida.aciertos[slot]++;
    }

    if (
        partida.aciertos[slot] === partida.cantidadBarcos
    ) {
        partida.fase = "finalizada";
        partida.ganador = slot;
        partida.restantes = 0;
    } else {
        partida.restantes--;

        if (partida.restantes === 0) {
            partida.turno = rival;
            partida.restantes = partida.disparosPorTurno;
        }
    }

    const evento = {
        jugador: slot,
        columna,
        fila,
        acierto,
        turno: partida.turno,
        restantes: partida.restantes,
        fase: partida.fase
    };

    partida.historial.push(evento);

    return {
        ok: true,
        evento,
        estado: estadoPublico(partida)
    };
}
