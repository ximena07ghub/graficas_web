import * as THREE from "three";

import {
    celdasBarco
} from "./reglasCombate.js";

import {
    clonarModeloBarco
} from "./modelos.js";

export function crearVistaFlota(tablero) {
    const objetos = new Map();

    let plantilla = null;
    let seleccionado = null;
    let datosFlota = [];

    function crearVisual(datos) {
        const raiz = new THREE.Group();

        raiz.userData.barcoId = datos.barcoId;

        const longitud =
            datos.longitud * tablero.celda * 0.94;

        let modelo;

        if (plantilla) {
            modelo = clonarModeloBarco(plantilla);

            const caja = new THREE.Box3()
                .setFromObject(modelo);

            let medidas = caja.getSize(
                new THREE.Vector3()
            );

            if (medidas.x > medidas.z) {
                modelo.rotation.y += Math.PI / 2;
                modelo.updateMatrixWorld(true);

                caja.setFromObject(modelo);

                medidas = caja.getSize(
                    new THREE.Vector3()
                );
            }

            modelo.scale.multiplyScalar(
                Math.min(
                    longitud / medidas.z,
                    tablero.celda * 0.83 / medidas.x
                )
            );

            modelo.updateMatrixWorld(true);
            caja.setFromObject(modelo);

            const centro = caja.getCenter(
                new THREE.Vector3()
            );

            modelo.position.x -= centro.x;
            modelo.position.z -= centro.z;
            modelo.position.y -= caja.min.y;
        } else {
            // Respaldo mientras carga el FBX.
            modelo = new THREE.Group();

            const material = new THREE.MeshPhongMaterial({
                color: 0x63b4c9,
                shininess: 60
            });

            const casco = new THREE.Mesh(
                new THREE.BoxGeometry(
                    tablero.celda * 0.62,
                    tablero.celda * 0.28,
                    longitud
                ),
                material
            );

            casco.position.y =
                tablero.celda * 0.14;

            const cabina = new THREE.Mesh(
                new THREE.BoxGeometry(
                    tablero.celda * 0.4,
                    tablero.celda * 0.30,
                    longitud * 0.35
                ),
                new THREE.MeshPhongMaterial({
                    color: 0xe6f4f3
                })
            );

            cabina.position.y =
                tablero.celda * 0.37;

            modelo.add(casco, cabina);
        }

        raiz.add(modelo);

        const vertical =
            datos.rotacion % 180 !== 0;

        raiz.position.set(
            -tablero.lado / 2 +
                tablero.celda * (
                    datos.columna +
                    (vertical ? 0.5 : datos.longitud / 2)
                ),
            0.13,
            -tablero.lado / 2 +
                tablero.celda * (
                    datos.fila +
                    (vertical ? datos.longitud / 2 : 0.5)
                )
        );

        raiz.rotation.y =
            Math.PI / 2 +
            THREE.MathUtils.degToRad(
                datos.rotacion
            );

        const huella = new THREE.Group();
        huella.name = "huella";

        for (const celda of celdasBarco(datos)) {
            const marca = new THREE.Mesh(
                new THREE.PlaneGeometry(
                    tablero.celda * 0.88,
                    tablero.celda * 0.88
                ),
                new THREE.MeshBasicMaterial({
                    color:
                        seleccionado === datos.barcoId
                            ? 0xffcd54
                            : 0x236b7c,
                    transparent: true,
                    opacity: 0.5,
                    fog: false
                })
            );

            marca.rotation.x = -Math.PI / 2;

            marca.position.set(
                -tablero.lado / 2 +
                    tablero.celda * (
                        celda.columna + 0.5
                    ),
                0.095,
                -tablero.lado / 2 +
                    tablero.celda * (
                        celda.fila + 0.5
                    )
            );

            marca.userData.barcoId =
                datos.barcoId;

            huella.add(marca);
        }

        tablero.grupo.add(raiz, huella);

        objetos.set(datos.barcoId, {
            raiz,
            huella
        });
    }

    function limpiar() {
        for (
            const { raiz, huella } of
            objetos.values()
        ) {
            raiz.removeFromParent();
            huella.removeFromParent();

            for (const grupo of [raiz, huella]) {
                grupo.traverse(objeto => {
                    if (
                        !plantilla ||
                        grupo === huella
                    ) {
                        objeto.geometry?.dispose();
                    }

                    for (
                        const material of
                        [].concat(objeto.material || [])
                    ) {
                        material.dispose();
                    }
                });
            }
        }

        objetos.clear();
    }

    function actualizar(flota) {
        const mismosBarcos =
            objetos.size === flota.length &&
            flota.every(barco =>
                objetos.has(barco.barcoId) &&
                datosFlota.find(
                    dato =>
                        dato.barcoId === barco.barcoId
                )?.longitud === barco.longitud
            );

        if (mismosBarcos) {
            // Mover no vuelve a clonar todos los modelos.
            for (const barco of flota) {
                const { raiz, huella } =
                    objetos.get(barco.barcoId);

                const vertical =
                    barco.rotacion % 180 !== 0;

                raiz.position.x =
                    -tablero.lado / 2 +
                    tablero.celda * (
                        barco.columna +
                        (vertical ? 0.5 : barco.longitud / 2)
                    );

                raiz.position.z =
                    -tablero.lado / 2 +
                    tablero.celda * (
                        barco.fila +
                        (vertical ? barco.longitud / 2 : 0.5)
                    );

                raiz.rotation.y =
                    Math.PI / 2 +
                    THREE.MathUtils.degToRad(
                        barco.rotacion
                    );

                celdasBarco(barco).forEach(
                    (celda, indice) => {
                        huella.children[indice].position.x =
                            -tablero.lado / 2 +
                            tablero.celda *
                                (celda.columna + 0.5);

                        huella.children[indice].position.z =
                            -tablero.lado / 2 +
                            tablero.celda *
                                (celda.fila + 0.5);
                    }
                );
            }

            datosFlota = flota.map(
                barco => ({ ...barco })
            );

            return;
        }

        limpiar();

        datosFlota = flota.map(
            barco => ({ ...barco })
        );

        datosFlota.forEach(crearVisual);
    }

    return {
        actualizar,

        seleccionar(id) {
            seleccionado = id;

            for (
                const [barcoId, { huella }] of
                objetos
            ) {
                huella.children.forEach(
                    objeto => objeto.material.color.setHex(
                        barcoId === id
                            ? 0xffcd54
                            : 0x236b7c
                    )
                );
            }
        },

        aplicarModelo(modelo) {
            const anteriores = datosFlota;

            limpiar();

            plantilla = modelo;

            actualizar(anteriores);
        },

        dispose: limpiar
    };
}