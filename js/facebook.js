// Inicio de sesion con Facebook mediante el SDK oficial de JavaScript.
(function () {
    "use strict";

    const FACEBOOK_APP_ID = "1077368794900563";

    function mostrarError(mensaje) {
        const errorLogin = document.getElementById("errorLogin");
        if (errorLogin) errorLogin.textContent = mensaje;
        else window.FleetApp?.mostrarToast(mensaje);
    }

    function completarSesionFacebook(perfilFacebook) {
        const nombre = String(perfilFacebook?.name || "").trim();

        if (!nombre) {
            mostrarError("Facebook no devolvió un nombre legible. Puedes usar el acceso manual y después agregar Google como alternativa.");
            return;
        }

        const resultado = window.FleetApp.iniciarSesionExterna({
            nombre,
            proveedor: "facebook",
            idExterno: perfilFacebook.id || "",
            email: perfilFacebook.email || ""
        });

        if (!resultado.ok) {
            mostrarError(resultado.mensaje);
            return;
        }

        document.dispatchEvent(new CustomEvent("fleet:sesion-iniciada", {
            detail: resultado.usuario
        }));
    }

    window.fbAsyncInit = function () {
        window.FB.init({
            appId: FACEBOOK_APP_ID,
            cookie: true,
            xfbml: true,
            version: "v26.0"
        });

        window.FB.AppEvents.logPageView();
    };

    window.checkLoginState = function () {
        if (!window.FB) {
            mostrarError("El SDK de Facebook todavía no está disponible. Revisa tu conexión a Internet.");
            return;
        }

        window.FB.getLoginStatus(function (loginResponse) {
            if (loginResponse.status !== "connected") {
                mostrarError("No se completó el inicio de sesión con Facebook.");
                return;
            }

            window.FB.api(
                "/me",
                { fields: "id,name,email" },
                function (response) {
                    if (response.error) {
                        console.error(response.error);
                        mostrarError("Facebook autorizó el acceso, pero no fue posible consultar el perfil.");
                        return;
                    }

                    completarSesionFacebook(response);
                }
            );
        });
    };

    function cargarSDK() {
        if (document.getElementById("facebook-jssdk")) return;

        const script = document.createElement("script");
        script.id = "facebook-jssdk";
        script.async = true;
        script.defer = true;
        script.crossOrigin = "anonymous";
        script.src = "https://connect.facebook.net/es_LA/sdk.js";
        document.head.appendChild(script);
    }

    cargarSDK();
})();
