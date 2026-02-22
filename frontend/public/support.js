const SUPPORT_API_BASE = "/api/support";
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

const supportFeedbackEl = document.getElementById("support-feedback");
const supportAssistantTitleEl = document.getElementById("support-assistant-title");
const supportAssistantSubtitleEl = document.getElementById("support-assistant-subtitle");
const supportBrandNameEl = document.getElementById("support-brand-name");
const supportBrandLogoEl = document.getElementById("support-brand-logo");
const supportPageEl = document.querySelector(".support-page");
const supportTenantWrapEl = document.getElementById("support-tenant-wrap");
const supportCompanySlugEl = document.getElementById("support-company-slug");
const supportEmailEl = document.getElementById("support-email");
const supportStartBtn = document.getElementById("support-start");
const supportChatEl = document.getElementById("support-chat");
const supportOptionsEl = document.getElementById("support-options");
const supportFreeChatInputEl = document.getElementById("support-freechat-input");
const supportFreeChatSendBtn = document.getElementById("support-freechat-send");
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

const supportAssistantBodyEl = document.getElementById("support-assistant-body");
const supportCreatedOverlayEl = document.getElementById("support-created-overlay");
const supportCreatedIdEl = document.getElementById("support-created-id");
const supportCreatedCopyBtn = document.getElementById("support-created-copy");
const supportCreatedStatusBtn = document.getElementById("support-created-status");
const supportCreatedNewBtn = document.getElementById("support-created-new");

let sessionId = null;
let currentStep = null;
let ticketCreated = false;
let isCreatingTicket = false;
let tenantSlug = "";
let lastAiTriage = null;
let statusContext = { ticket_id: "", email: "" };
let statusAutoRefreshTimer = null;
let statusStickToBottom = true;
let readyPromptShown = false;

function scrollToBottom(el) {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

function isNearBottom(el, thresholdPx = 28) {
  if (!el) return true;
  return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - thresholdPx);
}

function getTenantSlugFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const fromQuery = (params.get("tenant") || params.get("t") || "").trim().toLowerCase();
  if (fromQuery) return fromQuery;

  // Support canonical: /support/<tenant_slug>
  const path = String(window.location.pathname || "");
  const match = path.match(/\/support\/([^\/?#]+)/i);
  if (match && match[1]) {
    return String(match[1] || "").trim().toLowerCase();
  }
  return "";
}

function initTenant() {
  tenantSlug = getTenantSlugFromUrl();

  if (tenantSlug) {
    if (supportCompanySlugEl) supportCompanySlugEl.value = tenantSlug;
    if (supportTenantWrapEl) supportTenantWrapEl.style.display = "none";
    loadTenantBranding();
    return;
  }

  // No tenant in the URL. Keep the field visible for internal testing, but guide users.
  if (supportTenantWrapEl) supportTenantWrapEl.style.display = "block";
  setFeedback(
    supportFeedbackEl,
    "info",
    "This support link is missing a tenant. Ask the company for their support link, or enter a tenant slug for testing."
  );
}

async function loadTenantBranding() {
  if (!tenantSlug) return;
  try {
    const res = await apiFetch(`${SUPPORT_API_BASE}/config?company_slug=${encodeURIComponent(tenantSlug)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    applyCustomerChatUi(data.customer_chat_ui || {});
  } catch (error) {
    // Non-fatal.
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
  scrollToBottom(supportChatEl);
}

function applyCustomerChatUi(chatUi = {}) {
  if (!chatUi || typeof chatUi !== "object") return;

  if (supportBrandNameEl && chatUi.brand_name) {
    supportBrandNameEl.textContent = chatUi.brand_name;
  }
  if (supportBrandLogoEl && chatUi.logo_url) {
    supportBrandLogoEl.src = chatUi.logo_url;
  }

  if (supportAssistantTitleEl && chatUi.assistant_title) {
    supportAssistantTitleEl.textContent = chatUi.assistant_title;
  }
  if (supportAssistantSubtitleEl && chatUi.assistant_subtitle) {
    supportAssistantSubtitleEl.textContent = chatUi.assistant_subtitle;
  }

  // CSS defines these variables on `.support-page`, so set them there to override defaults.
  const scope = supportPageEl || document.documentElement;
  if (chatUi.brand_text_color) scope.style.setProperty("--support-brand-text-color", chatUi.brand_text_color);
  if (chatUi.primary_color) scope.style.setProperty("--support-primary-color", chatUi.primary_color);
  if (chatUi.assistant_bubble_color) scope.style.setProperty("--support-assistant-bubble-color", chatUi.assistant_bubble_color);
  if (chatUi.assistant_text_color) scope.style.setProperty("--support-assistant-text-color", chatUi.assistant_text_color);
  if (chatUi.customer_bubble_color) scope.style.setProperty("--support-customer-bubble-color", chatUi.customer_bubble_color);
  if (chatUi.customer_text_color) scope.style.setProperty("--support-customer-text-color", chatUi.customer_text_color);
  if (chatUi.page_bg_color) scope.style.setProperty("--support-page-bg", chatUi.page_bg_color);
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

async function sendAiMessage() {
  if (!sessionId || ticketCreated || isCreatingTicket) return;

  const text = (supportFreeChatInputEl?.value || "").trim();
  if (!text) return;

  appendChat("customer", text);
  supportFreeChatInputEl.value = "";
  supportFreeChatSendBtn.disabled = true;
  supportFreeChatInputEl.disabled = true;
  setFeedback(supportFeedbackEl, "", "");

  try {
    const res = await apiFetch(`${SUPPORT_API_BASE}/ai-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message: text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(supportFeedbackEl, "error", data.error || "Unable to send message.");
      return;
    }

    const assistantText = (data.message || "").trim();

    const triage = data.triage || null;
    const wasReady = Boolean(lastAiTriage?.should_create_ticket);
    lastAiTriage = triage;
    if (triage) {
      reviewCategoryEl.textContent = `Category: ${triage.category || "-"}`;
      reviewPriorityEl.textContent = `Priority: ${triage.priority || "-"}`;
      reviewSeverityEl.textContent = `Severity: ${triage.severity || "-"}`;
      showReview(true);

      const ready = Boolean(triage.should_create_ticket);
      if (supportCreateTicketBtn) {
        supportCreateTicketBtn.disabled = !ready;
        supportCreateTicketBtn.textContent = ready ? "Create Ticket" : "Keep Chatting...";
      }

      // Avoid spamming the same "press create ticket" prompt every message once ready.
      if (ready && wasReady) readyPromptShown = true;
    }

    // Slow down AI responses slightly to feel more natural.
    const delayMs = 520;
    const shouldShowAssistant =
      assistantText &&
      !(readyPromptShown && assistantText.toLowerCase().includes("press create ticket"));

    if (shouldShowAssistant) {
      setTimeout(() => appendChat("assistant", assistantText), delayMs);
    }

    if (triage?.should_create_ticket) {
      readyPromptShown = true;
    }
  } catch (error) {
    console.error("Support AI message error:", error);
    setFeedback(supportFeedbackEl, "error", "Support assistant is unavailable right now.");
  } finally {
    supportFreeChatSendBtn.disabled = false;
    supportFreeChatInputEl.disabled = false;
  }
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
  const company_slug = (tenantSlug || supportCompanySlugEl?.value || "").trim().toLowerCase();
  const customer_email = supportEmailEl.value.trim().toLowerCase();
  if (!company_slug) {
    setFeedback(supportFeedbackEl, "error", "This support link is missing a tenant.");
    return;
  }
  if (!customer_email) {
    setFeedback(supportFeedbackEl, "error", "Customer email is required.");
    return;
  }

  setFeedback(supportFeedbackEl, "info", "Starting assistant...");
  supportChatEl.innerHTML = "";
  clearOptions();
  showDetailsInput(false);
  showReview(false);
  ticketCreated = false;
  lastAiTriage = null;
  readyPromptShown = false;
  currentStep = "ai";
  supportCreateTicketBtn.disabled = true;
  if (supportCreateTicketBtn) supportCreateTicketBtn.textContent = "Keep Chatting...";

  try {
    const res = await apiFetch(`${SUPPORT_API_BASE}/ai-start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_slug, customer_email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(supportFeedbackEl, "error", data.error || "Unable to start assistant.");
      return;
    }
    sessionId = data.session_id;
    applyCustomerChatUi(data.customer_chat_ui || {});
    if (data.message) appendChat("assistant", data.message);
    setFeedback(supportFeedbackEl, "", "");
    supportFreeChatInputEl?.focus();
  } catch (error) {
    console.error("Support start error:", error);
    setFeedback(supportFeedbackEl, "error", "Support assistant is unavailable right now.");
  }
}

async function submitStep({ option_id = "", details = "", display_text = "" }) {
  if (!sessionId) return;

  if (display_text) appendChat("customer", display_text);

  try {
    const res = await apiFetch(`${SUPPORT_API_BASE}/step`, {
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
    const url = currentStep === "ai" ? `${SUPPORT_API_BASE}/ai-create-ticket` : `${SUPPORT_API_BASE}/create-ticket`;
    if (currentStep === "ai" && !lastAiTriage?.should_create_ticket) {
      setFeedback(supportFeedbackEl, "error", "Please answer the assistant's questions first.");
      supportCreateTicketBtn.disabled = false;
      isCreatingTicket = false;
      return;
    }

    const res = await apiFetch(url, {
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

    const ticketId = ticket._id || "";
    const customerEmail = supportEmailEl.value.trim().toLowerCase();

    if (ticketId) {
      setFeedback(supportFeedbackEl, "success", "Ticket created successfully.");
    } else {
      setFeedback(supportFeedbackEl, "info", "This session already has a ticket.");
    }

    ticketCreated = true;
    supportCreateTicketBtn.disabled = true;
    supportStartBtn.disabled = true;
    if (supportAssistantBodyEl) supportAssistantBodyEl.style.opacity = "0.25";
    if (supportCreatedIdEl) supportCreatedIdEl.value = ticketId;
    if (supportCreatedOverlayEl) supportCreatedOverlayEl.classList.remove("hidden");

    statusTicketIdEl.value = ticketId;
    statusEmailEl.value = customerEmail;
    statusContext = { ticket_id: ticketId, email: customerEmail };
    startStatusAutoRefresh();
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

  statusContext = { ticket_id: ticketId, email };
  setFeedback(statusFeedbackEl, "info", "Checking status...");
  try {
    const res = await apiFetch(`${SUPPORT_API_BASE}/ticket-status?ticket_id=${encodeURIComponent(ticketId)}&email=${encodeURIComponent(email)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(statusFeedbackEl, "error", data.error || "Unable to fetch ticket status.");
      statusResultEl.classList.add("hidden");
      return;
    }

    const ticket = data.ticket || {};
    statusResultEl.classList.remove("hidden");
    renderStatusResult(ticket);
    setFeedback(statusFeedbackEl, "", "");
  } catch (error) {
    console.error("Status check error:", error);
    setFeedback(statusFeedbackEl, "error", "Unable to fetch ticket status right now.");
  }
}

function stopStatusAutoRefresh() {
  if (statusAutoRefreshTimer) {
    clearInterval(statusAutoRefreshTimer);
    statusAutoRefreshTimer = null;
  }
}

function startStatusAutoRefresh() {
  stopStatusAutoRefresh();
  if (!statusContext.ticket_id || !statusContext.email) return;

  statusAutoRefreshTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    // Refresh without spamming the feedback bar.
    apiFetch(`${SUPPORT_API_BASE}/ticket-status?ticket_id=${encodeURIComponent(statusContext.ticket_id)}&email=${encodeURIComponent(statusContext.email)}`)
      .then((res) => res.json().catch(() => ({})).then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok) return;
        const ticket = data.ticket || {};
        statusResultEl.classList.remove("hidden");
        renderStatusResult(ticket);
      })
      .catch(() => {});
  }, 3000);
}

function normalizeSender(sender) {
  const s = String(sender || "").toLowerCase();
  if (s === "customer") return "customer";
  if (s === "assistant" || s === "client") return "assistant";
  return "assistant";
}

function joinedLabelFromMessage(m) {
  const role = String(m?.actor_company_role || "").toLowerCase();
  if (role === "supervisor") return "Supervisor has joined this chat.";
  return "Agent has joined this chat.";
}

function renderStatusResult(ticket) {
  // Preserve any in-progress customer reply draft while we refresh the status panel.
  // Auto-refresh re-renders the status panel HTML, so without this the draft gets wiped mid-typing.
  const prevReplyEl = document.getElementById("status-reply");
  const prevDraft = prevReplyEl ? String(prevReplyEl.value || "") : "";
  const hadFocus = prevReplyEl && document.activeElement === prevReplyEl;
  const prevSelStart = prevReplyEl && typeof prevReplyEl.selectionStart === "number" ? prevReplyEl.selectionStart : null;
  const prevSelEnd = prevReplyEl && typeof prevReplyEl.selectionEnd === "number" ? prevReplyEl.selectionEnd : null;

  const prevChatEl = statusResultEl.querySelector(".support-chat");
  // If the user scrolls up to read older messages, don't yank them back down on every poll.
  // "Stick to bottom" is a user-controlled state (updated by scroll events).
  const shouldStickToBottom = !prevChatEl ? true : (statusStickToBottom && isNearBottom(prevChatEl, 4));
  const prevScrollTop = prevChatEl ? prevChatEl.scrollTop : 0;

  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  const status = String(ticket.status || "").toLowerCase();
  const isResolved = status === "resolved";

  let agentJoinedInserted = false;
  const messagesHtml = messages.length
    ? messages
      .map((m) => {
        const sender = String(m.sender || "").toLowerCase();
        const role = normalizeSender(sender);
        const bubble = `<div class="support-msg ${role}"><p>${escapeHtml(m.text || "")}</p></div>`;

        if (!agentJoinedInserted && sender === "client") {
          agentJoinedInserted = true;
          return `<div class="support-msg system"><p>${escapeHtml(joinedLabelFromMessage(m))}</p></div>${bubble}`;
        }
        return bubble;
      })
      .join("")
    : `<div class="support-msg assistant"><p>No messages yet.</p></div>`;

  statusResultEl.innerHTML = `
    <h4>${escapeHtml(ticket.subject || "Ticket")}</h4>
    <p>Status: <strong>${escapeHtml(ticket.status || "-")}</strong></p>
    <p>Category: ${escapeHtml(ticket.category || "-")}</p>
    <p>Priority: ${escapeHtml(ticket.priority || "-")}</p>
    <p>Severity: ${escapeHtml(ticket.severity || "-")}</p>
    <div class="support-chat" style="margin-top: 12px;">
      ${messagesHtml}
    </div>
    <div style="margin-top: 10px;">
      ${isResolved ? `
        <p class="support-subtitle" style="margin: 10px 0 0;">
          This ticket is resolved. Re-open it to send a new message.
        </p>
        <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
          <button id="status-reopen" class="btn btn-secondary" type="button">Re-open Ticket</button>
        </div>
        <p id="status-reopen-feedback" class="tickets-feedback hidden" aria-live="polite" style="margin-top:10px;"></p>
      ` : `
        <label for="status-reply" style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;">Reply</label>
        <textarea id="status-reply" style="width:100%;border:1px solid #d6dff0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:14px;min-height:86px;resize:vertical;" placeholder="Type your reply..."></textarea>
        <div style="margin-top: 8px; display: flex; justify-content: flex-end;">
          <button id="status-reply-send" class="btn btn-primary" type="button">Send Reply</button>
        </div>
        <p id="status-reply-feedback" class="tickets-feedback hidden" aria-live="polite" style="margin-top:10px;"></p>
      `}
    </div>
  `;

  const chatEl = statusResultEl.querySelector(".support-chat");
  if (shouldStickToBottom) {
    scrollToBottom(chatEl);
  } else if (chatEl) {
    // Keep the reader's position stable during polling refresh.
    chatEl.scrollTop = Math.min(prevScrollTop, Math.max(0, chatEl.scrollHeight - chatEl.clientHeight));
  }
  if (chatEl) {
    // Re-attach scroll handler after every re-render (the element is replaced).
    statusStickToBottom = isNearBottom(chatEl, 4);
    chatEl.addEventListener(
      "scroll",
      () => {
        statusStickToBottom = isNearBottom(chatEl, 4);
      },
      { passive: true }
    );
  }

  // Restore draft text and caret position if the reply box still exists (not resolved view).
  const nextReplyEl = document.getElementById("status-reply");
  if (nextReplyEl && prevDraft && !nextReplyEl.value) {
    nextReplyEl.value = prevDraft;
    if (hadFocus) {
      nextReplyEl.focus();
      if (prevSelStart !== null && prevSelEnd !== null) {
        try {
          nextReplyEl.setSelectionRange(prevSelStart, prevSelEnd);
        } catch (_) {
          // Ignore selection restore failures.
        }
      }
    }
  }

  if (isResolved) {
    const reopenBtn = document.getElementById("status-reopen");
    const reopenFeedbackEl = document.getElementById("status-reopen-feedback");

    reopenBtn?.addEventListener("click", async () => {
      reopenBtn.disabled = true;
      setFeedback(reopenFeedbackEl, "info", "Re-opening...");
      try {
        const res = await apiFetch(`${SUPPORT_API_BASE}/ticket-reopen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticket_id: statusContext.ticket_id,
            email: statusContext.email,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setFeedback(reopenFeedbackEl, "error", data.error || "Unable to re-open ticket.");
          reopenBtn.disabled = false;
          return;
        }
        setFeedback(reopenFeedbackEl, "success", "Ticket reopened.");
        await checkStatus();
        startStatusAutoRefresh();
      } catch (error) {
        console.error("Ticket reopen error:", error);
        setFeedback(reopenFeedbackEl, "error", "Unable to re-open ticket right now.");
        reopenBtn.disabled = false;
      }
    });
    return;
  }

  const sendBtn = document.getElementById("status-reply-send");
  const replyEl = document.getElementById("status-reply");
  const replyFeedbackEl = document.getElementById("status-reply-feedback");

  sendBtn?.addEventListener("click", async () => {
    const message = (replyEl?.value || "").trim();
    if (!message) {
      setFeedback(replyFeedbackEl, "error", "Message is required.");
      return;
    }
    sendBtn.disabled = true;
    setFeedback(replyFeedbackEl, "info", "Sending...");
    try {
      const res = await apiFetch(`${SUPPORT_API_BASE}/ticket-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: statusContext.ticket_id,
          email: statusContext.email,
          message,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback(replyFeedbackEl, "error", data.error || "Unable to send reply.");
        sendBtn.disabled = false;
        return;
      }
      replyEl.value = "";
      setFeedback(replyFeedbackEl, "success", "Reply sent.");
      await checkStatus();
      startStatusAutoRefresh();
    } catch (error) {
      console.error("Ticket reply error:", error);
      setFeedback(replyFeedbackEl, "error", "Unable to send reply right now.");
      sendBtn.disabled = false;
    }
  });

  startStatusAutoRefresh();
}

supportStartBtn?.addEventListener("click", startAssistant);
supportFreeChatSendBtn?.addEventListener("click", sendAiMessage);
supportFreeChatInputEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendAiMessage();
  }
});
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

supportCreatedCopyBtn?.addEventListener("click", async () => {
  const value = (supportCreatedIdEl?.value || "").trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    setFeedback(supportFeedbackEl, "success", "Ticket ID copied.");
    setTimeout(() => setFeedback(supportFeedbackEl, "", ""), 1200);
  } catch (error) {
    supportCreatedIdEl?.focus();
    supportCreatedIdEl?.select();
  }
});

supportCreatedStatusBtn?.addEventListener("click", () => {
  // Scroll to the status panel on the right.
  statusTicketIdEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  checkStatus();
});

supportCreatedNewBtn?.addEventListener("click", () => {
  // Reset assistant UI to start a new session (same tenant + email).
  sessionId = null;
  currentStep = null;
  ticketCreated = false;
  isCreatingTicket = false;
  lastAiTriage = null;
  if (supportCreatedOverlayEl) supportCreatedOverlayEl.classList.add("hidden");
  if (supportAssistantBodyEl) supportAssistantBodyEl.style.opacity = "1";
  if (supportStartBtn) supportStartBtn.disabled = false;
  if (supportChatEl) supportChatEl.innerHTML = "";
  if (supportOptionsEl) supportOptionsEl.innerHTML = "";
  showDetailsInput(false);
  showReview(false);
  setFeedback(supportFeedbackEl, "", "");
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  // Resume polling if a ticket context exists.
  startStatusAutoRefresh();
});

initTenant();


