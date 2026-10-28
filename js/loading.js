// Pantalla de carga del sistema.


// Elementos animados de carga.

const barra =
    document.getElementById(
        "barraProgreso"
    );


const porcentajeTexto =
    document.getElementById(
        "porcentajeCarga"
    );


const mensajeTexto =
    document.getElementById(
        "mensajeCarga"
    );


const puntosCarga =
    document.getElementById(
        "puntosCarga"
    );



// Destino guardado desde otra ventana.

const destino =
    sessionStorage.getItem(
        "fleetDestino"
    )
    ||
    "dashboard.html";


const mensaje =
    sessionStorage.getItem(
        "fleetMensajeCarga"
    )
    ||
    "Preparando sistema...";



mensajeTexto.textContent =
    mensaje;



// Avance visual de la barra.

let progreso = 0;



const intervalo =
    setInterval(
        () => {


            // Avance aleatorio pequeño.

            const incremento =
                Math.floor(
                    Math.random() * 7
                ) + 2;


            progreso +=
                incremento;



            if (
                progreso > 100
            ) {

                progreso = 100;

            }



            barra.style.width =
                progreso + "%";


            porcentajeTexto.textContent =
                progreso + "%";



            actualizarMensaje(
                progreso
            );



            if (
                progreso >= 100
            ) {

                clearInterval(
                    intervalo
                );


                porcentajeTexto.textContent =
                    "100%";


                mensajeTexto.textContent =
                    "Sistema preparado";



                setTimeout(
                    () => {

                        window.location.href =
                            destino;

                    },
                    550
                );

            }

        },
        120
    );



// Cambia mensajes por porcentaje.

function actualizarMensaje(
    porcentaje
) {

    if (
        porcentaje < 25
    ) {

        return;

    }


    if (
        porcentaje < 50
    ) {

        mensajeTexto.textContent =
            "Comprobando sistemas navales...";

        return;

    }


    if (
        porcentaje < 75
    ) {

        mensajeTexto.textContent =
            "Sincronizando mando de flota...";

        return;

    }


    if (
        porcentaje < 100
    ) {

        mensajeTexto.textContent =
            "Finalizando preparación...";

    }

}



// Anima puntos del título.

let cantidadPuntos = 1;


setInterval(
    () => {

        puntosCarga.textContent =
            ".".repeat(
                cantidadPuntos
            );


        cantidadPuntos++;


        if (
            cantidadPuntos > 8
        ) {

            cantidadPuntos = 1;

        }

    },
    260
);
