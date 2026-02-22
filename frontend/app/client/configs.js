const CONFIGS_API_BASE = "/api/client/configs";
const configsToken = localStorage.getItem("token");
const configsPathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const configsLoginPath = `${configsPathBase}/auth/login.html`;
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

const configsFeedbackEl = document.getElementById("configs-feedback");
const defaultPriorityEl = document.getElementById("defaultPriority");
const slaWindowEl = document.getElementById("slaWindow");
const signatureEl = document.getElementById("signatureText");
const notifyNewTicketsEl = document.getElementById("notifyNewTickets");
const notifyDailySummaryEl = document.getElementById("notifyDailySummary");
const notifyEscalationsEl = document.getElementById("notifyEscalations");
const resetBtnEl = document.getElementById("resetConfigsBtn");
const saveBtnEl = document.getElementById("saveConfigsBtn");

const taxCategoriesEl = document.getElementById("taxCategories");
const taxPriorityHighEl = document.getElementById("taxPriorityHigh");
const taxPriorityNormalEl = document.getElementById("taxPriorityNormal");
const taxPriorityLowEl = document.getElementById("taxPriorityLow");
const taxSeverityCriticalEl = document.getElementById("taxSeverityCritical");
const taxSeverityHighEl = document.getElementById("taxSeverityHigh");
const taxSeverityMediumEl = document.getElementById("taxSeverityMedium");
const taxSeverityLowEl = document.getElementById("taxSeverityLow");
const taxPolicyTextEl = document.getElementById("taxPolicyText");

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
  const chat = config?.customer_chat_ui || {};
  const taxonomy = config?.taxonomy || {};
  const priorityLabels = taxonomy?.priority_labels || {};
  const severityLabels = taxonomy?.severity_labels || {};
  return {
    default_priority: config?.default_priority || "normal",
    sla_response_hours: Number(config?.sla_response_hours || 4),
    reply_signature: config?.reply_signature || "",
    notifications: {
      email_new_tickets: Boolean(notifications.email_new_tickets),
      daily_summary_report: Boolean(notifications.daily_summary_report),
      manager_escalation_alerts: Boolean(notifications.manager_escalation_alerts),
    },
    taxonomy: {
      categories: Array.isArray(taxonomy.categories) && taxonomy.categories.length
        ? taxonomy.categories
        : [
          "Billing & Payments",
          "Login & Access",
          "Bug / Crash",
          "Integrations",
          "Performance",
          "Account & Subscription",
          "Feature Request",
          "Other",
        ],
      priority_labels: {
        high: String(priorityLabels.high || "High"),
        normal: String(priorityLabels.normal || "Normal"),
        low: String(priorityLabels.low || "Low"),
      },
      severity_labels: {
        critical: String(severityLabels.critical || "Critical"),
        high: String(severityLabels.high || "High"),
        medium: String(severityLabels.medium || "Medium"),
        low: String(severityLabels.low || "Low"),
      },
      policy_text: String(taxonomy.policy_text || ""),
    },
    customer_chat_ui: {
      brand_name: chat.brand_name || "NO-Q Support",
      logo_url: chat.logo_url || "",
      brand_text_color: chat.brand_text_color || chat.primary_color || "#7c3aed",
      assistant_title: chat.assistant_title || "Guided Support Assistant",
      assistant_subtitle: chat.assistant_subtitle || "Answer a few guided prompts and we will create a support ticket for you.",
      page_bg_color: chat.page_bg_color || "#f8faff",
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

  if (taxCategoriesEl) taxCategoriesEl.value = (normalized.taxonomy.categories || []).join("\n");
  if (taxPriorityHighEl) taxPriorityHighEl.value = normalized.taxonomy.priority_labels.high || "High";
  if (taxPriorityNormalEl) taxPriorityNormalEl.value = normalized.taxonomy.priority_labels.normal || "Normal";
  if (taxPriorityLowEl) taxPriorityLowEl.value = normalized.taxonomy.priority_labels.low || "Low";
  if (taxSeverityCriticalEl) taxSeverityCriticalEl.value = normalized.taxonomy.severity_labels.critical || "Critical";
  if (taxSeverityHighEl) taxSeverityHighEl.value = normalized.taxonomy.severity_labels.high || "High";
  if (taxSeverityMediumEl) taxSeverityMediumEl.value = normalized.taxonomy.severity_labels.medium || "Medium";
  if (taxSeverityLowEl) taxSeverityLowEl.value = normalized.taxonomy.severity_labels.low || "Low";
  if (taxPolicyTextEl) taxPolicyTextEl.value = normalized.taxonomy.policy_text || "";
}

function readFormConfig() {
  // Backend validation currently requires customer_chat_ui in every PATCH payload.
  // Settings no longer edits branding, so preserve whatever was last loaded.
  const fallbackChat = normalizeConfig({}).customer_chat_ui;
  const preservedChat = lastLoadedConfig?.customer_chat_ui || fallbackChat;

  const rawCategories = (taxCategoriesEl?.value || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const c of rawCategories) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  if (!unique.some((c) => c.toLowerCase() === "other")) unique.push("Other");

  return {
    default_priority: defaultPriorityEl.value,
    sla_response_hours: Number(slaWindowEl.value),
    reply_signature: signatureEl.value.trim(),
    notifications: {
      email_new_tickets: notifyNewTicketsEl.checked,
      daily_summary_report: notifyDailySummaryEl.checked,
      manager_escalation_alerts: notifyEscalationsEl.checked,
    },
    taxonomy: {
      categories: unique,
      priority_labels: {
        high: (taxPriorityHighEl?.value || "High").trim(),
        normal: (taxPriorityNormalEl?.value || "Normal").trim(),
        low: (taxPriorityLowEl?.value || "Low").trim(),
      },
      severity_labels: {
        critical: (taxSeverityCriticalEl?.value || "Critical").trim(),
        high: (taxSeverityHighEl?.value || "High").trim(),
        medium: (taxSeverityMediumEl?.value || "Medium").trim(),
        low: (taxSeverityLowEl?.value || "Low").trim(),
      },
      policy_text: (taxPolicyTextEl?.value || "").trim(),
    },
    customer_chat_ui: preservedChat,
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
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = configsLoginPath;
        return;
      }
      if (res.status === 403) {
        // Agent accounts are blocked from supervisor-only pages.
        window.location.href = `${configsPathBase}/app/client/tickets.html`;
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
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = configsLoginPath;
        return;
      }
      if (res.status === 403) {
        // Agent accounts are blocked from supervisor-only pages.
        window.location.href = `${configsPathBase}/app/client/tickets.html`;
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
