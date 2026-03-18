const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  window.location.href = "index.html";
});

const STORAGE_KEY = `fcapp_drawings_${user}`;

const emptyEl = document.getElementById("libEmpty");
const gridEl = document.getElementById("libGrid");

const modalEl = document.getElementById("libModal");
const modalTitleEl = document.getElementById("libModalTitle");
const modalImgEl = document.getElementById("libModalImg");

function loadLibrary() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveLibrary(drawings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drawings));
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openModal(title, dataUrl) {
  modalTitleEl.textContent = title || "View";
  modalImgEl.src = dataUrl;
  modalEl.hidden = false;
  modalEl.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modalEl.hidden = true;
  modalEl.setAttribute("aria-hidden", "true");
  modalImgEl.src = "";
}

modalEl.addEventListener("click", (e) => {
  const t = e.target;
  if (t?.dataset?.close) closeModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalEl.hidden) closeModal();
});

function render() {
  const list = loadLibrary();
  gridEl.innerHTML = "";
  emptyEl.hidden = list.length !== 0;

  for (const d of list) {
    const card = document.createElement("div");
    card.className = "library-card";
    card.innerHTML = `
      <button class="library-card__thumb" type="button" aria-label="View ${escapeHtml(d.name)}">
        <img class="library-card__img" alt="${escapeHtml(d.name)}" />
      </button>
      <div class="library-card__body">
        <div class="library-card__name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
        <div class="library-card__meta">${new Date(d.createdAt || Date.now()).toLocaleString()}</div>
        <div class="library-card__actions">
          <button class="btn-quiet btn-quiet--sm" type="button" data-act="view">View</button>
          <button class="btn-quiet btn-quiet--sm" type="button" data-act="rename">Rename</button>
        </div>
      </div>
    `;

    const img = card.querySelector(".library-card__img");
    img.src = d.dataUrl || "";

    card.querySelectorAll("[data-act='view'], .library-card__thumb").forEach((el) => {
      el.addEventListener("click", () => openModal(d.name, d.dataUrl || ""));
    });

    card.querySelector("[data-act='rename']").addEventListener("click", () => {
      const next = (prompt("Rename drawing:", d.name) || "").trim();
      if (!next) return;
      const drawings = loadLibrary();
      const idx = drawings.findIndex((x) => x.id === d.id);
      if (idx < 0) return;
      drawings[idx] = { ...drawings[idx], name: next, updatedAt: new Date().toISOString() };
      saveLibrary(drawings);
      render();
    });

    gridEl.appendChild(card);
  }
}

render();
