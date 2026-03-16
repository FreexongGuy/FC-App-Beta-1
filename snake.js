const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  window.location.href = "index.html";
});

const canvas = document.getElementById("snakeCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("snakeScore");
const statusEl = document.getElementById("snakeStatus");
const restartEl = document.getElementById("snakeRestart");
const upEl = document.getElementById("snakeUp");
const downEl = document.getElementById("snakeDown");
const leftEl = document.getElementById("snakeLeft");
const rightEl = document.getElementById("snakeRight");

const GRID = 20;
const COLS = Math.floor(canvas.width / GRID);
const ROWS = Math.floor(canvas.height / GRID);

let rafId = null;
let lastTick = 0;
let tickMs = 90;

let dir = { x: 1, y: 0 };
let nextDir = { x: 1, y: 0 };
let snake = [];
let food = { x: 0, y: 0 };
let alive = true;
let score = 0;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function eq(a, b) {
  return a.x === b.x && a.y === b.y;
}

function spawnFood() {
  for (let tries = 0; tries < 5000; tries++) {
    const p = { x: randInt(0, COLS - 1), y: randInt(0, ROWS - 1) };
    if (!snake.some((s) => eq(s, p))) {
      food = p;
      return;
    }
  }
  food = { x: 0, y: 0 };
}

function reset() {
  cancelAnimationFrame(rafId);
  rafId = null;
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  snake = [
    { x: Math.floor(COLS / 2) - 1, y: Math.floor(ROWS / 2) },
    { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) },
    { x: Math.floor(COLS / 2) + 1, y: Math.floor(ROWS / 2) },
  ];
  score = 0;
  alive = true;
  tickMs = 90;
  statusEl.textContent = "Click the canvas and start moving.";
  spawnFood();
  draw();
  lastTick = performance.now();
  rafId = requestAnimationFrame(loop);
  updateHud();
}

function updateHud() {
  scoreEl.textContent = `Score: ${score}`;
}

function setDir(x, y) {
  if (!alive) return;
  // no 180-degree turns
  if (x === -dir.x && y === -dir.y) return;
  nextDir = { x, y };
}

function step() {
  if (!alive) return;

  dir = nextDir;
  const head = snake[snake.length - 1];
  const next = { x: head.x + dir.x, y: head.y + dir.y };

  if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) {
    alive = false;
    statusEl.textContent = "Game over. Press Restart.";
    return;
  }

  if (snake.some((s) => eq(s, next))) {
    alive = false;
    statusEl.textContent = "Game over. Press Restart.";
    return;
  }

  snake.push(next);

  if (eq(next, food)) {
    score += 1;
    tickMs = Math.max(45, tickMs - 1.5);
    spawnFood();
  } else {
    snake.shift();
  }

  updateHud();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // grid-ish background
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if ((x + y) % 2 === 0) ctx.fillRect(x * GRID, y * GRID, GRID, GRID);
    }
  }

  // food
  ctx.fillStyle = "rgba(255,91,110,0.92)";
  ctx.beginPath();
  ctx.arc(food.x * GRID + GRID / 2, food.y * GRID + GRID / 2, GRID * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // snake
  for (let i = 0; i < snake.length; i++) {
    const p = snake[i];
    const t = i / Math.max(1, snake.length - 1);
    ctx.fillStyle = `rgba(59,230,193,${0.25 + 0.75 * (0.5 + t / 2)})`;
    ctx.fillRect(p.x * GRID + 2, p.y * GRID + 2, GRID - 4, GRID - 4);
  }
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  const elapsed = now - lastTick;
  if (elapsed >= tickMs) {
    lastTick = now;
    step();
    draw();
  }
}

function onKey(ev) {
  const k = ev.key.toLowerCase();
  if (k === "arrowup" || k === "w") setDir(0, -1);
  if (k === "arrowdown" || k === "s") setDir(0, 1);
  if (k === "arrowleft" || k === "a") setDir(-1, 0);
  if (k === "arrowright" || k === "d") setDir(1, 0);
}

window.addEventListener("keydown", onKey);
restartEl.addEventListener("click", reset);
canvas.addEventListener("pointerdown", () => canvas.focus?.());

function bindBtn(btn, x, y) {
  if (!btn) return;
  const act = (e) => {
    e.preventDefault?.();
    setDir(x, y);
  };
  btn.addEventListener("click", act);
  btn.addEventListener("pointerdown", act);
}

bindBtn(upEl, 0, -1);
bindBtn(downEl, 0, 1);
bindBtn(leftEl, -1, 0);
bindBtn(rightEl, 1, 0);

reset();
