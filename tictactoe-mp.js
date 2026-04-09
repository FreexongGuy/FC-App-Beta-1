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

const W = canvas.width;
const H = canvas.height;

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
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  // Don't use Array.prototype.every on sparse arrays (Firebase can create them).
  let full = true;
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      full = false;
      break;
    }
  }
  if (full) return "draw";
  return null;
}

function normalizeBoard(raw) {
  const out = Array(9).fill("");
  if (Array.isArray(raw)) {
    for (let i = 0; i < 9; i++) {
      const v = raw[i];
      out[i] = v === "X" || v === "O" ? v : "";
    }
    return out;
  }
  if (raw && typeof raw === "object") {
    for (let i = 0; i < 9; i++) {
      const v = raw[i] ?? raw[String(i)];
      out[i] = v === "X" || v === "O" ? v : "";
    }
  }
  return out;
}

let unsub = null;
let currentRoom = null;
let myMark = null; // "X" | "O"
let roomState = null;

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function setMeta(msg) {
  metaEl.textContent = msg || "";
}

function draw(board) {
  ctx.clearRect(0, 0, W, H);
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.26)";
  ctx.lineCap = "round";

  const cell = W / 3;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 18);
    ctx.lineTo(i * cell, H - 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18, i * cell);
    ctx.lineTo(W - 18, i * cell);
    ctx.stroke();
  }

  for (let idx = 0; idx < 9; idx++) {
    const v = board[idx];
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

function updateUiFromState() {
  const s = roomState;
  if (!currentRoom || !s) {
    resetBtn.disabled = true;
    draw(Array(9).fill(""));
    return;
  }

  const board = normalizeBoard(s.board);
  draw(board);

  const winner = computeWinner(board);
  const turn = s.turn || "X";

  if (!myMark) {
    setStatus(`Room ${currentRoom} • Waiting for a seat…`);
    setMeta("If the room is full, try a different code.");
    resetBtn.disabled = true;
    return;
  }

  if (!s.players?.X || !s.players?.O) {
    setStatus(`Room ${currentRoom} • You are ${myMark} • Waiting for opponent…`);
    setMeta("Share the room code with a friend.");
    resetBtn.disabled = true;
    return;
  }

  if (winner) {
    setStatus(`Room ${currentRoom} • ${winner === "draw" ? "Draw" : `${winner} wins`}`);
    setMeta("Press Reset to play again.");
    resetBtn.disabled = false;
    return;
  }

  const yourTurn = turn === myMark;
  setStatus(`Room ${currentRoom} • You are ${myMark} • ${yourTurn ? "Your turn" : "Opponent turn"}`);
  setMeta(`Players: X=${s.players.X} • O=${s.players.O}`);
  resetBtn.disabled = false;
}

async function leaveRoom() {
  if (unsub) unsub();
  unsub = null;
  currentRoom = null;
  myMark = null;
  roomState = null;
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
  myMark = null;
  roomState = null;
  setStatus(`Joining ${rk}…`);

  const roomRef = ref(database, `tttRooms/${rk}`);

  // Ensure room exists
  const snap = await get(roomRef);
  if (!snap.exists()) {
    setStatus("Room not found.");
    await leaveRoom();
    return;
  }

  // Claim seat (transaction)
  await runTransaction(roomRef, (cur) => {
    const v = cur && typeof cur === "object" ? cur : null;
    if (!v) return cur;
    v.players = v.players || {};
    if (v.players.X === user) myMark = "X";
    if (v.players.O === user) myMark = "O";
    if (!myMark) {
      if (!v.players.X) {
        v.players.X = user;
        myMark = "X";
      } else if (!v.players.O) {
        v.players.O = user;
        myMark = "O";
      }
    }
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
  const roomRef = ref(database, `tttRooms/${rk}`);
  await set(roomRef, {
    board: Array(9).fill(""),
    turn: "X",
    players: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await joinRoom(rk);
}

createBtn.addEventListener("click", () => {
  createRoom().catch((err) => setStatus(err?.message || String(err)));
});
joinBtn.addEventListener("click", () => {
  joinRoom(roomCodeEl.value).catch((err) => setStatus(err?.message || String(err)));
});

resetBtn.addEventListener("click", async () => {
  if (!currentRoom) return;
  const roomRef = ref(database, `tttRooms/${currentRoom}`);
  await update(roomRef, { board: Array(9).fill(""), turn: "X", updatedAt: serverTimestamp() });
});

canvas.addEventListener("pointerdown", async (ev) => {
  if (!currentRoom || !roomState || !myMark) return;
  const board = normalizeBoard(roomState.board);
  const winner = computeWinner(board);
  if (winner) return;
  const turn = roomState.turn || "X";
  if (turn !== myMark) return;

  const rect = canvas.getBoundingClientRect();
  const px = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const py = (ev.clientY - rect.top) * (canvas.height / rect.height);
  const cell = canvas.width / 3;
  const col = Math.max(0, Math.min(2, Math.floor(px / cell)));
  const row = Math.max(0, Math.min(2, Math.floor(py / cell)));
  const idx = row * 3 + col;
  if (board[idx]) return;

  const roomRef = ref(database, `tttRooms/${currentRoom}`);
  await runTransaction(roomRef, (cur) => {
    if (!cur || typeof cur !== "object") return cur;
    const b = normalizeBoard(cur.board);
    if (b[idx]) return cur;
    const w = computeWinner(b);
    if (w) return cur;
    const t = cur.turn || "X";
    if (t !== myMark) return cur;
    b[idx] = myMark;
    cur.board = b;
    cur.turn = myMark === "X" ? "O" : "X";
    cur.updatedAt = serverTimestamp();
    return cur;
  });
});

// initial paint
draw(Array(9).fill(""));
