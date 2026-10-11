# editor-mcp · el Agente del Editor de Oretron, manejable desde fuera

Permite que **otras herramientas manejen el editor del sitio**: por ejemplo
Claude Desktop, o cualquier cliente MCP. Lo que se ejecuta no es una
simulación: es el mismo puente (`window.__oretronEditor`) que usa el chat
del editor, en la sesión del navegador que esté abierta.

Añadido en EDTH-130. Costo de operación: **$0** (Workers Free).

## Cómo funciona

```
Cliente MCP ──HTTP JSON-RPC──▶ Worker ──▶ Durable Object (sesión)
                                             ⇅ WebSocket
                                   navegador con el editor abierto
```

El editor y el Worker no comparten memoria: el comando viaja por el
WebSocket, se ejecuta contra el puente real y el resultado vuelve por el
mismo socket. Si el editor está cerrado, la tool responde con un mensaje
claro en vez de inventar un resultado.

## Puesta en marcha

```bash
# 1. Secreto compartido (el navegador lo necesita en claro: es una sesión
#    local de un solo usuario, no una credencial de servicio)
wrangler secret put MCP_TOKEN

# 2. Desplegar
pnpm --filter editor-mcp deploy
```

En el proyecto de Oretron, el `.env.local` del editor:

```
NEXT_PUBLIC_EDITOR_MCP_URL=https://editor-mcp.<subdominio>.workers.dev
NEXT_PUBLIC_EDITOR_MCP_TOKEN=<el mismo MCP_TOKEN>
```

Sin esas variables el editor funciona igual: simplemente no se conecta.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `listar_componentes` | Los componentes con su `[id]` real |
| `inspeccionar_sitio` | Cómo se ve: fondo, texto, contraste WCAG, tipografía |
| `ver_seleccionado` | Qué está seleccionado y sus props |
| `actualizar_componente` | Textos, colores, imágenes |
| `ajustar_color` | Oscurecer/aclarar en HSL desde el valor actual |
| `insertar` / `eliminar` / `mover` / `duplicar` | Estructura |
| `seleccionar_componente` | Seleccionar para que el usuario lo vea |
| `cambiar_tema_sitio` | `auto` / `light` / `dark` |
| `guardar_sitio` | Guardar cambios |

`seleccionar_componente` y `guardar_sitio` son las más útiles para un
cliente externo: permiten abrir el editor en el sitio correcto y dejar el
cambio guardado, listo para que el usuario lo revise.

## Conectarlo desde Claude Desktop

```json
{
  "mcpServers": {
    "oretron-editor": {
      "type": "http",
      "url": "https://editor-mcp.<subdominio>.workers.dev/mcp?sesion=<projectId>",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

`sesion` es el `projectId` del proyecto: es lo que impide que dos editors
abiertos se pisen.

## Límites a tener en cuenta

- **Un editor abierto por sesión.** La sesión es el `projectId`.
- **El token es compartido y viaja en el navegador**: sirve para
  acotar quién mete ruido, no para aislar a un usuario de otro. Si esto
  se expone a internet, conviene poner delante el Access de Cloudflare.
- **30 s de espera** por comando. Si el navegador está abierto pero
  colgado (pestaña dormida), el comando expira con un mensaje claro.