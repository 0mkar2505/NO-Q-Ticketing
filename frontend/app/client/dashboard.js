const DASHBOARD_API_BASE = "http://127.0.0.1:5000/api/client";
const dashboardToken = localStorage.getItem("token");
const dashboardPathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const dashboardLoginPath = `${dashboardPathBase}/auth/login.html`;

const unresolvedEl = document.getElementById("dash-unresolved");
const openEl = document.getElementById("dash-open");
const resolvedEl = document.getElementById("dash-resolved");
const totalEl = document.getElementById("dash-total");

function setDashboardCounts({ unresolved = 0, open = 0, resolved = 0, total = 0 }) {
  if (unresolvedEl) unresolvedEl.textContent = String(unresolved);
  if (openEl) openEl.textContent = String(open);
  if (resolvedEl) resolvedEl.textContent = String(resolved);
  if (totalEl) totalEl.textContent = String(total);
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
  } catch (error) {
    console.error("Dashboard ticket count error:", error);
  }
}

loadDashboardCounts();
