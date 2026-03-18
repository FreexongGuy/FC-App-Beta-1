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

let allGames = [];

function render() {
  const q = String(searchEl.value || "").trim().toLowerCase();
  const filtered = q
    ? allGames.filter((g) => {
        const hay = `${g.name}\n${g.description}\n${g.owner}`.toLowerCase();
        return hay.includes(q);
      })
    : allGames;

  listEl.innerHTML = "";
  emptyEl.hidden = filtered.length !== 0;

  for (const g of filtered) {
    const li = document.createElement("li");
    li.className = "game-card";
    li.innerHTML = `
      <div class="game-card__title">${escapeHtml(g.name || "Untitled")}</div>
      <div class="game-card__desc">${escapeHtml(g.description || "")}</div>
      <div class="game-card__meta">By ${escapeHtml(g.owner || "unknown")}</div>
      <a class="btn-quiet btn-quiet--sm" href="play.html?id=${encodeURIComponent(g.id)}">Play</a>
    `;
    listEl.appendChild(li);
  }
}

searchEl.addEventListener("input", render);

async function load() {
  setStatus("Loading…", null);
  try {
    const snap = await get(ref(database, "publishedGames"));
    const raw = snap.exists() ? snap.val() || {} : {};
    const list = [];
    for (const [id, v] of Object.entries(raw)) {
      if (!v || typeof v !== "object") continue;
      list.push({
        id,
        owner: typeof v.owner === "string" ? v.owner : "",
        name: typeof v.name === "string" ? v.name : "",
        description: typeof v.description === "string" ? v.description : "",
        createdAtMs: Number(v.createdAtMs) || 0,
      });
    }
    list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    allGames = list;
    setStatus("", null);
    render();
  } catch (err) {
    allGames = [];
    render();
    setStatus(err?.message || String(err), "error");
  }
}

load();

