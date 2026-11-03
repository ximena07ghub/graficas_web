import {
    estadoPublico,
    validarDisparo,
    disparar,
    validarRafaga,
    resolverRafagas
} from "./reglasCombate.js";

export const DEMORA_DISPARO_MS = 1000;

const esperarReal = milisegundos =>
    new Promise(resolve =>
        setTimeout(resolve, milisegundos)
    );

async function resolverConEspera(
    partida,
    datos,
    resolver,
    opciones
) {
    const pendiente = {
        ...datos,
        resuelveEn:
            Date.now() + DEMORA_DISPARO_MS
    };

    partida.disparoPendiente = pendiente;

    try {
        // Avisa que existe un disparo, sin resolverlo.
        opciones.alIniciar?.(
            estadoPublico(partida)
        );

        await (
            opciones.esperar || esperarReal
        )(DEMORA_DISPARO_MS);

        if (
            partida.disparoPendiente !== pendiente
        ) {
            return {
                ok: false,
                mensaje: "El disparo fue cancelado."
            };
        }

        partida.disparoPendiente = null;

        return resolver();

    } finally {
        if (
            partida.disparoPendiente === pendiente
        ) {
            partida.disparoPendiente = null;
        }
    }
}

export async function dispararConEspera(
    partida,
    slot,
    celda,
    opciones = {}
) {
    const validacion = validarDisparo(
        partida,
        slot,
        celda
    );

    if (!validacion.ok) {
        return validacion;
    }

    const destino = {
        columna: celda.columna,
        fila: celda.fila
    };

    return resolverConEspera(
        partida,
        {
            tipo: "clasico",
            jugador: slot,
            ...destino
        },
        () => disparar(
            partida,
            slot,
            destino
        ),
        opciones
    );
}

export async function enviarRafagaConEspera(
    partida,
    slot,
    celdas,
    opciones = {}
) {
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
        !partida.rafagas[1] ||
        !partida.rafagas[2]
    ) {
        return {
            ok: true,
            estado: estadoPublico(partida)
        };
    }

    // Las coordenadas siguen privadas durante la espera.
    return resolverConEspera(
        partida,
        {
            tipo: "rafaga",
            jugador: slot
        },
        () => resolverRafagas(partida),
        opciones
    );
}