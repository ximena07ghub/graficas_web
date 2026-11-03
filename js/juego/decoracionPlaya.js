import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Copia los cinco GLB dentro de public/models/playa.
const RUTA = "/public/models/playa/";
const loader = new GLTFLoader();

// MEDIDAS DE LAS PLATAFORMAS: las mismas que tiene tu escena actual.
const RADIO_SUPERIOR = 2.8;
const RADIO_INFERIOR = 3.3;
const GROSOR = 0.4;
const SEGMENTOS = 28;
const ALTURA_CENTRO = 0.05;

// AQUI ACOMODAS LOS OBJETOS. Las coordenadas son relativas a cada isla.
// x/z: desplazamiento horizontal. altura: alto final del modelo.
// giro: rotacion alrededor de Y, en GRADOS. elevar: ajuste vertical extra.
const OBJETOS = [
    { modelo: "palmera", nombre: "palmera1", x: -0.9, z: -0.7, altura: 3.4, giro: 20, elevar: 0 },
    { modelo: "palmera", nombre: "palmera2", x: 0.9, z: 0.7, altura: 3.4, giro: -20, elevar: 0 },
    { modelo: "silla", nombre: "silla1", x: 0.9, z: -0.2, altura: 0.9, giro: -30, elevar: 0 },
    { modelo: "pelota", nombre: "pelota1", x: 0.4, z: 1.2, altura: 0.45, giro: 0, elevar: 0 },
    { modelo: "castillo", nombre: "castillo1", x: -1.1, z: 0.9, altura: 0.65, giro: 25, elevar: 0 }
];

// El GLB conserva sus materiales, texturas y transformaciones internas.
async function cargarGLB(archivo) {
    const gltf = await loader.loadAsync(RUTA + archivo);
    return gltf.scene;
}

// Ajusta el alto y deja la base del objeto en Y=0.
// El Group exterior permite mover/girar el conjunto con facilidad.
function prepararObjeto(plantilla, altura) {
    const modelo = plantilla.clone(true);
    const caja = new THREE.Box3().setFromObject(modelo);
    const tamano = caja.getSize(new THREE.Vector3());

    if (tamano.y <= 0) throw new Error("El modelo no tiene altura medible.");

    modelo.scale.multiplyScalar(altura / tamano.y);
    modelo.updateMatrixWorld(true);
    caja.setFromObject(modelo);

    const centro = caja.getCenter(new THREE.Vector3());
    modelo.position.x -= centro.x;
    modelo.position.z -= centro.z;
    modelo.position.y -= caja.min.y;

    const objeto = new THREE.Group();
    objeto.add(modelo);
    return objeto;
}

// Estos planos recortan la arena al mismo borde de 28 lados del cilindro.
// El recorte ocurre al dibujar: no cambia los vertices ni los UV del GLB.
function planosDelBorde(isla) {
    isla.updateWorldMatrix(true, false);
    const centro = isla.getWorldPosition(new THREE.Vector3());
    const apotema = RADIO_SUPERIOR * Math.cos(Math.PI / SEGMENTOS);

    return Array.from({ length: SEGMENTOS }, (_, i) => {
        const angulo = (i + 0.5) * 2 * Math.PI / SEGMENTOS;
        const nx = Math.sin(angulo);
        const nz = Math.cos(angulo);

        return new THREE.Plane(
            new THREE.Vector3(-nx, 0, -nz),
            apotema + nx * centro.x + nz * centro.z
        );
    });
}

function prepararArena(plantilla, isla) {
    const arena = plantilla.clone(true);
    const caja = new THREE.Box3().setFromObject(arena);
    const tamano = caja.getSize(new THREE.Vector3());

    // Un margen pequeno asegura que el parche rebase el borde antes de recortarlo.
    const escalaHorizontal = (RADIO_SUPERIOR * 2 / Math.min(tamano.x, tamano.z)) * 1.05;
    const relieve = 0.08;

    arena.scale.multiply(new THREE.Vector3(
        escalaHorizontal,
        relieve / tamano.y,
        escalaHorizontal
    ));
    arena.updateMatrixWorld(true);
    caja.setFromObject(arena);

    const centro = caja.getCenter(new THREE.Vector3());
    arena.position.x -= centro.x;
    arena.position.z -= centro.z;
    arena.position.y += GROSOR / 2 + 0.015 - caja.min.y;
    arena.name = "arena";

    const planos = planosDelBorde(isla);
    arena.traverse((objeto) => {
        if (!objeto.isMesh) return;

        const prepararMaterial = (original) => {
            const material = original.clone();
            material.clippingPlanes = planos;
            material.clipIntersection = false;
            return material;
        };

        objeto.material = Array.isArray(objeto.material)
            ? objeto.material.map(prepararMaterial)
            : prepararMaterial(objeto.material);
    });

    return arena;
}

// La arena tiene relieve: este rayo encuentra su altura bajo cada objeto.
function alturaArena(isla, arena, x, z) {
    isla.updateWorldMatrix(true, true);
    const origen = isla.localToWorld(new THREE.Vector3(x, 20, z));
    const rayo = new THREE.Raycaster(origen, new THREE.Vector3(0, -1, 0));
    const impacto = rayo.intersectObject(arena, true)[0];

    if (!impacto) return GROSOR / 2;

    return isla.worldToLocal(impacto.point.clone()).y;
}

export async function crearDecoracionPlaya(grupo, mitadTablero) {
    // Las bases aparecen inmediatamente mientras se descargan los GLB.
    const islas = [-1, 1].map((lado) => {
        const isla = new THREE.Group();
        isla.name = lado === -1 ? "islaIzquierda" : "islaDerecha";
        isla.position.set(lado * (mitadTablero + 5), ALTURA_CENTRO, lado * 2.5);

        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(RADIO_SUPERIOR, RADIO_INFERIOR, GROSOR, SEGMENTOS),
            new THREE.MeshPhongMaterial({ color: 0xb99c5e, shininess: 12 })
        );

        base.name = "plataforma";
        isla.add(base);
        grupo.add(isla);
        return isla;
    });

    // Cada archivo se descarga una sola vez; las dos islas usan copias.
    const [arena, palmera, silla, pelota, castillo] = await Promise.all([
        cargarGLB("Arena.glb"),
        cargarGLB("coconut_palm.glb"),
        cargarGLB("beach_chair.glb"),
        cargarGLB("Pelota_playa.glb"),
        cargarGLB("SandCastle.glb")
    ]);

    const modelos = { palmera, silla, pelota, castillo };

    for (const isla of islas) {
        const terreno = prepararArena(arena, isla);
        isla.add(terreno);

        for (const datos of OBJETOS) {
            const objeto = prepararObjeto(modelos[datos.modelo], datos.altura);
            objeto.name = datos.nombre;

            objeto.rotation.y = THREE.MathUtils.degToRad(datos.giro);
            objeto.position.set(
                datos.x,
                alturaArena(isla, terreno, datos.x, datos.z) + (datos.elevar || 0),
                datos.z
            );

            isla.add(objeto);
        }
    }
}
