// Cada numero representa casillas consecutivas.
export const LONGITUDES_NORMAL = Object.freeze([5, 4, 3, 3, 2]);
export const LONGITUDES_TRES = Object.freeze([5, 4, 3]);

export function obtenerReglas(configuracion = {}) {
    const rafaga = configuracion.modo === "rafaga";
    const dificil = configuracion.dificultad === "dificil";

    return {
        tamano: dificil ? 12 : 10,
        longitudes: [
            ...(rafaga || dificil
                ? LONGITUDES_TRES
                : LONGITUDES_NORMAL)
        ],
        modo: rafaga ? "rafaga" : "clasico",
        disparos: rafaga ? 10 : 1
    };
}

const clave = (columna, fila) => `${columna},${fila}`;

const error = mensaje => ({
    ok: false,
    mensaje
});

const jugadorValido = slot => slot === 1 || slot === 2;

export const rivalDe = slot => slot === 1 ? 2 : 1;

// Devuelve cada casilla ocupada por un barco.
export function celdasBarco(barco) {
    const vertical = barco.rotacion % 180 !== 0;

    return Array.from(
        { length: barco.longitud },
        (_, i) => ({
            columna: barco.columna + (vertical ? 0 : i),
            fila: barco.fila + (vertical ? i : 0)
        })
    );
}

export function celdaValida(celda, tamano) {
    return (
        Number.isInteger(celda?.columna) &&
        Number.isInteger(celda?.fila) &&
        celda.columna >= 0 &&
        celda.columna < tamano &&
        celda.fila >= 0 &&
        celda.fila < tamano
    );
}

// Comprueba cantidad, identificadores, limites y colisiones.
export function validarFlota(flota, slot, reglas) {
    if (
        !jugadorValido(slot) ||
        !Array.isArray(flota) ||
        flota.length !== reglas.longitudes.length
    ) {
        return error(
            `Debes colocar ${reglas.longitudes.length} barcos.`
        );
    }

    const ocupadas = new Set();
    const ids = new Set();
    const barcos = [];

    for (const datos of flota) {
        const indice = reglas.longitudes.findIndex(
            (_, i) => datos?.barcoId === `p${slot}-b${i + 1}`
        );

        if (
            indice < 0 ||
            ids.has(datos.barcoId) ||
            ![0, 90, 180, 270].includes(datos.rotacion)
        ) {
            return error(
                "Identificador o rotacion de barco invalido."
            );
        }

        // La longitud la decide la regla, no lo enviado por el cliente.
        const barco = {
            barcoId: datos.barcoId,
            longitud: reglas.longitudes[indice],
            columna: datos.columna,
            fila: datos.fila,
            rotacion: datos.rotacion
        };

        for (const celda of celdasBarco(barco)) {
            const id = clave(celda.columna, celda.fila);

            if (!celdaValida(celda, reglas.tamano)) {
                return error("Un barco sale del tablero.");
            }

            if (ocupadas.has(id)) {
                return error(
                    "Dos barcos ocupan la misma casilla."
                );
            }

            ocupadas.add(id);
        }

        ids.add(barco.barcoId);
        barcos.push(barco);
    }

    barcos.sort(
        (a, b) => a.barcoId.localeCompare(b.barcoId)
    );

    return {
        ok: true,
        flota: barcos
    };
}

// Genera una colocacion inicial valida.
export function crearFlotaAleatoria(
    slot,
    reglas,
    aleatorio = Math.random
) {
    for (let intento = 0; intento < 100; intento++) {
        const flota = [];
        const ocupadas = new Set();

        for (let i = 0; i < reglas.longitudes.length; i++) {
            const longitud = reglas.longitudes[i];
            const opciones = [];

            for (const rotacion of [0, 90]) {
                for (
                    let fila = 0;
                    fila < reglas.tamano;
                    fila++
                ) {
                    for (
                        let columna = 0;
                        columna < reglas.tamano;
                        columna++
                    ) {
                        const barco = {
                            barcoId: `p${slot}-b${i + 1}`,
                            longitud,
                            columna,
                            fila,
                            rotacion
                        };

                        const disponible = celdasBarco(barco)
                            .every(c =>
                                celdaValida(c, reglas.tamano) &&
                                !ocupadas.has(
                                    clave(c.columna, c.fila)
                                )
                            );

                        if (disponible) {
                            opciones.push(barco);
                        }
                    }
                }
            }

            if (!opciones.length) break;

            const indice = Math.min(
                opciones.length - 1,
                Math.floor(aleatorio() * opciones.length)
            );

            const barco = opciones[indice];

            flota.push(barco);

            celdasBarco(barco).forEach(c =>
                ocupadas.add(clave(c.columna, c.fila))
            );
        }

        if (flota.length === reglas.longitudes.length) {
            return flota;
        }
    }

    throw new Error(
        "No se pudo generar una flota valida."
    );
}

export function crearMotorPartida(configuracion = {}) {
    const reglas = obtenerReglas(configuracion);

    return {
        configuracion: { ...configuracion },
        reglas,

        tamano: reglas.tamano,
        cantidadBarcos: reglas.longitudes.length,

        fase: "colocando",
        turno: reglas.modo === "rafaga" ? null : 1,
        restantes: reglas.disparos,
        ganador: null,
        disparoPendiente: null,

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

        hundidos: {
            1: 0,
            2: 0
        },

        rafagas: {
            1: null,
            2: null
        },

        historial: []
    };
}

export function resultadoPartida(partida) {
    if (partida.fase !== "finalizada") {
        return null;
    }

    const valorBarco =
        partida.configuracion.dificultad === "dificil"
            ? 200
            : 100;

    return {
        ganador: partida.ganador,
        empate: partida.ganador === 0,

        danos: { ...partida.aciertos },
        hundidos: { ...partida.hundidos },

        puntuaciones: Object.fromEntries(
            [1, 2].map(slot => [
                slot,
                partida.hundidos[slot] * valorBarco +
                (partida.ganador === slot ? 300 : 0)
            ])
        )
    };
}

// Datos que pueden conocer ambos jugadores.
// No incluye posiciones de barcos ni rafagas pendientes.
export function estadoPublico(partida) {
    return {
        fase: partida.fase,
        modo: partida.reglas.modo,
        tamano: partida.tamano,

        turno: partida.turno,
        restantes: partida.restantes,
        disparoPendiente: partida.disparoPendiente
            ? { ...partida.disparoPendiente }
            : null,

        listos: {
            1: !!partida.flotas[1],
            2: !!partida.flotas[2]
        },

        rafagasListas: {
            1: !!partida.rafagas[1],
            2: !!partida.rafagas[2]
        },

        aciertos: { ...partida.aciertos },
        hundidos: { ...partida.hundidos },

        historial: partida.historial.map(
            tiro => ({ ...tiro })
        ),

        ganador: partida.ganador,
        resultado: resultadoPartida(partida)
    };
}

// Solo se envia al propietario de esta flota.
export function flotaPropia(partida, slot) {
    return partida.flotas[slot]?.map(
        ({ impactos, ...barco }) => ({
            ...barco,
            impactos: [...impactos]
        })
    ) ?? null;
}

export function registrarFlota(partida, slot, flota) {
    if (!jugadorValido(slot)) {
        return error("Jugador invalido.");
    }

    if (
        partida.fase !== "colocando" ||
        partida.flotas[slot]
    ) {
        return error(
            "La preparacion de tu flota ya termino."
        );
    }

    const validacion = validarFlota(
        flota,
        slot,
        partida.reglas
    );

    if (!validacion.ok) {
        return validacion;
    }

    partida.flotas[slot] = validacion.flota.map(
        barco => ({
            ...barco,
            impactos: new Set()
        })
    );

    if (
        partida.flotas[1] &&
        partida.flotas[2]
    ) {
        partida.fase = "en_curso";
    }

    return {
        ok: true,
        estado: estadoPublico(partida)
    };
}

function aplicarDisparo(partida, slot, celda) {
    const defensor = rivalDe(slot);
    const id = clave(celda.columna, celda.fila);

    partida.disparos[slot].add(id);

    const barco = partida.flotas[defensor].find(
        item => celdasBarco(item).some(
            c => clave(c.columna, c.fila) === id
        )
    );

    let hundido = false;

    if (barco) {
        barco.impactos.add(id);
        partida.aciertos[slot]++;

        hundido =
            barco.impactos.size === barco.longitud;

        if (hundido) {
            partida.hundidos[slot]++;
        }
    }

    const evento = {
        jugador: slot,
        defensor,
        columna: celda.columna,
        fila: celda.fila,
        acierto: !!barco,
        hundido
    };

    partida.historial.push(evento);

    return evento;
}

export function validarDisparo(partida, slot, celda) {
    if (slot !== 1 && slot !== 2) {
        return {
            ok: false,
            mensaje: "Jugador invalido."
        };
    }

    if (
        partida.fase !== "en_curso" ||
        partida.reglas.modo !== "clasico"
    ) {
        return {
            ok: false,
            mensaje: "El combate clasico no esta activo."
        };
    }

    if (partida.turno !== slot) {
        return {
            ok: false,
            mensaje: "Es turno del rival."
        };
    }

    if (partida.disparoPendiente) {
        return {
            ok: false,
            mensaje: "Espera a que termine el disparo pendiente."
        };
    }

    if (partida.restantes === 0) {
        return {
            ok: false,
            mensaje: "Ya disparaste. Presiona TERMINAR TURNO."
        };
    }

    if (!celdaValida(celda, partida.tamano)) {
        return {
            ok: false,
            mensaje: "Casilla invalida."
        };
    }

    if (
        partida.disparos[slot].has(
            `${celda.columna},${celda.fila}`
        )
    ) {
        return {
            ok: false,
            mensaje: "Ya disparaste a esa casilla."
        };
    }

    return { ok: true };
}

export function disparar(partida, slot, celda) {
    const validacion = validarDisparo(
        partida,
        slot,
        celda
    );

    if (!validacion.ok) {
        return validacion;
    }

    const evento = aplicarDisparo(
        partida,
        slot,
        celda
    );

    // El disparo se consume, pero el turno no cambia.
    partida.restantes = 0;

    if (
        partida.hundidos[slot] ===
        partida.cantidadBarcos
    ) {
        partida.fase = "finalizada";
        partida.ganador = slot;
    }

    return {
        ok: true,
        evento,
        estado: estadoPublico(partida)
    };
}

export function terminarTurno(partida, slot) {
    if (!jugadorValido(slot)) {
        return error("Jugador invalido.");
    }

    if (
        partida.fase !== "en_curso" ||
        partida.reglas.modo !== "clasico" ||
        partida.turno !== slot
    ) {
        return error(
            "No puedes terminar este turno."
        );
    }

    if (partida.disparoPendiente) {
    return {
        ok: false,
        mensaje: "Espera el resultado antes de terminar el turno."
        };
    }

    if (partida.restantes !== 0) {
        return error(
            "Realiza tu disparo antes de terminar el turno."
        );
    }

    partida.turno = rivalDe(slot);
    partida.restantes = 1;

    return {
        ok: true,
        estado: estadoPublico(partida)
    };
}

export function validarRafaga(partida, slot, celdas) {
    if (slot !== 1 && slot !== 2) {
        return {
            ok: false,
            mensaje: "Jugador invalido."
        };
    }

    if (
        partida.fase !== "en_curso" ||
        partida.reglas.modo !== "rafaga" ||
        partida.rafagas[slot] ||
        partida.disparoPendiente
    ) {
        return {
            ok: false,
            mensaje: "No puedes enviar esta rafaga."
        };
    }

    const valida =
        Array.isArray(celdas) &&
        celdas.length === 10 &&
        celdas.every(c =>
            celdaValida(c, partida.tamano)
        ) &&
        new Set(
            celdas.map(c =>
                `${c.columna},${c.fila}`
            )
        ).size === 10;

    return valida
        ? { ok: true }
        : {
            ok: false,
            mensaje:
                "Selecciona diez casillas distintas del tablero enemigo."
        };
}

export function resolverRafagas(partida) {
    if (
        partida.fase !== "en_curso" ||
        partida.reglas.modo !== "rafaga" ||
        partida.disparoPendiente ||
        !partida.rafagas[1] ||
        !partida.rafagas[2]
    ) {
        return {
            ok: false,
            mensaje: "Las rafagas todavia no pueden resolverse."
        };
    }

    for (const atacante of [1, 2]) {
        for (
            const celda of
            partida.rafagas[atacante]
        ) {
            aplicarDisparo(
                partida,
                atacante,
                celda
            );
        }
    }

    partida.ganador =
        partida.aciertos[1] === partida.aciertos[2]
            ? 0
            : partida.aciertos[1] > partida.aciertos[2]
                ? 1
                : 2;

    partida.fase = "finalizada";
    partida.restantes = 0;

    return {
        ok: true,
        estado: estadoPublico(partida)
    };
}

export function enviarRafaga(partida, slot, celdas) {
    const validacion = validarRafaga(
        partida,
        slot,
        celdas
    );

    if (!validacion.ok) {
        return validacion;
    }

    partida.rafagas[slot] = celdas.map(c => ({
        columna: c.columna,
        fila: c.fila
    }));

    if (
        partida.rafagas[1] &&
        partida.rafagas[2]
    ) {
        return resolverRafagas(partida);
    }

    return {
        ok: true,
        estado: estadoPublico(partida)
    };
}

// Recibe el historial propio de la IA, no la flota rival.
export function elegirDisparoIA(
    historial,
    tamano,
    dificil = false,
    aleatorio = Math.random
) {
    const usados = new Set(
        historial.map(t =>
            clave(t.columna, t.fila)
        )
    );

    const disponibles = [];

    for (let fila = 0; fila < tamano; fila++) {
        for (
            let columna = 0;
            columna < tamano;
            columna++
        ) {
            if (!usados.has(clave(columna, fila))) {
                disponibles.push({ columna, fila });
            }
        }
    }

    if (!disponibles.length) {
        return null;
    }

    let candidatos = disponibles;

    if (dificil) {
        const vecinos = [];

        for (const tiro of [...historial].reverse()) {
            if (!tiro.acierto || tiro.hundido) {
                continue;
            }

            for (
                const [dx, dy] of
                [[1, 0], [-1, 0], [0, 1], [0, -1]]
            ) {
                const celda = {
                    columna: tiro.columna + dx,
                    fila: tiro.fila + dy
                };

                if (
                    celdaValida(celda, tamano) &&
                    !usados.has(
                        clave(celda.columna, celda.fila)
                    )
                ) {
                    vecinos.push(celda);
                }
            }
        }

        const paridad = disponibles.filter(
            c => (c.columna + c.fila) % 2 === 0
        );

        candidatos = vecinos.length
            ? vecinos
            : paridad.length
                ? paridad
                : disponibles;
    }

    const indice = Math.min(
        candidatos.length - 1,
        Math.floor(aleatorio() * candidatos.length)
    );

    return candidatos[indice];
}