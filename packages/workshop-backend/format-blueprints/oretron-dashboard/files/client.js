// Oretron Dashboard — Panel de control para gestionar proyectos y métricas

const style = document.createElement("style");
style.textContent = `
:root {
  color-scheme: dark;
  --bg: #0D1117;
  --surface: #101828;
  --border: #1E2535;
  --text: #e6edf3;
  --muted: #8b949e;
  --accent: #3b82f6;
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
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

.badge.active { background: rgba(16, 185, 129, 0.2); color: var(--success); }
.badge.pending { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
.badge.completed { background: rgba(59, 130, 246, 0.2); color: var(--accent); }

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
`;

document.head.appendChild(style);

const app = document.createElement("div");
app.className = "app";
app.innerHTML = `
  <div class="header">
    <div class="logo">
      <svg viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="8" fill="#3b82f6"/>
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

// Simulated data (replace with actual Supabase queries via gatekeeper)
const mockProjects = [
  { name: "Oretron Platform", status: "active", client: "Interno", progress: 85 },
  { name: "Mining Dashboard", status: "active", client: "Codelco", progress: 60 },
  { name: "E-commerce Client", status: "pending", client: "Retail Corp", progress: 20 },
];

const mockLeads = [
  { name: "Juan Pérez", email: "juan@empresa.cl", source: "Web", status: "new" },
  { name: "María Silva", email: "maria@mining.cl", source: "Referido", status: "contacted" },
  { name: "Carlos López", email: "carlos@tech.cl", source: "LinkedIn", status: "qualified" },
];

function renderProjects() {
  const container = document.getElementById("projects-list");
  if (!mockProjects.length) {
    container.innerHTML = '<div class="empty">No hay proyectos</div>';
    return;
  }

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Cliente</th>
          <th>Estado</th>
          <th>Progreso</th>
        </tr>
      </thead>
      <tbody>
        ${mockProjects.map(p => `
          <tr>
            <td>${p.name}</td>
            <td>${p.client}</td>
            <td><span class="badge ${p.status}">${p.status}</span></td>
            <td>${p.progress}%</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderLeads() {
  const container = document.getElementById("leads-list");
  if (!mockLeads.length) {
    container.innerHTML = '<div class="empty">No hay leads</div>';
    return;
  }

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Email</th>
          <th>Fuente</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${mockLeads.map(l => `
          <tr>
            <td>${l.name}</td>
            <td>${l.email}</td>
            <td>${l.source}</td>
            <td><span class="badge ${l.status}">${l.status}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// Update stats
document.getElementById("stat-projects").textContent = mockProjects.length;
document.getElementById("stat-leads").textContent = mockLeads.length;
document.getElementById("stat-docs").textContent = "12";
document.getElementById("stat-agents").textContent = "3";

renderProjects();
renderLeads();
