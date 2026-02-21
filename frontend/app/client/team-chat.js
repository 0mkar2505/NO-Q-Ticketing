const API_BASE = "/api/client/team-chat";
const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

const feedbackEl = document.getElementById("teamchat-feedback");
const messagesEl = document.getElementById("teamchat-messages");
const inputEl = document.getElementById("teamchat-input");
const sendBtn = document.getElementById("teamchat-send");

let pollTimer = null;
let stickToBottom = true;
let isSending = false;

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

function isNearBottom(el, thresholdPx = 8) {
  if (!el) return true;
  return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - thresholdPx);
}

function scrollToBottom(el) {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

function handleAuthFailure(res) {
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = loginPath;
    return true;
  }
  return false;
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function roleBadge(role) {
  const r = String(role || "").toLowerCase();
  if (r === "supervisor") return "member-chip member-chip--supervisor";
  return "member-chip member-chip--agent";
}

function renderMessages(list) {
  if (!messagesEl) return;
  const wasNear = stickToBottom && isNearBottom(messagesEl, 4);
  const prevTop = messagesEl.scrollTop;

  const rows = Array.isArray(list) ? list : [];
  if (!rows.length) {
    messagesEl.innerHTML = `<p class="no-tickets">No team messages yet.</p>`;
  } else {
    messagesEl.innerHTML = rows.map((m) => `
      <div class="teamchat-row">
        <div class="teamchat-meta">
          <span class="${roleBadge(m.sender_role)}">${escapeHtml(m.sender_role || "agent")}</span>
          <strong>${escapeHtml(m.sender_name || "User")}</strong>
          <span class="teamchat-time">${escapeHtml(fmtTime(m.created_at))}</span>
        </div>
        <div class="teamchat-bubble">${escapeHtml(m.text || "")}</div>
      </div>
    `).join("");
  }

  if (wasNear) scrollToBottom(messagesEl);
  else messagesEl.scrollTop = prevTop;
}

async function loadMessages({ silent = true } = {}) {
  if (!token) {
    window.location.href = loginPath;
    return;
  }
  try {
    const res = await apiFetch(`${API_BASE}?limit=80`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (handleAuthFailure(res)) return;
      if (!silent) setFeedback("error", "Unable to load chat right now.");
      return;
    }
    const data = await res.json().catch(() => ({}));
    renderMessages(data.messages || []);
    if (!silent) setFeedback("", "");
  } catch (e) {
    if (!silent) setFeedback("error", "Unable to load chat right now.");
  }
}

async function sendMessage() {
  if (isSending) return;
  const text = (inputEl?.value || "").trim();
  if (!text) return;

  isSending = true;
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";
  }
  setFeedback("", "");

  try {
    const res = await apiFetch(API_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (handleAuthFailure(res)) return;
      setFeedback("error", data.error || "Unable to send.");
      return;
    }
    if (inputEl) inputEl.value = "";
    stickToBottom = true;
    await loadMessages({ silent: true });
  } catch (e) {
    setFeedback("error", "Unable to send right now.");
  } finally {
    isSending = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send";
    }
  }
}

messagesEl?.addEventListener(
  "scroll",
  () => {
    stickToBottom = isNearBottom(messagesEl, 4);
  },
  { passive: true }
);

sendBtn?.addEventListener("click", sendMessage);
inputEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendMessage();
  }
});

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    loadMessages({ silent: true });
  }, 3000);
}

loadMessages({ silent: false });
startPolling();

