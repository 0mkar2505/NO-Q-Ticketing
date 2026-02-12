const DASHBOARD_API_BASE = "/api/client";
const dashboardToken = localStorage.getItem("token");
const dashboardPathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const dashboardLoginPath = `${dashboardPathBase}/auth/login.html`;
const createTicketPath = `${dashboardPathBase}/app/client/create-ticket.html`;

const unresolvedEl = document.getElementById("dash-unresolved");
const openEl = document.getElementById("dash-open");
const resolvedEl = document.getElementById("dash-resolved");
const totalEl = document.getElementById("dash-total");
const feedbackEl = document.getElementById("dashboard-feedback");
const createTicketBtn = document.getElementById("dash-create-ticket");
const breakdownEl = document.getElementById("dash-priority-breakdown");
const recentEl = document.getElementById("dash-recent-tickets");

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

function setDashboardCounts({ unresolved = 0, open = 0, resolved = 0, total = 0 }) {
  if (unresolvedEl) unresolvedEl.textContent = String(unresolved);
  if (openEl) openEl.textContent = String(open);
  if (resolvedEl) resolvedEl.textContent = String(resolved);
  if (totalEl) totalEl.textContent = String(total);
}

function normalizePriority(value) {
  const p = String(value || "").toLowerCase();
  if (p === "high" || p === "normal" || p === "low") return p;
  return "normal";
}

function renderPriorityBreakdown(tickets) {
  if (!breakdownEl) return;
  const unresolvedTickets = tickets.filter((t) => (t.status || "").toLowerCase() !== "resolved");
  const counts = { high: 0, normal: 0, low: 0 };
  unresolvedTickets.forEach((t) => {
    counts[normalizePriority(t.priority)] += 1;
  });
  breakdownEl.innerHTML = `
    <li><span>High</span><strong>${counts.high}</strong></li>
    <li><span>Normal</span><strong>${counts.normal}</strong></li>
    <li><span>Low</span><strong>${counts.low}</strong></li>
  `;
}

function renderRecentTickets(tickets) {
  if (!recentEl) return;
  if (!tickets.length) {
    recentEl.innerHTML = `<li><span>No tickets yet</span><strong>-</strong></li>`;
    return;
  }
  recentEl.innerHTML = tickets.slice(0, 5).map((t) => {
    const status = (t.status || "open").toLowerCase();
    const priority = normalizePriority(t.priority);
    return `<li><span>${t.subject || "Untitled ticket"}</span><strong>${priority} | ${status}</strong></li>`;
  }).join("");
}

async function loadDashboardCounts() {
  if (!dashboardToken) {
    window.location.href = dashboardLoginPath;
    return;
  }

  try {
    const res = await fetch(`${DASHBOARD_API_BASE}/tickets`, {
      headers: { Authorization: `Bearer ${dashboardToken}` },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = dashboardLoginPath;
      }
      return;
    }

    const tickets = await res.json();
    const safeTickets = Array.isArray(tickets) ? tickets : [];
    const resolved = safeTickets.filter((t) => (t.status || "").toLowerCase() === "resolved").length;
    const open = safeTickets.filter((t) => (t.status || "").toLowerCase() === "open").length;
    const unresolved = safeTickets.length - resolved;

    setDashboardCounts({
      unresolved,
      open,
      resolved,
      total: safeTickets.length,
    });
    renderPriorityBreakdown(safeTickets);
    renderRecentTickets(safeTickets);
    setFeedback("", "");
  } catch (error) {
    console.error("Dashboard ticket count error:", error);
    setFeedback("error", "Unable to load dashboard data right now.");
  }
}

createTicketBtn?.addEventListener("click", () => {
  window.location.href = createTicketPath;
});

loadDashboardCounts();
