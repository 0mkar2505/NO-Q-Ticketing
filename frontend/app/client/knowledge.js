const API_BASE = "/api/client/knowledge";
const token = localStorage.getItem("token");
const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
const loginPath = `${pathBase}/auth/login.html`;
const apiFetch = (path, options = {}) =>
  (window.NOQ && typeof window.NOQ.apiFetch === "function")
    ? window.NOQ.apiFetch(path, options)
    : fetch(path, options);

const feedbackEl = document.getElementById("knowledge-feedback");
const searchEl = document.getElementById("knowledge-search");
const newBtn = document.getElementById("knowledge-new");
const itemsEl = document.getElementById("knowledge-items");

const titleEl = document.getElementById("knowledge-title");
const tagsEl = document.getElementById("knowledge-tags");
const contentEl = document.getElementById("knowledge-content");
const saveBtn = document.getElementById("knowledge-save");
const deleteBtn = document.getElementById("knowledge-delete");

let entries = [];
let currentId = null;
let isSaving = false;
let searchTimer = null;

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

function parseTags(text) {
  const raw = String(text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const t of raw) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

function clearEditor() {
  currentId = null;
  titleEl.value = "";
  tagsEl.value = "";
  contentEl.value = "";
  deleteBtn.disabled = true;
}

function loadIntoEditor(entry) {
  currentId = entry?._id || null;
  titleEl.value = entry?.title || "";
  tagsEl.value = Array.isArray(entry?.tags) ? entry.tags.join(", ") : "";
  contentEl.value = entry?.content || "";
  deleteBtn.disabled = !currentId;
}

function renderList() {
  if (!itemsEl) return;
  if (!entries.length) {
    itemsEl.innerHTML = `<p class="no-tickets">No knowledge entries yet.</p>`;
    return;
  }

  itemsEl.innerHTML = entries.map((e) => {
    const active = e._id === currentId ? " knowledge-item--active" : "";
    const tagText = Array.isArray(e.tags) && e.tags.length ? e.tags.join(", ") : "";
    return `
      <div class="knowledge-item${active}" data-id="${escapeHtml(e._id)}">
        <strong class="knowledge-item-title">${escapeHtml(e.title || "Untitled")}</strong>
        <div class="knowledge-item-meta">${escapeHtml(tagText)}</div>
      </div>
    `;
  }).join("");

  itemsEl.querySelectorAll(".knowledge-item").forEach((node) => {
    node.addEventListener("click", () => {
      const id = node.getAttribute("data-id");
      const entry = entries.find((x) => x._id === id);
      if (entry) loadIntoEditor(entry);
      renderList();
    });
  });
}

async function fetchEntries(query = "") {
  if (!token) {
    window.location.href = loginPath;
    return;
  }

  try {
    const url = query ? `${API_BASE}?q=${encodeURIComponent(query)}` : API_BASE;
    const res = await apiFetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = loginPath;
        return;
      }
      setFeedback("error", data.error || "Unable to load knowledge entries.");
      return;
    }

    entries = Array.isArray(data.entries) ? data.entries : [];
    // If current selection disappeared, clear editor.
    if (currentId && !entries.some((e) => e._id === currentId)) clearEditor();
    renderList();
  } catch (error) {
    console.error("Knowledge fetch error:", error);
    setFeedback("error", "Unable to load knowledge entries right now.");
  }
}

async function saveEntry() {
  if (isSaving) return;
  const title = titleEl.value.trim();
  const content = contentEl.value.trim();
  const tags = parseTags(tagsEl.value);

  if (!title) {
    setFeedback("error", "Title is required.");
    return;
  }
  if (!content) {
    setFeedback("error", "Content is required.");
    return;
  }

  isSaving = true;
  saveBtn.disabled = true;
  setFeedback("info", "Saving...");

  try {
    const isUpdate = Boolean(currentId);
    const res = await apiFetch(isUpdate ? `${API_BASE}/${currentId}` : API_BASE, {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, content, tags }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback("error", data.error || "Unable to save entry.");
      return;
    }

    const entry = data.entry;
    setFeedback("success", "Saved.");
    await fetchEntries(searchEl.value.trim());
    if (entry && entry._id) {
      const found = entries.find((e) => e._id === entry._id);
      if (found) loadIntoEditor(found);
    }
    renderList();
  } catch (error) {
    console.error("Knowledge save error:", error);
    setFeedback("error", "Unable to save right now.");
  } finally {
    isSaving = false;
    saveBtn.disabled = false;
    setTimeout(() => setFeedback("", ""), 900);
  }
}

async function deleteEntry() {
  if (!currentId) return;
  const ok = confirm("Delete this knowledge entry?");
  if (!ok) return;

  deleteBtn.disabled = true;
  setFeedback("info", "Deleting...");

  try {
    const res = await apiFetch(`${API_BASE}/${currentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback("error", data.error || "Unable to delete entry.");
      deleteBtn.disabled = false;
      return;
    }
    clearEditor();
    await fetchEntries(searchEl.value.trim());
    setFeedback("success", "Deleted.");
    setTimeout(() => setFeedback("", ""), 900);
  } catch (error) {
    console.error("Knowledge delete error:", error);
    setFeedback("error", "Unable to delete right now.");
    deleteBtn.disabled = false;
  }
}

newBtn?.addEventListener("click", () => {
  clearEditor();
  renderList();
  titleEl.focus();
});

saveBtn?.addEventListener("click", saveEntry);
deleteBtn?.addEventListener("click", deleteEntry);

searchEl?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => fetchEntries(searchEl.value.trim()), 250);
});

clearEditor();
fetchEntries("");

