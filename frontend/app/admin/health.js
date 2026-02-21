const API_BASE = "/api/admin/health";
const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

const feedbackEl = document.getElementById("admin-health-feedback");
const statusEl = document.getElementById("admin-health-status");
const kvEl = document.getElementById("admin-health-kv");

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

function render(data) {
  if (!kvEl) return;
  const mongoOk = Boolean(data.mongo_ok);
  const llmOk = Boolean(data.llm_configured);
  const status = !mongoOk ? "Down" : (!llmOk ? "Degraded" : "OK");
  if (statusEl) statusEl.textContent = status;

  const rows = [
    ["Server Time", data.server_time || "-"],
    ["MongoDB", mongoOk ? "Connected" : `Down${data.mongo_error ? ` (${data.mongo_error})` : ""}`],
    ["LLM Provider", data.llm_provider || "-"],
    ["LLM Model", data.llm_model || "-"],
    ["LLM Configured", llmOk ? "Yes" : "No"],
    ["Pending Payments", String(data.pending_payment ?? "-")],
    ["Pending Approvals", String(data.pending_approval ?? "-")],
    ["Tickets Updated (24h)", String(data.tickets_24h ?? "-")],
    ["Support Chats Updated (24h)", String(data.support_chats_24h ?? "-")],
  ];

  kvEl.innerHTML = rows
    .map(([k, v]) => `<div><strong>${escapeHtml(k)}</strong><p>${escapeHtml(v)}</p></div>`)
    .join("");
}

async function load() {
  if (!token) {
    window.location.href = loginPath;
    return;
  }
  setFeedback("info", "Loading health...");
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
      setFeedback("error", data.error || "Unable to load health.");
      return;
    }
    render(data);
    setFeedback("", "");
  } catch (e) {
    setFeedback("error", "Unable to load health right now.");
  }
}

load();

