const API_BASE = "/api/client";
const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

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
const searchEl = document.getElementById("ticket-search");
const statusFilterEl = document.getElementById("ticket-filter-status");
const priorityFilterEl = document.getElementById("ticket-filter-priority");
const sortEl = document.getElementById("ticket-sort");
const prevPageBtn = document.getElementById("ticket-prev-page");
const nextPageBtn = document.getElementById("ticket-next-page");
const pageInfoEl = document.getElementById("ticket-page-info");
const ticketRefreshBtn = document.getElementById("ticket-refresh");

let currentTicketId = null;
let ticketCache = [];
let isSubmitting = false;
let isAiRunning = false;
let currentPage = 1;
const PAGE_SIZE = 12;
let ticketAutoRefreshTimer = null;

function scrollToBottom(el) {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
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

function startTicketAutoRefresh() {
  stopTicketAutoRefresh();

  ticketAutoRefreshTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    pollTickets({ silent: true });
  }, 3000);
}

function stopTicketAutoRefresh() {
  if (ticketAutoRefreshTimer) {
    clearInterval(ticketAutoRefreshTimer);
    ticketAutoRefreshTimer = null;
  }
}

async function refreshOpenTicket({ silent = false } = {}) {
  if (!currentTicketId) return;
  try {
    const res = await apiFetch(`${API_BASE}/tickets/${currentTicketId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;

    const ticket = data.ticket || null;
    if (!ticket) return;

    const idx = ticketCache.findIndex((t) => t._id === currentTicketId);
    if (idx >= 0) ticketCache[idx] = ticket;

    renderTicketView(ticket);
    if (!silent) setFeedback("info", "Updated.");
  } catch (error) {
    if (!silent) console.error("Ticket refresh error:", error);
  }
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

function priorityRank(priority) {
  const map = { high: 3, normal: 2, low: 1, unspecified: 0 };
  return map[normalizePriority(priority)] ?? 0;
}

function toEpoch(value) {
  const ts = Date.parse(value || "");
  return Number.isFinite(ts) ? ts : 0;
}

function getFilteredAndSortedTickets() {
  const query = (searchEl?.value || "").trim().toLowerCase();
  const statusFilter = (statusFilterEl?.value || "all").toLowerCase();
  const priorityFilter = (priorityFilterEl?.value || "all").toLowerCase();
  const sortKey = (sortEl?.value || "updated_desc").toLowerCase();

  let list = ticketCache.filter((ticket) => {
    const ticketStatus = String(ticket.status || "").toLowerCase();
    const ticketPriority = normalizePriority(ticket.priority);

    if (statusFilter !== "all" && ticketStatus !== statusFilter) return false;
    if (priorityFilter !== "all" && ticketPriority !== priorityFilter) return false;

    if (!query) return true;
    const haystack = [
      ticket.subject,
      ticket.customer_email,
      ticket.category,
      ticketPriority,
      ticketStatus,
    ]
      .map((v) => String(v || "").toLowerCase())
      .join(" ");
    return haystack.includes(query);
  });

  list.sort((a, b) => {
    const aUpdated = toEpoch(a.updated_at);
    const bUpdated = toEpoch(b.updated_at);
    const aCreated = toEpoch(a.created_at);
    const bCreated = toEpoch(b.created_at);
    const aPriority = priorityRank(a.priority);
    const bPriority = priorityRank(b.priority);

    switch (sortKey) {
      case "updated_asc":
        return aUpdated - bUpdated;
      case "created_desc":
        return bCreated - aCreated;
      case "created_asc":
        return aCreated - bCreated;
      case "priority_desc":
        return bPriority - aPriority || bUpdated - aUpdated;
      case "priority_asc":
        return aPriority - bPriority || bUpdated - aUpdated;
      case "updated_desc":
      default:
        return bUpdated - aUpdated;
    }
  });

  return list;
}

function getPageSlice(tickets) {
  const totalPages = Math.max(1, Math.ceil(tickets.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = tickets.slice(start, start + PAGE_SIZE);
  return { pageItems, totalPages };
}

function renderPagination(totalPages, totalItems) {
  if (pageInfoEl) {
    pageInfoEl.textContent = `Page ${currentPage} of ${totalPages} (${totalItems} tickets)`;
  }
  if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
  if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
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

function refreshTicketList() {
  if (!Array.isArray(ticketCache) || ticketCache.length === 0) {
    ticketList.innerHTML = "<p class=\"no-tickets\">No tickets found</p>";
    ticketView.classList.add("hidden");
    currentTicketId = null;
    renderPagination(1, 0);
    return;
  }

  const filtered = getFilteredAndSortedTickets();
  if (filtered.length === 0) {
    ticketList.innerHTML = "<p class=\"no-tickets\">No tickets match current filters</p>";
    ticketView.classList.add("hidden");
    renderPagination(1, 0);
    return;
  }

  const { pageItems, totalPages } = getPageSlice(filtered);
  renderTicketGroups(pageItems);
  renderPagination(totalPages, filtered.length);

  if (currentTicketId) {
    const updated = filtered.find((t) => t._id === currentTicketId);
    if (updated) {
      openTicket(updated);
      return;
    }
    currentTicketId = null;
    ticketView.classList.add("hidden");
  }
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
    refreshTicketList();
    setFeedback("", "");
  } catch (error) {
    console.error("Tickets fetch error:", error);
    setFeedback("error", "Unable to load tickets right now.");
    ticketList.innerHTML = "<p class=\"no-tickets\">Could not load tickets</p>";
    renderPagination(1, 0);
  }
}

async function pollTickets({ silent = true } = {}) {
  if (!token) return;
  try {
    const res = await apiFetch(`${API_BASE}/tickets`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = loginPath;
        return;
      }
      return;
    }

    const tickets = await res.json().catch(() => ([]));
    ticketCache = Array.isArray(tickets) ? tickets : [];
    refreshTicketList();
    if (!silent) setFeedback("info", "Updated.");
  } catch (error) {
    // Polling is best-effort; avoid spamming the UI on transient failures.
  }
}

loadTickets();
startTicketAutoRefresh();

// Open Ticket & Render Conversation
function openTicket(ticket) {
  currentTicketId = ticket._id;
  markActiveTicket();
  ticketView.classList.remove("hidden");
  renderTicketView(ticket);

  const isResolved = ticket.status === "resolved";
  resolveBtn.style.display = isResolved ? "none" : "block";
  replyBox.disabled = isResolved || isSubmitting;
  sendReplyBtn.disabled = isResolved || isSubmitting;
  setAiState(false);

  const suggestedPriority = ticket.ai_priority_suggestion || "-";
  const summary = ticket.ai_summary || "Summary will appear here after generation.";
  aiPriorityEl.textContent = `Priority Suggestion: ${suggestedPriority}`;
  aiSummaryEl.textContent = summary;

  if (ticketRefreshBtn) ticketRefreshBtn.disabled = false;
  startTicketAutoRefresh();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTicketView(ticket) {
  document.getElementById("ticket-subject").textContent = ticket.subject || "";
  const statusEl = document.getElementById("ticket-status");
  const status = String(ticket.status || "open").toLowerCase();
  statusEl.textContent = status;
  statusEl.className = `ticket-status ${status}`;

  const metaEl = document.getElementById("ticket-meta");
  if (metaEl) {
    const id = ticket._id || "-";
    const email = ticket.customer_email || "-";
    metaEl.textContent = `Ticket ID: ${id} | Customer: ${email}`;
  }

  messagesDiv.innerHTML = "";
  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  if (messages.length > 0) {
    messages.forEach((msg) => {
      const m = document.createElement("div");
      m.className = `message ${msg.sender}`;
      const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : "";
      m.innerHTML = `<strong>${escapeHtml(msg.sender || "")}</strong>: ${escapeHtml(msg.text || "")}<br><small>${escapeHtml(ts)}</small>`;
      messagesDiv.appendChild(m);
    });
  } else {
    messagesDiv.innerHTML = "<p class=\"no-messages\">No messages yet</p>";
  }

  scrollToBottom(messagesDiv);
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
    await refreshOpenTicket({ silent: true });
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
    await refreshOpenTicket({ silent: true });
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
    await refreshOpenTicket({ silent: true });
    await loadTickets();
  } catch (error) {
    console.error("AI assist error:", error);
    setFeedback("error", "AI assist unavailable right now.");
  } finally {
    setAiState(false);
  }
};

function resetToFirstPageAndRefresh() {
  currentPage = 1;
  refreshTicketList();
}

searchEl?.addEventListener("input", resetToFirstPageAndRefresh);
statusFilterEl?.addEventListener("change", resetToFirstPageAndRefresh);
priorityFilterEl?.addEventListener("change", resetToFirstPageAndRefresh);
sortEl?.addEventListener("change", resetToFirstPageAndRefresh);

prevPageBtn?.addEventListener("click", () => {
  if (currentPage <= 1) return;
  currentPage -= 1;
  refreshTicketList();
});

nextPageBtn?.addEventListener("click", () => {
  currentPage += 1;
  refreshTicketList();
});

ticketRefreshBtn?.addEventListener("click", () => {
  // Manual refresh should refresh the full list (new tickets + latest messages).
  pollTickets({ silent: false });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  startTicketAutoRefresh();
});
