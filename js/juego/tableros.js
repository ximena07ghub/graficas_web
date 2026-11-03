import * as THREE from "three";

function etiqueta(texto, ancho = 3.4, alto = 0.48) {
    const canvas = document.createElement("canvas");
    const corto = texto.length <= 2;

    canvas.width = corto ? 96 : 640;
    canvas.height = 96;

    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#031725";
    ctx.fillRect(0, 0, canvas.width, 96);

    ctx.fillStyle = "#d9fffc";
    ctx.font = corto
        ? "bold 60px Arial"
        : "bold 42px Arial";

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, canvas.width / 2, 48);

    const mapa = new THREE.CanvasTexture(canvas);
    mapa.colorSpace = THREE.SRGBColorSpace;

    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: mapa,
            fog: false,
            depthTest: false
        })
    );

    sprite.scale.set(ancho, alto, 1);

    return sprite;
}

export function crearTableros(mundo, tamano) {
    // Los cuadros se reducen visualmente para que quepan ambos tableros.
    const celda = mundo.cellSize * 0.44;
    const lado = tamano * celda;
    const separacion = celda * 2;

    // Retira la cuadricula unica anterior.
    mundo.scene.remove(
        mundo.tableroRaycast,
        mundo.grilla,
        mundo.marcador
    );

    const tableros = [];
    const marcadores = new Map();

    let objetivos = [];

    let cursor = null;
    let pendiente = null;

    function crear(nombre, x, color) {
        const grupo = new THREE.Group();

        grupo.name = nombre;
        grupo.position.x = x;

        mundo.scene.add(grupo);

        const fondo = new THREE.Mesh(
            new THREE.PlaneGeometry(lado, lado),
            new THREE.MeshBasicMaterial({
                color: 0x083549,
                fog: false
            })
        );

        fondo.rotation.x = -Math.PI / 2;
        fondo.position.y = 0.025;

        grupo.add(fondo);

        const materialLinea = new THREE.MeshBasicMaterial({
            color,
            fog: false
        });

        for (let i = 0; i <= tamano; i++) {
            const posicion = -lado / 2 + i * celda;

            const grosor =
                i === 0 || i === tamano
                    ? 0.065
                    : 0.027;

            const horizontal = new THREE.Mesh(
                new THREE.BoxGeometry(
                    lado + grosor,
                    0.025,
                    grosor
                ),
                materialLinea
            );

            horizontal.position.set(
                0,
                0.06,
                posicion
            );

            const vertical = new THREE.Mesh(
                new THREE.BoxGeometry(
                    grosor,
                    0.025,
                    lado + grosor
                ),
                materialLinea
            );

            vertical.position.set(
                posicion,
                0.06,
                0
            );

            grupo.add(horizontal, vertical);
        }

        const titulo = etiqueta(
            nombre === "tableroPropio"
                ? "TU FLOTA"
                : "TABLERO ENEMIGO"
        );

        titulo.position.set(
            0,
            0.12,
            -lado / 2 - 0.76
        );

        grupo.add(titulo);

        for (let i = 0; i < tamano; i++) {
            const letra = etiqueta(
                String.fromCharCode(65 + i),
                0.28,
                0.27
            );

            letra.position.set(
                -lado / 2 + celda * (i + 0.5),
                0.1,
                -lado / 2 - 0.32
            );

            const numero = etiqueta(
                String(i + 1),
                0.28,
                0.27
            );

            numero.position.set(
                -lado / 2 - 0.30,
                0.1,
                -lado / 2 + celda * (i + 0.5)
            );

            grupo.add(letra, numero);
        }

        const plano = new THREE.Mesh(
            new THREE.PlaneGeometry(lado, lado),
            new THREE.MeshBasicMaterial({
                visible: false
            })
        );

        plano.rotation.x = -Math.PI / 2;
        plano.position.y = 0.09;

        grupo.add(plano);

        const tablero = {
            nombre,
            grupo,
            plano,
            tamano,
            celda,
            lado
        };

        plano.userData.tablero = tablero;

        tableros.push(tablero);

        return tablero;
    }

    const propio = crear(
        "tableroPropio",
        -(lado + separacion) / 2,
        0x54e7d7
    );

    const enemigo = crear(
        "tableroEnemigo",
        (lado + separacion) / 2,
        0x8dbfe8
    );

    function localizar(rayo) {
        const impacto = rayo.intersectObjects(
            tableros.map(t => t.plano),
            false
        )[0];

        if (!impacto) return null;

        const tablero =
            impacto.object.userData.tablero;

        const punto = tablero.grupo.worldToLocal(
            impacto.point.clone()
        );

        const columna = Math.floor(
            (punto.x + lado / 2) / celda
        );

        const fila = Math.floor(
            (punto.z + lado / 2) / celda
        );

        if (
            columna < 0 ||
            fila < 0 ||
            columna >= tamano ||
            fila >= tamano
        ) {
            return null;
        }

        return {
            tablero,
            columna,
            fila
        };
    }

    function cuadro(
        tablero,
        columna,
        fila,
        color,
        altura = 0.11
    ) {
        const marca = new THREE.Mesh(
            new THREE.PlaneGeometry(
                celda * 0.77,
                celda * 0.77
            ),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.82,
                fog: false,
                side: THREE.DoubleSide
            })
        );

        marca.rotation.x = -Math.PI / 2;

        marca.position.set(
            -lado / 2 + celda * (columna + 0.5),
            altura,
            -lado / 2 + celda * (fila + 0.5)
        );

        tablero.grupo.add(marca);

        return marca;
    }

    function quitar(marca) {
        marca.removeFromParent();
        marca.geometry.dispose();
        marca.material.dispose();
    }

    function mostrarObjetivos(celdas) {
        objetivos.forEach(quitar);

        objetivos = celdas.map(c =>
            cuadro(
                enemigo,
                c.columna,
                c.fila,
                0xffd060,
                0.12
            )
        );
    }

    function apuntar(celda) {
    if (cursor) {
        quitar(cursor);
        cursor = null;
    }

    if (!celda) return;

    cursor = cuadro(
        enemigo,
        celda.columna,
        celda.fila,
        0xc5f7ff,
        0.13
    );

    // Iluminacion leve de la casilla.
    cursor.material.opacity = 0.18;
}

function mostrarPendiente(datos, slotLocal) {
    if (pendiente) {
        quitar(pendiente);
        pendiente = null;
    }

    if (
        !datos ||
        datos.tipo !== "clasico"
    ) {
        return;
    }

    const tablero =
        datos.jugador === slotLocal
            ? enemigo
            : propio;

    pendiente = cuadro(
        tablero,
        datos.columna,
        datos.fila,
        0xe5faff,
        0.14
    );

    // Todavia no indica si fue agua o impacto.
    pendiente.material.opacity = 0.25;
}

function disparo(evento, slotLocal) {
    const id =
        `${evento.jugador}:` +
        `${evento.columna},${evento.fila}`;

    if (marcadores.has(id)) return;

    const tablero =
        evento.jugador === slotLocal
            ? enemigo
            : propio;

    const marca = new THREE.Group();
    marca.name = `disparo-${id}`;

    // Agua: conserva el fondo normal.
    // Impacto: agrega un fondo rojo.
    if (evento.acierto) {
        const fondo = cuadro(
            tablero,
            evento.columna,
            evento.fila,
            0xe74238,
            0.11
        );

        marca.add(fondo);
    }

    const material = new THREE.MeshBasicMaterial({
        color: 0xf1f7ff,
        fog: false,
        depthTest: false,
        depthWrite: false
    });

    // Dos trazos forman la X.
    for (
        const giro of
        [-Math.PI / 4, Math.PI / 4]
    ) {
        const trazo = new THREE.Mesh(
            new THREE.BoxGeometry(
                celda * 0.72,
                0.015,
                celda * 0.07
            ),
            material
        );

        trazo.rotation.y = giro;

        trazo.position.set(
            -lado / 2 +
                celda * (evento.columna + 0.5),
            0.16,
            -lado / 2 +
                celda * (evento.fila + 0.5)
        );

        trazo.renderOrder = 20;

        marca.add(trazo);
    }

    tablero.grupo.add(marca);

    marcadores.set(id, marca);
}

    function encuadrar() {
        const ancho =
            lado * 2 + separacion + celda;

        const alto = lado * 0.86 + 1.5;

        const factor = Math.tan(
            THREE.MathUtils.degToRad(
                mundo.camera.fov / 2
            )
        );

        const alturaUtil = Math.max(
            180,
            window.innerHeight - 330
        );

        const distancia = Math.max(
            ancho / (
                2 * factor * mundo.camera.aspect
            ),
            alto / (2 * factor) *
                window.innerHeight / alturaUtil
        ) * 1.12;

        mundo.camera.position.set(
            0,
            distancia * 0.86,
            distancia * 0.51
        );

        mundo.camera.lookAt(0, 0, 0);
        mundo.controlesCamara.target.set(0, 0, 0);

        mundo.controlesCamara.minDistance =
            distancia * 0.55;

        mundo.controlesCamara.maxDistance =
            distancia * 2;

        mundo.controlesCamara.update();
    }

    encuadrar();

    window.addEventListener(
        "resize",
        encuadrar
    );

    return {
        propio,
        enemigo,
        localizar,
        mostrarObjetivos,
        apuntar,
        mostrarPendiente,
        disparo,
        encuadrar,

        dispose() {
            window.removeEventListener(
                "resize",
                encuadrar
            );

            for (const tablero of tableros) {
                tablero.grupo.traverse(objeto => {
                    objeto.geometry?.dispose();

                    for (
                        const material of
                        [].concat(objeto.material || [])
                    ) {
                        material.map?.dispose();
                        material.dispose();
                    }
                });

                tablero.grupo.removeFromParent();
            }
        }
    };
}