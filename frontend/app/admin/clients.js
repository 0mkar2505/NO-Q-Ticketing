const ADMIN_CLIENTS_API = "http://127.0.0.1:5000/api/admin/clients";
const adminToken = localStorage.getItem("token");
const adminPathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const adminLoginPath = `${adminPathBase}/auth/login.html`;

const feedbackEl = document.getElementById("admin-clients-feedback");
const countBadgeEl = document.getElementById("admin-clients-count");
const searchEl = document.getElementById("admin-clients-search");
const filterBtnEl = document.getElementById("admin-clients-filter");
const tableBodyEl = document.getElementById("admin-clients-body");

let isLoading = false;

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

function setLoadingState(loading) {
  isLoading = loading;
  if (filterBtnEl) {
    filterBtnEl.disabled = loading;
    filterBtnEl.textContent = loading ? "Loading..." : "Filter";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderRows(clients) {
  if (!Array.isArray(clients) || clients.length === 0) {
    tableBodyEl.innerHTML = `
      <tr>
        <td colspan="5" class="admin-table-empty">No clients found.</td>
      </tr>
    `;
    return;
  }

  tableBodyEl.innerHTML = clients
    .map((client) => {
      const statusClass = client.status === "active" ? "admin-status-active" : "admin-status-inactive";
      return `
        <tr>
          <td>
            <strong>${escapeHtml(client.company_name || "Unnamed Company")}</strong><br />
            <small>${escapeHtml(client.company_email || "-")}</small>
          </td>
          <td>${escapeHtml(client.plan || "N/A")}</td>
          <td>${Number(client.members) || 0}</td>
          <td>${Number(client.tickets) || 0}</td>
          <td><span class="admin-status-pill ${statusClass}">${escapeHtml(client.status || "unknown")}</span></td>
        </tr>
      `;
    })
    .join("");
}

function updateCount(count) {
  if (!countBadgeEl) return;
  const n = Number(count) || 0;
  countBadgeEl.textContent = `${n} client${n === 1 ? "" : "s"}`;
}

async function loadClients() {
  if (!adminToken) {
    window.location.href = adminLoginPath;
    return;
  }
  if (isLoading) return;

  const q = (searchEl?.value || "").trim();
  const query = q ? `?q=${encodeURIComponent(q)}` : "";

  setLoadingState(true);
  setFeedback("info", "Loading clients...");

  try {
    const res = await fetch(`${ADMIN_CLIENTS_API}${query}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = adminLoginPath;
        return;
      }
      throw new Error("Failed to load clients");
    }

    const data = await res.json();
    renderRows(data.clients || []);
    updateCount(data.count || 0);
    setFeedback("", "");
  } catch (error) {
    console.error("Admin clients error:", error);
    renderRows([]);
    updateCount(0);
    setFeedback("error", "Unable to load clients right now.");
  } finally {
    setLoadingState(false);
  }
}

filterBtnEl?.addEventListener("click", loadClients);
searchEl?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    loadClients();
  }
});

loadClients();
