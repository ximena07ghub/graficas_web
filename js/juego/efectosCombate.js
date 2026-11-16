import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { celdasBarco } from "./reglasCombate.js";
import { detenerEfectos, reproducirEfecto } from "./audioEfectos.js";

export const VUELO_RAFAGA_MS = 750;

function centro(tablero, columna, fila, altura) {
    return tablero.grupo.localToWorld(new THREE.Vector3(
        -tablero.lado / 2 + (columna + 0.5) * tablero.celda,
        altura,
        -tablero.lado / 2 + (fila + 0.5) * tablero.celda
    ));
}

function claveTiro({ jugador, columna, fila }) {
    return `${jugador}:${columna},${fila}`;
}

function liberarModelo(modelo) {
    const recursos = new Set();
    modelo.traverse(objeto => {
        if (!objeto.isMesh) return;
        recursos.add(objeto.geometry);
        const materiales = Array.isArray(objeto.material)
            ? objeto.material
            : [objeto.material];
        for (const material of materiales) {
            recursos.add(material);
            for (const valor of Object.values(material)) {
                if (valor?.isTexture) recursos.add(valor);
            }
        }
    });
    for (const recurso of recursos) recurso.dispose();
}

export function crearEfectosCombate(mundo, tableros) {
    const proyectiles = new Map();
    const impactos = [];
    const pulsos = [];
    const contactos = new Map();
    const geometriaBala = new THREE.CapsuleGeometry(0.07, 0.23, 5, 10);
    const materialBala = new THREE.MeshBasicMaterial({ color: 0xe8b663 });
    const geometriaParticula = new THREE.SphereGeometry(1, 6, 5);
    const arriba = new THREE.Vector3(0, 1, 0);
    const tangente = new THREE.Vector3();
    const instancia = new THREE.Object3D();
    const alturaArco = 1.6;
    let balaModelo = null;
    let barcoAnterior = null;
    let destruido = false;

    new GLTFLoader().load("/public/models/9mm+Bullet.glb", ({ scene }) => {
        if (destruido) {
            liberarModelo(scene);
            return;
        }

        const caja = new THREE.Box3().setFromObject(scene);
        const tamano = caja.getSize(new THREE.Vector3()).length();
        if (tamano === 0 || !Number.isFinite(tamano)) {
            liberarModelo(scene);
            return;
        }

        const factor = 0.55 / tamano;
        scene.scale.multiplyScalar(factor);
        scene.position.addScaledVector(caja.getCenter(new THREE.Vector3()), -factor);
        balaModelo = scene;
    }, undefined, error => {
        console.warn("Se usará el proyectil de respaldo.", error);
    });

    function obtenerOrigen(tiro, slotLocal, flota, historial) {
        const tablero = tiro.jugador === slotLocal ? tableros.propio : tableros.enemigo;
        if (tiro.jugador === slotLocal) {
            const recibidos = new Set(historial
                .filter(evento => evento.defensor === slotLocal && evento.acierto && !evento.bloqueado)
                .map(evento => `${evento.columna},${evento.fila}`));

            const disponibles = flota.filter(barco => celdasBarco(barco).some(
                celda => !recibidos.has(`${celda.columna},${celda.fila}`)
            ));
            const alternativos = disponibles.filter(barco => barco.barcoId !== barcoAnterior);
            const opciones = alternativos.length ? alternativos : disponibles;

            if (opciones.length) {
                const barco = opciones[Math.floor(Math.random() * opciones.length)];
                barcoAnterior = barco.barcoId;
                const celdas = celdasBarco(barco);
                const ultima = celdas.at(-1);
                return centro(tablero,
                    (barco.columna + ultima.columna) / 2,
                    (barco.fila + ultima.fila) / 2, 0.55);
            }
        }

        // El disparo del rival sale del centro de su tablero.
        const mitad = (tablero.tamano - 1) / 2;
        return centro(tablero, mitad, mitad, 0.55);
    }

    function destino(tiro, slotLocal) {
        const tablero = tiro.jugador === slotLocal ? tableros.enemigo : tableros.propio;
        return centro(tablero, tiro.columna, tiro.fila, 0.23);
    }

    function lanzar(tiros, slotLocal, flota, historial, duracion, conSonido = true) {
        let lanzado = false;
        for (const tiro of tiros) {
            const id = claveTiro(tiro);
            if (proyectiles.has(id)) continue;

            const objeto = new THREE.Group();
            objeto.add(balaModelo
                ? balaModelo.clone(true)
                : new THREE.Mesh(geometriaBala, materialBala));
            const origen = obtenerOrigen(tiro, slotLocal, flota, historial);
            objeto.position.copy(origen);
            mundo.scene.add(objeto);

            proyectiles.set(id, {
                objeto, origen, fin: destino(tiro, slotLocal),
                inicio: performance.now(), duracion
            });
            lanzado = true;
        }
        if (lanzado && conSonido) reproducirEfecto("disparo");
    }

    function impactar(tiros, slotLocal) {
        const sonidos = new Set();
        for (const tiro of tiros) {
            const id = claveTiro(tiro);
            proyectiles.get(id)?.objeto.removeFromParent();
            proyectiles.delete(id);
            const contacto = contactos.get(id);
            if (contacto && !tiro.bloqueado) {
                quitarMalla(contacto);
                contactos.delete(id);
            }

            const tipo = tiro.bloqueado ? "impacto-escudo" : tiro.acierto ? "explosion" : "agua";
            const explosion = tipo === "explosion";
            const color = tipo === "impacto-escudo" ? 0x65eaff : explosion ? 0xff6b25 : 0x8deaff;
            const material = new THREE.MeshBasicMaterial({
                color, transparent: true, depthWrite: false
            });
            const objeto = new THREE.InstancedMesh(geometriaParticula, material, explosion ? 34 : 25);
            objeto.frustumCulled = false;
            objeto.position.copy(destino(tiro, slotLocal));
            const velocidades = Array.from({ length: objeto.count }, () => {
                const angulo = Math.random() * Math.PI * 2;
                const rapidez = 0.35 + Math.random() * (explosion ? 1.6 : 1.05);
                return new THREE.Vector3(
                    Math.cos(angulo) * rapidez,
                    1.1 + Math.random(),
                    Math.sin(angulo) * rapidez
                );
            });
            impactos.push({
                objeto, velocidades, inicio: performance.now(),
                duracion: 800, radio: explosion ? 0.075 : 0.05
            });
            objeto.visible = false;
            mundo.scene.add(objeto);
            sonidos.add(tipo);
        }
        for (const sonido of sonidos) reproducirEfecto(sonido);
    }

    function quitarMalla(objeto) {
        objeto.removeFromParent();
        objeto.geometry.dispose();
        objeto.material.dispose();
    }

    function animarSonar(celda, revelada) {
        reproducirEfecto("sonar");
        const tablero = tableros.enemigo;
        const radio = tablero.celda * 1.5;
        const anillo = new THREE.Mesh(
            new THREE.RingGeometry(radio * 0.94, radio, 48),
            new THREE.MeshBasicMaterial({
                color: 0x00f5d4, transparent: true, depthWrite: false,
                depthTest: false, side: THREE.DoubleSide
            })
        );
        anillo.position.copy(centro(tablero, celda.columna, celda.fila, 0.2));
        anillo.rotation.x = -Math.PI / 2;
        anillo.scale.setScalar(0.05);
        mundo.scene.add(anillo);
        pulsos.push({ objeto: anillo, inicio: performance.now(), duracion: 1250, expandir: true });

        if (!revelada) return;
        const id = claveTiro({ ...revelada, jugador: 1 });
        if (contactos.has(id)) return;
        const marca = new THREE.Mesh(
            new THREE.RingGeometry(tablero.celda * 0.21, tablero.celda * 0.31, 24),
            new THREE.MeshBasicMaterial({
                color: 0x55ffb3, depthTest: false, depthWrite: false, side: THREE.DoubleSide
            })
        );
        marca.position.copy(centro(tablero, revelada.columna, revelada.fila, 0.21));
        marca.rotation.x = -Math.PI / 2;
        contactos.set(id, marca);
        mundo.scene.add(marca);
    }

    function animarEscudo(barco) {
        reproducirEfecto("escudo");
        const tablero = tableros.propio;
        const ultima = celdasBarco(barco).at(-1);
        const burbuja = new THREE.Mesh(
            new THREE.SphereGeometry(1, 24, 12),
            new THREE.MeshBasicMaterial({
                color: 0x45dfff, opacity: 0.4, transparent: true, depthWrite: false
            })
        );
        burbuja.position.copy(centro(tablero,
            (barco.columna + ultima.columna) / 2,
            (barco.fila + ultima.fila) / 2, 0.35));
        const vertical = barco.rotacion % 180 !== 0;
        const corto = tablero.celda * 0.6;
        const largo = corto * barco.longitud;
        burbuja.scale.set(vertical ? corto : largo, tablero.celda * 0.85, vertical ? largo : corto);
        mundo.scene.add(burbuja);
        pulsos.push({ objeto: burbuja, inicio: performance.now(), duracion: 1700, expandir: false });
    }

    function quitarImpacto({ objeto }) {
        objeto.removeFromParent();
        objeto.dispose();
        objeto.material.dispose();
    }

    function actualizar(ahora) {
        for (let i = pulsos.length - 1; i >= 0; i--) {
            const { objeto, inicio, duracion, expandir } = pulsos[i];
            const progreso = Math.max(0, (ahora - inicio) / duracion);
            if (progreso >= 1) {
                quitarMalla(objeto);
                pulsos.splice(i, 1);
                continue;
            }
            if (expandir) objeto.scale.setScalar(Math.max(0.05, progreso));
            objeto.material.opacity = (expandir ? 0.9 : 0.4) * (1 - progreso);
        }

        for (const [id, vuelo] of proyectiles) {
            const progreso = Math.min(1, Math.max(0, (ahora - vuelo.inicio) / vuelo.duracion));
            vuelo.objeto.position.lerpVectors(vuelo.origen, vuelo.fin, progreso);
            vuelo.objeto.position.y += Math.sin(Math.PI * progreso) * alturaArco;
            tangente.subVectors(vuelo.fin, vuelo.origen);
            tangente.y += Math.cos(Math.PI * progreso) * alturaArco * Math.PI;
            vuelo.objeto.quaternion.setFromUnitVectors(arriba, tangente.normalize());
            if (progreso === 1) {
                vuelo.objeto.removeFromParent();
                proyectiles.delete(id);
            }
        }

        for (let i = impactos.length - 1; i >= 0; i--) {
            const impacto = impactos[i];
            const progreso = Math.max(0, (ahora - impacto.inicio) / impacto.duracion);
            if (progreso >= 1) {
                quitarImpacto(impacto);
                impactos.splice(i, 1);
                continue;
            }
            const { objeto, velocidades, radio } = impacto;
            objeto.visible = true;
            objeto.material.opacity = 1 - progreso;
            instancia.scale.setScalar(radio);
            for (let j = 0; j < velocidades.length; j++) {
                instancia.position.copy(velocidades[j]).multiplyScalar(progreso);
                instancia.position.y -= 1.7 * progreso * progreso;
                instancia.updateMatrix();
                objeto.setMatrixAt(j, instancia.matrix);
            }
            objeto.instanceMatrix.needsUpdate = true;
        }
    }

    function limpiar() {
        for (const vuelo of proyectiles.values()) vuelo.objeto.removeFromParent();
        proyectiles.clear();
        for (const impacto of impactos) quitarImpacto(impacto);
        impactos.length = 0;
        for (const pulso of pulsos) quitarMalla(pulso.objeto);
        pulsos.length = 0;
        for (const contacto of contactos.values()) quitarMalla(contacto);
        contactos.clear();
        barcoAnterior = null;
        detenerEfectos();
    }

    return {
        lanzar, impactar, animarSonar, animarEscudo, actualizar, limpiar,
        dispose() {
            destruido = true;
            limpiar();
            geometriaBala.dispose();
            materialBala.dispose();
            geometriaParticula.dispose();
            if (balaModelo) liberarModelo(balaModelo);
        }
    };
}
