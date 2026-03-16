const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  window.location.href = "index.html";
});

const canvas = document.getElementById("ppCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("ppScore");
const statusEl = document.getElementById("ppStatus");
const startEl = document.getElementById("ppStart");
const resetEl = document.getElementById("ppReset");

const W = canvas.width;
const H = canvas.height;

const PADDLE_W = 14;
const PADDLE_H = 92;
const BALL_R = 9;

let rafId = null;
let last = performance.now();

const state = {
  running: false,
  you: { x: 26, y: H / 2 - PADDLE_H / 2, vy: 0, score: 0 },
  bot: { x: W - 26 - PADDLE_W, y: H / 2 - PADDLE_H / 2, vy: 0, score: 0 },
  ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function resetBall(servingTo = "bot") {
  state.ball.x = W / 2;
  state.ball.y = H / 2;
  const dir = servingTo === "bot" ? 1 : -1;
  const speed = 440;
  const angle = (Math.random() * 0.6 - 0.3) * Math.PI;
  state.ball.vx = Math.cos(angle) * speed * dir;
  state.ball.vy = Math.sin(angle) * speed;
}

function setStatus() {
  if (state.you.score >= 7) {
    statusEl.textContent = "You win! Press Reset.";
    return;
  }
  if (state.bot.score >= 7) {
    statusEl.textContent = "Bot wins. Press Reset.";
    return;
  }
  statusEl.textContent = state.running ? "" : "Press Serve to start.";
}

function updateHud() {
  scoreEl.textContent = `${state.you.score} - ${state.bot.score}`;
  setStatus();
}

function paddleRect(p) {
  return { x: p.x, y: p.y, w: PADDLE_W, h: PADDLE_H };
}

function circleRectCollide(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

function bounceFromPaddle(p) {
  const rect = paddleRect(p);
  const rel = (state.ball.y - (rect.y + rect.h / 2)) / (rect.h / 2);
  const max = 0.8;
  const ang = clamp(rel, -1, 1) * max;
  const speed = Math.min(820, Math.hypot(state.ball.vx, state.ball.vy) * 1.05);
  const dir = p === state.you ? 1 : -1;
  state.ball.vx = Math.cos(ang) * speed * dir;
  state.ball.vy = Math.sin(ang) * speed;
}

function tick(dt) {
  // input paddles
  state.you.y = clamp(state.you.y + state.you.vy * dt, 8, H - PADDLE_H - 8);

  // bot AI: track the ball with some error and speed limit
  const target = state.ball.y - PADDLE_H / 2;
  const diff = target - state.bot.y;
  const botMax = 520;
  const noise = (Math.random() - 0.5) * 50;
  state.bot.vy = clamp(diff * 4 + noise, -botMax, botMax);
  state.bot.y = clamp(state.bot.y + state.bot.vy * dt, 8, H - PADDLE_H - 8);

  if (!state.running) return;

  // move ball
  state.ball.x += state.ball.vx * dt;
  state.ball.y += state.ball.vy * dt;

  // wall bounce
  if (state.ball.y <= 10 + BALL_R) {
    state.ball.y = 10 + BALL_R;
    state.ball.vy *= -1;
  }
  if (state.ball.y >= H - 10 - BALL_R) {
    state.ball.y = H - 10 - BALL_R;
    state.ball.vy *= -1;
  }

  // paddle collision
  if (circleRectCollide(state.ball.x, state.ball.y, BALL_R, paddleRect(state.you)) && state.ball.vx < 0) {
    state.ball.x = state.you.x + PADDLE_W + BALL_R;
    bounceFromPaddle(state.you);
  }
  if (circleRectCollide(state.ball.x, state.ball.y, BALL_R, paddleRect(state.bot)) && state.ball.vx > 0) {
    state.ball.x = state.bot.x - BALL_R;
    bounceFromPaddle(state.bot);
  }

  // score
  if (state.ball.x < -30) {
    state.bot.score += 1;
    state.running = false;
    resetBall("you");
    updateHud();
  }
  if (state.ball.x > W + 30) {
    state.you.score += 1;
    state.running = false;
    resetBall("bot");
    updateHud();
  }

  if (state.you.score >= 7 || state.bot.score >= 7) {
    state.running = false;
    updateHud();
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // background
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, 0, W, H);

  // court
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 14);
  ctx.lineTo(W / 2, H - 14);
  ctx.stroke();
  ctx.setLineDash([]);

  // borders
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  // paddles
  ctx.fillStyle = "rgba(59,230,193,0.9)";
  ctx.fillRect(state.you.x, state.you.y, PADDLE_W, PADDLE_H);
  ctx.fillStyle = "rgba(255,91,110,0.9)";
  ctx.fillRect(state.bot.x, state.bot.y, PADDLE_W, PADDLE_H);

  // ball
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  tick(dt);
  draw();
}

function resetGame() {
  state.you.score = 0;
  state.bot.score = 0;
  state.running = false;
  state.you.y = H / 2 - PADDLE_H / 2;
  state.bot.y = H / 2 - PADDLE_H / 2;
  resetBall("bot");
  updateHud();
}

function serve() {
  if (state.you.score >= 7 || state.bot.score >= 7) return;
  state.running = true;
  updateHud();
}

function setYouTargetY(y) {
  const target = clamp(y - PADDLE_H / 2, 8, H - PADDLE_H - 8);
  state.you.y = target;
}

canvas.addEventListener("pointermove", (ev) => {
  const rect = canvas.getBoundingClientRect();
  const py = (ev.clientY - rect.top) * (canvas.height / rect.height);
  setYouTargetY(py);
});

window.addEventListener("keydown", (ev) => {
  const k = ev.key.toLowerCase();
  const speed = 640;
  if (k === "arrowup" || k === "w") state.you.vy = -speed;
  if (k === "arrowdown" || k === "s") state.you.vy = speed;
});
window.addEventListener("keyup", (ev) => {
  const k = ev.key.toLowerCase();
  if (k === "arrowup" || k === "w" || k === "arrowdown" || k === "s") state.you.vy = 0;
});

startEl.addEventListener("click", serve);
resetEl.addEventListener("click", resetGame);

resetGame();
rafId = requestAnimationFrame(loop);

