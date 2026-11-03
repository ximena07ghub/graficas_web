
import * as THREE from "three";

import { crearDecoracionPlaya } from "./decoracionPlaya.js";

import { crearDecoracionArtico } from "./decoracionArtico.js";

import { crearDecoracionTormenta } from "./decoracionTormenta.js";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import {
    OrbitControls
} from "three/addons/controls/OrbitControls.js";

const AMBIENTES = {
    playa: {
        fondo: 0x87ceeb,
        niebla: 0xc8e8e4,
        mar: 0x1b9fa6,
        ambiental: 0xfff1d8,
        direccional: 0xffd6a0,
        punto: 0xffe1b0,
        intensidadAmbiental: 0.75,
        intensidadDireccional: 1.8
    },

    tormenta: {
        fondo: 0x07111f,
        niebla: 0x14283a,
        mar: 0x082b3a,
        ambiental: 0x6f89a8,
        direccional: 0xa8c5e5,
        punto: 0x8c9cff,
        intensidadAmbiental: 0.25,
        intensidadDireccional: 1.0
    },

    artico: {
        fondo: 0xb7d7df,
        niebla: 0xd8edf0,
        mar: 0x2a7894,
        ambiental: 0xe1f8ff,
        direccional: 0xdaf4ff,
        punto: 0x8ff7ff,
        intensidadAmbiental: 0.92,
        intensidadDireccional: 1.25
    }
};

// Decoraciones diferentes para cada escenario.
function crearDecoracion(scene, mapa, mitadTablero) {
    const grupo = new THREE.Group();

    grupo.name = "decoracionEscenario";

    if (mapa === "playa") {
        const cargadorPlaya = new GLTFLoader();
const rutaModelosPlaya = "/public/models/playa/";

async function agregarModelosPlaya(archivo, posiciones) {
    try {
        // Carga el archivo una vez para crear las copias necesarias.
        const gltf = await cargadorPlaya.loadAsync(
            rutaModelosPlaya + archivo
        );

        for (const datos of posiciones) {
            const modelo = gltf.scene.clone(true);

            const caja = new THREE.Box3().setFromObject(modelo);
            const medidas = caja.getSize(new THREE.Vector3());

            const dimensionMayor = Math.max(
                medidas.x,
                medidas.y,
                medidas.z
            );

            if (dimensionMayor <= 0) {
                throw new Error("El modelo no tiene dimensiones.");
            }

            // Ajusta el tamaño conservando las proporciones.
            modelo.scale.multiplyScalar(
                datos.tamano / dimensionMayor
            );

            modelo.updateMatrixWorld(true);
            caja.setFromObject(modelo);

            // Centra el modelo y coloca su base en Y = 0.
            const centro = caja.getCenter(new THREE.Vector3());

            modelo.position.x -= centro.x;
            modelo.position.z -= centro.z;
            modelo.position.y -= caja.min.y;

            // Permite moverlo y girarlo desde el centro de su base.
            const objeto = new THREE.Group();

            objeto.name = datos.nombre;
            objeto.add(modelo);

            objeto.position.set(
                datos.x,
                datos.y,
                datos.z
            );

            objeto.rotation.y = THREE.MathUtils.degToRad(
                datos.giro
            );

            grupo.add(objeto);
        }
    } catch (error) {
        console.error(`No se pudo cargar ${archivo}:`, error);
    }
}

// COSTA: una sola copia hacia la orilla izquierda.
void agregarModelosPlaya("beach_in_ballyduff.glb", [
    {
        nombre: "costaPlaya",
        x: -(mitadTablero - 1),
        y: -0.35,
        z: -25,
        tamano: 40,
        giro: 180
    }
]);

// ALETAS: cada fila representa una copia independiente.
void agregarModelosPlaya("shark_fin.glb", [
    {
        nombre: "aleta1",
        x: -(mitadTablero + 3),
        y: -0.22,
        z: 6,
        tamano: 0.9,
        giro: 25
    },
    {
        nombre: "aleta2",
        x: mitadTablero + 3,
        y: -0.24,
        z: -5,
        tamano: 1.05,
        giro: 115
    },
    {
        nombre: "aleta3",
        x: -4,
        y: -0.20,
        z: -(mitadTablero + 3),
        tamano: 0.8,
        giro: 200
    },
    {
        nombre: "aleta4",
        x: 5,
        y: -0.25,
        z: mitadTablero + 4,
        tamano: 1,
        giro: 280
    },
    {
        nombre: "aleta5",
        x: mitadTablero + 7,
        y: -0.18,
        z: -(mitadTablero + 7),
        tamano: 0.95,
        giro: 335
    }
]);
        const arena = new THREE.MeshPhongMaterial({
            color: 0xd9c38a,
            shininess: 18
        });

        void crearDecoracionPlaya(grupo, mitadTablero).catch((error) => {
            console.error("No se pudo cargar la decoración de playa:", error);
        });

        [-1, 1].forEach(lado => {
            const isla = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    2.8, 3.3, 0.4, 28
                ),
                arena
            );

            isla.position.set(
                lado * (mitadTablero + 5),
                0.05,
                lado * 2.5
            );

            grupo.add(isla);
        });
        new GLTFLoader().load(
            "/public/models/cielo/skydome_playa.glb",
            (gltf) => {
                const cielo = gltf.scene;

                cielo.name = "skydomePlaya";
                cielo.position.set(0, 0, 0);
                cielo.scale.setScalar(80);
                cielo.renderOrder = -1000;

                cielo.traverse((objeto) => {
                   if (!objeto.isMesh) return;

                    const materiales = Array.isArray(objeto.material)
                        ? objeto.material
                        : [objeto.material];

                    materiales.forEach((material) => {
                        material.fog = false;
                        material.depthWrite = false;
                        material.toneMapped = false;
                    });
                });

                scene.add(cielo);
            },
            undefined,
            (error) => console.error("Error cargando el cielo:", error)
        );
    }

    if (mapa === "tormenta") {
        crearDecoracionTormenta(scene, grupo, mitadTablero);
    }

    if (mapa === "artico") {
            void crearDecoracionArtico(grupo, mitadTablero).catch((error) => {
            console.error(
                "No se pudo crear la decoración del Ártico:",
                error
            );
        });
    }

    scene.add(grupo);

    return grupo;
}

export function crearEscena({
    mapa,
    tamanoTablero,
    contenedor,
    cellSize = 1.65,
    skyboxUrls = null
}) {
    const ambiente =
        AMBIENTES[mapa] || AMBIENTES.playa;

    const boardSize = tamanoTablero * cellSize;
    const boardHalf = boardSize / 2;

    // Escena principal.
    const scene = new THREE.Scene();

    scene.background = new THREE.Color(
        ambiente.fondo
    );

    let texturaSkybox = null;

    // Cargar skybox solamente si existen seis rutas.
    const skyboxValido =
        Array.isArray(skyboxUrls) &&
        skyboxUrls.length === 6 &&
        skyboxUrls.every(ruta =>
            typeof ruta === "string" &&
            ruta.length > 0
        );

    if (skyboxValido) {
        new THREE.CubeTextureLoader().load(
            skyboxUrls,

            textura => {
                texturaSkybox = textura;
                scene.background = textura;
            },

            undefined,

            error => {
                console.warn(
                    "No se pudo cargar el skybox.",
                    error
                );
            }
        );
    }

    scene.fog = new THREE.Fog(
        ambiente.niebla,
        boardSize * 1.15,
        boardSize * 2.9
    );

    // Cámara.
    const camera = new THREE.PerspectiveCamera(
        48,
        window.innerWidth / window.innerHeight,
        0.1,
        180
    );

    camera.position.set(
        boardSize * 0.62,
        boardSize * 0.92,
        boardSize * 0.86
    );

    camera.lookAt(0, 0, 0);

    // Renderizador.
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.localClippingEnabled = true;

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, 1.25)
    );

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.shadowMap.enabled = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    contenedor.appendChild(renderer.domElement);

    // Superficie del mar.
    const mar = new THREE.Mesh(
        new THREE.PlaneGeometry(
            boardSize * 3.6,
            boardSize * 3.6
        ),

        new THREE.MeshPhongMaterial({
            color: ambiente.mar,
            shininess: mapa === "tormenta"
                ? 36
                : 72,

            specular: mapa === "artico"
                ? 0xbff7ff
                : 0x5bc5da
        })
    );

    mar.rotation.x = -Math.PI / 2;
    mar.position.y = -0.1;

    scene.add(mar);

    // Superficie invisible para detectar clics.
    const tableroRaycast = new THREE.Mesh(
        new THREE.PlaneGeometry(
            boardSize,
            boardSize
        ),

        new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false
        })
    );

    tableroRaycast.name = "tableroRaycast";
    tableroRaycast.rotation.x = -Math.PI / 2;
    tableroRaycast.position.y = 0.04;

    scene.add(tableroRaycast);

    // Líneas de cuadrícula.
    const grilla = new THREE.GridHelper(
        boardSize,
        tamanoTablero,
        0x5afff2,
        0x25546a
    );

    grilla.position.y = 0.05;
    grilla.material.transparent = true;
    grilla.material.opacity = 0.54;

    scene.add(grilla);

    // Iluminación ambiental.
    const ambiental = new THREE.AmbientLight(
        ambiente.ambiental,
        ambiente.intensidadAmbiental
    );

    scene.add(ambiental);

    // Luz direccional.
    const direccional = new THREE.DirectionalLight(
        ambiente.direccional,
        ambiente.intensidadDireccional
    );

    direccional.position.set(
        boardSize * 0.45,
        boardSize * 0.9,
        boardSize * 0.38
    );

    scene.add(direccional);

    // Luz puntual.
    const punto = new THREE.PointLight(
        ambiente.punto,
        mapa === "playa" ? 0.25 : mapa === "tormenta" ? 3.2 : 1.8,
        boardSize * 1.6,
        2
    );

    punto.position.set(
        -boardHalf * 0.6,
        5,
        -boardHalf * 0.45
    );

    scene.add(punto);

    crearDecoracion(
        scene,
        mapa,
        boardHalf
    );

    // Marcador para colocación.
    const marcador = new THREE.Mesh(
        new THREE.PlaneGeometry(
            cellSize * 0.82,
            cellSize * 0.82
        ),

        new THREE.MeshBasicMaterial({
            color: 0x69ffd7,
            transparent: true,
            opacity: 0.28,
            side: THREE.DoubleSide
        })
    );

    marcador.rotation.x = -Math.PI / 2;
    marcador.position.y = 0.08;
    marcador.visible = false;

    scene.add(marcador);

    // Controles de cámara.
    const controlesCamara = new OrbitControls(
        camera,
        renderer.domElement
    );

    controlesCamara.target.set(0, 0, 0);
    controlesCamara.enablePan = false;
    controlesCamara.enableDamping = false;

    controlesCamara.minDistance =
        boardSize * 0.72;

    controlesCamara.maxDistance =
        boardSize * 1.7;

    controlesCamara.minPolarAngle = 0.35;
    controlesCamara.maxPolarAngle =
        Math.PI / 2.08;

    controlesCamara.zoomSpeed = 0.85;
    controlesCamara.rotateSpeed = 0.65;

    controlesCamara.update();

    function redimensionar() {
        camera.aspect =
            window.innerWidth / window.innerHeight;

        camera.updateProjectionMatrix();

        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );
    }

    window.addEventListener(
        "resize",
        redimensionar
    );

    return {
        scene,
        camera,
        renderer,
        mar,
        tableroRaycast,
        grilla,
        marcador,
        pointLight: punto,
        boardSize,
        boardHalf,
        cellSize,
        controlesCamara,

        dispose() {
            window.removeEventListener(
                "resize",
                redimensionar
            );

            controlesCamara.dispose();
            texturaSkybox?.dispose();
            renderer.dispose();
        }
    };
}
