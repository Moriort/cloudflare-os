/**
 * editor-mcp · expone el Agente del Editor de Oretron por MCP (EDTH-130).
 *
 * El editor vive en el navegador del usuario: su puente es
 * `window.__oretronEditor`. Un servidor MCP en un Worker no puede tocarlo
 * directamente, así que este Worker hace de puente:
 *
 *   cliente MCP ──HTTP/JSON-RPC──▶ Worker ──▶ Durable Object (sesión)
 *                                            ⇅ WebSocket
 *                                     navegador con el editor abierto
 *
 * El comando viaja al navegador, se ejecuta contra el puente real (los
 * mismos tools que usa el chat) y el resultado vuelve por el mismo
 * socket. Nada se simula: si el editor está cerrado, el comando expira.
 *
 * Transporte MCP: HTTP stateless (initialize / tools/list / tools/call),
 * el mismo patrón que usa `cloudflare/mcp`.
 */

/** Las herramientas que el editor puede ejecutar. Espejo de `EDITOR_TOOLS`. */
const HERRAMIENTAS = [
    {
        name: "listar_componentes",
        description: "Lista los componentes del sitio abierto con su [id] real, su tipo y su posición.",
        parameters: { type: "object", properties: {}, required: [] },
    },
    {
        name: "inspeccionar_sitio",
        description:
            "Lee cómo se ve el sitio: por sección, fondo, color del texto, contraste WCAG, tamaño y tipografía del título. Úsalo antes de opinar sobre estilo.",
        parameters: { type: "object", properties: {}, required: [] },
    },
    {
        name: "ver_seleccionado",
        description: "Qué componente está seleccionado en el editor y sus propiedades actuales.",
        parameters: { type: "object", properties: {}, required: [] },
    },
    {
        name: "actualizar_componente",
        description: "Cambia textos, colores o imágenes de un componente existente.",
        parameters: {
            type: "object",
            properties: {
                componente_id: { type: "string", description: "El [id] real del componente." },
                props: { type: "object", description: "Propiedades con su valor final." },
            },
            required: ["componente_id", "props"],
        },
    },
    {
        name: "ajustar_color",
        description: "Oscurece o aclara un color desde su valor actual, en HSL.",
        parameters: {
            type: "object",
            properties: {
                componente_id: { type: "string" },
                campo: { type: "string", enum: ["bgColor", "textColor"] },
                accion: { type: "string", enum: ["oscurecer", "aclarar"] },
                intensidad: { type: "string", enum: ["leve", "media", "fuerte"] },
            },
            required: ["componente_id", "campo", "accion", "intensidad"],
        },
    },
    {
        name: "insertar_componente",
        description: "Agrega un componente nuevo al sitio.",
        parameters: {
            type: "object",
            properties: {
                tipo: { type: "string", description: "El tipo, tal como aparece en listar_catalogo." },
                posicion: { type: "number", description: "0-based; si se omite, al final." },
            },
            required: ["tipo"],
        },
    },
    {
        name: "eliminar_componente",
        description: "Elimina un componente por su [id].",
        parameters: {
            type: "object",
            properties: { componente_id: { type: "string" } },
            required: ["componente_id"],
        },
    },
    {
        name: "mover_componente",
        description: "Reordena un componente a otra posición.",
        parameters: {
            type: "object",
            properties: {
                componente_id: { type: "string" },
                posicion: { type: "number" },
            },
            required: ["componente_id", "posicion"],
        },
    },
    {
        name: "duplicar_componente",
        description: "Duplica un componente.",
        parameters: {
            type: "object",
            properties: { componente_id: { type: "string" } },
            required: ["componente_id"],
        },
    },
    {
        name: "seleccionar_componente",
        description: "Selecciona un componente en el editor.",
        parameters: {
            type: "object",
            properties: { componente_id: { type: "string" } },
            required: ["componente_id"],
        },
    },
    {
        name: "cambiar_tema_sitio",
        description: "Cambia el tema del sitio.",
        parameters: {
            type: "object",
            properties: { modo: { type: "string", enum: ["auto", "light", "dark"] } },
            required: ["modo"],
        },
    },
    {
        name: "guardar_sitio",
        description: "Guarda los cambios pendientes del sitio.",
        parameters: { type: "object", properties: {}, required: [] },
    },
] as const;

const NOMBRES = new Set(HERRAMIENTAS.map((h) => h.name));

/** Respuesta JSON-RPC. */
function rpc(id: unknown, result: unknown) {
    return { jsonrpc: "2.0" as const, id, result };
}
function rpcError(id: unknown, code: number, message: string) {
    return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(cuerpo: unknown, status = 200): Response {
    return new Response(JSON.stringify(cuerpo), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

import { DurableObject } from "cloudflare:workers";

/**
 * Un Durable Object por sesión de edición: es el que habla con el
 * navegador y sostiene el comando mientras espera su respuesta.
 *
 * Tiene que extender `DurableObject` de `cloudflare:workers`: sin eso
 * la clase no soporta RPC y cualquier llamada al stub falla con 1101.
 */
export class EditorSession extends DurableObject<Env> {

    /** Sockets del navegador conectado a esta sesión. */
    private sockets = new Set<WebSocket>();
    /** Comandos esperando respuesta del navegador. */
    private pendientes = new Map<string, { resolver: (v: string) => void; timer: ReturnType<typeof setTimeout> }>();

    async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        if (req.headers.get("Upgrade") !== "websocket") {
            return json({ error: "Se esperaba un WebSocket." }, 426);
        }
        const pair = new WebSocketPair();
        const cliente = pair[0];
        const servidor = pair[1];

        this.sockets.add(servidor);
        servidor.addEventListener("close", () => this.sockets.delete(servidor));
        servidor.addEventListener("error", () => this.sockets.delete(servidor));
        servidor.addEventListener("message", (evento) => {
            void this.alRecibir(String(evento.data));
        });

        servidor.accept();
        this.saludar(servidor);
        return new Response(null, { status: 101, webSocket: cliente });
    }

    private saludar(ws: WebSocket) {
        try {
            ws.send(JSON.stringify({ tipo: "conectado", proyecto: this.ctx.id.toString() }));
        } catch {
            /* el socket puede haberse cerrado */
        }
    }

    private async alRecibir(texto: string) {
        let msg: { tipo?: string; id?: string; ok?: boolean; resultado?: string };
        try {
            msg = JSON.parse(texto);
        } catch {
            return;
        }
        if (msg.tipo === "respuesta" && msg.id) {
            const pendiente = this.pendientes.get(msg.id);
            if (!pendiente) return;
            clearTimeout(pendiente.timer);
            this.pendientes.delete(msg.id);
            pendiente.resolver(msg.ok ? (msg.resultado ?? "ok") : `El editor rechazó la operación: ${msg.resultado ?? "sin detalle"}`);
        }
    }

    /**
     * Ejecuta una herramienta en el navegador y espera el resultado.
     * Si el editor no está abierto, el comando expira: preferimos un
     * error claro a un comando que se ejecuta a destiempo.
     */
    async ejecutar(nombre: string, args: unknown): Promise<string> {
        if (!this.sockets.size) {
            return "No hay ningún editor abierto en esta sesión. Abre el editor del proyecto e inténtalo de nuevo.";
        }
        const id = crypto.randomUUID();
        const mensaje = JSON.stringify({ tipo: "comando", id, tool: nombre, args });

        return new Promise<string>((resolve) => {
            const timer = setTimeout(() => {
                this.pendientes.delete(id);
                resolve(
                    "El editor está abierto pero no respondió a tiempo. Vuelve a intentarlo; si sigue igual, revisa la consola del navegador.",
                );
            }, 30_000);

            this.pendientes.set(id, { resolver: resolve, timer });
            let enviado = false;
            for (const ws of this.sockets) {
                try {
                    ws.send(mensaje);
                    enviado = true;
                } catch {
                    this.sockets.delete(ws);
                }
            }
            if (!enviado) {
                clearTimeout(timer);
                this.pendientes.delete(id);
                resolve("No hay ningún editor abierto en esta sesión.");
            }
        });
    }

    /** Informa si hay un navegador conectado ahora mismo. */
    conectado(): boolean {
        return this.sockets.size > 0;
    }
}

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const url = new URL(req.url);

        if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

        // ── El navegador del editor se engancha por WebSocket ──
        // ws://editor-mcp…/?sesion=<id>&token=<t>
        if (req.headers.get("Upgrade") === "websocket") {
            const sesion = url.searchParams.get("sesion");
            if (!sesion || !autorizado(url.searchParams.get("token"), env)) {
                return new Response("No autorizado", { status: 401 });
            }
            const id = env.EditorSession.idFromName(sesion);
            return env.EditorSession.get(id).fetch(req);
        }

        if (url.pathname === "/salud") {
            const sesion = url.searchParams.get("sesion");
            if (!sesion) return json({ ok: true, protocolo: env.MCP_PROTOCOL_VERSION });
            const conectado = await env.EditorSession.get(env.EditorSession.idFromName(sesion)).conectado();
            return json({ ok: true, sesion, editorConectado: conectado });
        }

        if (url.pathname !== "/mcp" || req.method !== "POST") {
            return json({ error: "Ruta desconocida. Usa POST /mcp." }, 404);
        }

        // ── MCP sobre HTTP ──
        const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        if (!autorizado(token, env)) return json(rpcError(null, -32001, "No autorizado"), 401);

        let cuerpo: any;
        try {
            cuerpo = await req.json();
        } catch {
            return json(rpcError(null, -32700, "JSON inválido"), 400);
        }

        const { id, method, params } = cuerpo ?? {};
        const sesion = (params?.session as string | undefined) ?? url.searchParams.get("sesion") ?? "";

        switch (method) {
            case "initialize":
                return json(
                    rpc(id, {
                        protocolVersion: env.MCP_PROTOCOL_VERSION,
                        capabilities: { tools: {} },
                        serverInfo: { name: "oretron-editor", version: "1.0.0" },
                        instructions:
                            "Maneja el editor del sitio de Oretron. Las herramientas se ejecutan en el navegador: si el editor está cerrado, ábrelo primero.",
                    }),
                );

            case "tools/list":
                return json(rpc(id, { tools: HERRAMIENTAS }));

            case "tools/call": {
                const nombre = String(params?.name ?? "");
                if (!NOMBRES.has(nombre)) {
                    return json(
                        rpcError(id, -32602, `Herramienta desconocida: ${nombre}`),
                        400,
                    );
                }
                const stub = env.EditorSession.get(env.EditorSession.idFromName(sesion));
                const resultado = await stub.ejecutar(nombre, params?.arguments ?? {});
                return json(
                    rpc(id, {
                        content: [{ type: "text", text: resultado }],
                        isError: resultado.startsWith("No hay") || resultado.startsWith("El editor"),
                    }),
                );
            }

            default:
                return json(rpcError(id, -32601, `Método no soportado: ${method}`), 400);
        }
    },
};

/**
 * Token compartido. Se compara en tiempo constante para no filtrar
 * información por temporización; es la misma defensa que usa el resto
 * del repo para secretos de un solo uso.
 */
function autorizado(token: string | null, env: Env): boolean {
    const esperado = env.MCP_TOKEN;
    if (!esperado) return false; // sin token configurado, cerrado
    if (!token) return false;
    if (token.length !== esperado.length) return false;
    let diff = 0;
    for (let i = 0; i < esperado.length; i++) diff |= token.charCodeAt(i) ^ esperado.charCodeAt(i);
    return diff === 0;
}

/** Contrato del binding. */
interface Env {
    /** La sesión de Durable Objects que sostiene el socket del editor. */
    EditorSession: DurableObjectNamespace;
    /** Versión del protocolo MCP que anuncia `initialize`. */
    MCP_PROTOCOL_VERSION: string;
    /** Secreto compartido (se pone con `wrangler secret put MCP_TOKEN`). */
    MCP_TOKEN: string;
}