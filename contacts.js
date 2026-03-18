import { database, ref, get } from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

const searchEl = document.getElementById("search");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const statusEl = document.getElementById("status");

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let allUsers = [];

function render() {
  const q = String(searchEl.value || "").trim().toLowerCase();
  const filtered = q
    ? allUsers.filter((u) => u.toLowerCase().includes(q))
    : allUsers;

  listEl.innerHTML = "";
  emptyEl.hidden = filtered.length !== 0;

  for (const u of filtered) {
    const li = document.createElement("li");
    li.className = "game-card";
    const isMe = u === user;
    li.innerHTML = `
      <div class="game-card__title">${escapeHtml(isMe ? `${u} (you)` : u)}</div>
      <div class="game-card__meta">Private messaging</div>
      <div class="contact-actions">
        <a class="btn-quiet btn-quiet--sm" href="dm.html?to=${encodeURIComponent(u)}"${isMe ? ' aria-disabled="true"' : ""}>Message</a>
        <a class="btn-quiet btn-quiet--sm" href="profile.html?user=${encodeURIComponent(u)}">Profile</a>
        <a class="btn-quiet btn-quiet--sm" href="call.html">Call room</a>
      </div>
    `;
    if (isMe) {
      const msgLink = li.querySelector('a[href^="dm.html"]');
      msgLink?.classList.add("hub-tile--disabled");
      msgLink?.addEventListener("click", (e) => e.preventDefault());
    }
    listEl.appendChild(li);
  }
}

searchEl.addEventListener("input", render);

async function load() {
  setStatus("Loading…", null);
  try {
    const snap = await get(ref(database, "users"));
    const raw = snap.exists() ? snap.val() || {} : {};
    const list = Object.keys(raw)
      .map((k) => String(k || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    allUsers = list;
    setStatus("", null);
    render();
  } catch (err) {
    allUsers = [];
    render();
    setStatus(err?.message || String(err), "error");
  }
}

load();
