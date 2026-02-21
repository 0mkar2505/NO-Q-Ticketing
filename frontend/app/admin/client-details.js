const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

const feedbackEl = document.getElementById("client-details-feedback");
const subtitleEl = document.getElementById("client-details-subtitle");
const billingEl = document.getElementById("client-billing");
const usageEl = document.getElementById("client-usage");
const membersBodyEl = document.getElementById("client-members-body");

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

function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function roleChip(role) {
  const r = String(role || "-").toLowerCase();
  const cls = r === "supervisor" ? "member-chip member-chip--supervisor" : "member-chip member-chip--agent";
  return `<span class="${cls}">${escapeHtml(role || "-")}</span>`;
}

function statusChip(active) {
  const cls = active ? "member-chip member-chip--active" : "member-chip member-chip--inactive";
  return `<span class="${cls}">${active ? "active" : "inactive"}</span>`;
}

function getCompanyIdFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  return (params.get("company_id") || "").trim();
}

async function loadDetails() {
  const companyId = getCompanyIdFromUrl();
  if (!companyId) {
    setFeedback("error", "Missing company_id.");
    return;
  }
  if (!token) {
    window.location.href = loginPath;
    return;
  }

  setFeedback("info", "Loading client details...");

  try {
    const [clientsRes, membersRes] = await Promise.all([
      apiFetch(`/api/admin/clients`, { headers: { Authorization: `Bearer ${token}` } }),
      apiFetch(`/api/admin/clients/${encodeURIComponent(companyId)}/members`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    if (!clientsRes.ok) {
      if (clientsRes.status === 401 || clientsRes.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = loginPath;
        return;
      }
      throw new Error("Unable to load client list.");
    }
    if (!membersRes.ok) {
      if (membersRes.status === 401 || membersRes.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = loginPath;
        return;
      }
      const err = await membersRes.json().catch(() => ({}));
      throw new Error(err.error || "Unable to load members.");
    }

    const clientsData = await clientsRes.json().catch(() => ({}));
    const membersData = await membersRes.json().catch(() => ({}));

    const client = Array.isArray(clientsData.clients)
      ? clientsData.clients.find((c) => String(c.company_id) === String(companyId))
      : null;

    if (client && subtitleEl) {
      subtitleEl.textContent = `${client.company_name || "Client"} | slug: ${client.company_slug || "-"}`;
    }

    if (billingEl) {
      const plan = client?.plan || "-";
      const billingStatus = client?.billing_status || "-";
      const started = fmtDate(client?.billing_started_at);
      const renew = fmtDate(client?.billing_renew_at);
      const daysLeft = (client?.billing_days_left === 0 || client?.billing_days_left)
        ? `${client.billing_days_left} days left`
        : "-";
      billingEl.textContent = `Plan: ${plan}. Billing: ${billingStatus}. Started: ${started}. Renews: ${renew}. ${daysLeft}`;
    }

    if (usageEl) {
      const t7 = client?.tickets_7d ?? 0;
      const t30 = client?.tickets_30d ?? 0;
      const c7 = client?.support_chats_7d ?? 0;
      const c30 = client?.support_chats_30d ?? 0;
      const lastT = fmtDate(client?.last_ticket_at);
      const lastC = fmtDate(client?.last_support_chat_at);
      usageEl.textContent = `Tickets: ${client?.tickets ?? 0} total, ${t7} (7d), ${t30} (30d). Support chats: ${client?.support_chats ?? 0} total, ${c7} (7d), ${c30} (30d). Last ticket: ${lastT}. Last chat: ${lastC}.`;
    }

    const members = Array.isArray(membersData.members) ? membersData.members : [];
    if (membersBodyEl) {
      if (!members.length) {
        membersBodyEl.innerHTML = `<tr><td colspan="5">No members found.</td></tr>`;
      } else {
        membersBodyEl.innerHTML = members.map((m) => `
          <tr>
            <td>${escapeHtml(m.name || "-")}</td>
            <td>${escapeHtml(m.email || "-")}</td>
            <td>${roleChip(m.company_role)}</td>
            <td>${statusChip(Boolean(m.is_active))}</td>
            <td>${escapeHtml(fmtDate(m.created_at))}</td>
          </tr>
        `).join("");
      }
    }

    setFeedback("", "");
  } catch (e) {
    setFeedback("error", e?.message || "Unable to load details.");
  }
}

loadDetails();
