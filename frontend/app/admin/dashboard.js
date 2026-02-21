const API_BASE = "/api/admin/dashboard";
const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

const totalClientsEl = document.getElementById("admin-total-clients");
const totalTicketsEl = document.getElementById("admin-total-tickets");
const activeUsersEl = document.getElementById("admin-active-users");
const systemStatusEl = document.getElementById("admin-system-status");
const activityListEl = document.getElementById("admin-activity-list");
const healthKvEl = document.getElementById("admin-health-kv");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function titleize(value) {
  const s = String(value || "").trim();
  if (!s) return "-";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function renderActivity(events) {
  if (!activityListEl) return;
  const list = Array.isArray(events) ? events : [];
  if (!list.length) {
    activityListEl.innerHTML = `<li class="admin-empty-copy">No activity yet.</li>`;
    return;
  }

  activityListEl.innerHTML = list
    .slice(0, 10)
    .map((e) => {
      const when = fmtTime(e.timestamp);
      const title = e.title || "Event";
      const detail = e.detail || "";
      return `
        <li class="admin-activity-item">
          <div class="admin-activity-main">
            <strong>${escapeHtml(title)}</strong>
            <span class="admin-activity-detail">${escapeHtml(detail)}</span>
          </div>
          <div class="admin-activity-time">${escapeHtml(when)}</div>
        </li>
      `;
    })
    .join("");
}

function renderHealth(health, summary) {
  if (!healthKvEl) return;
  const h = health || {};
  const s = summary || {};

  const mongo = h.mongo_ok ? "Connected" : "Down";
  const llm = h.llm_configured ? "Configured" : "Not configured";
  const status = titleize(s.system_status || "");

  const rows = [
    ["System", status],
    ["MongoDB", mongo],
    ["LLM", llm],
    ["Pending Payments", String(h.pending_payment ?? "-")],
    ["Pending Approvals", String(h.pending_approval ?? "-")],
    ["Tickets (24h)", String(h.tickets_24h ?? "-")],
    ["Support Chats (24h)", String(h.support_chats_24h ?? "-")],
  ];

  healthKvEl.innerHTML = rows
    .map(([k, v]) => `<div><strong>${escapeHtml(k)}</strong><p>${escapeHtml(v)}</p></div>`)
    .join("");
}

async function loadDashboard() {
  if (!token) {
    window.location.href = loginPath;
    return;
  }

  try {
    const res = await apiFetch(API_BASE, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = loginPath;
        return;
      }
      throw new Error(data.error || "Unable to load admin dashboard.");
    }

    const summary = data.summary || {};
    setText(totalClientsEl, String(summary.total_clients ?? "-"));
    setText(totalTicketsEl, String(summary.total_tickets ?? "-"));
    setText(activeUsersEl, String(summary.active_users ?? "-"));
    setText(systemStatusEl, titleize(summary.system_status));

    renderActivity(data.recent_activity || []);
    renderHealth(data.health || {}, summary);
  } catch (e) {
    // Best-effort: keep page usable.
    renderActivity([]);
    if (healthKvEl) healthKvEl.innerHTML = `<div class="admin-empty-copy">Unable to load health.</div>`;
  }
}

loadDashboard();

