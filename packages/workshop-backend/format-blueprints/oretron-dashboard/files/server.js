import { DurableObject } from "cloudflare:workers";

/**
 * Oretron Dashboard — datos reales del cliente.
 *
 * Un gadget no puede hacer peticiones de red por su cuenta: el único
 * camino hacia Supabase es el binding `supabase`, que el backend resuelve
 * contra el gatekeeper que el usuario conectó. Cada lectura pide
 * aprobación, así que el usuario ve exactamente qué se está consultando.
 *
 * Reglas que sigue este archivo:
 *  - Solo `SELECT`. Nunca una escritura contra la base del cliente.
 *  - Se traen conteos y las últimas filas, no volcados: el gadget
 *    existe para mirar, no para exportar datos.
 *  - Nunca se inventan cifras. Si el gatekeeper no está conectado, se
 *    dice; si algo falla, se informa el motivo. La versión anterior
 *    mostraba proyectos y leads ficticios, que es peor que no mostrar
 *    nada: se confundían con datos reales.
 */

// Tablas que existen en el proyecto de Oretron. Se consultan por nombre
// para que un cliente con un esquema parecido no rompa el gadget.
const CONSULTAS = [
  {
    clave: "proyectos",
    sql: "select id, title, business_name, status from projects order by created_at desc nulls last limit 8",
  },
  { clave: "leads", sql: "select id, full_name, email, status, created_at from leads order by created_at desc limit 8" },
  { clave: "documentos", sql: "select count(*)::int as total from project_documents" },
  { clave: "agentes", sql: "select agent_key, enabled from agent_config order by agent_key" },
];

export class Gadget extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  /** El gatekeeper es opcional: sin binding, el dashboard lo explica. */
  async getGatekeeper() {
    const gk = this.env?.supabase;
    if (!gk) {
      return {
        error:
          "Este gadget no tiene conectado el gatekeeper de Supabase. Abrí el blueprint desde el catálogo y conectá Supabase en el panel de conexiones.",
      };
    }
    return { gatekeeper: gk };
  }

  async fetchData() {
    const { gatekeeper, error } = await this.getGatekeeper();
    if (error) {
      return { estado: "sin-conexion", mensaje: error, proyectos: [], leads: [], metricas: {} };
    }

    try {
      const resumen = await gatekeeper.listProjects();
      // El proyecto de Oretron es el que tiene las tablas del negocio.
      const ref =
        resumen?.find((p) => /oretron/i.test(p?.name ?? ""))?.ref ?? resumen?.[0]?.ref;

      if (!ref) {
        return {
          estado: "sin-proyecto",
          mensaje:
            "El gatekeeper no ve ningún proyecto de Supabase. Revisá que la cuenta conectada tenga al menos uno.",
          proyectos: [],
          leads: [],
          metricas: {},
        };
      }

      const datos = { ref, proyectos: [], leads: [], metricas: {} };
      const avisos = [];

      for (const { clave, sql } of CONSULTAS) {
        try {
          const r = await gatekeeper.query(sql);
          const filas = r?.rows ?? [];
          if (clave === "documentos") {
            datos.metricas.documentos = Number(filas[0]?.total ?? 0);
          } else if (clave === "agentes") {
            datos.metricas.agentes = filas.filter((f) => f?.enabled).length;
          } else {
            datos[clave] = filas;
            datos.metricas[clave] = filas.length;
          }
        } catch (err) {
          // Una tabla que no existe no debe tumbar el panel entero.
          avisos.push(`${clave}: ${mensajeDe(err)}`);
        }
      }

      return {
        estado: avisos.length && !datos.proyectos.length ? "parcial" : "ok",
        mensaje: avisos.length ? `Algunas consultas fallaron: ${avisos.join("; ")}` : "",
        ref,
        ...datos,
      };
    } catch (err) {
      return {
        estado: "error",
        mensaje: mensajeDe(err),
        proyectos: [],
        leads: [],
        metricas: {},
      };
    }
  }

  async getData() {
    return this.fetchData();
  }
}

function mensajeDe(err) {
  const m = err instanceof Error ? err.message : String(err);
  return m.length > 240 ? `${m.slice(0, 240)}…` : m;
}