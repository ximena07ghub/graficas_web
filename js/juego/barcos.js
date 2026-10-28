import * as THREE from "three";

function materialesBarco(color) {
    const casco = new THREE.MeshPhongMaterial({
        color,
        shininess: 55,
        specular: 0x8afaf1,
        emissive: 0x001317
    });

    const metal = new THREE.MeshPhongMaterial({
        color: 0xa9c5cb,
        shininess: 70,
        specular: 0xffffff,
        emissive: 0x020809
    });

    return { casco, metal };
}

export function crearBarcoProvisional({ id, propietario, color }) {
    const grupo = new THREE.Group();
    const materiales = materialesBarco(color);

    // Respaldo sencillo por si un FBX no puede cargarse.
    const casco = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 2.45), materiales.casco);
    grupo.add(casco);

    const proa = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.95, 4), materiales.casco);
    proa.rotation.x = Math.PI / 2;
    proa.rotation.y = Math.PI / 4;
    proa.position.z = -1.58;
    grupo.add(proa);

    const cabina = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.34, 0.72), materiales.metal);
    cabina.position.set(0, 0.34, 0.15);
    grupo.add(cabina);

    grupo.userData = {
        barcoId: id,
        propietario,
        seleccionable: true,
        baseY: 0.22,
        materiales: [materiales.casco, materiales.metal]
    };

    grupo.position.y = grupo.userData.baseY;
    return grupo;
}

export function crearFlotaProvisional({ slot, cantidad, scene, boardHalf, cellSize }) {
    const color = slot === 1 ? 0x00d9cf : 0xff9c38;
    const flota = [];
    const celdas = Math.round((boardHalf * 2) / cellSize);
    const fila = slot === 1 ? celdas - 2 : 1;
    const zBase = -boardHalf + cellSize * (fila + 0.5);
    const inicioX = -((cantidad - 1) * cellSize) / 2;

    for (let i = 0; i < cantidad; i += 1) {
        const barco = crearBarcoProvisional({
            id: `p${slot}-b${i + 1}`,
            propietario: slot,
            color
        });

        barco.position.x = inicioX + i * cellSize;
        barco.position.z = zBase;
        barco.rotation.y = slot === 1 ? 0 : Math.PI;
        scene.add(barco);
        flota.push(barco);
    }

    return flota;
}

export function encontrarBarcoDesdeObjeto(objeto) {
    let actual = objeto;

    while (actual) {
        if (actual.userData?.barcoId) return actual;
        actual = actual.parent;
    }

    return null;
}

export function marcarSeleccion(barco, seleccionado) {
    if (!barco) return;

    barco.userData.materiales?.forEach((material) => {
        if (!material?.emissive) return;

        if (material.userData.fleetEmissiveOriginal === undefined) {
            material.userData.fleetEmissiveOriginal = material.emissive.getHex();
        }

        material.emissive.setHex(
            seleccionado ? 0x0a605c : material.userData.fleetEmissiveOriginal
        );
    });
}

function cajaEnEstado(barco, x, z, rotY = barco.rotation.y) {
    const posicionAnterior = barco.position.clone();
    const rotacionAnterior = barco.rotation.y;

    barco.position.x = x;
    barco.position.z = z;
    barco.rotation.y = rotY;
    barco.updateMatrixWorld(true);

    const caja = new THREE.Box3().setFromObject(barco);

    barco.position.copy(posicionAnterior);
    barco.rotation.y = rotacionAnterior;
    barco.updateMatrixWorld(true);

    return caja;
}

function dentroDelTablero(barco, x, z, boardHalf) {
    const caja = cajaEnEstado(barco, x, z);
    const margen = 0.08;

    return caja.min.x >= -boardHalf + margen &&
        caja.max.x <= boardHalf - margen &&
        caja.min.z >= -boardHalf + margen &&
        caja.max.z <= boardHalf - margen;
}

// J1 utiliza la mitad positiva de Z y J2 la mitad negativa.
// Se revisa la caja completa para que el modelo no cruce la linea central.
function dentroDelLadoAsignado(barco, x, z) {
    const caja = cajaEnEstado(barco, x, z);
    const margenCentro = 0.06;

    if (barco.userData.propietario === 1) {
        return caja.min.z >= margenCentro;
    }

    if (barco.userData.propietario === 2) {
        return caja.max.z <= -margenCentro;
    }

    return true;
}

function colisionaConFlota(barco, x, z, flota) {
    const caja = cajaEnEstado(barco, x, z);

    return flota.some((otro) => {
        if (otro === barco) return false;

        const cajaOtro = cajaEnEstado(
            otro,
            otro.position.x,
            otro.position.z
        );

        return caja.intersectsBox(cajaOtro);
    });
}

// Valida tablero, mitad asignada y colisiones. Si todo esta bien, mueve una casilla.
export function moverBarcoSeguro(barco, destino, flota, boardHalf) {
    const x = Number(destino.x);
    const z = Number(destino.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

    const valido = dentroDelTablero(barco, x, z, boardHalf) &&
        dentroDelLadoAsignado(barco, x, z) &&
        !colisionaConFlota(barco, x, z, flota);

    if (!valido) return false;

    barco.position.x = x;
    barco.position.z = z;
    return true;
}

// Aplica directamente una posicion recibida desde el otro navegador.
export function aplicarEstadoBarco(barco, estado) {
    barco.position.x = Number(estado.x) || 0;
    barco.position.z = Number(estado.z) || 0;
    barco.rotation.y = Number(estado.rotY) || 0;
    barco.userData.baseY = Number.isFinite(Number(estado.y))
        ? Number(estado.y)
        : barco.userData.baseY;
    barco.position.y = barco.userData.baseY;
}

export function serializarBarco(barco) {
    return {
        barcoId: barco.userData.barcoId,
        x: barco.position.x,
        y: barco.userData.baseY,
        z: barco.position.z,
        rotY: barco.rotation.y
    };
}

export function serializarFlota(flota) {
    return flota.map(serializarBarco);
}
