const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  window.location.href = "index.html";
});

const canvas = document.getElementById("tetrisCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("tetrisScore");
const linesEl = document.getElementById("tetrisLines");
const levelEl = document.getElementById("tetrisLevel");
const statusEl = document.getElementById("tetrisStatus");
const pauseEl = document.getElementById("tetrisPause");
const restartEl = document.getElementById("tetrisRestart");

const leftEl = document.getElementById("tetrisLeft");
const rightEl = document.getElementById("tetrisRight");
const downEl = document.getElementById("tetrisDown");
const rotateEl = document.getElementById("tetrisRotate");
const dropEl = document.getElementById("tetrisDrop");
const holdEl = document.getElementById("tetrisHold");

const COLS = 10;
const VISIBLE_ROWS = 20;
const HIDDEN_ROWS = 2;
const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

const PIECES = {
  I: { color: "rgba(59,230,193,0.95)", matrix: [[1, 1, 1, 1]] },
  O: { color: "rgba(255,255,255,0.92)", matrix: [[1, 1], [1, 1]] },
  T: { color: "rgba(140,92,255,0.92)", matrix: [[0, 1, 0], [1, 1, 1]] },
  S: { color: "rgba(90,255,154,0.9)", matrix: [[0, 1, 1], [1, 1, 0]] },
  Z: { color: "rgba(255,91,110,0.92)", matrix: [[1, 1, 0], [0, 1, 1]] },
  J: { color: "rgba(99,173,255,0.92)", matrix: [[1, 0, 0], [1, 1, 1]] },
  L: { color: "rgba(255,187,89,0.92)", matrix: [[0, 0, 1], [1, 1, 1]] },
};

function makeBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(m) {
  return m.map((r) => [...r]);
}

function rotateCW(m) {
  const h = m.length;
  const w = m[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[x][h - 1 - y] = m[y][x];
  }
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function levelToDropMs(level) {
  // Fast-ish curve; clamps for sanity.
  const ms = 800 * Math.pow(0.88, level - 1);
  return Math.max(60, Math.floor(ms));
}

let rafId = null;
let last = 0;
let acc = 0;

const state = {
  board: makeBoard(),
  running: true,
  over: false,
  paused: false,
  score: 0,
  lines: 0,
  level: 1,
  bag: [],
  cur: null,
  next: null,
  hold: null,
  canHold: true,
};

function refillBag() {
  const keys = Object.keys(PIECES);
  state.bag = shuffle(keys.slice());
}

function nextType() {
  if (!state.bag.length) refillBag();
  return state.bag.pop();
}

function makePiece(type) {
  const def = PIECES[type];
  const m = cloneMatrix(def.matrix);
  const x = Math.floor(COLS / 2) - Math.ceil(m[0].length / 2);
  const y = 0;
  return { type, color: def.color, matrix: m, x, y };
}

function cellAt(board, x, y) {
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return "wall";
  return board[y][x];
}

function collides(piece, board) {
  const m = piece.matrix;
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[0].length; x++) {
      if (!m[y][x]) continue;
      const bx = piece.x + x;
      const by = piece.y + y;
      const c = cellAt(board, bx, by);
      if (c) return true;
    }
  }
  return false;
}

function merge(piece) {
  const m = piece.matrix;
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[0].length; x++) {
      if (!m[y][x]) continue;
      const bx = piece.x + x;
      const by = piece.y + y;
      if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) state.board[by][bx] = piece.color;
    }
  }
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (state.board[y].every(Boolean)) {
      state.board.splice(y, 1);
      state.board.unshift(Array(COLS).fill(null));
      cleared += 1;
      y += 1;
    }
  }
  if (!cleared) return 0;
  state.lines += cleared;
  const lvl = state.level;
  const table = { 1: 100, 2: 300, 3: 500, 4: 800 };
  state.score += (table[cleared] || 0) * lvl;
  state.level = 1 + Math.floor(state.lines / 10);
  return cleared;
}

function spawn() {
  state.cur = state.next || makePiece(nextType());
  state.cur.x = Math.floor(COLS / 2) - Math.ceil(state.cur.matrix[0].length / 2);
  state.cur.y = 0;
  state.next = makePiece(nextType());
  state.canHold = true;

  if (collides(state.cur, state.board)) {
    state.over = true;
    state.running = false;
    statusEl.textContent = "Game over. Press Restart.";
  }
}

function reset() {
  cancelAnimationFrame(rafId);
  rafId = null;
  setHeld("left", false);
  setHeld("right", false);
  setHeld("down", false);
  state.board = makeBoard();
  state.running = true;
  state.over = false;
  state.paused = false;
  state.score = 0;
  state.lines = 0;
  state.level = 1;
  state.hold = null;
  state.canHold = true;
  state.bag = [];
  state.next = makePiece(nextType());
  spawn();
  pauseEl.textContent = "Pause";
  statusEl.textContent = "Click the canvas and start playing.";
  last = performance.now();
  acc = 0;
  rafId = requestAnimationFrame(loop);
  updateHud();
  draw();
}

function updateHud() {
  scoreEl.textContent = `Score: ${state.score}`;
  linesEl.textContent = `Lines: ${state.lines}`;
  levelEl.textContent = `Level: ${state.level}`;
  if (state.paused && !state.over) statusEl.textContent = "Paused.";
}

function tryMove(dx, dy) {
  if (!state.running || state.paused || state.over) return false;
  const p = state.cur;
  const next = { ...p, x: p.x + dx, y: p.y + dy };
  if (collides(next, state.board)) return false;
  state.cur = next;
  return true;
}

function lockPiece() {
  if (!state.cur) return;
  merge(state.cur);
  clearLines();
  updateHud();
  spawn();
}

function stepDown() {
  if (!state.running || state.paused || state.over) return;
  if (!tryMove(0, 1)) lockPiece();
}

function hardDrop() {
  if (!state.running || state.paused || state.over) return;
  let dropped = 0;
  while (tryMove(0, 1)) dropped += 1;
  state.score += dropped * 2;
  lockPiece();
  updateHud();
}

function rotate() {
  if (!state.running || state.paused || state.over) return;
  const p = state.cur;
  if (!p) return;
  if (p.type === "O") return;
  const rotated = rotateCW(p.matrix);
  const cand = { ...p, matrix: rotated };

  // Simple wall-kick tries
  const kicks = [0, -1, 1, -2, 2, -3, 3];
  for (const k of kicks) {
    const test = { ...cand, x: cand.x + k };
    if (!collides(test, state.board)) {
      state.cur = test;
      return;
    }
  }
}

function hold() {
  if (!state.running || state.paused || state.over) return;
  if (!state.canHold) return;
  const curType = state.cur.type;
  if (state.hold) {
    const swapType = state.hold;
    state.hold = curType;
    state.cur = makePiece(swapType);
    state.cur.y = 0;
  } else {
    state.hold = curType;
    state.cur = state.next;
    state.next = makePiece(nextType());
  }
  state.canHold = false;
  state.cur.x = Math.floor(COLS / 2) - Math.ceil(state.cur.matrix[0].length / 2);
  state.cur.y = 0;
  if (collides(state.cur, state.board)) {
    state.over = true;
    state.running = false;
    statusEl.textContent = "Game over. Press Restart.";
  }
}

function togglePause() {
  if (state.over) return;
  state.paused = !state.paused;
  pauseEl.textContent = state.paused ? "Resume" : "Pause";
  updateHud();
}

function drawBlock(x, y, size, color) {
  const pad = Math.max(1, Math.floor(size * 0.08));
  ctx.fillStyle = color;
  ctx.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + pad + 1, y + pad + 1, size - pad * 2 - 2, size - pad * 2 - 2);
}

function draw() {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, 0, W, H);

  const cell = Math.max(18, Math.floor(H / VISIBLE_ROWS));
  const boardW = cell * COLS;
  const boardH = cell * VISIBLE_ROWS;
  const sideW = Math.min(320, W - boardW - 36);
  const ox = Math.floor((W - (boardW + sideW + 18)) / 2);
  const oy = Math.floor((H - boardH) / 2);

  // Board frame
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox - 1, oy - 1, boardW + 2, boardH + 2);

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(ox + x * cell, oy);
    ctx.lineTo(ox + x * cell, oy + boardH);
    ctx.stroke();
  }
  for (let y = 1; y < VISIBLE_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + y * cell);
    ctx.lineTo(ox + boardW, oy + y * cell);
    ctx.stroke();
  }

  // Frozen blocks (skip hidden rows)
  for (let y = HIDDEN_ROWS; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = state.board[y][x];
      if (!c) continue;
      const vx = ox + x * cell;
      const vy = oy + (y - HIDDEN_ROWS) * cell;
      drawBlock(vx, vy, cell, c);
    }
  }

  // Ghost piece
  if (state.cur && !state.over) {
    const ghost = { ...state.cur, matrix: state.cur.matrix };
    while (!collides({ ...ghost, y: ghost.y + 1 }, state.board)) ghost.y += 1;
    ctx.globalAlpha = 0.22;
    const m = ghost.matrix;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[0].length; x++) {
        if (!m[y][x]) continue;
        const by = ghost.y + y - HIDDEN_ROWS;
        const bx = ghost.x + x;
        if (by < 0) continue;
        drawBlock(ox + bx * cell, oy + by * cell, cell, ghost.color);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Active piece
  if (state.cur) {
    const p = state.cur;
    const m = p.matrix;
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[0].length; x++) {
        if (!m[y][x]) continue;
        const by = p.y + y - HIDDEN_ROWS;
        const bx = p.x + x;
        if (by < 0) continue;
        drawBlock(ox + bx * cell, oy + by * cell, cell, p.color);
      }
    }
  }

  // Side panel
  const sx = ox + boardW + 18;
  const sy = oy;
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(sx, sy, sideW, boardH);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(sx - 1, sy - 1, sideW + 2, boardH + 2);

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "900 14px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("NEXT", sx + 14, sy + 24);
  ctx.fillText("HOLD", sx + 14, sy + 178);

  function drawMini(type, x0, y0) {
    if (!type) return;
    const def = PIECES[type];
    const mm = def.matrix;
    const mCell = Math.max(14, Math.floor(Math.min(sideW / 7, 24)));
    const w = mm[0].length * mCell;
    const h = mm.length * mCell;
    const px = x0 + Math.floor((sideW - w) / 2);
    const py = y0 + Math.floor((120 - h) / 2);
    for (let y = 0; y < mm.length; y++) {
      for (let x = 0; x < mm[0].length; x++) {
        if (!mm[y][x]) continue;
        drawBlock(px + x * mCell, py + y * mCell, mCell, def.color);
      }
    }
  }

  drawMini(state.next?.type, sx, sy + 34);
  drawMini(state.hold, sx, sy + 188);

  // Overlay when paused/over
  if (state.paused || state.over) {
    ctx.fillStyle = "rgba(7,17,31,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 28px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(state.over ? "GAME OVER" : "PAUSED", W / 2, H / 2 - 10);
    ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText(state.over ? "Press Restart to play again" : "Press P to resume", W / 2, H / 2 + 22);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
}

const held = {
  left: false,
  right: false,
  down: false,
};
const repeat = {
  left: { t: 0 },
  right: { t: 0 },
  down: { t: 0 },
};

function setHeld(key, on) {
  held[key] = on;
  if (!on) {
    repeat[key].t = 0;
  }
}

function tickHeld(dt) {
  if (!state.running || state.paused || state.over) return;

  const DAS = 0.14;
  const ARR = 0.04;
  const SDR = 0.03;

  function procMove(key, dx) {
    if (!held[key]) return;
    const r = repeat[key];
    r.t += dt;
    if (r.t < DAS) return;
    const over = r.t - DAS;
    const steps = Math.floor(over / ARR);
    if (steps <= 0) return;
    r.t = DAS + (over % ARR);
    for (let i = 0; i < steps; i++) tryMove(dx, 0);
  }

  procMove("left", -1);
  procMove("right", 1);

  // soft drop
  if (held.down) {
    repeat.down.t += dt;
    const interval = SDR;
    const steps = Math.floor(repeat.down.t / interval);
    if (steps > 0) repeat.down.t = repeat.down.t % interval;
    for (let i = 0; i < steps; i++) {
      if (tryMove(0, 1)) state.score += 1;
      else {
        lockPiece();
        break;
      }
    }
    updateHud();
  }
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.running || state.paused || state.over) {
    draw();
    return;
  }

  tickHeld(dt);

  acc += dt * 1000;
  const dropMs = levelToDropMs(state.level);
  while (acc >= dropMs) {
    acc -= dropMs;
    stepDown();
    if (state.over) break;
  }

  draw();
}

function onKeyDown(ev) {
  const k = ev.key.toLowerCase();
  if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(ev.key)) ev.preventDefault();

  if (k === "p" || k === "escape") {
    togglePause();
    return;
  }
  if (state.paused || state.over) return;

  if (k === "arrowleft" || k === "a") {
    if (!ev.repeat) tryMove(-1, 0);
    setHeld("left", true);
  }
  if (k === "arrowright" || k === "d") {
    if (!ev.repeat) tryMove(1, 0);
    setHeld("right", true);
  }
  if (k === "arrowdown" || k === "s") {
    if (!ev.repeat && tryMove(0, 1)) state.score += 1;
    setHeld("down", true);
    updateHud();
  }
  if (k === "arrowup" || k === "w") {
    if (!ev.repeat) rotate();
  }
  if (k === "c" || k === "shift") {
    if (!ev.repeat) hold();
  }
  if (ev.key === " ") {
    if (!ev.repeat) hardDrop();
  }
}

function onKeyUp(ev) {
  const k = ev.key.toLowerCase();
  if (k === "arrowleft" || k === "a") setHeld("left", false);
  if (k === "arrowright" || k === "d") setHeld("right", false);
  if (k === "arrowdown" || k === "s") setHeld("down", false);
}

window.addEventListener("keydown", onKeyDown, { passive: false });
window.addEventListener("keyup", onKeyUp);

pauseEl.addEventListener("click", togglePause);
restartEl.addEventListener("click", reset);
canvas.addEventListener("pointerdown", () => canvas.focus?.());

function bindBtn(btn, down, up) {
  if (!btn) return;
  const onDown = (e) => {
    e.preventDefault?.();
    down();
  };
  const onUp = (e) => {
    e.preventDefault?.();
    up?.();
  };
  btn.addEventListener("pointerdown", onDown);
  btn.addEventListener("pointerup", onUp);
  btn.addEventListener("pointercancel", onUp);
  btn.addEventListener("click", (e) => e.preventDefault?.());
}

bindBtn(
  leftEl,
  () => {
    tryMove(-1, 0);
    setHeld("left", true);
  },
  () => setHeld("left", false),
);
bindBtn(
  rightEl,
  () => {
    tryMove(1, 0);
    setHeld("right", true);
  },
  () => setHeld("right", false),
);
bindBtn(
  downEl,
  () => {
    if (tryMove(0, 1)) state.score += 1;
    setHeld("down", true);
    updateHud();
  },
  () => setHeld("down", false),
);
bindBtn(rotateEl, () => rotate());
bindBtn(dropEl, () => hardDrop());
bindBtn(holdEl, () => hold());

reset();
