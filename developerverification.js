const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

const formEl = document.getElementById("dev-form");
const passEl = document.getElementById("dev-pass");
const statusEl = document.getElementById("status");

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

if (localStorage.getItem("fcapp_dev") === "1") {
  window.location.href = "utils.html";
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  setStatus("", null);

  const pw = String(passEl.value || "");
  if (pw === "XXX333") {
    localStorage.setItem("fcapp_dev", "1");
    localStorage.setItem("fcapp_dev_at", String(Date.now()));
    window.location.href = "utils.html";
    return;
  }

  setStatus("Incorrect password.", "error");
  passEl.select();
});

