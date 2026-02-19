const ADMIN_SYSTEM_API = "/api/admin/system";
const adminSystemToken = localStorage.getItem("token");
const adminSystemPathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const adminSystemLoginPath = `${adminSystemPathBase}/auth/login.html`;
const BACKEND_FALLBACK_ORIGIN = "http://127.0.0.1:5000";

const feedbackEl = document.getElementById("admin-system-feedback");
const strongPasswordsEl = document.getElementById("systemStrongPasswords");
const mfaAdminsEl = document.getElementById("systemMfaAdmins");
const autoExpireEl = document.getElementById("systemAutoExpire");
const logRetentionEl = document.getElementById("logRetention");
const backupWindowEl = document.getElementById("backupWindow");
const auditBodyEl = document.getElementById("system-audit-body");
const discardBtnEl = document.getElementById("system-discard-btn");
const exportBtnEl = document.getElementById("system-export-btn");
const saveBtnEl = document.getElementById("system-save-btn");

let savedSettings = null;
let latestAuditLogs = [];
let isSaving = false;

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(path, options);
    const shouldFallback =
      window.location.port !== "5000" &&
      (res.status === 404 || res.status === 405 || res.status === 501);
    if (!shouldFallback) return res;
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
  feedbackEl.className = `tickets-feedback ${type}`;
  feedbackEl.textContent = text;
}

function setSavingState(saving) {
  isSaving = saving;
  if (saveBtnEl) {
    saveBtnEl.disabled = saving;
    saveBtnEl.textContent = saving ? "Saving..." : "Save Settings";
  }
  if (discardBtnEl) discardBtnEl.disabled = saving;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeSettings(settings) {
  const auth = settings?.auth_policy || {};
  const maintenance = settings?.maintenance || {};
  return {
    auth_policy: {
      strong_passwords: Boolean(auth.strong_passwords),
      enforce_mfa_admins: Boolean(auth.enforce_mfa_admins),
      auto_expire_sessions: Boolean(auth.auto_expire_sessions),
    },
    maintenance: {
      log_retention_days: Number(maintenance.log_retention_days || 30),
      backup_window_utc: String(maintenance.backup_window_utc || "02:00"),
    },
  };
}

function applySettings(settings) {
  const normalized = normalizeSettings(settings);
  strongPasswordsEl.checked = normalized.auth_policy.strong_passwords;
  mfaAdminsEl.checked = normalized.auth_policy.enforce_mfa_admins;
  autoExpireEl.checked = normalized.auth_policy.auto_expire_sessions;
  logRetentionEl.value = String(normalized.maintenance.log_retention_days);
  backupWindowEl.value = normalized.maintenance.backup_window_utc;
}

function readSettings() {
  return {
    auth_policy: {
      strong_passwords: strongPasswordsEl.checked,
      enforce_mfa_admins: mfaAdminsEl.checked,
      auto_expire_sessions: autoExpireEl.checked,
    },
    maintenance: {
      log_retention_days: Number(logRetentionEl.value),
      backup_window_utc: backupWindowEl.value,
    },
  };
}

function formatTimestamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function renderAuditLogs(logs) {
  latestAuditLogs = Array.isArray(logs) ? logs : [];
  if (latestAuditLogs.length === 0) {
    auditBodyEl.innerHTML = `
      <tr>
        <td colspan="4" class="admin-table-empty">No audit entries found.</td>
      </tr>
    `;
    return;
  }

  auditBodyEl.innerHTML = latestAuditLogs
    .map((row) => `
      <tr>
        <td>${escapeHtml(formatTimestamp(row.timestamp))}</td>
        <td>${escapeHtml(row.actor || "-")}</td>
        <td>${escapeHtml(row.action || "-")}</td>
        <td>${escapeHtml(row.scope || "-")}</td>
      </tr>
    `)
    .join("");
}

async function loadSystemData() {
  if (!adminSystemToken) {
    window.location.href = adminSystemLoginPath;
    return;
  }

  setFeedback("info", "Loading system settings...");
  try {
    const res = await apiFetch(ADMIN_SYSTEM_API, {
      headers: { Authorization: `Bearer ${adminSystemToken}` },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = adminSystemLoginPath;
        return;
      }
      throw new Error("Failed to load system settings");
    }

    const data = await res.json();
    savedSettings = normalizeSettings(data.settings || {});
    applySettings(savedSettings);
    renderAuditLogs(data.audit_logs || []);
    setFeedback("", "");
  } catch (error) {
    console.error("System load error:", error);
    setFeedback("error", "Unable to load system settings right now.");
  }
}

async function saveSystemSettings() {
  if (isSaving) return;
  const payload = readSettings();

  if (![30, 60, 90].includes(payload.maintenance.log_retention_days)) {
    setFeedback("error", "Log retention must be 30, 60, or 90 days.");
    return;
  }
  if (!["02:00", "04:00", "06:00"].includes(payload.maintenance.backup_window_utc)) {
    setFeedback("error", "Backup window must be 02:00, 04:00, or 06:00 UTC.");
    return;
  }

  setSavingState(true);
  setFeedback("", "");

  try {
    const res = await apiFetch(ADMIN_SYSTEM_API, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${adminSystemToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = adminSystemLoginPath;
        return;
      }
      setFeedback("error", data.error || "Failed to save system settings.");
      return;
    }

    savedSettings = normalizeSettings(data.settings || payload);
    applySettings(savedSettings);
    setFeedback("success", "System settings saved.");
    await loadSystemData();
  } catch (error) {
    console.error("System save error:", error);
    setFeedback("error", "Unable to save system settings right now.");
  } finally {
    setSavingState(false);
  }
}

function discardSystemSettings() {
  if (!savedSettings) return;
  applySettings(savedSettings);
  setFeedback("info", "Reverted to last saved settings.");
}

function exportAuditLogs() {
  const payload = JSON.stringify(latestAuditLogs, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const link = document.createElement("a");
  link.href = url;
  link.download = `noq-audit-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

saveBtnEl?.addEventListener("click", saveSystemSettings);
discardBtnEl?.addEventListener("click", discardSystemSettings);
exportBtnEl?.addEventListener("click", exportAuditLogs);

loadSystemData();


