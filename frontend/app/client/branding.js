const CONFIGS_API_BASE = "/api/client/configs";
const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

const feedbackEl = document.getElementById("branding-feedback");
const saveBtn = document.getElementById("brandingSaveBtn");
const resetBtn = document.getElementById("brandingResetBtn");

const brandNameEl = document.getElementById("brandName");
const logoUrlEl = document.getElementById("logoUrl");
const assistantTitleEl = document.getElementById("assistantTitle");
const assistantSubtitleEl = document.getElementById("assistantSubtitle");

const primaryPicker = document.getElementById("primaryColorPicker");
const primaryText = document.getElementById("primaryColorText");
const assistantBubblePicker = document.getElementById("assistantBubblePicker");
const assistantBubbleText = document.getElementById("assistantBubbleText");
const assistantTextPicker = document.getElementById("assistantTextPicker");
const assistantTextText = document.getElementById("assistantTextText");
const customerBubblePicker = document.getElementById("customerBubblePicker");
const customerBubbleText = document.getElementById("customerBubbleText");
const customerTextPicker = document.getElementById("customerTextPicker");
const customerTextText = document.getElementById("customerTextText");

const previewRoot = document.getElementById("branding-preview");
const previewLogo = document.getElementById("preview-logo");
const previewBrand = document.getElementById("preview-brand");
const previewTitle = document.getElementById("preview-title");
const previewSubtitle = document.getElementById("preview-subtitle");

let isSaving = false;
let loadedConfig = null;

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
  if (saveBtn) saveBtn.disabled = saving;
  if (resetBtn) resetBtn.disabled = saving;
  if (saveBtn) saveBtn.textContent = saving ? "Saving..." : "Save Branding";
}

function normalizeConfig(config) {
  const notifications = config?.notifications || {};
  const chat = config?.customer_chat_ui || {};
  return {
    default_priority: config?.default_priority || "normal",
    sla_response_hours: Number(config?.sla_response_hours || 4),
    reply_signature: config?.reply_signature || "Thanks for reaching out.\nNO-Q Support Team",
    notifications: {
      email_new_tickets: Boolean(notifications.email_new_tickets),
      daily_summary_report: Boolean(notifications.daily_summary_report),
      manager_escalation_alerts: Boolean(notifications.manager_escalation_alerts),
    },
    customer_chat_ui: {
      brand_name: chat.brand_name || "NO-Q Support",
      logo_url: chat.logo_url || "",
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

function clampHex(value, fallback) {
  const v = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  return fallback;
}

function syncColorPair(pickerEl, textEl, value) {
  const v = clampHex(value, "#000000");
  if (pickerEl) pickerEl.value = v;
  if (textEl) textEl.value = v;
}

function applyToPreview(chat) {
  if (!previewRoot) return;

  previewRoot.style.setProperty("--support-primary-color", chat.primary_color);
  previewRoot.style.setProperty("--support-assistant-bubble-color", chat.assistant_bubble_color);
  previewRoot.style.setProperty("--support-assistant-text-color", chat.assistant_text_color);
  previewRoot.style.setProperty("--support-customer-bubble-color", chat.customer_bubble_color);
  previewRoot.style.setProperty("--support-customer-text-color", chat.customer_text_color);

  if (previewBrand) previewBrand.textContent = chat.brand_name || "Support";
  if (previewTitle) previewTitle.textContent = chat.assistant_title || "Guided Support Assistant";
  if (previewSubtitle) previewSubtitle.textContent = chat.assistant_subtitle || "";

  if (previewLogo) {
    const url = (chat.logo_url || "").trim();
    previewLogo.style.display = url ? "block" : "none";
    if (url) previewLogo.src = url;
  }
}

function readChatUiFromForm() {
  return {
    brand_name: brandNameEl.value.trim(),
    logo_url: logoUrlEl.value.trim(),
    assistant_title: assistantTitleEl.value.trim(),
    assistant_subtitle: assistantSubtitleEl.value.trim(),
    primary_color: clampHex(primaryText.value, "#7c3aed"),
    assistant_bubble_color: clampHex(assistantBubbleText.value, "#eef2ff"),
    assistant_text_color: clampHex(assistantTextText.value, "#312e81"),
    customer_bubble_color: clampHex(customerBubbleText.value, "#dcfce7"),
    customer_text_color: clampHex(customerTextText.value, "#14532d"),
  };
}

function applyConfigToForm(config) {
  const normalized = normalizeConfig(config);
  loadedConfig = normalized;

  const chat = normalized.customer_chat_ui;
  brandNameEl.value = chat.brand_name || "";
  logoUrlEl.value = chat.logo_url || "";
  assistantTitleEl.value = chat.assistant_title || "";
  assistantSubtitleEl.value = chat.assistant_subtitle || "";

  syncColorPair(primaryPicker, primaryText, chat.primary_color);
  syncColorPair(assistantBubblePicker, assistantBubbleText, chat.assistant_bubble_color);
  syncColorPair(assistantTextPicker, assistantTextText, chat.assistant_text_color);
  syncColorPair(customerBubblePicker, customerBubbleText, chat.customer_bubble_color);
  syncColorPair(customerTextPicker, customerTextText, chat.customer_text_color);

  applyToPreview(chat);
}

function wireColorPair(pickerEl, textEl) {
  pickerEl?.addEventListener("input", () => {
    textEl.value = pickerEl.value;
    applyToPreview(readChatUiFromForm());
  });
  textEl?.addEventListener("input", () => {
    const v = clampHex(textEl.value, pickerEl.value);
    pickerEl.value = v;
    applyToPreview(readChatUiFromForm());
  });
}

function wirePreviewInputs() {
  [brandNameEl, logoUrlEl, assistantTitleEl, assistantSubtitleEl].forEach((el) => {
    el?.addEventListener("input", () => applyToPreview(readChatUiFromForm()));
  });

  wireColorPair(primaryPicker, primaryText);
  wireColorPair(assistantBubblePicker, assistantBubbleText);
  wireColorPair(assistantTextPicker, assistantTextText);
  wireColorPair(customerBubblePicker, customerBubbleText);
  wireColorPair(customerTextPicker, customerTextText);
}

async function loadBranding() {
  if (!token) {
    window.location.href = loginPath;
    return;
  }

  setFeedback("info", "Loading branding...");
  try {
    const res = await apiFetch(CONFIGS_API_BASE, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = loginPath;
        return;
      }
      throw new Error("Failed to load branding");
    }

    const data = await res.json();
    applyConfigToForm(data);
    setFeedback("", "");
  } catch (error) {
    console.error("Branding load error:", error);
    setFeedback("error", "Unable to load branding right now.");
  }
}

async function saveBranding() {
  if (isSaving) return;
  if (!loadedConfig) return;

  const payload = {
    default_priority: loadedConfig.default_priority,
    sla_response_hours: loadedConfig.sla_response_hours,
    reply_signature: loadedConfig.reply_signature,
    notifications: loadedConfig.notifications,
    customer_chat_ui: readChatUiFromForm(),
  };

  if (!payload.customer_chat_ui.assistant_title) {
    setFeedback("error", "Assistant title is required.");
    return;
  }
  if (!payload.customer_chat_ui.assistant_subtitle) {
    setFeedback("error", "Assistant subtitle is required.");
    return;
  }

  setSavingState(true);
  setFeedback("", "");
  try {
    const res = await apiFetch(CONFIGS_API_BASE, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = loginPath;
        return;
      }
      setFeedback("error", data.error || "Failed to save branding.");
      return;
    }

    applyConfigToForm(data.config || payload);
    setFeedback("success", "Branding saved.");
  } catch (error) {
    console.error("Branding save error:", error);
    setFeedback("error", "Unable to save branding right now.");
  } finally {
    setSavingState(false);
  }
}

function resetBranding() {
  if (!loadedConfig) return;
  applyConfigToForm(loadedConfig);
  setFeedback("info", "Reverted to last saved values.");
}

saveBtn?.addEventListener("click", saveBranding);
resetBtn?.addEventListener("click", resetBranding);

wirePreviewInputs();
loadBranding();
