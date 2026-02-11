const API_BASE = "http://127.0.0.1:5000/api/client";
const token = localStorage.getItem("token");

const ticketList = document.getElementById("ticket-list");
const ticketView = document.getElementById("ticket-view");
const messagesDiv = document.getElementById("messages");
const replyBox = document.getElementById("reply-box");
const sendReplyBtn = document.getElementById("send-reply");
const resolveBtn = document.getElementById("resolve-ticket");

let currentTicketId = null;
let ticketCache = [];

// Fetch & Render Tickets
async function loadTickets() {
  if (!token) {
    console.error("Missing auth token");
    return;
  }

  const res = await fetch(`${API_BASE}/tickets`, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  if (!res.ok) {
    console.error("Failed to fetch tickets");
    return;
  }

  const tickets = await res.json();
  ticketCache = Array.isArray(tickets) ? tickets : [];
  ticketList.innerHTML = "";

  if (ticketCache.length === 0) {
    ticketList.innerHTML = "<p class=\"no-tickets\">No tickets found</p>";
    ticketView.classList.add("hidden");
    currentTicketId = null;
    return;
  }

  ticketCache.forEach(ticket => {
    const div = document.createElement("div");
    div.className = "ticket-item";
    if (ticket._id === currentTicketId) {
      div.classList.add("active");
    }
    div.innerHTML = `
      <span class="ticket-subject">${ticket.subject}</span>
      <span class="ticket-status-badge ${ticket.status}">${ticket.status}</span>
    `;

    div.onclick = () => openTicket(ticket);
    ticketList.appendChild(div);
  });

  if (currentTicketId) {
    const updated = ticketCache.find(t => t._id === currentTicketId);
    if (updated) {
      openTicket(updated);
    }
  }
}

loadTickets();

// Open Ticket & Render Conversation
function openTicket(ticket) {
  currentTicketId = ticket._id;
  ticketView.classList.remove("hidden");

  document.getElementById("ticket-subject").textContent = ticket.subject;
  const statusEl = document.getElementById("ticket-status");
  statusEl.textContent = ticket.status;
  statusEl.className = `ticket-status ${ticket.status}`;

  messagesDiv.innerHTML = "";

  if (ticket.messages && ticket.messages.length > 0) {
    ticket.messages.forEach(msg => {
      const m = document.createElement("div");
      m.className = `message ${msg.sender}`;
      m.innerHTML = `<strong>${msg.sender}</strong>: ${msg.text}<br><small>${new Date(msg.timestamp).toLocaleString()}</small>`;
      messagesDiv.appendChild(m);
    });
  } else {
    messagesDiv.innerHTML = "<p class=\"no-messages\">No messages yet</p>";
  }

  const isResolved = ticket.status === "resolved";
  resolveBtn.style.display = isResolved ? "none" : "block";
  replyBox.disabled = isResolved;
  sendReplyBtn.disabled = isResolved;
}

// Reply to Ticket
sendReplyBtn.onclick = async () => {
  const text = replyBox.value.trim();
  if (!text || !currentTicketId) return;

  const res = await fetch(`${API_BASE}/tickets/${currentTicketId}/reply`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message: text })
  });

  if (!res.ok) {
    console.error("Failed to send reply");
    return;
  }

  replyBox.value = "";
  await loadTickets();
};

// Resolve Ticket
resolveBtn.onclick = async () => {
  if (!currentTicketId) return;

  const res = await fetch(`${API_BASE}/tickets/${currentTicketId}/resolve`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  if (!res.ok) {
    console.error("Failed to resolve ticket");
    return;
  }

  await loadTickets();
};
