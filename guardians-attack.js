import { database, ref, get, set, update, onValue, runTransaction, serverTimestamp } from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) window.location.href = "index.html";

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const roomCodeEl = document.getElementById("roomCode");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const resetBtn = document.getElementById("resetBtn");
const spawnBtn = document.getElementById("spawnBtn");

const W = canvas.width;
const H = canvas.height;

const GAME_VERSION = 1;
const STARTING_INVENTORY = 50;

// Simulation tuning (client-authoritative via RTDB transactions)
const STEP_MS = 120;
const SPEED = 0.19; // platform units / sec (0..1)
const SPACING = 0.028;
const RANGE = 0.04;
const DAMAGE = 2;
const ATK_COOLDOWN = 0.55;
const MAX_DT = 0.25;

function clampText(v, maxLen) {
  const s = String(v || "").trim();
  return maxLen ? s.slice(0, Math.max(0, maxLen)) : s;
}

function roomKey(code) {
  return clampText(code, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function nowMs() {
  return Date.now();
}

function safeInt(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sideOfPlayer(players, username) {
  if (!players || typeof players !== "object") return null;
  if (players.A === username) return "A";
  if (players.B === username) return "B";
  return null;
}

function otherSide(side) {
  return side === "A" ? "B" : side === "B" ? "A" : null;
}

function makeGuardId() {
  return `g_${Math.random().toString(36).slice(2, 9)}_${nowMs().toString(36)}`;
}

function normalizeGuards(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, g] of Object.entries(raw)) {
    if (!g || typeof g !== "object") continue;
    const o = g.o === "A" || g.o === "B" ? g.o : null;
    if (!o) continue;
    const x = Math.max(0, Math.min(1, safeNum(g.x, o === "A" ? 0.08 : 0.92)));
    const hp = Math.max(0, Math.min(99, safeInt(g.hp, 10)));
    const cd = Math.max(0, Math.min(10, safeNum(g.cd, 0)));
    out[id] = { o, x, hp, cd };
  }
  return out;
}

function sideCounts(guards) {
  let a = 0;
  let b = 0;
  for (const g of Object.values(guards || {})) {
    if (!g) continue;
    if (g.o === "A") a++;
    if (g.o === "B") b++;
  }
  return { A: a, B: b };
}

function hash01(str) {
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function drawArena(state) {
  ctx.clearRect(0, 0, W, H);

  const padX = 46;
  const platformY = Math.round(H * 0.62);
  const platformW = W - padX * 2;

  // platform
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(padX, platformY);
  ctx.lineTo(padX + platformW, platformY);
  ctx.stroke();

  // spawn zones
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(59,230,193,0.35)";
  ctx.strokeRect(padX - 12, platformY - 40, 90, 70);
  ctx.strokeStyle = "rgba(255,91,110,0.35)";
  ctx.strokeRect(padX + platformW - 78, platformY - 40, 90, 70);

  const guards = normalizeGuards(state?.guards);
  const entries = Object.entries(guards);

  for (const [id, g] of entries) {
    const x = padX + g.x * platformW;
    const jitter = (hash01(id) - 0.5) * 18;
    const y = platformY - 18 + jitter;
    const w = 22;
    const h = 22;
    const r = 6;

    // body
    ctx.fillStyle = g.o === "A" ? "rgba(59,230,193,0.92)" : "rgba(255,91,110,0.92)";
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + r, y - h / 2);
    ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
    ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
    ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
    ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
    ctx.closePath();
    ctx.fill();

    // hp bar
    const hpMax = 10;
    const hp = Math.max(0, Math.min(hpMax, safeInt(g.hp, 0)));
    const barW = 24;
    const barH = 4;
    const bx = x - barW / 2;
    const by = y - h / 2 - 10;
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = hp > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.15)";
    ctx.fillRect(bx, by, (barW * hp) / hpMax, barH);
  }
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function setMeta(msg) {
  metaEl.textContent = msg || "";
}

let unsub = null;
let currentRoom = null;
let roomState = null;
let mySide = null; // "A" | "B" | null

let lastStartAttemptAt = 0;
let lastSimAttemptAt = 0;

function updateUiFromState() {
  const s = roomState;
  if (!currentRoom || !s) {
    resetBtn.disabled = true;
    spawnBtn.disabled = true;
    drawArena(null);
    setMeta("");
    return;
  }

  mySide = sideOfPlayer(s.players, user);
  const invA = safeInt(s.inventory?.A, STARTING_INVENTORY);
  const invB = safeInt(s.inventory?.B, STARTING_INVENTORY);
  const guards = normalizeGuards(s.guards);
  const counts = sideCounts(guards);

  drawArena(s);

  const phase = s.phase || "lobby";
  const winner = s.winner || null;

  if (!mySide) {
    setStatus(`Room ${currentRoom} • Waiting for a seat…`);
    setMeta("If the room is full, try a different code.");
    resetBtn.disabled = true;
    spawnBtn.disabled = true;
    return;
  }

  const youInv = mySide === "A" ? invA : invB;
  const opp = otherSide(mySide);
  const oppInv = opp === "A" ? invA : invB;

  if (!s.players?.A || !s.players?.B) {
    setStatus(`Room ${currentRoom} • You are ${mySide} • Waiting for opponent…`);
    setMeta(`You: inv=${youInv} • on-platform=${counts[mySide]} • Opponent: inv=${oppInv} • on-platform=${counts[opp]}`);
    resetBtn.disabled = true;
    spawnBtn.disabled = true;
    return;
  }

  if (phase === "ended" && winner) {
    const youWon = winner === mySide;
    setStatus(`Room ${currentRoom} • ${youWon ? "You win!" : "You lose"} • Winner: ${winner}`);
    setMeta(`You: inv=${youInv} • on-platform=${counts[mySide]} • Opponent: inv=${oppInv} • on-platform=${counts[opp]} • Press Reset for a new match.`);
    resetBtn.disabled = false;
    spawnBtn.disabled = true;
    return;
  }

  if (phase === "lobby") {
    setStatus(`Room ${currentRoom} • Ready • You are ${mySide}`);
    setMeta(`You: inv=${youInv} • on-platform=${counts[mySide]} • Opponent: inv=${oppInv} • on-platform=${counts[opp]} • Match starts when both joined.`);
    resetBtn.disabled = false;
    spawnBtn.disabled = true;
    maybeStartMatch();
    return;
  }

  // playing
  setStatus(`Room ${currentRoom} • Playing • You are ${mySide}`);
  setMeta(`You: inv=${youInv} • on-platform=${counts[mySide]} • Opponent: inv=${oppInv} • on-platform=${counts[opp]}`);
  resetBtn.disabled = false;
  spawnBtn.disabled = youInv <= 0;
}

async function leaveRoom() {
  if (unsub) unsub();
  unsub = null;
  currentRoom = null;
  roomState = null;
  mySide = null;
  updateUiFromState();
}

async function joinRoom(code) {
  const rk = roomKey(code);
  if (!rk) {
    setStatus("Enter a valid room code.");
    return;
  }

  if (unsub) unsub();
  unsub = null;
  currentRoom = rk;
  roomState = null;
  mySide = null;
  setStatus(`Joining ${rk}…`);

  const roomRef = ref(database, `gaRooms/${rk}`);

  const snap = await get(roomRef);
  if (!snap.exists()) {
    setStatus("Room not found.");
    await leaveRoom();
    return;
  }

  await runTransaction(roomRef, (cur) => {
    const v = cur && typeof cur === "object" ? cur : null;
    if (!v) return cur;
    v.players = v.players || {};
    if (v.players.A === user || v.players.B === user) return v;
    if (!v.players.A) v.players.A = user;
    else if (!v.players.B) v.players.B = user;
    v.updatedAt = serverTimestamp();
    return v;
  });

  unsub = onValue(roomRef, (s) => {
    roomState = s.exists() ? s.val() || {} : null;
    updateUiFromState();
  });
}

async function createRoom() {
  const code = makeCode();
  roomCodeEl.value = code;
  const rk = roomKey(code);
  const roomRef = ref(database, `gaRooms/${rk}`);
  await set(roomRef, {
    version: GAME_VERSION,
    phase: "lobby",
    players: {},
    inventory: { A: STARTING_INVENTORY, B: STARTING_INVENTORY },
    guards: {},
    lastSimAt: 0,
    winner: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await joinRoom(rk);
}

async function resetMatch() {
  if (!currentRoom) return;
  const roomRef = ref(database, `gaRooms/${currentRoom}`);
  await runTransaction(roomRef, (cur) => {
    if (!cur || typeof cur !== "object") return cur;
    cur.phase = "lobby";
    cur.winner = null;
    cur.guards = {};
    cur.inventory = { A: STARTING_INVENTORY, B: STARTING_INVENTORY };
    cur.lastSimAt = 0;
    cur.updatedAt = serverTimestamp();
    return cur;
  });
}

async function maybeStartMatch() {
  if (!currentRoom) return;
  const s = roomState;
  if (!s?.players?.A || !s?.players?.B) return;
  if ((s.phase || "lobby") !== "lobby") return;
  const t = nowMs();
  if (t - lastStartAttemptAt < 800) return;
  lastStartAttemptAt = t;

  const roomRef = ref(database, `gaRooms/${currentRoom}`);
  await runTransaction(roomRef, (cur) => {
    if (!cur || typeof cur !== "object") return cur;
    const phase = cur.phase || "lobby";
    if (phase !== "lobby") return cur;
    if (!cur.players?.A || !cur.players?.B) return cur;
    cur.phase = "playing";
    cur.winner = null;
    cur.lastSimAt = nowMs();
    cur.updatedAt = serverTimestamp();
    return cur;
  });
}

function computeSpawnX(guards, side) {
  const spawnBase = side === "A" ? 0.08 : 0.92;
  const gs = Object.values(guards || {}).filter((g) => g?.o === side);
  if (!gs.length) return spawnBase;

  if (side === "A") {
    let back = 1;
    for (const g of gs) back = Math.min(back, safeNum(g.x, spawnBase));
    return Math.max(0.02, Math.min(spawnBase, back - SPACING));
  }

  let back = 0;
  for (const g of gs) back = Math.max(back, safeNum(g.x, spawnBase));
  return Math.min(0.98, Math.max(spawnBase, back + SPACING));
}

async function spawnGuard() {
  if (!currentRoom) return;
  const roomRef = ref(database, `gaRooms/${currentRoom}`);
  await runTransaction(roomRef, (cur) => {
    if (!cur || typeof cur !== "object") return cur;
    const phase = cur.phase || "lobby";
    if (phase !== "playing") return cur;

    const side = sideOfPlayer(cur.players, user);
    if (!side) return cur;

    cur.inventory = cur.inventory || { A: STARTING_INVENTORY, B: STARTING_INVENTORY };
    const inv = safeInt(cur.inventory[side], STARTING_INVENTORY);
    if (inv <= 0) return cur;

    cur.guards = normalizeGuards(cur.guards);
    const id = makeGuardId();
    const x = computeSpawnX(cur.guards, side);
    cur.guards[id] = { o: side, x, hp: 10, cd: 0 };
    cur.inventory[side] = inv - 1;
    cur.updatedAt = serverTimestamp();
    return cur;
  });
}

function sortedSide(guards, side) {
  const arr = [];
  for (const [id, g] of Object.entries(guards)) {
    if (!g || g.o !== side) continue;
    arr.push({ id, ...g });
  }
  arr.sort((a, b) => a.x - b.x);
  return arr;
}

function applyMovement(guards, dt) {
  const a = sortedSide(guards, "A");
  const b = sortedSide(guards, "B");

  // A moves right; constrain by next ahead.
  for (let i = 0; i < a.length; i++) {
    const g = a[i];
    const move = SPEED * dt;
    const next = a[i + 1];
    const maxX = next ? Math.max(0, next.x - SPACING) : 0.98;
    g.x = Math.min(maxX, g.x + move);
    guards[g.id].x = g.x;
  }

  // B moves left; iterate from leftmost? easier using descending list.
  b.sort((x1, x2) => x2.x - x1.x); // right -> left
  for (let i = 0; i < b.length; i++) {
    const g = b[i];
    const move = SPEED * dt;
    const next = b[i + 1]; // next behind to the right (higher x) after descending sort
    const minX = next ? Math.min(1, next.x + SPACING) : 0.02;
    g.x = Math.max(minX, g.x - move);
    guards[g.id].x = g.x;
  }
}

function frontlineIds(guards) {
  let leadA = null;
  let leadB = null;
  for (const [id, g] of Object.entries(guards)) {
    if (!g) continue;
    if (g.o === "A") {
      if (!leadA || g.x > leadA.x) leadA = { id, x: g.x };
    } else if (g.o === "B") {
      if (!leadB || g.x < leadB.x) leadB = { id, x: g.x };
    }
  }
  return { leadA: leadA?.id || null, leadB: leadB?.id || null };
}

function tryAttacks(cur, dt) {
  const guards = cur.guards;
  const { leadA, leadB } = frontlineIds(guards);
  if (!leadA || !leadB) return;

  const a = guards[leadA];
  const b = guards[leadB];
  if (!a || !b) return;

  const dist = b.x - a.x;
  if (dist > RANGE) return;

  const aCan = a.cd <= 0;
  const bCan = b.cd <= 0;

  if (aCan) {
    b.hp = safeInt(b.hp, 10) - DAMAGE;
    a.cd = ATK_COOLDOWN;
  }
  if (bCan) {
    a.hp = safeInt(a.hp, 10) - DAMAGE;
    b.cd = ATK_COOLDOWN;
  }

  const aDied = safeInt(a.hp, 0) <= 0;
  const bDied = safeInt(b.hp, 0) <= 0;

  if (aDied) {
    delete guards[leadA];
    cur.inventory = cur.inventory || { A: STARTING_INVENTORY, B: STARTING_INVENTORY };
    cur.inventory.B = Math.min(999, safeInt(cur.inventory.B, STARTING_INVENTORY) + 1);
  }
  if (bDied) {
    delete guards[leadB];
    cur.inventory = cur.inventory || { A: STARTING_INVENTORY, B: STARTING_INVENTORY };
    cur.inventory.A = Math.min(999, safeInt(cur.inventory.A, STARTING_INVENTORY) + 1);
  }
}

function checkWin(cur) {
  const guards = cur.guards;
  const counts = sideCounts(guards);
  const invA = safeInt(cur.inventory?.A, STARTING_INVENTORY);
  const invB = safeInt(cur.inventory?.B, STARTING_INVENTORY);
  const aOut = invA <= 0 && counts.A === 0;
  const bOut = invB <= 0 && counts.B === 0;
  if (!aOut && !bOut) return;
  if (aOut && bOut) {
    // rare: both wiped at once; pick winner by last hitter doesn't exist -> draw not supported
    cur.phase = "ended";
    cur.winner = "A";
    return;
  }
  cur.phase = "ended";
  cur.winner = aOut ? "B" : "A";
}

async function attemptSimStep() {
  if (!currentRoom || !roomState) return;
  if ((roomState.phase || "lobby") !== "playing") return;
  if (!roomState.players?.A || !roomState.players?.B) return;

  const t = nowMs();
  if (t - lastSimAttemptAt < 70) return;
  lastSimAttemptAt = t;

  const roomRef = ref(database, `gaRooms/${currentRoom}`);
  await runTransaction(roomRef, (cur) => {
    if (!cur || typeof cur !== "object") return cur;
    const phase = cur.phase || "lobby";
    if (phase !== "playing") return cur;
    if (!cur.players?.A || !cur.players?.B) return cur;

    const now = nowMs();
    const last = safeInt(cur.lastSimAt, 0);
    if (!last) {
      cur.lastSimAt = now;
      return cur;
    }
    const elapsed = now - last;
    if (elapsed < STEP_MS) return cur;

    const dt = Math.max(0, Math.min(MAX_DT, elapsed / 1000));
    cur.lastSimAt = now;

    cur.guards = normalizeGuards(cur.guards);
    cur.inventory = cur.inventory || { A: STARTING_INVENTORY, B: STARTING_INVENTORY };

    // cool down tick for everyone (even if not frontline)
    for (const g of Object.values(cur.guards)) {
      if (!g) continue;
      g.cd = Math.max(0, safeNum(g.cd, 0) - dt);
    }

    applyMovement(cur.guards, dt);
    tryAttacks(cur, dt);
    checkWin(cur);
    cur.updatedAt = serverTimestamp();
    return cur;
  });
}

createBtn.addEventListener("click", () => {
  createRoom().catch((err) => setStatus(err?.message || String(err)));
});

joinBtn.addEventListener("click", () => {
  joinRoom(roomCodeEl.value).catch((err) => setStatus(err?.message || String(err)));
});

resetBtn.addEventListener("click", () => {
  resetMatch().catch((err) => setStatus(err?.message || String(err)));
});

spawnBtn.addEventListener("click", () => {
  spawnGuard().catch((err) => setStatus(err?.message || String(err)));
});

// click arena to spawn quickly (only on your half)
canvas.addEventListener("pointerdown", (ev) => {
  if (!currentRoom || !roomState) return;
  if ((roomState.phase || "lobby") !== "playing") return;
  if (!mySide) return;
  const rect = canvas.getBoundingClientRect();
  const px = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const half = canvas.width / 2;
  if (mySide === "A" && px > half) return;
  if (mySide === "B" && px < half) return;
  spawnGuard().catch((err) => setStatus(err?.message || String(err)));
});

setInterval(() => {
  attemptSimStep().catch(() => {});
}, 90);

// initial paint
drawArena(null);
