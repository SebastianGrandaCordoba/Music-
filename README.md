# Needle — Reproductor de música

Needle es una aplicación web para escuchar y organizar canciones mediante una **lista doblemente enlazada implementada desde cero en TypeScript**. La interfaz representa la cola musical como nodos conectados y permite recorrerla hacia adelante y hacia atrás.

## Funcionalidades

- Agregar canciones al inicio, al final o en una posición elegida.
- Eliminar canciones y vaciar la cola.
- Avanzar y retroceder entre pistas; al finalizar una canción sale de la fila activa y queda registrada en el historial.
- Modo aleatorio sin repetir pistas hasta completar una ronda; en orden normal la fila vuelve a empezar al llegar al final.
- Historial independiente de canciones escuchadas o saltadas, con opción de volverlas a agregar y reproducir.
- Cada recarga empieza con las canciones demo originales; la búsqueda, la cola, el historial y la sesión de Spotify vuelven a iniciar.
- Reordenar canciones arrastrándolas y ver sus enlaces `prev` y `next`.
- Buscar dentro de la cola y conservarla al recargar la página.
- Explorar sugerencias, escuchar previews disponibles y cargar audio local.
- Conectar Spotify, buscar canciones del catálogo y reproducir con Web Playback SDK cuando la cuenta y la aplicación tengan acceso habilitado.
- Interfaz adaptable a escritorio y móvil.

## Tecnologías

- **Frontend:** React, TypeScript, Vite y Tailwind CSS.
- **Backend:** Node.js, Express y TypeScript.
- **Autenticación Spotify:** Authorization Code con PKCE.
- **Estructura principal:** lista doblemente enlazada genérica.

## Estructura del proyecto

```text
client/
  src/
    data/tracks.ts
    structures/DoublyLinkedList.ts
    App.tsx
    styles.css
  index.html
server/
  src/index.ts
  tsconfig.json
.env.example
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

## Lista doblemente enlazada

Cada `Node<T>` conserva el valor de la canción y dos referencias: `next` al nodo siguiente y `prev` al anterior. `DoublyLinkedList<T>` mantiene `head`, `tail`, el nodo `current` y el tamaño. Implementa `addFirst`, `addLast`, `insertAt`, `removeAt`, `removeById`, `moveNext`, `movePrevious`, `setCurrentById` y `clear`.

La navegación y las modificaciones recorren y actualizan nodos directamente. `toArray()` se usa únicamente para crear la instantánea que React necesita para mostrar los elementos.

## Requisitos

- Node.js 20 o superior.
- pnpm 11 o superior.

## Configuración y ejecución

Instala las dependencias desde la carpeta raíz:

```bash
pnpm install
```

Crea `server/.env` a partir de `.env.example`. Para desarrollo local configura:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
SPOTIFY_CLIENT_ID=tu_client_id
SPOTIFY_REDIRECT_URI=http://127.0.0.1:4000/api/spotify/callback
```

La Redirect URI debe coincidir exactamente con la registrada en la aplicación de Spotify. No se necesita Client Secret para el flujo PKCE. El frontend usa `http://localhost:4000` como API de desarrollo por defecto; opcionalmente, puedes crear `client/.env.local` con `VITE_API_URL=http://localhost:4000`.

Inicia el frontend y el backend:

```bash
pnpm dev
```

Frontend: <http://localhost:5173>  
Backend: <http://localhost:4000>

Para generar las compilaciones de producción:

```bash
pnpm build
```

## Integración de audio

La conexión con Spotify usa OAuth PKCE y requiere que la aplicación tenga el scope `streaming` habilitado, una cuenta Premium elegible y acceso al Web Playback SDK. La disponibilidad depende de los permisos que Spotify conceda a la aplicación. Cuando no se pueda reproducir desde Spotify, Needle usa un preview disponible o permite cargar un archivo de audio local.

Al recargar, la cola y el historial se reinician, y se requiere volver a conectar Spotify. Las canciones de prueba se cargan nuevamente. Los archivos de audio seleccionados se reproducen desde el dispositivo y no se cargan al servidor.

## Despliegue y callback de Spotify

En producción, el frontend de Vercel usa `client/vercel.json` para reenviar `/api/*` al backend de Render manteniendo el dominio de Vercel en la barra del navegador. Así, la autorización de Spotify regresa por el mismo dominio que la aplicación.

Para este despliegue, registra exactamente `https://music-opal-kappa.vercel.app/api/spotify/callback` como Redirect URI en el Developer Dashboard de Spotify y configura el mismo valor en `SPOTIFY_REDIRECT_URI` en Render. `CLIENT_ORIGIN` en Render debe ser `https://music-opal-kappa.vercel.app`. El dominio del backend indicado en `client/vercel.json` debe coincidir con el servicio Render actual. En Vercel, usa `client` como Root Directory para que cargue ese archivo de proxy. En local, la app sigue usando `http://localhost:4000`.

Chrome controla la advertencia de sitio peligroso mediante Safe Browsing; el código de la app no puede quitarla ni debe ocultarla. El proxy evita que la navegación OAuth lleve al usuario directamente al hostname de Render. Si Chrome también marca el dominio Vercel, el propietario del sitio debe revisar su estado con Google Safe Browsing y solicitar una revisión si considera que es un falso positivo.
