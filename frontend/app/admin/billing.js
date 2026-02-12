const ADMIN_BILLING_API = "/api/admin/billing";
const ADMIN_BILLING_RULES_API = "/api/admin/billing/rules";
const adminBillingToken = localStorage.getItem("token");
const adminBillingPathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const adminBillingLoginPath = `${adminBillingPathBase}/auth/login.html`;

const feedbackEl = document.getElementById("admin-billing-feedback");
const totalClientsEl = document.getElementById("billing-total-clients");
const planSummaryEl = document.getElementById("billing-plan-summary");
const invoicesBodyEl = document.getElementById("billing-invoices-body");
const graceDaysEl = document.getElementById("graceDays");
const currencyEl = document.getElementById("currency");
const discardBtnEl = document.getElementById("billing-discard-btn");
const saveBtnEl = document.getElementById("billing-save-btn");

let savedRules = { grace_days: 7, currency: "USD" };
let isSaving = false;

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
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setSavingState(saving) {
  isSaving = saving;
  if (saveBtnEl) {
    saveBtnEl.disabled = saving;
    saveBtnEl.textContent = saving ? "Saving..." : "Save Rules";
  }
  if (discardBtnEl) discardBtnEl.disabled = saving;
}

function applyRules(rules) {
  const grace = Number(rules?.grace_days);
  graceDaysEl.value = Number.isFinite(grace) ? grace : 7;
  currencyEl.value = (rules?.currency || "USD").toUpperCase();
}

function readRules() {
  return {
    grace_days: Number(graceDaysEl.value),
    currency: String(currencyEl.value || "").toUpperCase(),
  };
}

function renderPlanSummary(planDistribution = {}) {
  const getCount = (key) => Number(planDistribution[key]) || 0;
  planSummaryEl.innerHTML = `
    <div><span>Free</span><strong>${getCount("free")}</strong></div>
    <div><span>Starter</span><strong>${getCount("starter")}</strong></div>
    <div><span>Growth</span><strong>${getCount("growth")}</strong></div>
    <div><span>Enterprise</span><strong>${getCount("enterprise")}</strong></div>
  `;
}

function renderInvoices(invoices = []) {
  if (!Array.isArray(invoices) || invoices.length === 0) {
    invoicesBodyEl.innerHTML = `
      <tr>
        <td colspan="3" class="admin-table-empty">No invoices yet.</td>
      </tr>
    `;
    return;
  }

  invoicesBodyEl.innerHTML = invoices
    .map((inv) => {
      const status = String(inv.status || "unknown").toLowerCase();
      const statusClass = status === "paid" ? "admin-status-active" : "admin-status-inactive";
      return `
        <tr>
          <td>${escapeHtml(inv.invoice_id || "-")}</td>
          <td>${escapeHtml(inv.company_name || "-")}</td>
          <td><span class="admin-status-pill ${statusClass}">${escapeHtml(status)}</span></td>
        </tr>
      `;
    })
    .join("");
}

async function loadBilling() {
  if (!adminBillingToken) {
    window.location.href = adminBillingLoginPath;
    return;
  }

  setFeedback("info", "Loading billing data...");

  try {
    const res = await fetch(ADMIN_BILLING_API, {
      headers: { Authorization: `Bearer ${adminBillingToken}` },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = adminBillingLoginPath;
        return;
      }
      throw new Error("Failed to load billing data");
    }

    const data = await res.json();
    const totalClients = Number(data?.summary?.total_clients) || 0;
    totalClientsEl.textContent = `${totalClients} client${totalClients === 1 ? "" : "s"}`;
    renderPlanSummary(data?.summary?.plan_distribution || {});
    renderInvoices(data?.recent_invoices || []);
    savedRules = {
      grace_days: Number(data?.rules?.grace_days) || 7,
      currency: (data?.rules?.currency || "USD").toUpperCase(),
    };
    applyRules(savedRules);
    setFeedback("", "");
  } catch (error) {
    console.error("Billing load error:", error);
    setFeedback("error", "Unable to load billing data right now.");
  }
}

async function saveRules() {
  if (isSaving) return;
  const payload = readRules();

  if (!Number.isFinite(payload.grace_days) || payload.grace_days < 0 || payload.grace_days > 90) {
    setFeedback("error", "Grace days must be between 0 and 90.");
    return;
  }
  if (!["USD", "EUR", "INR"].includes(payload.currency)) {
    setFeedback("error", "Currency must be USD, EUR, or INR.");
    return;
  }

  setSavingState(true);
  setFeedback("", "");

  try {
    const res = await fetch(ADMIN_BILLING_RULES_API, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminBillingToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = adminBillingLoginPath;
        return;
      }
      setFeedback("error", data.error || "Failed to save billing rules.");
      return;
    }

    savedRules = {
      grace_days: Number(data?.rules?.grace_days) || payload.grace_days,
      currency: (data?.rules?.currency || payload.currency).toUpperCase(),
    };
    applyRules(savedRules);
    setFeedback("success", "Billing rules saved.");
  } catch (error) {
    console.error("Billing save error:", error);
    setFeedback("error", "Unable to save billing rules right now.");
  } finally {
    setSavingState(false);
  }
}

function discardRules() {
  applyRules(savedRules);
  setFeedback("info", "Reverted to last saved rules.");
}

saveBtnEl?.addEventListener("click", saveRules);
discardBtnEl?.addEventListener("click", discardRules);

loadBilling();
