import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function crearDecoracionTormenta(scene, grupo, mitadTablero) {
    const cargadorTormenta = new GLTFLoader();
    const rutaTormenta = "/public/models/tormenta/";

    // Ajusta el tamaño y coloca el centro de la base en el origen.
    function prepararModeloTormenta(plantilla, tamano) {
        const modelo = plantilla.clone(true);
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

        // Escala proporcional: tamano es la dimensión mayor deseada.
        modelo.scale.multiplyScalar(tamano / dimensionMayor);
        modelo.updateMatrixWorld(true);
        caja.setFromObject(modelo);

        const centro = caja.getCenter(new THREE.Vector3());
        modelo.position.x -= centro.x;
        modelo.position.z -= centro.z;
        modelo.position.y -= caja.min.y;

        // El grupo permite mover y girar desde el centro de la base.
        const objeto = new THREE.Group();
        objeto.add(modelo);
        return objeto;
    }

    // Carga cada archivo una vez y crea las copias que necesites.
    function agregarModelosTormenta(archivo, posiciones) {
        return cargadorTormenta.loadAsync(rutaTormenta + archivo)
            .then((gltf) => {
                posiciones.forEach((datos, indice) => {
                    const objeto = prepararModeloTormenta(
                        gltf.scene,
                        datos.tamano
                    );

                    objeto.name = `${archivo}-${indice + 1}`;
                    objeto.position.set(datos.x, datos.y, datos.z);
                    objeto.rotation.y = THREE.MathUtils.degToRad(
                        datos.giro || 0
                    );

                    grupo.add(objeto);
                });
            })
            .catch((error) => {
                console.error(`No se pudo cargar ${archivo}:`, error);
            });
    }

    // ROCAS: posiciones, tamaños y giros actuales del escenario.
    void agregarModelosTormenta("rock_sea_sea_rock.glb", [
        {
            x: -(mitadTablero + 2),
            y: -0.30,
            z: -10,
            tamano: 3.5,
            giro: 15
        },
        {
            x: mitadTablero + 3.5,
            y: -0.16,
            z: -20,
            tamano: 5.5,
            giro: 90
        },
        {
            x: -(mitadTablero - 4.5),
            y: -0.25,
            z: 20,
            tamano: 4,
            giro: 160
        },
        {
            x: mitadTablero + 5,
            y: -0.40,
            z: -10,
            tamano: 3,
            giro: 40
        },
        {
            x: -(mitadTablero - 20.5),
            y: -0.30,
            z: 15,
            tamano: 6.7,
            giro: 230
        },
        {
            x: mitadTablero + 10.5,
            y: -0.25,
            z: 5,
            tamano: 3.5,
            giro: 310
        },
        {
            x: -(mitadTablero + 3),
            y: -0.35,
            z: 2.5,
            tamano: 2.8,
            giro: 110
        }
    ]);

    // COSTA ROCOSA: las dos copias del lado X negativo.
    void agregarModelosTormenta(
        "rocky_coast_of_the_sea_of_japan_n6._fragment.glb",
        [
            {
                x: -(mitadTablero + 15),
                y: -0.25,
                z: -15,
                tamano: 31,
                giro: 90
            },
            {
                x: -(mitadTablero + 15),
                y: -0.25,
                z: 15,
                tamano: 31,
                giro: 90
            }
        ]
    );

    // FARO: del lado X positivo.
    void agregarModelosTormenta("lighthouse.glb", [
        {
            x: mitadTablero + 12.5,
            y: -0.10,
            z: -15,
            tamano: 7,
            giro: 210
        }
    ]);

    new GLTFLoader().load(
        "/public/models/cielo/skydome_tormenta_sin_costura.glb",
        (gltf) => {
            const cielo = gltf.scene;

            cielo.name = "skydomeTormenta";
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
