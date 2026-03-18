import { database, ref, push, set } from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) window.location.href = "index.html";

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

const titleEl = document.getElementById("title");
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const toolLabelEl = document.getElementById("toolLabel");
const toolSelectEl = document.getElementById("toolSelect");
const toolRectEl = document.getElementById("toolRect");
const toolCircleEl = document.getElementById("toolCircle");
const toolSpawnEl = document.getElementById("toolSpawn");
const toolGoalEl = document.getElementById("toolGoal");
const delObjEl = document.getElementById("delObj");
const playBtnEl = document.getElementById("playBtn");
const stopBtnEl = document.getElementById("stopBtn");

const gameNameEl = document.getElementById("gameName");
const gameDescEl = document.getElementById("gameDesc");
const gravityEl = document.getElementById("gravity");
const statusEl = document.getElementById("status");
const saveBtnEl = document.getElementById("saveBtn");
const publishBtnEl = document.getElementById("publishBtn");

const noSelectionEl = document.getElementById("noSelection");
const inspectorEl = document.getElementById("inspector");
const objTypeEl = document.getElementById("objType");
const objXEl = document.getElementById("objX");
const objYEl = document.getElementById("objY");
const objWEl = document.getElementById("objW");
const objHEl = document.getElementById("objH");
const objColorEl = document.getElementById("objColor");
const objSolidEl = document.getElementById("objSolid");

titleEl.textContent = `2D Studio • ${user}`;

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

function clampText(value, maxLen) {
  const s = String(value || "").trim();
  return maxLen ? s.slice(0, Math.max(0, maxLen)) : s;
}

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

const STORAGE_KEY = `fcapp_studio2d_${user}`;

const state = {
  tool: "select", // select | rect | circle | spawn | goal
  zoom: 1,
  panX: 0,
  panY: 0,
  objects: [],
  selectedId: null,
  playing: false,
  player: { x: 60, y: 60, vx: 0, vy: 0, w: 28, h: 28 },
  keys: new Set(),
};

function defaultScene() {
  return {
    meta: { name: "My 2D game", description: "", gravity: 800 },
    objects: [
      { id: uid(), type: "rect", x: 120, y: 460, w: 520, h: 40, color: "#3be6c1", solid: true },
      { id: uid(), type: "goal", x: 720, y: 410, w: 34, h: 34, color: "#ff5b6e", solid: false },
      { id: uid(), type: "spawn", x: 140, y: 410, w: 34, h: 34, color: "#8c5cff", solid: false },
    ],
  };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    if (!Array.isArray(v.objects)) return null;
    return v;
  } catch {
    return null;
  }
}

function saveLocal(scene) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scene));
}

function getSceneFromUi() {
  const name = clampText(gameNameEl.value, 40) || "My 2D game";
  const description = clampText(gameDescEl.value, 200);
  const gravity = Math.max(0, Math.min(5000, n(gravityEl.value, 800)));
  return {
    meta: { name, description, gravity },
    objects: state.objects.map((o) => ({ ...o })),
  };
}

function applySceneToUi(scene) {
  const meta = scene?.meta || {};
  gameNameEl.value = typeof meta.name === "string" ? meta.name : "My 2D game";
  gameDescEl.value = typeof meta.description === "string" ? meta.description : "";
  gravityEl.value = String(Number.isFinite(Number(meta.gravity)) ? Number(meta.gravity) : 800);
  state.objects = Array.isArray(scene.objects) ? scene.objects.map((o) => ({ ...o })) : [];
  state.selectedId = null;
  refreshInspector();
  render();
}

function setTool(next) {
  const t = next === "rect" || next === "circle" || next === "spawn" || next === "goal" ? next : "select";
  state.tool = t;
  toolLabelEl.textContent = t === "select" ? "Select" : t[0].toUpperCase() + t.slice(1);
}

toolSelectEl.addEventListener("click", () => setTool("select"));
toolRectEl.addEventListener("click", () => setTool("rect"));
toolCircleEl.addEventListener("click", () => setTool("circle"));
toolSpawnEl.addEventListener("click", () => setTool("spawn"));
toolGoalEl.addEventListener("click", () => setTool("goal"));

function worldToScreen(x, y) {
  return { x: (x + state.panX) * state.zoom, y: (y + state.panY) * state.zoom };
}

function screenToWorld(x, y) {
  return { x: x / state.zoom - state.panX, y: y / state.zoom - state.panY };
}

function hitTest(wx, wy) {
  for (let i = state.objects.length - 1; i >= 0; i--) {
    const o = state.objects[i];
    if (!o) continue;
    if (o.type === "circle") {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const r = Math.min(o.w, o.h) / 2;
      const dx = wx - cx;
      const dy = wy - cy;
      if (dx * dx + dy * dy <= r * r) return o;
    } else {
      if (wx >= o.x && wx <= o.x + o.w && wy >= o.y && wy <= o.y + o.h) return o;
    }
  }
  return null;
}

function ensureSingleton(type) {
  if (type !== "spawn" && type !== "goal") return;
  state.objects = state.objects.filter((o) => o.type !== type);
}

function addObjectAt(type, wx, wy) {
  const base = { id: uid(), type, x: wx - 30, y: wy - 30, w: 60, h: 60, color: "#ffffff", solid: true };
  if (type === "rect") base.color = "rgba(255,255,255,0.9)";
  if (type === "circle") base.color = "rgba(255,255,255,0.9)";
  if (type === "spawn") {
    base.color = "#8c5cff";
    base.solid = false;
    ensureSingleton("spawn");
  }
  if (type === "goal") {
    base.color = "#ff5b6e";
    base.solid = false;
    ensureSingleton("goal");
  }
  state.objects.push(base);
  state.selectedId = base.id;
  refreshInspector();
  render();
}

let dragging = null; // { id, offX, offY }
canvas.addEventListener("pointerdown", (e) => {
  if (state.playing) return;
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
  const { x: wx, y: wy } = screenToWorld(sx, sy);

  if (state.tool !== "select") {
    addObjectAt(state.tool, wx, wy);
    return;
  }

  const hit = hitTest(wx, wy);
  state.selectedId = hit?.id || null;
  refreshInspector();
  if (hit) {
    dragging = { id: hit.id, offX: wx - hit.x, offY: wy - hit.y };
    canvas.setPointerCapture(e.pointerId);
  }
  render();
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging || state.playing) return;
  const obj = state.objects.find((o) => o.id === dragging.id);
  if (!obj) return;

  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
  const { x: wx, y: wy } = screenToWorld(sx, sy);

  obj.x = wx - dragging.offX;
  obj.y = wy - dragging.offY;
  refreshInspector({ keepFocus: true });
  render();
});

canvas.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = null;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {}
});

canvas.addEventListener("wheel", (e) => {
  if (state.playing) return;
  e.preventDefault();
  const delta = Math.sign(e.deltaY || 0);
  const factor = delta > 0 ? 0.92 : 1.08;
  state.zoom = Math.max(0.4, Math.min(2.6, state.zoom * factor));
  render();
});

function refreshInspector({ keepFocus = false } = {}) {
  const selected = state.objects.find((o) => o.id === state.selectedId) || null;
  const activeId = document.activeElement?.id || null;

  if (!selected) {
    noSelectionEl.hidden = false;
    inspectorEl.hidden = true;
    return;
  }

  noSelectionEl.hidden = true;
  inspectorEl.hidden = false;

  objTypeEl.value = selected.type;
  objXEl.value = String(Math.round(selected.x));
  objYEl.value = String(Math.round(selected.y));
  objWEl.value = String(Math.round(selected.w));
  objHEl.value = String(Math.round(selected.h));
  objColorEl.value = String(selected.color || "");
  objSolidEl.value = selected.solid ? "1" : "0";

  if (keepFocus && activeId) {
    document.getElementById(activeId)?.focus?.();
  }
}

function applyInspector() {
  const selected = state.objects.find((o) => o.id === state.selectedId) || null;
  if (!selected) return;
  selected.x = n(objXEl.value, selected.x);
  selected.y = n(objYEl.value, selected.y);
  selected.w = Math.max(4, n(objWEl.value, selected.w));
  selected.h = Math.max(4, n(objHEl.value, selected.h));
  selected.color = clampText(objColorEl.value, 16) || selected.color;
  selected.solid = objSolidEl.value === "1";
  refreshInspector({ keepFocus: true });
  render();
}

[objXEl, objYEl, objWEl, objHEl, objColorEl, objSolidEl].forEach((el) => {
  el?.addEventListener("input", () => applyInspector());
  el?.addEventListener("change", () => applyInspector());
});

delObjEl.addEventListener("click", () => {
  if (!state.selectedId) return;
  state.objects = state.objects.filter((o) => o.id !== state.selectedId);
  state.selectedId = null;
  refreshInspector();
  render();
});

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolveCollisions(player, solids) {
  // Simple AABB resolution (separate axes).
  for (const s of solids) {
    if (!rectsOverlap(player, s)) continue;
    const dx1 = s.x + s.w - player.x;
    const dx2 = player.x + player.w - s.x;
    const dy1 = s.y + s.h - player.y;
    const dy2 = player.y + player.h - s.y;
    const minX = Math.min(dx1, dx2);
    const minY = Math.min(dy1, dy2);
    if (minX < minY) {
      player.x += dx1 < dx2 ? dx1 : -dx2;
      player.vx = 0;
    } else {
      player.y += dy1 < dy2 ? dy1 : -dy2;
      player.vy = 0;
    }
  }
}

function findFirst(type) {
  return state.objects.find((o) => o.type === type) || null;
}

function startPlay() {
  state.playing = true;
  playBtnEl.disabled = true;
  stopBtnEl.disabled = false;
  setTool("select");
  const spawn = findFirst("spawn");
  if (spawn) {
    state.player.x = spawn.x + spawn.w / 2 - state.player.w / 2;
    state.player.y = spawn.y + spawn.h / 2 - state.player.h / 2;
  } else {
    state.player.x = 60;
    state.player.y = 60;
  }
  state.player.vx = 0;
  state.player.vy = 0;
  setStatus("Play: WASD / arrows to move, space to jump.", "ok");
}

function stopPlay() {
  state.playing = false;
  playBtnEl.disabled = false;
  stopBtnEl.disabled = true;
  state.keys.clear();
  setStatus("", null);
}

playBtnEl.addEventListener("click", startPlay);
stopBtnEl.addEventListener("click", stopPlay);

window.addEventListener("keydown", (e) => {
  if (!state.playing) return;
  state.keys.add(e.key);
});
window.addEventListener("keyup", (e) => {
  state.keys.delete(e.key);
});

let lastT = performance.now();
function tick(t) {
  const dt = Math.min(0.03, Math.max(0.001, (t - lastT) / 1000));
  lastT = t;

  if (state.playing) {
    const gravity = Math.max(0, Math.min(5000, n(gravityEl.value, 800)));
    const speed = 240;
    const jump = 420;

    const left = state.keys.has("ArrowLeft") || state.keys.has("a") || state.keys.has("A");
    const right = state.keys.has("ArrowRight") || state.keys.has("d") || state.keys.has("D");
    const up = state.keys.has("ArrowUp") || state.keys.has("w") || state.keys.has("W");
    const jumpKey = state.keys.has(" ") || up;

    state.player.vx = (right ? 1 : 0 - (left ? 1 : 0)) * speed;
    state.player.vy += gravity * dt;

    state.player.x += state.player.vx * dt;
    resolveCollisions(state.player, state.objects.filter((o) => o.solid));

    state.player.y += state.player.vy * dt;
    const beforeVy = state.player.vy;
    resolveCollisions(state.player, state.objects.filter((o) => o.solid));
    const grounded = beforeVy > 0 && state.player.vy === 0;
    if (grounded && jumpKey) {
      state.player.vy = -jump;
    }

    const goal = findFirst("goal");
    if (goal && rectsOverlap(state.player, goal)) {
      setStatus("You reached the goal! 🎉", "ok");
    }

    // Keep camera roughly following player.
    const targetX = -(state.player.x - canvas.width / 2 / state.zoom + state.player.w / 2);
    const targetY = -(state.player.y - canvas.height / 2 / state.zoom + state.player.h / 2);
    state.panX += (targetX - state.panX) * 0.08;
    state.panY += (targetY - state.panY) * 0.08;
  }

  render();
  requestAnimationFrame(tick);
}

function drawGrid() {
  const grid = 40;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  const minX = -state.panX - 1000;
  const minY = -state.panY - 1000;
  const maxX = -state.panX + canvas.width / state.zoom + 1000;
  const maxY = -state.panY + canvas.height / state.zoom + 1000;
  for (let x = Math.floor(minX / grid) * grid; x < maxX; x += grid) {
    const a = worldToScreen(x, minY);
    const b = worldToScreen(x, maxY);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = Math.floor(minY / grid) * grid; y < maxY; y += grid) {
    const a = worldToScreen(minX, y);
    const b = worldToScreen(maxX, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  for (const o of state.objects) {
    const s = worldToScreen(o.x, o.y);
    const w = o.w * state.zoom;
    const h = o.h * state.zoom;
    ctx.save();
    ctx.fillStyle = o.color || "rgba(255,255,255,0.9)";
    if (o.type === "circle") {
      ctx.beginPath();
      ctx.ellipse(s.x + w / 2, s.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(s.x, s.y, w, h);
    }

    // Outline selection
    if (!state.playing && state.selectedId === o.id) {
      ctx.strokeStyle = "rgba(59,230,193,0.95)";
      ctx.lineWidth = 3;
      ctx.strokeRect(s.x - 1, s.y - 1, w + 2, h + 2);
    }
    ctx.restore();
  }

  if (state.playing) {
    const p = state.player;
    const s = worldToScreen(p.x, p.y);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillRect(s.x, s.y, p.w * state.zoom, p.h * state.zoom);
    ctx.restore();
  }
}

saveBtnEl.addEventListener("click", () => {
  const scene = getSceneFromUi();
  saveLocal(scene);
  setStatus("Saved to this browser.", "ok");
});

publishBtnEl.addEventListener("click", async () => {
  setStatus("", null);
  const scene = getSceneFromUi();
  const name = scene.meta.name || "My 2D game";
  const description = scene.meta.description || "";

  publishBtnEl.disabled = true;
  try {
    const gamesRef = ref(database, "publishedGames");
    const newRef = push(gamesRef);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    await set(newRef, {
      owner: user,
      name,
      description,
      engine: "studio2d",
      scene,
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
    publishBtnEl.disabled = false;
  }
});

// Init
const existing = loadLocal() || defaultScene();
applySceneToUi(existing);
requestAnimationFrame(tick);

