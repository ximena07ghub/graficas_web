
import * as THREE from "three";

import {
    OrbitControls
} from "three/addons/controls/OrbitControls.js";

const AMBIENTES = {
    playa: {
        fondo: 0x5b91b2,
        niebla: 0x87b4c8,
        mar: 0x0a6685,
        ambiental: 0xbde8ff,
        direccional: 0xfff0c2,
        punto: 0x55fff0,
        intensidadAmbiental: 0.82,
        intensidadDireccional: 1.5
    },

    tormenta: {
        fondo: 0x07111f,
        niebla: 0x14283a,
        mar: 0x082b3a,
        ambiental: 0x6f89a8,
        direccional: 0xa8c5e5,
        punto: 0x8c9cff,
        intensidadAmbiental: 0.45,
        intensidadDireccional: 1.05
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
        const arena = new THREE.MeshPhongMaterial({
            color: 0xb99c5e,
            shininess: 12
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
    }

    if (mapa === "tormenta") {
        const rocaMaterial =
            new THREE.MeshPhongMaterial({
                color: 0x1a3340,
                shininess: 22
            });

        for (let i = 0; i < 7; i++) {
            const roca = new THREE.Mesh(
                new THREE.DodecahedronGeometry(
                    0.9 + (i % 3) * 0.35
                ),
                rocaMaterial
            );

            roca.position.set(
                (i % 2 ? 1 : -1) *
                    (mitadTablero + 3 + i * 0.45),
                0.45,
                -5 + i * 1.6
            );

            roca.rotation.set(
                i * 0.3,
                i * 0.45,
                0
            );

            grupo.add(roca);
        }
    }

    if (mapa === "artico") {
        const hielo =
            new THREE.MeshPhongMaterial({
                color: 0xe8fbff,
                shininess: 90
            });

        for (let i = 0; i < 8; i++) {
            const placa = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    1.2 + (i % 3) * 0.4,
                    1.5,
                    0.25,
                    6
                ),
                hielo
            );

            placa.position.set(
                (i % 2 ? 1 : -1) *
                    (mitadTablero + 3.5 + (i % 3)),
                0.1,
                -7 + i * 2
            );

            placa.rotation.y = i * 0.6;

            grupo.add(placa);
        }
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
        mapa === "tormenta" ? 3.2 : 1.8,
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
