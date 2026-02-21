const ADMIN_CLIENTS_API = "/api/admin/clients";
const ADMIN_APPROVE_API = "/api/admin/clients";
const adminToken = localStorage.getItem("token");
const adminPathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const adminLoginPath = `${adminPathBase}/auth/login.html`;
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

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
        <td colspan="7" class="admin-table-empty">No clients found.</td>
      </tr>
    `;
    return;
  }

  tableBodyEl.innerHTML = clients
    .map((client) => {
      const statusClass = client.status === "active" ? "admin-status-active" : "admin-status-inactive";
      const approval = String(client.approval_status || "").toLowerCase();
      const billing = String(client.billing_status || "").toLowerCase();
      const isPendingApproval = approval === "pending_admin_approval" || approval === "pending_payment";
      const canApprove = approval === "pending_admin_approval" && billing === "paid";

      const badgeText = approval && approval !== "active"
        ? `${client.status} (${approval.replaceAll("_", " ")})`
        : (client.status || "unknown");

      const approveBtn = canApprove
        ? `<button class="btn btn-secondary admin-approve-btn" data-company-id="${escapeHtml(client.company_id)}" type="button">Approve</button>`
        : "";

      const removeBtn = `<button class="btn btn-secondary admin-remove-btn" data-company-id="${escapeHtml(client.company_id)}" type="button">Remove</button>`;
      const viewBtn = `<button class="btn btn-secondary admin-view-btn" data-company-id="${escapeHtml(client.company_id)}" type="button">View</button>`;

      const actions = `${approveBtn} ${viewBtn} ${removeBtn}`.trim() || `<span class="settings-copy">-</span>`;

      const daysLeft = client.billing_days_left === 0 || client.billing_days_left
        ? `${Number(client.billing_days_left)}d left`
        : "-";
      const billingCell = billing === "paid" ? `${daysLeft}` : (billing || "-");
      return `
        <tr>
          <td>
            <strong>${escapeHtml(client.company_name || "Unnamed Company")}</strong><br />
            <small>${escapeHtml(client.company_email || "-")}</small><br />
            <small>slug: ${escapeHtml(client.company_slug || "-")}</small>
          </td>
          <td>${escapeHtml(client.plan || "N/A")}</td>
          <td>${Number(client.members) || 0}</td>
          <td>${Number(client.tickets) || 0}</td>
          <td><span class="admin-status-pill ${statusClass}">${escapeHtml(badgeText)}</span></td>
          <td>${escapeHtml(billingCell)}</td>
          <td>${actions}</td>
        </tr>
      `;
    })
    .join("");

  tableBodyEl.querySelectorAll(".admin-approve-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const companyId = btn.getAttribute("data-company-id");
      if (!companyId) return;
      btn.disabled = true;
      btn.textContent = "Approving...";
      setFeedback("info", "Approving client...");
      try {
        const res = await apiFetch(`${ADMIN_APPROVE_API}/${encodeURIComponent(companyId)}/approve`, {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setFeedback("error", data.error || "Unable to approve client.");
          btn.disabled = false;
          btn.textContent = "Approve";
          return;
        }
        setFeedback("success", "Client approved.");
        loadClients();
      } catch (e) {
        setFeedback("error", "Unable to approve client right now.");
        btn.disabled = false;
        btn.textContent = "Approve";
      }
    });
  });

  tableBodyEl.querySelectorAll(".admin-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const companyId = btn.getAttribute("data-company-id");
      if (!companyId) return;
      const ok = confirm("Remove this client? This disables the company and all its users.");
      if (!ok) return;
      btn.disabled = true;
      btn.textContent = "Removing...";
      setFeedback("info", "Removing client...");
      try {
        const res = await apiFetch(`${ADMIN_APPROVE_API}/${encodeURIComponent(companyId)}/remove`, {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setFeedback("error", data.error || "Unable to remove client.");
          btn.disabled = false;
          btn.textContent = "Remove";
          return;
        }
        setFeedback("success", "Client removed.");
        loadClients();
      } catch (e) {
        setFeedback("error", "Unable to remove client right now.");
        btn.disabled = false;
        btn.textContent = "Remove";
      }
    });
  });

  tableBodyEl.querySelectorAll(".admin-view-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const companyId = btn.getAttribute("data-company-id");
      if (!companyId) return;
      window.location.href = `./client-details.html?company_id=${encodeURIComponent(companyId)}`;
    });
  });
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
    const res = await apiFetch(`${ADMIN_CLIENTS_API}${query}`, {
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


