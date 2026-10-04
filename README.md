# Needle — Reproductor de música

Needle es una aplicación web para escuchar y organizar canciones mediante una **lista doblemente enlazada implementada desde cero en TypeScript**. La interfaz representa la cola musical como nodos conectados y permite recorrerla hacia adelante y hacia atrás.

## Funcionalidades

- Agregar canciones al inicio, al final o en una posición elegida.
- Eliminar canciones y vaciar la cola.
- Avanzar y retroceder entre pistas; reproducción aleatoria y repetición.
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

La cola se guarda en el almacenamiento local del navegador. Los archivos de audio seleccionados se reproducen desde el dispositivo y no se cargan al servidor.
