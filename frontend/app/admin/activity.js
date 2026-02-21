const API_BASE = "/api/admin/activity";
const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

const feedbackEl = document.getElementById("admin-activity-feedback");
const countEl = document.getElementById("admin-activity-count");
const feedEl = document.getElementById("admin-activity-feed");

function setFeedback(type, text) {
  if (!feedbackEl) return;
  if (!text) {
    feedbackEl.className = "tickets-feedback hidden";
    feedbackEl.textContent = "";
    return;
  }
  feedbackEl.className = `tickets-feedback ${type}`;
  feedbackEl.textContent = text;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function render(events) {
  const list = Array.isArray(events) ? events : [];
  if (countEl) countEl.textContent = `${list.length} events`;

  if (!feedEl) return;
  if (!list.length) {
    feedEl.innerHTML = `<li class="admin-empty-copy">No activity yet.</li>`;
    return;
  }

  feedEl.innerHTML = list.map((e) => `
    <li class="admin-activity-item">
      <div class="admin-activity-main">
        <strong>${escapeHtml(e.title || "Event")}</strong>
        <span class="admin-activity-detail">${escapeHtml(e.detail || "")}</span>
      </div>
      <div class="admin-activity-time">${escapeHtml(fmtTime(e.timestamp))}</div>
    </li>
  `).join("");
}

async function load() {
  if (!token) {
    window.location.href = loginPath;
    return;
  }

  setFeedback("info", "Loading activity...");
  try {
    const res = await apiFetch(`${API_BASE}?limit=40`, {
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
      setFeedback("error", data.error || "Unable to load activity.");
      render([]);
      return;
    }
    render(data.events || []);
    setFeedback("", "");
  } catch (e) {
    setFeedback("error", "Unable to load activity right now.");
    render([]);
  }
}

load();

