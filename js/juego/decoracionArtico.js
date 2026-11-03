import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const RUTA = "/public/models/artico/";
const NIVEL_MAR = -0.1;

// Conserva las proporciones; tamano es la dimension mayor del modelo.
function prepararModelo(plantilla, tamano) {
    const modelo = plantilla.clone(true);
    const caja = new THREE.Box3().setFromObject(modelo);
    const medidas = caja.getSize(new THREE.Vector3());
    const mayor = Math.max(medidas.x, medidas.y, medidas.z);

    if (mayor <= 0) throw new Error("El modelo no tiene dimensiones.");

    modelo.scale.multiplyScalar(tamano / mayor);
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

export async function crearDecoracionArtico(grupo, mitadTablero) {
    const loader = new GLTFLoader();

    // Recupera los colores y texturas de los materiales del Titanic.
loader.register((parser) => ({
    name: "KHR_materials_pbrSpecularGlossiness",

    async extendMaterialParams(indice, parametros) {
        const material = parser.json.materials[indice];
        const datos =
            material.extensions?.KHR_materials_pbrSpecularGlossiness;

        if (!datos) return;

        parametros.color = new THREE.Color().fromArray(
            datos.diffuseFactor ?? [1, 1, 1, 1]
        );

        parametros.opacity = datos.diffuseFactor?.[3] ?? 1;
        parametros.metalness = 0;
        parametros.roughness = 1 - (datos.glossinessFactor ?? 1);

        if (datos.diffuseTexture) {
            await parser.assignTexture(
                parametros,
                "map",
                datos.diffuseTexture,
                THREE.SRGBColorSpace
            );
        }
    }
}));

    async function cargar(ruta, colocar) {
        try {
            const gltf = await loader.loadAsync(ruta);
            await colocar(gltf.scene);
        } catch (error) {
            console.error(`No se pudo cargar ${ruta}:`, error);
        }
    }

    // AQUI ACOMODAS LOS OCHO GRUPOS DE HIELO.
    // x/z: posicion horizontal; y: altura; giro: grados.
    const HIELOS = [
        { x: -(mitadTablero + 5), y: -0.18, z: -4, tamano: 6.2, giro: 25 },
        { x: mitadTablero + 4, y: -0.16, z: -6, tamano: 3.6, giro: 80 },
        { x: -(mitadTablero + 3.5), y: -0.14, z: 3.5, tamano: 3, giro: 140 },
        { x: mitadTablero + 5, y: -0.18, z: 2, tamano: 4.7, giro: 210 },
        { x: -4, y: -0.14, z: mitadTablero + 4, tamano: 3.4, giro: 35 },
        { x: 4, y: -0.16, z: mitadTablero + 5, tamano: 4.1, giro: 115 },
        { x: -4, y: -0.13, z: -(mitadTablero + 2.5), tamano: 3.3, giro: 285 },
        { x: -(mitadTablero + 7), y: -0.16, z: mitadTablero + 6, tamano: 3.8, giro: 320 }
    ];

    const IGLU = {
        hielo: 0,       // 0 = primer grupo de HIELOS.
        x: 0,          // Posicion relativa a ese grupo de hielo.
        z: -1.6,
        tamano: 1.6,
        giro: 20,
        ajusteY: -0.01
    };

    const ICEBERG = {
        x: mitadTablero + 8,
        z: mitadTablero + 8,
        tamano: 9,
        giro: -25,
        sumergido: 0.30 // Fraccion de su altura bajo el agua: 20%.
    };

    // El mar de escena.js mide 3.6 veces el ancho del tablero.
    const MURO = {
        largo: mitadTablero * 2 * 3.6,
        separacion: 6, // Distancia desde el tablero a la cara cercana.
        y: -5.0
    };

    await Promise.all([
        cargar(RUTA + "le_titanic.glb", (plantilla) => {
    const datos = {
        x: -(mitadTablero + 11),
        z: -3,
        tamano: 12,
        giro: 90,
        sumergido: 0.15
    };

    const titanic = prepararModelo(plantilla, datos.tamano);

    const altura = new THREE.Box3().setFromObject(titanic)
        .getSize(new THREE.Vector3()).y;

    titanic.name = "titanicArtico";

    titanic.position.set(
        datos.x,
        NIVEL_MAR - altura * datos.sumergido,
        datos.z
    );

    titanic.rotation.y = THREE.MathUtils.degToRad(datos.giro);

    grupo.add(titanic);
}),

        cargar(RUTA + "ice_floes.glb", async (plantilla) => {
            // El archivo se carga una vez y se reutiliza para las ocho copias.
            const placas = HIELOS.map((datos, indice) => {
                const hielo = prepararModelo(plantilla, datos.tamano);
                hielo.name = `hieloArtico${indice + 1}`;
                hielo.position.set(datos.x, datos.y, datos.z);
                hielo.rotation.y = THREE.MathUtils.degToRad(datos.giro);
                grupo.add(hielo);
                return hielo;
            });

            await cargar(RUTA + "simple_igloo.glb", (modeloIglu) => {
                const hielo = placas[IGLU.hielo];
                if (!hielo) throw new Error("No existe el hielo elegido para el iglu.");

                // Busca la superficie real debajo del iglu.
                hielo.updateWorldMatrix(true, true);
                const caja = new THREE.Box3().setFromObject(hielo);
                const origen = hielo.localToWorld(
                    new THREE.Vector3(IGLU.x, 0, IGLU.z)
                );
                origen.y = caja.max.y + 10;

                const rayo = new THREE.Raycaster(
                    origen,
                    new THREE.Vector3(0, -1, 0)
                );
                const impacto = rayo.intersectObject(hielo, true)[0];

                if (!impacto) {
                    throw new Error("El iglu esta fuera del hielo; ajusta IGLU.x e IGLU.z.");
                }

                const altura = hielo.worldToLocal(impacto.point.clone()).y;
                const iglu = prepararModelo(modeloIglu, IGLU.tamano);
                iglu.name = "igluArtico";
                iglu.position.set(IGLU.x, altura + IGLU.ajusteY, IGLU.z);
                iglu.rotation.y = THREE.MathUtils.degToRad(IGLU.giro);

                // Al ser hijo del hielo, se mueve y gira junto con el.
                hielo.add(iglu);
            });
        }),

        cargar(RUTA + "the_rehorek_iceberg.glb", (plantilla) => {
            const iceberg = prepararModelo(plantilla, ICEBERG.tamano);
            const altura = new THREE.Box3().setFromObject(iceberg)
                .getSize(new THREE.Vector3()).y;

            iceberg.name = "icebergArtico";
            iceberg.position.set(
                ICEBERG.x,
                NIVEL_MAR - altura * ICEBERG.sumergido,
                ICEBERG.z
            );
            iceberg.rotation.y = THREE.MathUtils.degToRad(ICEBERG.giro);
            grupo.add(iceberg);
        }),

        cargar(RUTA + "ice_castles_ny__ice_wall.glb", (plantilla) => {
            // Este modelo tiene su eje largo sobre X.
            const muro = prepararModelo(plantilla, MURO.largo);
            const profundidad = new THREE.Box3().setFromObject(muro)
                .getSize(new THREE.Vector3()).z;

            muro.name = "muroHieloArtico";
            muro.position.set(
                0,
                MURO.y,
                -(mitadTablero + MURO.separacion) - profundidad / 2
            );
            grupo.add(muro);
        }),

        cargar("/public/models/cielo/skydome_artico.glb", (cielo) => {
            cielo.name = "skydomeArtico";
            cielo.position.set(0, 0, 0);
            cielo.scale.setScalar(80);
            cielo.renderOrder = -1000;

            cielo.traverse((objeto) => {
                if (!objeto.isMesh) return;
                objeto.renderOrder = -1000;

                const materiales = Array.isArray(objeto.material)
                    ? objeto.material
                    : [objeto.material];

                materiales.forEach((material) => {
                    material.fog = false;
                    material.depthWrite = false;
                    material.toneMapped = false;
                });
            });

            // Solo agrega el fondo; no cambia las luces ni scene.environment.
            grupo.add(cielo);
        })
    ]);
}
