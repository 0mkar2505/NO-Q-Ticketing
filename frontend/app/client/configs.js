const CONFIGS_API_BASE = "http://127.0.0.1:5000/api/client/configs";
const configsToken = localStorage.getItem("token");
const configsPathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const configsLoginPath = `${configsPathBase}/auth/login.html`;

const configsFeedbackEl = document.getElementById("configs-feedback");
const defaultPriorityEl = document.getElementById("defaultPriority");
const slaWindowEl = document.getElementById("slaWindow");
const signatureEl = document.getElementById("signatureText");
const notifyNewTicketsEl = document.getElementById("notifyNewTickets");
const notifyDailySummaryEl = document.getElementById("notifyDailySummary");
const notifyEscalationsEl = document.getElementById("notifyEscalations");
const resetBtnEl = document.getElementById("resetConfigsBtn");
const saveBtnEl = document.getElementById("saveConfigsBtn");

let lastLoadedConfig = null;
let isSaving = false;

function setConfigsFeedback(type, text) {
  if (!configsFeedbackEl) return;
  if (!text) {
    configsFeedbackEl.className = "tickets-feedback hidden";
    configsFeedbackEl.textContent = "";
    return;
  }
  configsFeedbackEl.className = `tickets-feedback ${type}`;
  configsFeedbackEl.textContent = text;
}

function setSavingState(saving) {
  isSaving = saving;
  if (saveBtnEl) saveBtnEl.disabled = saving;
  if (resetBtnEl) resetBtnEl.disabled = saving;
  if (saveBtnEl) saveBtnEl.textContent = saving ? "Saving..." : "Save Changes";
}

function normalizeConfig(config) {
  const notifications = config?.notifications || {};
  return {
    default_priority: config?.default_priority || "normal",
    sla_response_hours: Number(config?.sla_response_hours || 4),
    reply_signature: config?.reply_signature || "",
    notifications: {
      email_new_tickets: Boolean(notifications.email_new_tickets),
      daily_summary_report: Boolean(notifications.daily_summary_report),
      manager_escalation_alerts: Boolean(notifications.manager_escalation_alerts),
    },
  };
}

function applyConfigToForm(config) {
  const normalized = normalizeConfig(config);
  defaultPriorityEl.value = normalized.default_priority;
  slaWindowEl.value = String(normalized.sla_response_hours);
  signatureEl.value = normalized.reply_signature;
  notifyNewTicketsEl.checked = normalized.notifications.email_new_tickets;
  notifyDailySummaryEl.checked = normalized.notifications.daily_summary_report;
  notifyEscalationsEl.checked = normalized.notifications.manager_escalation_alerts;
}

function readFormConfig() {
  return {
    default_priority: defaultPriorityEl.value,
    sla_response_hours: Number(slaWindowEl.value),
    reply_signature: signatureEl.value.trim(),
    notifications: {
      email_new_tickets: notifyNewTicketsEl.checked,
      daily_summary_report: notifyDailySummaryEl.checked,
      manager_escalation_alerts: notifyEscalationsEl.checked,
    },
  };
}

async function loadConfigs() {
  if (!configsToken) {
    window.location.href = configsLoginPath;
    return;
  }

  setConfigsFeedback("info", "Loading settings...");

  try {
    const res = await fetch(CONFIGS_API_BASE, {
      headers: { Authorization: `Bearer ${configsToken}` },
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = configsLoginPath;
        return;
      }
      throw new Error("Failed to load settings");
    }

    const data = await res.json();
    lastLoadedConfig = normalizeConfig(data);
    applyConfigToForm(lastLoadedConfig);
    setConfigsFeedback("", "");
  } catch (error) {
    console.error("Settings load error:", error);
    setConfigsFeedback("error", "Unable to load settings right now.");
  }
}

async function saveConfigs() {
  if (isSaving) return;

  const payload = readFormConfig();
  if (!payload.reply_signature) {
    setConfigsFeedback("error", "Reply signature is required.");
    return;
  }

  setSavingState(true);
  setConfigsFeedback("", "");

  try {
    const res = await fetch(CONFIGS_API_BASE, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${configsToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = configsLoginPath;
        return;
      }
      setConfigsFeedback("error", data.error || "Failed to save settings.");
      return;
    }

    lastLoadedConfig = normalizeConfig(data.config || payload);
    applyConfigToForm(lastLoadedConfig);
    setConfigsFeedback("success", "Settings saved.");
  } catch (error) {
    console.error("Settings save error:", error);
    setConfigsFeedback("error", "Unable to save settings right now.");
  } finally {
    setSavingState(false);
  }
}

function resetConfigs() {
  if (!lastLoadedConfig) return;
  applyConfigToForm(lastLoadedConfig);
  setConfigsFeedback("info", "Changes reset to last saved values.");
}

if (saveBtnEl) saveBtnEl.addEventListener("click", saveConfigs);
if (resetBtnEl) resetBtnEl.addEventListener("click", resetConfigs);

loadConfigs();
