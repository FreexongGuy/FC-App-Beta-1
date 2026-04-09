const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

if (localStorage.getItem("fcapp_dev") !== "1") {
  window.location.href = "developerverification.html";
}

const signoutEl = document.getElementById("signout");
const statusEl = document.getElementById("status");
const toggleEl = document.getElementById("noConfirmDeleteMsg");
const toggleAnnEl = document.getElementById("noConfirmDeleteAnn");
const showAnnEl = document.getElementById("showAnnInChat");

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

signoutEl.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

const KEY = "fcapp_utils_no_confirm_delete_message";
const ANN_KEY = "fcapp_utils_no_confirm_delete_announcement";
const SHOW_ANN_KEY = "fcapp_chat_show_announcements";

function load() {
  toggleEl.checked = localStorage.getItem(KEY) === "1";
  toggleAnnEl.checked = localStorage.getItem(ANN_KEY) === "1";
  showAnnEl.checked = localStorage.getItem(SHOW_ANN_KEY) === "1";
}

toggleEl.addEventListener("change", () => {
  localStorage.setItem(KEY, toggleEl.checked ? "1" : "0");
  setStatus("Saved.", "ok");
});

toggleAnnEl.addEventListener("change", () => {
  localStorage.setItem(ANN_KEY, toggleAnnEl.checked ? "1" : "0");
  setStatus("Saved.", "ok");
});

showAnnEl.addEventListener("change", () => {
  localStorage.setItem(SHOW_ANN_KEY, showAnnEl.checked ? "1" : "0");
  setStatus("Saved.", "ok");
});

load();
