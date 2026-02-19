const API_BASE = "/api/client";
const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;
const BACKEND_FALLBACK_ORIGIN = "http://127.0.0.1:5000";

const feedbackEl = document.getElementById("create-ticket-feedback");
const createSubjectEl = document.getElementById("create-subject");
const createCustomerEmailEl = document.getElementById("create-customer-email");
const createMessageEl = document.getElementById("create-message");
const createTicketBtn = document.getElementById("create-ticket-btn");

let isCreating = false;

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

function setCreateState(isBusy) {
  isCreating = isBusy;
  if (!createTicketBtn) return;
  createTicketBtn.disabled = isBusy;
  createTicketBtn.textContent = isBusy ? "Creating..." : "Create Ticket";
}

async function createTicket() {
  if (!token) {
    window.location.href = loginPath;
    return;
  }
  if (isCreating) return;

  const subject = createSubjectEl?.value.trim();
  const customer_email = createCustomerEmailEl?.value.trim().toLowerCase();
  const message = createMessageEl?.value.trim();

  if (!subject || !customer_email || !message) {
    setFeedback("error", "Subject, customer email, and message are required.");
    return;
  }

  setCreateState(true);
  setFeedback("", "");

  try {
    const res = await apiFetch(`${API_BASE}/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject, customer_email, message }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = loginPath;
        return;
      }
      setFeedback("error", data.error || "Unable to create ticket.");
      return;
    }

    setFeedback("success", `Ticket created (${data.ticket?._id || "new"}).`);
    createSubjectEl.value = "";
    createCustomerEmailEl.value = "";
    createMessageEl.value = "";
  } catch (error) {
    console.error("Create ticket error:", error);
    setFeedback("error", "Unable to create ticket right now.");
  } finally {
    setCreateState(false);
  }
}

createTicketBtn?.addEventListener("click", createTicket);


