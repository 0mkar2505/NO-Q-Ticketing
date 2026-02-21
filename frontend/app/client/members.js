const API_BASE = "/api/client/members";
const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

const feedbackEl = document.getElementById("members-feedback");
const countEl = document.getElementById("members-count");
const bodyEl = document.getElementById("members-body");

const nameEl = document.getElementById("memberName");
const emailEl = document.getElementById("memberEmail");
const passEl = document.getElementById("memberPassword");
const createBtn = document.getElementById("memberCreateBtn");

let isCreating = false;

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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function handleAuthFailure(res) {
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = loginPath;
    return true;
  }
  if (res.status === 403) {
    // Agents cannot access members management.
    window.location.href = `${pathBase}/app/client/tickets.html`;
    return true;
  }
  return false;
}

function renderMembers(members) {
  if (!bodyEl) return;
  const list = Array.isArray(members) ? members : [];
  if (countEl) countEl.textContent = String(list.length);

  if (!list.length) {
    bodyEl.innerHTML = `<tr><td colspan="6">No members yet.</td></tr>`;
    return;
  }

  bodyEl.innerHTML = list
    .map((m) => {
      const active = m.is_active ? "active" : "inactive";
      const role = (m.company_role || "-").toString();
      const isAgent = role.toLowerCase() === "agent";
      const canRemove = isAgent && m.is_active;
      const removeBtn = canRemove
        ? `<button class="btn btn-secondary member-remove" data-id="${escapeHtml(m.id)}" type="button">Remove</button>`
        : `<span class="settings-copy">-</span>`;
      return `
        <tr>
          <td>${escapeHtml(m.name || "-")}</td>
          <td>${escapeHtml(m.email || "-")}</td>
          <td><span class="member-chip member-chip--${escapeHtml(role.toLowerCase())}">${escapeHtml(role)}</span></td>
          <td><span class="member-chip member-chip--${active}">${active}</span></td>
          <td>${escapeHtml(fmtDate(m.created_at))}</td>
          <td>${removeBtn}</td>
        </tr>
      `;
    })
    .join("");

  bodyEl.querySelectorAll(".member-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (!id) return;
      const ok = confirm("Remove this agent? They will no longer be able to sign in.");
      if (!ok) return;
      btn.disabled = true;
      btn.textContent = "Removing...";
      setFeedback("info", "Removing agent...");
      try {
        const res = await apiFetch(`${API_BASE}/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (handleAuthFailure(res)) return;
          setFeedback("error", data.error || "Unable to remove agent.");
          btn.disabled = false;
          btn.textContent = "Remove";
          return;
        }
        setFeedback("success", "Agent removed.");
        loadMembers({ silent: true });
      } catch (e) {
        setFeedback("error", "Unable to remove agent right now.");
        btn.disabled = false;
        btn.textContent = "Remove";
      }
    });
  });
}

async function loadMembers({ silent = false } = {}) {
  if (!token) {
    window.location.href = loginPath;
    return;
  }
  if (!silent) setFeedback("info", "Loading members...");

  try {
    const res = await apiFetch(API_BASE, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (handleAuthFailure(res)) return;
      const data = await res.json().catch(() => ({}));
      setFeedback("error", data.error || "Unable to load members.");
      return;
    }
    const data = await res.json().catch(() => ({}));
    renderMembers(data.members || []);
    if (!silent) setFeedback("", "");
  } catch (e) {
    if (!silent) setFeedback("error", "Unable to load members right now.");
  }
}

async function createMember() {
  if (isCreating) return;
  const name = (nameEl?.value || "").trim();
  const email = (emailEl?.value || "").trim().toLowerCase();
  const password = (passEl?.value || "").trim();

  if (!name) return setFeedback("error", "Name is required.");
  if (!email || !email.includes("@")) return setFeedback("error", "Valid email is required.");
  if (!password || password.length < 8) return setFeedback("error", "Password must be at least 8 characters.");

  isCreating = true;
  if (createBtn) {
    createBtn.disabled = true;
    createBtn.textContent = "Creating...";
  }
  setFeedback("", "");

  try {
    const res = await apiFetch(API_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, email, password, company_role: "agent" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (handleAuthFailure(res)) return;
      setFeedback("error", data.error || "Unable to create member.");
      return;
    }

    setFeedback("success", "Member created.");
    if (nameEl) nameEl.value = "";
    if (emailEl) emailEl.value = "";
    if (passEl) passEl.value = "";
    await loadMembers({ silent: true });
  } catch (e) {
    setFeedback("error", "Unable to create member right now.");
  } finally {
    isCreating = false;
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.textContent = "Create Member";
    }
  }
}

createBtn?.addEventListener("click", createMember);
loadMembers();
