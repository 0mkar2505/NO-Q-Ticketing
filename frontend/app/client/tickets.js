const API_BASE = "http://127.0.0.1:5000/api/client";
const token = localStorage.getItem("token");

const ticketList = document.getElementById("ticket-list");
const ticketView = document.getElementById("ticket-view");
const messagesDiv = document.getElementById("messages");

let currentTicketId = null;

// Fetch & Render Tickets
async function loadTickets() {
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
  ticketList.innerHTML = "";

  if (tickets.length === 0) {
    ticketList.innerHTML = "<p class=\"no-tickets\">No tickets found</p>";
    return;
  }

  tickets.forEach(ticket => {
    const div = document.createElement("div");
    div.className = "ticket-item";
    div.innerHTML = `
      <span class="ticket-subject">${ticket.subject}</span>
      <span class="ticket-status-badge ${ticket.status}">${ticket.status}</span>
    `;

    div.onclick = () => openTicket(ticket);
    ticketList.appendChild(div);
  });
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

  document.getElementById("resolve-ticket").style.display =
    ticket.status === "resolved" ? "none" : "block";
}

// Reply to Ticket
document.getElementById("send-reply").onclick = async () => {
  const text = document.getElementById("reply-box").value.trim();
  if (!text || !currentTicketId) return;

  await fetch(`${API_BASE}/tickets/${currentTicketId}/reply`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message: text })
  });

  document.getElementById("reply-box").value = "";
  loadTickets(); // refresh state
  ticketView.classList.add("hidden");
};

// Resolve Ticket
document.getElementById("resolve-ticket").onclick = async () => {
  if (!currentTicketId) return;

  await fetch(`${API_BASE}/tickets/${currentTicketId}/resolve`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  loadTickets();
  ticketView.classList.add("hidden");
  currentTicketId = null;
};
