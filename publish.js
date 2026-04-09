import { database, ref, push, set } from "./firebase.js";

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

const formEl = document.getElementById("publishForm");
const nameEl = document.getElementById("gameName");
const descEl = document.getElementById("gameDesc");
const htmlEl = document.getElementById("gameHtml");
const frameEl = document.getElementById("previewFrame");
const statusEl = document.getElementById("status");
const publishBtn = document.getElementById("publishBtn");

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

function clampText(value, maxLen) {
  const s = String(value || "").trim();
  if (!maxLen) return s;
  return s.slice(0, Math.max(0, maxLen));
}

function makeSrcdoc(userHtml) {
  const baseCss = `
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; background: #0b1d35; color: rgba(255,255,255,0.92); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      canvas { display: block; margin: 0 auto; background: rgba(255,255,255,0.06); }
    </style>
  `;
  const safe = String(userHtml || "").slice(0, 50_000);
  return `<!doctype html><meta charset="utf-8">${baseCss}${safe}`;
}

let previewTimer = null;
function schedulePreview() {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    frameEl.srcdoc = makeSrcdoc(htmlEl.value || "");
  }, 120);
}

htmlEl.addEventListener("input", schedulePreview);
descEl.addEventListener("input", () => {
  // no-op; keeps consistent feel if we add live meta preview later
});

// Initial preview (empty)
schedulePreview();

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("", null);

  const name = clampText(nameEl.value, 40);
  const description = clampText(descEl.value, 200);
  const html = String(htmlEl.value || "").trim().slice(0, 50_000);

  if (!name) {
    setStatus("Name is required.", "error");
    return;
  }

  if (!html) {
    setStatus("Paste some HTML/JS for your game first.", "error");
    return;
  }

  publishBtn.disabled = true;
  nameEl.disabled = true;
  descEl.disabled = true;
  htmlEl.disabled = true;

  try {
    const gamesRef = ref(database, "publishedGames");
    const newRef = push(gamesRef);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    await set(newRef, {
      owner: user,
      name,
      description,
      html,
      createdAt: nowIso,
      createdAtMs: nowMs,
      updatedAt: nowIso,
      updatedAtMs: nowMs,
    });

    setStatus("Published.", "ok");
    window.location.href = `play.html?id=${encodeURIComponent(newRef.key)}`;
  } catch (err) {
    setStatus(err?.message || String(err), "error");
  } finally {
    publishBtn.disabled = false;
    nameEl.disabled = false;
    descEl.disabled = false;
    htmlEl.disabled = false;
  }
});

