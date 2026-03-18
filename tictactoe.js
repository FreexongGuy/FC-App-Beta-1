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
const difficultyEl = document.getElementById("tttDifficulty");
const ctx = canvas.getContext("2d");

const HUMAN = "X";
const BOT = "O";

const state = {
  board: Array(9).fill(null),
  turn: HUMAN,
  winner: null,
  over: false,
};

const DIFF_KEY = "fcapp_ttt_difficulty";
function getDifficulty() {
  const d = (difficultyEl?.value || localStorage.getItem(DIFF_KEY) || "medium").trim();
  return d === "easy" || d === "hard" ? d : "medium";
}

function setDifficulty(next) {
  const d = next === "easy" || next === "hard" ? next : "medium";
  localStorage.setItem(DIFF_KEY, d);
  if (difficultyEl) difficultyEl.value = d;
  setStatus();
}

setDifficulty(localStorage.getItem(DIFF_KEY) || "medium");
difficultyEl?.addEventListener("change", () => setDifficulty(difficultyEl.value));

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
    const diff = getDifficulty();
    const diffLabel = diff[0].toUpperCase() + diff.slice(1);
    statusEl.textContent =
      state.turn === HUMAN ? `Your turn. (${diffLabel})` : `Bot thinking… (${diffLabel})`;
    return;
  }
  if (state.winner === "draw") {
    statusEl.textContent = "Draw. Press Reset to play again.";
    return;
  }
  statusEl.textContent =
    state.winner === HUMAN
      ? "You win! Press Reset to play again."
      : "Bot wins. Press Reset to play again.";
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
  state.turn = HUMAN;
  state.winner = null;
  state.over = false;
  setStatus();
  draw();
}

function emptyCells(board) {
  const out = [];
  for (let i = 0; i < board.length; i++) if (!board[i]) out.push(i);
  return out;
}

function pickRandomEmpty(board) {
  const empties = emptyCells(board);
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

function minimax(board, isBotTurn, depth) {
  const winner = computeWinner(board);
  if (winner) {
    if (winner === BOT) return { score: 10 - depth };
    if (winner === HUMAN) return { score: depth - 10 };
    return { score: 0 };
  }

  const empties = emptyCells(board);
  if (isBotTurn) {
    let best = { score: -Infinity, idx: empties[0] };
    for (const idx of empties) {
      board[idx] = BOT;
      const res = minimax(board, false, depth + 1);
      board[idx] = null;
      if (res.score > best.score) best = { score: res.score, idx };
    }
    return best;
  }

  let best = { score: Infinity, idx: empties[0] };
  for (const idx of empties) {
    board[idx] = HUMAN;
    const res = minimax(board, true, depth + 1);
    board[idx] = null;
    if (res.score < best.score) best = { score: res.score, idx };
  }
  return best;
}

function botMove() {
  if (state.over || state.turn !== BOT) return;
  const diff = getDifficulty();
  let idx = null;
  if (diff === "easy") {
    idx = pickRandomEmpty(state.board);
  } else if (diff === "medium") {
    // Mostly smart, but sometimes makes a mistake.
    idx = Math.random() < 0.28 ? pickRandomEmpty(state.board) : minimax([...state.board], true, 0).idx;
  } else {
    idx = minimax([...state.board], true, 0).idx;
  }

  if (idx == null || state.board[idx]) return;

  state.board[idx] = BOT;
  const winner = computeWinner(state.board);
  if (winner) {
    state.over = true;
    state.winner = winner;
  } else {
    state.turn = HUMAN;
  }
  setStatus();
  draw();
}

function handleClick(ev) {
  if (state.over) return;
  if (state.turn !== HUMAN) return;
  const rect = canvas.getBoundingClientRect();
  const px = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const py = (ev.clientY - rect.top) * (canvas.height / rect.height);
  const cell = canvas.width / 3;
  const col = Math.max(0, Math.min(2, Math.floor(px / cell)));
  const row = Math.max(0, Math.min(2, Math.floor(py / cell)));
  const idx = row * 3 + col;
  if (state.board[idx]) return;

  state.board[idx] = HUMAN;
  const winner = computeWinner(state.board);
  if (winner) {
    state.over = true;
    state.winner = winner;
  } else {
    state.turn = BOT;
  }

  setStatus();
  draw();

  if (!state.over) {
    window.setTimeout(botMove, 220);
  }
}

canvas.addEventListener("pointerdown", handleClick);
resetEl.addEventListener("click", reset);

reset();
