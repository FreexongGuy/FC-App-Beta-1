import { database, ref, get } from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

const signoutEl = document.getElementById("signout");
const statusEl = document.getElementById("status");

signoutEl.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

let inFlight = false;
async function checkShutdown() {
  if (inFlight) return;
  inFlight = true;
  try {
    const snap = await get(ref(database, "config/chatShutdown"));
    const isShutdown = snap.exists() ? Boolean(snap.val()) : false;
    if (!isShutdown) {
      window.location.href = "chat.html";
      return;
    }
    setStatus("Waiting for reopen…", null);
  } catch (err) {
    setStatus(err?.message || String(err), "error");
  } finally {
    inFlight = false;
  }
}

checkShutdown();
const interval = window.setInterval(checkShutdown, 500);
window.addEventListener("beforeunload", () => window.clearInterval(interval));
