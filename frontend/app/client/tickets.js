const API_BASE = "/api/client";
const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;
const BACKEND_FALLBACK_ORIGIN = "http://127.0.0.1:5000";

const ticketList = document.getElementById("ticket-list");
const ticketView = document.getElementById("ticket-view");
const messagesDiv = document.getElementById("messages");
const replyBox = document.getElementById("reply-box");
const sendReplyBtn = document.getElementById("send-reply");
const resolveBtn = document.getElementById("resolve-ticket");
const feedbackEl = document.getElementById("tickets-feedback");
const runAiAssistBtn = document.getElementById("run-ai-assist");
const aiPriorityEl = document.getElementById("ai-priority");
const aiSummaryEl = document.getElementById("ai-summary");

let currentTicketId = null;
let ticketCache = [];
let isSubmitting = false;
let isAiRunning = false;

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(path, options);
    if (res.status !== 404 || window.location.port === "5000") {
      return res;
    }
  } catch (error) {
    // Try backend fallback when local frontend is on another port.
  }
  return fetch(`${BACKEND_FALLBACK_ORIGIN}${path}`, options);
}

function setFeedback(type, text) {
  if (!feedbackEl) return;
  if (!text) {
    feedbackEl.className = "tickets-feedback hidden";
    feedbackEl.textContent = "";
    return;
  }

  feedbackEl.textContent = text;
  feedbackEl.className = `tickets-feedback ${type}`;
}

function setSubmittingState(isBusy) {
  isSubmitting = isBusy;

  const ticket = ticketCache.find((t) => t._id === currentTicketId);
  const isResolved = ticket?.status === "resolved";

  sendReplyBtn.disabled = isBusy || isResolved;
  resolveBtn.disabled = isBusy;
  if (isBusy) {
    sendReplyBtn.textContent = "Sending...";
    resolveBtn.textContent = "Resolving...";
  } else {
    sendReplyBtn.textContent = "Send Reply";
    resolveBtn.textContent = "Resolve Ticket";
  }
}

function setAiState(isBusy) {
  isAiRunning = isBusy;
  if (!runAiAssistBtn) return;
  runAiAssistBtn.disabled = isBusy || !currentTicketId;
  runAiAssistBtn.textContent = isBusy ? "Generating..." : "Generate";
}

function getErrorMessage(res, fallback) {
  return res
    .json()
    .then((data) => data?.error || fallback)
    .catch(() => fallback);
}

function markActiveTicket() {
  document.querySelectorAll(".ticket-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.ticketId === currentTicketId);
  });
}

function normalizePriority(priority) {
  const value = String(priority || "").toLowerCase();
  if (value === "high" || value === "normal" || value === "low") return value;
  return "unspecified";
}

function renderTicketGroups(tickets) {
  const groups = { high: [], normal: [], low: [], unspecified: [] };
  tickets.forEach((ticket) => {
    groups[normalizePriority(ticket.priority)].push(ticket);
  });

  ticketList.innerHTML = "";
  ["high", "normal", "low", "unspecified"].forEach((priorityKey) => {
    const groupTickets = groups[priorityKey];
    if (!groupTickets.length) return;

    const header = document.createElement("div");
    header.className = "ticket-group-header";
    header.textContent = `${priorityKey[0].toUpperCase()}${priorityKey.slice(1)} Priority (${groupTickets.length})`;
    ticketList.appendChild(header);

    groupTickets.forEach((ticket) => {
      const priority = normalizePriority(ticket.priority);
      const div = document.createElement("div");
      div.className = "ticket-item";
      div.dataset.ticketId = ticket._id;
      if (ticket._id === currentTicketId) div.classList.add("active");
      div.innerHTML = `
        <span class="ticket-subject">${ticket.subject}</span>
        <div class="ticket-item-meta">
          <span class="ticket-status-badge ${ticket.status}">${ticket.status}</span>
          <span class="ticket-priority-badge ticket-priority-${priority}">${priority}</span>
        </div>
      `;
      div.onclick = () => openTicket(ticket);
      ticketList.appendChild(div);
    });
  });
}

// Fetch & Render Tickets
async function loadTickets() {
  if (!token) {
    window.location.href = loginPath;
    return;
  }

  setFeedback("info", "Loading tickets...");

  try {
    const res = await apiFetch(`${API_BASE}/tickets`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = loginPath;
        return;
      }
      throw new Error("Failed to fetch tickets");
    }

    const tickets = await res.json();
    ticketCache = Array.isArray(tickets) ? tickets : [];
    ticketList.innerHTML = "";

    if (ticketCache.length === 0) {
      ticketList.innerHTML = "<p class=\"no-tickets\">No tickets found</p>";
      ticketView.classList.add("hidden");
      currentTicketId = null;
      setFeedback("", "");
      return;
    }

    renderTicketGroups(ticketCache);

    if (currentTicketId) {
      const updated = ticketCache.find((t) => t._id === currentTicketId);
      if (updated) {
        openTicket(updated);
      } else {
        currentTicketId = null;
        ticketView.classList.add("hidden");
      }
    }

    setFeedback("", "");
  } catch (error) {
    console.error("Tickets fetch error:", error);
    setFeedback("error", "Unable to load tickets right now.");
    ticketList.innerHTML = "<p class=\"no-tickets\">Could not load tickets</p>";
  }
}

loadTickets();

// Open Ticket & Render Conversation
function openTicket(ticket) {
  currentTicketId = ticket._id;
  markActiveTicket();
  ticketView.classList.remove("hidden");

  document.getElementById("ticket-subject").textContent = ticket.subject;
  const statusEl = document.getElementById("ticket-status");
  statusEl.textContent = ticket.status;
  statusEl.className = `ticket-status ${ticket.status}`;

  messagesDiv.innerHTML = "";

  if (ticket.messages && ticket.messages.length > 0) {
    ticket.messages.forEach(msg => {
      const m = document.createElement("div");
      m.className = `message ${msg.sender}`;
      m.innerHTML = `<strong>${msg.sender}</strong>: ${msg.text}<br><small>${new Date(msg.timestamp).toLocaleString()}</small>`;
      messagesDiv.appendChild(m);
    });
  } else {
    messagesDiv.innerHTML = "<p class=\"no-messages\">No messages yet</p>";
  }

  const isResolved = ticket.status === "resolved";
  resolveBtn.style.display = isResolved ? "none" : "block";
  replyBox.disabled = isResolved || isSubmitting;
  sendReplyBtn.disabled = isResolved || isSubmitting;
  setAiState(false);

  const suggestedPriority = ticket.ai_priority_suggestion || "-";
  const summary = ticket.ai_summary || "Summary will appear here after generation.";
  aiPriorityEl.textContent = `Priority Suggestion: ${suggestedPriority}`;
  aiSummaryEl.textContent = summary;
}

// Reply to Ticket
sendReplyBtn.onclick = async () => {
  const text = replyBox.value.trim();
  if (!text || !currentTicketId || isSubmitting) return;

  setSubmittingState(true);
  setFeedback("", "");

  try {
    const res = await apiFetch(`${API_BASE}/tickets/${currentTicketId}/reply`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: text })
    });

    if (!res.ok) {
      const error = await getErrorMessage(res, "Failed to send reply");
      setFeedback("error", error);
      return;
    }

    replyBox.value = "";
    setFeedback("success", "Reply sent");
    await loadTickets();
  } catch (error) {
    console.error("Reply error:", error);
    setFeedback("error", "Unable to send reply right now.");
  } finally {
    setSubmittingState(false);
  }
};

// Resolve Ticket
resolveBtn.onclick = async () => {
  if (!currentTicketId || isSubmitting) return;

  setSubmittingState(true);
  setFeedback("", "");

  try {
    const res = await apiFetch(`${API_BASE}/tickets/${currentTicketId}/resolve`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const error = await getErrorMessage(res, "Failed to resolve ticket");
      setFeedback("error", error);
      return;
    }

    setFeedback("success", "Ticket marked as resolved");
    await loadTickets();
  } catch (error) {
    console.error("Resolve error:", error);
    setFeedback("error", "Unable to resolve ticket right now.");
  } finally {
    setSubmittingState(false);
  }
};

runAiAssistBtn.onclick = async () => {
  if (!currentTicketId || isAiRunning) return;

  setAiState(true);
  setFeedback("", "");

  try {
    const res = await apiFetch(`${API_BASE}/tickets/${currentTicketId}/ai-assist`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
      }
    });

    if (!res.ok) {
      const error = await getErrorMessage(res, "Unable to generate AI assist");
      setFeedback("error", error);
      return;
    }

    const data = await res.json();
    aiPriorityEl.textContent = `Priority Suggestion: ${data.ai_priority_suggestion || "-"}`;
    aiSummaryEl.textContent = data.ai_summary || "Summary unavailable.";
    setFeedback("success", "AI assist generated");
    await loadTickets();
  } catch (error) {
    console.error("AI assist error:", error);
    setFeedback("error", "AI assist unavailable right now.");
  } finally {
    setAiState(false);
  }
};
