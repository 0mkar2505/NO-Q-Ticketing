const CONFIGS_API_BASE = "/api/client/configs";
const configsToken = localStorage.getItem("token");
const configsPathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const configsLoginPath = `${configsPathBase}/auth/login.html`;
const BACKEND_FALLBACK_ORIGIN = "http://127.0.0.1:5000";

const configsFeedbackEl = document.getElementById("configs-feedback");
const defaultPriorityEl = document.getElementById("defaultPriority");
const slaWindowEl = document.getElementById("slaWindow");
const signatureEl = document.getElementById("signatureText");
const notifyNewTicketsEl = document.getElementById("notifyNewTickets");
const notifyDailySummaryEl = document.getElementById("notifyDailySummary");
const notifyEscalationsEl = document.getElementById("notifyEscalations");
const chatAssistantTitleEl = document.getElementById("chatAssistantTitle");
const chatAssistantSubtitleEl = document.getElementById("chatAssistantSubtitle");
const chatPrimaryColorEl = document.getElementById("chatPrimaryColor");
const chatAssistantBubbleColorEl = document.getElementById("chatAssistantBubbleColor");
const chatAssistantTextColorEl = document.getElementById("chatAssistantTextColor");
const chatCustomerBubbleColorEl = document.getElementById("chatCustomerBubbleColor");
const chatCustomerTextColorEl = document.getElementById("chatCustomerTextColor");
const resetBtnEl = document.getElementById("resetConfigsBtn");
const saveBtnEl = document.getElementById("saveConfigsBtn");

let lastLoadedConfig = null;
let isSaving = false;

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(path, options);
    if (res.status !== 404 || window.location.port === "5000") {
      return res;
    }
  } catch (error) {
    // Try backend fallback when local frontend is on another port.
  }
  return fetch(`${BACKEND_FALLBACK_ORIGIN}${path}`, options);
}

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
  const chat = config?.customer_chat_ui || {};
  return {
    default_priority: config?.default_priority || "normal",
    sla_response_hours: Number(config?.sla_response_hours || 4),
    reply_signature: config?.reply_signature || "",
    notifications: {
      email_new_tickets: Boolean(notifications.email_new_tickets),
      daily_summary_report: Boolean(notifications.daily_summary_report),
      manager_escalation_alerts: Boolean(notifications.manager_escalation_alerts),
    },
    customer_chat_ui: {
      assistant_title: chat.assistant_title || "Guided Support Assistant",
      assistant_subtitle: chat.assistant_subtitle || "Answer a few guided prompts and we will create a support ticket for you.",
      primary_color: chat.primary_color || "#7c3aed",
      assistant_bubble_color: chat.assistant_bubble_color || "#eef2ff",
      assistant_text_color: chat.assistant_text_color || "#312e81",
      customer_bubble_color: chat.customer_bubble_color || "#dcfce7",
      customer_text_color: chat.customer_text_color || "#14532d",
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
  chatAssistantTitleEl.value = normalized.customer_chat_ui.assistant_title;
  chatAssistantSubtitleEl.value = normalized.customer_chat_ui.assistant_subtitle;
  chatPrimaryColorEl.value = normalized.customer_chat_ui.primary_color;
  chatAssistantBubbleColorEl.value = normalized.customer_chat_ui.assistant_bubble_color;
  chatAssistantTextColorEl.value = normalized.customer_chat_ui.assistant_text_color;
  chatCustomerBubbleColorEl.value = normalized.customer_chat_ui.customer_bubble_color;
  chatCustomerTextColorEl.value = normalized.customer_chat_ui.customer_text_color;
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
    customer_chat_ui: {
      assistant_title: chatAssistantTitleEl.value.trim(),
      assistant_subtitle: chatAssistantSubtitleEl.value.trim(),
      primary_color: chatPrimaryColorEl.value.trim(),
      assistant_bubble_color: chatAssistantBubbleColorEl.value.trim(),
      assistant_text_color: chatAssistantTextColorEl.value.trim(),
      customer_bubble_color: chatCustomerBubbleColorEl.value.trim(),
      customer_text_color: chatCustomerTextColorEl.value.trim(),
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
    const res = await apiFetch(CONFIGS_API_BASE, {
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
    const res = await apiFetch(CONFIGS_API_BASE, {
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
