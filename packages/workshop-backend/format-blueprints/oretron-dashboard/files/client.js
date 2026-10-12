// Oretron Dashboard — Panel de control para gestionar proyectos y métricas

const style = document.createElement("style");
style.textContent = `
:root {
  color-scheme: dark;
  --bg: #080808;
  --surface: #111111;
  --border: #2D2F2F;
  --text: #FFFFFF;
  --muted: #8D908F;
  --accent: #9A5B3D;
  --success: #2F6F55;
  --warning: #8A6726;
  --error: #A9473E;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 24px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.header h1 {
  font-size: 24px;
  font-weight: 600;
}

.header .logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header .logo svg {
  width: 32px;
  height: 32px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}

.stat-card .label {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.stat-card .value {
  font-size: 28px;
  font-weight: 700;
}

.stat-card .value.accent { color: var(--accent); }
.stat-card .value.success { color: var(--success); }
.stat-card .value.warning { color: var(--warning); }

.section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.section h2 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.table th {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.table tr:last-child td {
  border-bottom: none;
}

.badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.badge.active { background: rgba(47, 111, 85, 0.2); color: var(--success); }
.badge.pending { background: rgba(138, 103, 38, 0.2); color: var(--warning); }
.badge.completed { background: rgba(154, 91, 61, 0.2); color: var(--accent); }

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--muted);
}

.empty {
  text-align: center;
  padding: 40px;
  color: var(--muted);
}

.aviso {
  border: 1px solid var(--border);
  border-left: 3px solid var(--warning);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 16px;
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
}

.aviso strong { display: block; margin-bottom: 4px; }
.aviso span { color: var(--muted); }
`;

document.head.appendChild(style);

const app = document.createElement("div");
app.className = "app";
app.innerHTML = `
  <div class="header">
    <div class="logo">
      <svg viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="8" fill="#9A5B3D"/>
        <path d="M8 16C8 11.58 11.58 8 16 8C20.42 8 24 11.58 24 16" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="16" cy="20" r="4" fill="white"/>
      </svg>
      <h1>Oretron Dashboard</h1>
    </div>
    <span style="color: var(--muted); font-size: 12px;">Panel de Control</span>
  </div>

  <div class="stats" id="stats">
    <div class="stat-card">
      <div class="label">Proyectos Activos</div>
      <div class="value accent" id="stat-projects">--</div>
    </div>
    <div class="stat-card">
      <div class="label">Leads Totales</div>
      <div class="value success" id="stat-leads">--</div>
    </div>
    <div class="stat-card">
      <div class="label">Documentos</div>
      <div class="value warning" id="stat-docs">--</div>
    </div>
    <div class="stat-card">
      <div class="label">Agentes IA</div>
      <div class="value accent" id="stat-agents">--</div>
    </div>
  </div>

  <div class="section">
    <h2>Proyectos Recientes</h2>
    <div id="projects-list">
      <div class="loading">Cargando proyectos...</div>
    </div>
  </div>

  <div class="section">
    <h2>Últimos Leads</h2>
    <div id="leads-list">
      <div class="loading">Cargando leads...</div>
    </div>
  </div>
`;

document.body.appendChild(app);

// ── Datos reales ────────────────────────────────────────────────────────────
// El gadget NO inventa nada: pide al servidor (que consulta Supabase por el
// gatekeeper) y muestra lo que viene, incluido el motivo si algo falla.

const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ESTADOS = {
  "sin-conexion": ["Falta conectar Supabase", "Este gadget no tiene el gatekeeper de Supabase conectado."],
  "sin-proyecto": ["Sin proyecto de Supabase", "El gatekeeper no ve ningún proyecto."],
  error: ["No se pudo consultar", "Revisá la conexión y los permisos."],
  parcial: ["Datos parciales", "Algunas consultas fallaron."],
};

function renderAviso(estado, mensaje) {
  const [titulo, base] = ESTADOS[estado] || ["Sin datos", ""];
  const cont = document.createElement("div");
  cont.className = "aviso";
  cont.innerHTML = `<strong>${escapeHtml(titulo)}</strong><span>${escapeHtml(mensaje || base)}</span>`;
  const contenedor = document.getElementById("projects-list").parentElement;
  contenedor.parentElement.insertBefore(cont, contenedor);
}

function renderProjects(proyectos) {
  const container = document.getElementById("projects-list");
  if (!proyectos.length) {
    container.innerHTML = '<div class="empty">Sin proyectos</div>';
    return;
  }
  container.innerHTML = `
    <table class="table">
      <thead><tr><th>Nombre</th><th>Cliente</th><th>Estado</th></tr></thead>
      <tbody>
        ${proyectos.map(p => `
          <tr>
            <td>${escapeHtml(p.title || p.business_name || "—")}</td>
            <td>${escapeHtml(p.business_name || "—")}</td>
            <td><span class="badge ${escapeHtml(p.status || "pending")}">${escapeHtml(p.status || "sin estado")}</span></td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

function renderLeads(leads) {
  const container = document.getElementById("leads-list");
  if (!leads.length) {
    container.innerHTML = '<div class="empty">Sin leads</div>';
    return;
  }
  container.innerHTML = `
    <table class="table">
      <thead><tr><th>Intención</th><th>Mensaje</th><th>Puntaje</th></tr></thead>
      <tbody>
        ${leads.map(l => `
          <tr>
            <td>${escapeHtml(l.intent || "—")}</td>
            <td>${escapeHtml((l.mensaje || "—").slice(0, 90))}</td>
            <td>${escapeHtml(l.score ?? "—")}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

async function cargar() {
  const set = (id, v) => { document.getElementById(id).textContent = v ?? "—"; };
  try {
    const d = await gadget.getData();
    if (!d || d.estado !== "ok") {
      renderAviso(d?.estado, d?.mensaje);
      set("stat-projects", "—");
      set("stat-leads", "—");
      set("stat-docs", "—");
      set("stat-agents", "—");
      document.getElementById("projects-list").innerHTML = "";
      document.getElementById("leads-list").innerHTML = "";
      return;
    }
    set("stat-projects", d.metricas.proyectos ?? d.proyectos.length);
    set("stat-leads", d.metricas.leads ?? d.leads.length);
    set("stat-docs", d.metricas.documentos ?? "—");
    set("stat-agents", d.metricas.agentes ?? "—");
    renderProjects(d.proyectos || []);
    renderLeads(d.leads || []);
  } catch (e) {
    renderAviso("error", e?.message || String(e));
  }
}

cargar();
