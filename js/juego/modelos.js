import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const manager = new THREE.LoadingManager();

manager.onStart = function (url, itemsLoaded, itemsTotal) {
    console.log(`Iniciando carga: ${url}. ${itemsLoaded} de ${itemsTotal} archivos.`);
};

manager.onLoad = function () {
    console.log("Carga de recursos 3D completa.");
};

manager.onProgress = function (url, itemsLoaded, itemsTotal) {
    console.log(`Cargando: ${url}. ${itemsLoaded} de ${itemsTotal} archivos.`);
};

manager.onError = function (url) {
    console.warn(`No se pudo cargar un recurso del modelo: ${url}`);
};

function materialIluminado(material) {
    if (!material?.isMeshBasicMaterial) return material;

    return new THREE.MeshPhongMaterial({
        color: material.color?.clone() || new THREE.Color(0xffffff),
        map: material.map || null,
        transparent: material.transparent,
        opacity: material.opacity,
        side: material.side,
        shininess: 55
    });
}

function prepararModelo(modelo) {
    modelo.traverse((objeto) => {
        if (!objeto.isMesh) return;

        // Los FBX son detallados; desactivar sombras por malla reduce el trabajo de la GPU.
        objeto.castShadow = false;
        objeto.receiveShadow = false;

        if (Array.isArray(objeto.material)) {
            objeto.material = objeto.material.map(materialIluminado);
        } else {
            objeto.material = materialIluminado(objeto.material);
        }
    });
}

function ajustarTamanoYCentro(modelo, longitudObjetivo = 2.15) {
    let caja = new THREE.Box3().setFromObject(modelo);
    const tamano = new THREE.Vector3();
    caja.getSize(tamano);

    // Los barcos del juego avanzan sobre el eje Z. Si el FBX viene acostado en X,
    // se gira una sola vez para que los controles coincidan con la proa.
    if (tamano.x > tamano.z) {
        modelo.rotation.y += Math.PI / 2;
        modelo.updateMatrixWorld(true);
        caja = new THREE.Box3().setFromObject(modelo);
        caja.getSize(tamano);
    }

    const largoActual = Math.max(tamano.x, tamano.z);
    if (largoActual > 0) {
        modelo.scale.multiplyScalar(longitudObjetivo / largoActual);
    }

    modelo.updateMatrixWorld(true);
    caja = new THREE.Box3().setFromObject(modelo);

    const centro = new THREE.Vector3();
    caja.getCenter(centro);

    modelo.position.x -= centro.x;
    modelo.position.z -= centro.z;
    modelo.position.y -= caja.min.y;
    modelo.updateMatrixWorld(true);
}

// Funcion de clase para cargar un OBJ junto con su MTL.
export function cargarModelo3D(path, nombre, escala = new THREE.Vector3(1, 1, 1)) {
    return new Promise((resolve, reject) => {
        const loaderOBJ = new OBJLoader(manager);
        const loaderMTL = new MTLLoader(manager);

        loaderMTL.load(
            path + ".mtl",
            function (materials) {
                materials.preload();
                loaderOBJ.setMaterials(materials);

                loaderOBJ.load(
                    path + ".obj",
                    function (object) {
                        object.name = nombre;
                        object.scale.copy(escala);
                        prepararModelo(object);
                        console.log(`Modelo ${nombre} cargado correctamente.`);
                        resolve(object);
                    },
                    function (xhr) {
                        if (xhr.total > 0) {
                            console.log(`${nombre}: ${(xhr.loaded / xhr.total * 100).toFixed(1)}% cargado`);
                        }
                    },
                    function (error) {
                        console.error(`Error cargando ${nombre}:`, error);
                        reject(error);
                    }
                );
            },
            undefined,
            function (error) {
                console.error(`Error cargando MTL de ${nombre}:`, error);
                reject(error);
            }
        );
    });
}

// Carga un FBX, activa sombras y lo adapta al tamaño usado por el tablero.
export function cargarModeloFBX(ruta, nombre, longitudObjetivo = 2.15) {
    return new Promise((resolve, reject) => {
        const loaderFBX = new FBXLoader(manager);

        loaderFBX.load(
            ruta,
            function (object) {
                object.name = nombre;
                prepararModelo(object);
                ajustarTamanoYCentro(object, longitudObjetivo);
                console.log(`Modelo FBX ${nombre} cargado correctamente.`);
                resolve(object);
            },
            function (xhr) {
                if (xhr.total > 0) {
                    console.log(`${nombre}: ${(xhr.loaded / xhr.total * 100).toFixed(1)}% cargado`);
                }
            },
            function (error) {
                console.error(`Error cargando FBX ${nombre}:`, error);
                reject(error);
            }
        );
    });
}

// Crea una copia independiente del modelo para que cada barco pueda seleccionarse
// sin cambiar el material de los demas barcos.
export function clonarModeloBarco(plantilla) {
    if (!plantilla) return null;

    const copia = plantilla.clone(true);

    copia.traverse((objeto) => {
        if (!objeto.isMesh || !objeto.material) return;

        if (Array.isArray(objeto.material)) {
            objeto.material = objeto.material.map((material) => material.clone());
        } else {
            objeto.material = objeto.material.clone();
        }
    });

    return copia;
}
