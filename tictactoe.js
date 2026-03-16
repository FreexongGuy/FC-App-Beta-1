const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  window.location.href = "index.html";
});

const canvas = document.getElementById("tttCanvas");
const statusEl = document.getElementById("tttStatus");
const resetEl = document.getElementById("tttReset");
const ctx = canvas.getContext("2d");

const state = {
  board: Array(9).fill(null),
  turn: "X",
  winner: null,
  over: false,
};

function lines() {
  return [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
}

function computeWinner(board) {
  for (const [a, b, c] of lines()) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  if (board.every(Boolean)) return "draw";
  return null;
}

function setStatus() {
  if (!state.over) {
    statusEl.textContent = `${state.turn}’s turn.`;
    return;
  }
  if (state.winner === "draw") {
    statusEl.textContent = "Draw. Press Reset to play again.";
    return;
  }
  statusEl.textContent = `${state.winner} wins! Press Reset to play again.`;
}

function draw() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Board
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.26)";
  ctx.lineCap = "round";

  const cell = w / 3;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 18);
    ctx.lineTo(i * cell, h - 18);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(18, i * cell);
    ctx.lineTo(w - 18, i * cell);
    ctx.stroke();
  }

  // Pieces
  for (let idx = 0; idx < 9; idx++) {
    const v = state.board[idx];
    if (!v) continue;
    const x = (idx % 3) * cell;
    const y = Math.floor(idx / 3) * cell;
    const pad = 36;

    if (v === "X") {
      ctx.strokeStyle = "rgba(59,230,193,0.92)";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(x + pad, y + pad);
      ctx.lineTo(x + cell - pad, y + cell - pad);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + cell - pad, y + pad);
      ctx.lineTo(x + pad, y + cell - pad);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(255,91,110,0.92)";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, (cell - pad * 2) / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function reset() {
  state.board.fill(null);
  state.turn = "X";
  state.winner = null;
  state.over = false;
  setStatus();
  draw();
}

function handleClick(ev) {
  if (state.over) return;
  const rect = canvas.getBoundingClientRect();
  const px = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const py = (ev.clientY - rect.top) * (canvas.height / rect.height);
  const cell = canvas.width / 3;
  const col = Math.max(0, Math.min(2, Math.floor(px / cell)));
  const row = Math.max(0, Math.min(2, Math.floor(py / cell)));
  const idx = row * 3 + col;
  if (state.board[idx]) return;

  state.board[idx] = state.turn;
  const winner = computeWinner(state.board);
  if (winner) {
    state.over = true;
    state.winner = winner;
  } else {
    state.turn = state.turn === "X" ? "O" : "X";
  }

  setStatus();
  draw();
}

canvas.addEventListener("pointerdown", handleClick);
resetEl.addEventListener("click", reset);

reset();

