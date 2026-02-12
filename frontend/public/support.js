const SUPPORT_API_BASE = "http://127.0.0.1:5000/api/support";

const supportFeedbackEl = document.getElementById("support-feedback");
const supportAssistantTitleEl = document.getElementById("support-assistant-title");
const supportAssistantSubtitleEl = document.getElementById("support-assistant-subtitle");
const supportCompanyEl = document.getElementById("support-company");
const supportEmailEl = document.getElementById("support-email");
const supportStartBtn = document.getElementById("support-start");
const supportChatEl = document.getElementById("support-chat");
const supportOptionsEl = document.getElementById("support-options");
const supportDetailsWrapEl = document.getElementById("support-details-wrap");
const supportDetailsEl = document.getElementById("support-details");
const supportDetailsSubmitBtn = document.getElementById("support-details-submit");
const supportReviewEl = document.getElementById("support-review");
const reviewCategoryEl = document.getElementById("review-category");
const reviewPriorityEl = document.getElementById("review-priority");
const reviewSeverityEl = document.getElementById("review-severity");
const supportCreateTicketBtn = document.getElementById("support-create-ticket");

const statusTicketIdEl = document.getElementById("status-ticket-id");
const statusEmailEl = document.getElementById("status-email");
const statusCheckBtn = document.getElementById("status-check");
const statusFeedbackEl = document.getElementById("status-feedback");
const statusResultEl = document.getElementById("status-result");

let sessionId = null;
let currentStep = null;
let ticketCreated = false;
let isCreatingTicket = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setFeedback(el, type, text) {
  if (!el) return;
  if (!text) {
    el.className = "tickets-feedback hidden";
    el.textContent = "";
    return;
  }
  el.className = `tickets-feedback ${type}`;
  el.textContent = text;
}

function appendChat(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `support-msg ${role}`;
  bubble.innerHTML = `<p>${escapeHtml(text)}</p>`;
  supportChatEl.appendChild(bubble);
  supportChatEl.scrollTop = supportChatEl.scrollHeight;
}

function applyCustomerChatUi(chatUi = {}) {
  if (!chatUi || typeof chatUi !== "object") return;

  if (supportAssistantTitleEl && chatUi.assistant_title) {
    supportAssistantTitleEl.textContent = chatUi.assistant_title;
  }
  if (supportAssistantSubtitleEl && chatUi.assistant_subtitle) {
    supportAssistantSubtitleEl.textContent = chatUi.assistant_subtitle;
  }

  const root = document.documentElement;
  if (chatUi.primary_color) root.style.setProperty("--support-primary-color", chatUi.primary_color);
  if (chatUi.assistant_bubble_color) root.style.setProperty("--support-assistant-bubble-color", chatUi.assistant_bubble_color);
  if (chatUi.assistant_text_color) root.style.setProperty("--support-assistant-text-color", chatUi.assistant_text_color);
  if (chatUi.customer_bubble_color) root.style.setProperty("--support-customer-bubble-color", chatUi.customer_bubble_color);
  if (chatUi.customer_text_color) root.style.setProperty("--support-customer-text-color", chatUi.customer_text_color);
}

function clearOptions() {
  supportOptionsEl.innerHTML = "";
}

function showDetailsInput(show) {
  supportDetailsWrapEl.classList.toggle("hidden", !show);
  if (!show) supportDetailsEl.value = "";
}

function showReview(show) {
  supportReviewEl.classList.toggle("hidden", !show);
}

function renderOptions(options = []) {
  clearOptions();
  options.forEach((option) => {
    const btn = document.createElement("button");
    btn.className = "support-option-btn";
    btn.type = "button";
    btn.textContent = option.label;
    btn.addEventListener("click", () => submitStep({ option_id: option.id, display_text: option.label }));
    supportOptionsEl.appendChild(btn);
  });
}

function applyAssistantState(payload) {
  currentStep = payload.step;
  if (payload.message) appendChat("assistant", payload.message);
  renderOptions(payload.options || []);
  showDetailsInput(payload.step === "details");
  showReview(Boolean(payload.ready_to_create_ticket));

  if (payload.review) {
    reviewCategoryEl.textContent = `Category: ${payload.review.category || "-"}`;
    reviewPriorityEl.textContent = `Priority: ${payload.review.priority || "-"}`;
    reviewSeverityEl.textContent = `Severity: ${payload.review.severity || "-"}`;
  }
}

async function startAssistant() {
  const company_name = supportCompanyEl.value.trim();
  const customer_email = supportEmailEl.value.trim().toLowerCase();
  if (!company_name || !customer_email) {
    setFeedback(supportFeedbackEl, "error", "Company name and email are required.");
    return;
  }

  setFeedback(supportFeedbackEl, "info", "Starting assistant...");
  supportChatEl.innerHTML = "";
  clearOptions();
  showDetailsInput(false);
  showReview(false);
  ticketCreated = false;
  supportCreateTicketBtn.disabled = false;

  try {
    const res = await fetch(`${SUPPORT_API_BASE}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name, customer_email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(supportFeedbackEl, "error", data.error || "Unable to start assistant.");
      return;
    }
    sessionId = data.session_id;
    applyCustomerChatUi(data.customer_chat_ui || {});
    applyAssistantState(data);
    setFeedback(supportFeedbackEl, "", "");
  } catch (error) {
    console.error("Support start error:", error);
    setFeedback(supportFeedbackEl, "error", "Support assistant is unavailable right now.");
  }
}

async function submitStep({ option_id = "", details = "", display_text = "" }) {
  if (!sessionId) return;

  if (display_text) appendChat("customer", display_text);

  try {
    const res = await fetch(`${SUPPORT_API_BASE}/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, option_id, details }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(supportFeedbackEl, "error", data.error || "Unable to continue support flow.");
      return;
    }
    applyAssistantState(data);
    setFeedback(supportFeedbackEl, "", "");
  } catch (error) {
    console.error("Support step error:", error);
    setFeedback(supportFeedbackEl, "error", "Support assistant is unavailable right now.");
  }
}

async function createTicket() {
  if (!sessionId || ticketCreated || isCreatingTicket) return;
  isCreatingTicket = true;
  supportCreateTicketBtn.disabled = true;
  setFeedback(supportFeedbackEl, "info", "Creating ticket...");

  try {
    const res = await fetch(`${SUPPORT_API_BASE}/create-ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(supportFeedbackEl, "error", data.error || "Unable to create ticket.");
      return;
    }

    const ticket = data.ticket || {};
    const isAlreadyCreated = (data.message || "").toLowerCase().includes("already created");

    if (!isAlreadyCreated && ticket._id) {
      appendChat("assistant", `Ticket created: ${ticket._id}. Current status is ${ticket.status}.`);
      setFeedback(supportFeedbackEl, "success", "Ticket created successfully.");
      ticketCreated = true;
      supportCreateTicketBtn.disabled = true;
    } else {
      setFeedback(supportFeedbackEl, "info", "This session already has a ticket.");
      ticketCreated = true;
      supportCreateTicketBtn.disabled = true;
    }

    statusTicketIdEl.value = ticket._id || "";
    statusEmailEl.value = supportEmailEl.value.trim();
  } catch (error) {
    console.error("Create ticket error:", error);
    setFeedback(supportFeedbackEl, "error", "Unable to create ticket right now.");
    if (!ticketCreated) supportCreateTicketBtn.disabled = false;
  } finally {
    isCreatingTicket = false;
  }
}

async function checkStatus() {
  const ticketId = statusTicketIdEl.value.trim();
  const email = statusEmailEl.value.trim().toLowerCase();
  if (!ticketId || !email) {
    setFeedback(statusFeedbackEl, "error", "Ticket ID and email are required.");
    return;
  }

  setFeedback(statusFeedbackEl, "info", "Checking status...");
  try {
    const res = await fetch(`${SUPPORT_API_BASE}/ticket-status?ticket_id=${encodeURIComponent(ticketId)}&email=${encodeURIComponent(email)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(statusFeedbackEl, "error", data.error || "Unable to fetch ticket status.");
      statusResultEl.classList.add("hidden");
      return;
    }

    const ticket = data.ticket || {};
    statusResultEl.classList.remove("hidden");
    statusResultEl.innerHTML = `
      <h4>${escapeHtml(ticket.subject || "Ticket")}</h4>
      <p>Status: <strong>${escapeHtml(ticket.status || "-")}</strong></p>
      <p>Category: ${escapeHtml(ticket.category || "-")}</p>
      <p>Priority: ${escapeHtml(ticket.priority || "-")}</p>
      <p>Severity: ${escapeHtml(ticket.severity || "-")}</p>
    `;
    setFeedback(statusFeedbackEl, "", "");
  } catch (error) {
    console.error("Status check error:", error);
    setFeedback(statusFeedbackEl, "error", "Unable to fetch ticket status right now.");
  }
}

supportStartBtn?.addEventListener("click", startAssistant);
supportDetailsSubmitBtn?.addEventListener("click", () => {
  const details = supportDetailsEl.value.trim();
  if (!details) {
    setFeedback(supportFeedbackEl, "error", "Please enter issue details.");
    return;
  }
  submitStep({ details });
});
supportCreateTicketBtn?.addEventListener("click", createTicket);
statusCheckBtn?.addEventListener("click", checkStatus);
