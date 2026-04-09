const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  window.location.href = "index.html";
});

const canvas = document.getElementById("drawCanvas");
const ctx = canvas.getContext("2d");
const inkCanvas = document.createElement("canvas");
const inkCtx = inkCanvas.getContext("2d");

const statusEl = document.getElementById("drawStatus");
const toolEl = document.getElementById("drawTool");
const colorEl = document.getElementById("drawColor");
const sizeEl = document.getElementById("drawSize");
const opacityEl = document.getElementById("drawOpacity");
const bgEl = document.getElementById("drawBg");
const undoEl = document.getElementById("drawUndo");
const redoEl = document.getElementById("drawRedo");
const clearEl = document.getElementById("drawClear");
const saveEl = document.getElementById("drawSave");

const STORAGE_KEY = `fcapp_drawings_${user}`;
const MAX_HISTORY = 40;

function nowIso() {
  return new Date().toISOString();
}

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

function createId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

// Crisp lines on HiDPI
function setupDpr() {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  if (!canvas.dataset.cssW) canvas.dataset.cssW = String(canvas.getAttribute("width") || "940");
  if (!canvas.dataset.cssH) canvas.dataset.cssH = String(canvas.getAttribute("height") || "560");
  const cssW = Number(canvas.dataset.cssW) || 940;
  const cssH = Number(canvas.dataset.cssH) || 560;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  inkCanvas.width = Math.floor(cssW * dpr);
  inkCanvas.height = Math.floor(cssH * dpr);
  inkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { dpr, cssW, cssH };
}

let dprInfo = setupDpr();

let bgColor = bgEl.value;
let drawing = false;
let lastPt = null;
let history = [];
let historyIdx = -1;

function render() {
  const w = dprInfo.cssW || 940;
  const h = dprInfo.cssH || 560;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(inkCanvas, 0, 0, w, h);
  ctx.restore();
}

function snapshot() {
  const ink = inkCanvas.toDataURL("image/png");
  history = history.slice(0, historyIdx + 1);
  history.push({ ink, bgColor });
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
  historyIdx = history.length - 1;
  updateUndoRedo();
}

function restoreFrom(inkDataUrl, nextBg) {
  const img = new Image();
  img.onload = () => {
    inkCtx.save();
    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
    inkCtx.restore();

    inkCtx.setTransform(dprInfo.dpr, 0, 0, dprInfo.dpr, 0, 0);
    bgColor = nextBg || bgColor;
    bgEl.value = bgColor;
    inkCtx.drawImage(img, 0, 0, dprInfo.cssW || 940, dprInfo.cssH || 560);
    render();
  };
  img.src = inkDataUrl;
}

function updateUndoRedo() {
  undoEl.disabled = historyIdx <= 0;
  redoEl.disabled = historyIdx >= history.length - 1;
}

function resetCanvas() {
  dprInfo = setupDpr();
  inkCtx.save();
  inkCtx.setTransform(1, 0, 0, 1, 0, 0);
  inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
  inkCtx.restore();
  inkCtx.setTransform(dprInfo.dpr, 0, 0, dprInfo.dpr, 0, 0);
  render();
  snapshot();
  setStatus("Ready.");
}

function getPointer(ev) {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (dprInfo.cssW / rect.width);
  const y = (ev.clientY - rect.top) * (dprInfo.cssH / rect.height);
  return { x, y };
}

function applyBrushStyle() {
  const tool = toolEl.value;
  const size = Number(sizeEl.value) || 10;
  const opacity = Number(opacityEl.value) || 1;
  const color = colorEl.value || "#3be6c1";

  inkCtx.lineCap = "round";
  inkCtx.lineJoin = "round";
  inkCtx.lineWidth = size;
  inkCtx.globalAlpha = tool === "marker" ? Math.min(0.45, opacity) : opacity;
  if (tool === "eraser") {
    inkCtx.globalAlpha = 1;
    inkCtx.globalCompositeOperation = "destination-out";
    inkCtx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    inkCtx.globalCompositeOperation = "source-over";
    inkCtx.strokeStyle = color;
  }
}

function beginStroke(p) {
  drawing = true;
  lastPt = p;
  inkCtx.beginPath();
  inkCtx.moveTo(p.x, p.y);
}

function strokeTo(p) {
  if (!drawing || !lastPt) return;
  applyBrushStyle();
  // simple smoothing by midpoint
  const mid = { x: (lastPt.x + p.x) / 2, y: (lastPt.y + p.y) / 2 };
  inkCtx.quadraticCurveTo(lastPt.x, lastPt.y, mid.x, mid.y);
  inkCtx.stroke();
  lastPt = p;
  render();
}

function endStroke() {
  if (!drawing) return;
  drawing = false;
  lastPt = null;
  snapshot();
}

canvas.addEventListener("pointerdown", (ev) => {
  ev.preventDefault();
  canvas.setPointerCapture?.(ev.pointerId);
  beginStroke(getPointer(ev));
});
canvas.addEventListener("pointermove", (ev) => {
  if (!drawing) return;
  strokeTo(getPointer(ev));
});
canvas.addEventListener("pointerup", () => endStroke());
canvas.addEventListener("pointercancel", () => endStroke());

bgEl.addEventListener("change", () => {
  bgColor = bgEl.value;
  render();
  snapshot();
});

undoEl.addEventListener("click", () => {
  if (historyIdx <= 0) return;
  historyIdx -= 1;
  const s = history[historyIdx];
  restoreFrom(s.ink, s.bgColor);
  updateUndoRedo();
});

redoEl.addEventListener("click", () => {
  if (historyIdx >= history.length - 1) return;
  historyIdx += 1;
  const s = history[historyIdx];
  restoreFrom(s.ink, s.bgColor);
  updateUndoRedo();
});

clearEl.addEventListener("click", () => {
  inkCtx.save();
  inkCtx.setTransform(1, 0, 0, 1, 0, 0);
  inkCtx.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
  inkCtx.restore();
  inkCtx.setTransform(dprInfo.dpr, 0, 0, dprInfo.dpr, 0, 0);
  render();
  snapshot();
  setStatus("Cleared.");
});

saveEl.addEventListener("click", () => {
  const name = (prompt("Name your drawing:", `Drawing ${new Date().toLocaleString()}`) || "").trim();
  if (!name) return;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = inkCanvas.width;
  exportCanvas.height = inkCanvas.height;
  const exportCtx = exportCanvas.getContext("2d");
  exportCtx.save();
  exportCtx.setTransform(1, 0, 0, 1, 0, 0);
  exportCtx.fillStyle = bgColor;
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  exportCtx.restore();
  exportCtx.drawImage(inkCanvas, 0, 0);
  const dataUrl = exportCanvas.toDataURL("image/png");

  const drawings = loadLibrary();
  if (drawings.length >= 30) {
    setStatus("Library is full (30). Rename/view only in library.");
    return;
  }

  const entry = {
    id: createId(),
    name,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    bgColor,
    dataUrl,
    w: dprInfo.cssW || 940,
    h: dprInfo.cssH || 560,
  };

  drawings.unshift(entry);
  try {
    saveLibrary(drawings);
    setStatus(`Saved to library: ${name}`);
  } catch (err) {
    console.warn("Save failed:", err);
    setStatus("Could not save (storage full).");
  }
});

window.addEventListener("resize", () => {
  // Keep it stable: no live resizing, but ensure dpr stays correct if zoom changes.
  const current = historyIdx >= 0 ? history[historyIdx] : null;
  dprInfo = setupDpr();
  inkCtx.setTransform(dprInfo.dpr, 0, 0, dprInfo.dpr, 0, 0);
  if (current) restoreFrom(current.ink, current.bgColor);
});

resetCanvas();
