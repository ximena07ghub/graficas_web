# Fleet Command

Juego web 3D con un servidor Node.js para las partidas y servicios PHP de XAMPP para guardar y consultar resultados.

## Requisitos

- Node.js 20.6 o posterior y npm.
- Apache y MySQL/MariaDB activos en XAMPP.
- La base `fleet_command_gcw` con las tablas `usuarios`, `partidas` y `participaciones`.

## Dependencias

| Biblioteca | Uso |
|---|---|
| Express | Sirve las páginas y los archivos del juego. |
| Socket.IO | Comunica salas, turnos y disparos entre los jugadores. |
| Three.js | Dibuja la escena 3D y carga los modelos. |

Bootstrap ya está incluido en `assets/vendor/bootstrap`. No se necesita un conector MySQL de Node: la conexión con la base la realizan los servicios PHP mediante PDO.

## Configuración local

1. En el `config.php` de los servicios PHP, configura el host, puerto, nombre de base y credenciales de tu instalación. En la computadora de Kevin, XAMPP usa `127.0.0.1:3307`, la base `fleet_command_gcw`, usuario `root` y contraseña vacía.
2. Desde la carpeta del proyecto, instala las dependencias con `npm ci`.
3. Copia `.env.example` como `.env` y ajusta sus valores:

   - `PORT`: puerto del sitio, normalmente `3000`.
   - `FLEET_PHP_URL`: dirección HTTP completa de `guardar_puntaje.php`.
   - `FLEET_INTERNAL_KEY`: el mismo valor que `internal_key` en el `config.php` de PHP.

En PowerShell puedes escribir `npm.cmd ci` y `npm.cmd start` en lugar de `npm ci` y `npm start`.

La carpeta `C:\xampp\htdocs` corresponde a `http://localhost/`. Por ejemplo:

```text
C:\xampp\htdocs\WebServices (2)\WebServices\guardar_puntaje.php
http://127.0.0.1/WebServices%20(2)/WebServices/guardar_puntaje.php
```

`%20` representa el espacio de `WebServices (2)`. Esta URL utiliza el puerto de Apache; el puerto `3307` corresponde a la base de datos y se configura únicamente en PHP.

Cada computadora mantiene su propia copia de `.env`. La página consulta `/api/php` en Node, y Node utiliza `FLEET_PHP_URL` para localizar los servicios. No hace falta editar el JavaScript del navegador al cambiar la carpeta de XAMPP. El guardado oficial continúa enviándose desde Node al PHP con la clave interna.

`.env` y `node_modules` están excluidos de Git. La clave interna debe permanecer en el servidor.

## Iniciar y comprobar

Con Apache y la base de datos encendidos, ejecuta en la carpeta del proyecto:

```text
npm start
```

Abre [Fleet Command](http://localhost:3000/). Mantén abierta la terminal; `Ctrl+C` detiene el servidor. Para reiniciarlo, vuelve a ejecutar `npm start`. Para desarrollo con reinicio al editar archivos, usa `npm run dev`.

- [Estado de Node](http://localhost:3000/api/status): debe devolver `ok: true`.
- [Conexión con PHP y la base](http://localhost:3000/api/php/health.php): debe devolver `ok: true`, `mysql: true` y las tres tablas.
- [Puntuaciones](http://localhost:3000/api/php/obtener_puntajes.php): una lista vacía es válida si no hay partidas registradas.

Abre el juego desde Node, no mediante un archivo local ni un servidor sencillo de HTML: las rutas de Socket.IO y Three.js dependen de Node. El acceso manual permite probar la navegación. Facebook conserva su configuración independiente.
