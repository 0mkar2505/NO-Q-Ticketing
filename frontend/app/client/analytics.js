const API_BASE = "/api/client";
const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;

const feedbackEl = document.getElementById("analytics-feedback");
const ticketsWeekEl = document.getElementById("metric-tickets-week");
const responseTimeEl = document.getElementById("metric-response-time");
const resolutionRateEl = document.getElementById("metric-resolution-rate");
const reopenedEl = document.getElementById("metric-reopened");
const volumeBarsEl = document.getElementById("volume-bars");
const statusOpenEl = document.getElementById("status-open");
const statusPendingEl = document.getElementById("status-pending");
const statusResolvedEl = document.getElementById("status-resolved");
const topCategoriesEl = document.getElementById("top-categories-list");
const teamBodyEl = document.getElementById("team-performance-body");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

function toDurationLabel(minutes) {
  if (minutes === null || minutes === undefined) return "-";
  const totalMinutes = Number(minutes);
  if (Number.isNaN(totalMinutes)) return "-";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function renderSummary(summary) {
  ticketsWeekEl.textContent = summary.tickets_this_week ?? 0;
  responseTimeEl.textContent = toDurationLabel(summary.avg_response_minutes);
  resolutionRateEl.textContent = `${summary.resolution_rate ?? 0}%`;
  reopenedEl.textContent = summary.reopened_tickets ?? 0;
}

function renderVolume(volumeData) {
  if (!Array.isArray(volumeData) || volumeData.length === 0) return;
  const max = Math.max(...volumeData.map((point) => point.count || 0), 1);
  const bars = volumeData
    .map((point) => {
      const height = Math.max(5, Math.round(((point.count || 0) / max) * 100));
      return `<div style="height: ${height}%" title="${point.date}: ${point.count || 0}"></div>`;
    })
    .join("");
  volumeBarsEl.innerHTML = bars;
}

function renderStatus(status) {
  const openCount = status.open || 0;
  const pendingCount = status.pending || 0;
  const resolvedCount = status.resolved || 0;
  const total = openCount + pendingCount + resolvedCount;

  const openPct = total ? Math.round((openCount / total) * 100) : 0;
  const pendingPct = total ? Math.round((pendingCount / total) * 100) : 0;
  const resolvedPct = total ? Math.round((resolvedCount / total) * 100) : 0;

  statusOpenEl.style.width = `${Math.max(openPct, total ? 6 : 0)}%`;
  statusPendingEl.style.width = `${Math.max(pendingPct, total ? 6 : 0)}%`;
  statusResolvedEl.style.width = `${Math.max(resolvedPct, total ? 6 : 0)}%`;

  statusOpenEl.textContent = `Open ${openPct}%`;
  statusPendingEl.textContent = `Pending ${pendingPct}%`;
  statusResolvedEl.textContent = `Resolved ${resolvedPct}%`;
}

function renderTopCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    topCategoriesEl.innerHTML = `
      <li>
        <span>No categories yet</span>
        <strong>0 tickets</strong>
      </li>
    `;
    return;
  }

  topCategoriesEl.innerHTML = categories
    .map(
      (category) => `
        <li>
          <span>${escapeHtml(category.name)}</span>
          <strong>${Number(category.count) || 0} tickets</strong>
        </li>
      `
    )
    .join("");
}

function renderTeamPerformance(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    teamBodyEl.innerHTML = `
      <tr>
        <td colspan="4">No team data available yet</td>
      </tr>
    `;
    return;
  }

  teamBodyEl.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.agent || "-")}</td>
          <td>${Number(row.handled) || 0}</td>
          <td>${Number(row.resolved) || 0}</td>
          <td>${escapeHtml(row.avg_time || "-")}</td>
        </tr>
      `
    )
    .join("");
}

async function loadAnalytics() {
  if (!token) {
    window.location.href = loginPath;
    return;
  }

  setFeedback("info", "Loading analytics...");

  try {
    const res = await fetch(`${API_BASE}/analytics`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = loginPath;
        return;
      }
      throw new Error("Failed to load analytics");
    }

    const data = await res.json();
    renderSummary(data.summary || {});
    renderVolume(data.volume_last_7_days || []);
    renderStatus(data.status_distribution || {});
    renderTopCategories(data.top_categories || []);
    renderTeamPerformance(data.team_performance || []);
    setFeedback("", "");
  } catch (error) {
    console.error("Analytics error:", error);
    setFeedback("error", "Unable to load analytics right now.");
  }
}

loadAnalytics();
