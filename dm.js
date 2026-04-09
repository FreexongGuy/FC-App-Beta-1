import {
  database,
  ref,
  get,
  push,
  set,
  update,
  onChildAdded,
  onChildRemoved,
  onChildChanged,
  query,
  limitToLast,
  serverTimestamp,
} from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

const to = (new URL(window.location.href).searchParams.get("to") || "").trim();
if (!to) {
  window.location.href = "contacts.html";
}

const titleEl = document.getElementById("dm-title");
const messagesEl = document.getElementById("messages");
const composerEl = document.getElementById("composer");
const messageInput = document.getElementById("message");
const sendBtn = document.getElementById("send");
const statusEl = document.getElementById("status");

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

function profileKey(username) {
  return String(username || "").replace(/[.#$\[\]\/]/g, "_");
}

function threadIdFor(a, b) {
  const x = String(a || "").trim();
  const y = String(b || "").trim();
  const ax = x.toLowerCase();
  const by = y.toLowerCase();
  const first = ax <= by ? x : y;
  const second = ax <= by ? y : x;
  return `dm_${profileKey(first)}__${profileKey(second)}`;
}

const threadId = threadIdFor(user, to);
titleEl.textContent = `DM • ${to}`;

async function verifyRecipient() {
  if (to === user) {
    setStatus("You can’t DM yourself.", "error");
    sendBtn.disabled = true;
    messageInput.disabled = true;
    return false;
  }
  try {
    const snap = await get(ref(database, `users/${to}`));
    if (!snap.exists()) {
      setStatus("That account does not exist.", "error");
      sendBtn.disabled = true;
      messageInput.disabled = true;
      return false;
    }
    return true;
  } catch (err) {
    setStatus(err?.message || String(err), "error");
    return false;
  }
}

function initials(username) {
  const parts = String(username || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] || "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

const avatarCache = new Map(); // username -> { src, fetchedAt }
const avatarInFlight = new Map(); // username -> Promise<string|null>

function applyAvatarToUsername(username, src) {
  if (!username || !src) return;
  const nodes = messagesEl.querySelectorAll(`.avatar[data-username="${CSS.escape(username)}"]`);
  for (const avatar of nodes) {
    if (!avatar.isConnected) continue;
    if (avatar.querySelector("img")) continue;

    const fallback = document.createElement("span");
    fallback.className = "avatar__fallback";
    fallback.textContent = initials(username);

    const img = document.createElement("img");
    img.alt = `${username} profile picture`;
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = src;
    img.addEventListener("error", () => {
      if (!img.isConnected) return;
      img.remove();
      if (!avatar.querySelector(".avatar__fallback")) {
        avatar.appendChild(fallback);
      }
    });

    avatar.textContent = "";
    avatar.appendChild(img);
  }
}

async function getAvatarSrc(username) {
  if (!username) return null;

  const inflight = avatarInFlight.get(username);
  if (inflight) return inflight;

  const existing = avatarCache.get(username);
  if (existing) {
    const ageMs = Date.now() - (existing.fetchedAt || 0);
    const ttlMs = existing.src ? 10 * 60 * 1000 : 0;
    if (ageMs < ttlMs) return existing.src;
  }

  const promise = (async () => {
    try {
      const snap = await get(ref(database, `profiles/${profileKey(username)}`));
      const value = snap.exists() ? snap.val() || {} : {};
      const src =
        (typeof value.photoDataURL === "string" && value.photoDataURL) ||
        (typeof value.photoURL === "string" && value.photoURL) ||
        null;
      avatarCache.set(username, { src, fetchedAt: Date.now() });
      applyAvatarToUsername(username, src);
      return src;
    } catch (err) {
      console.warn("Failed to load profile for avatar:", username, err);
      avatarCache.set(username, { src: null, fetchedAt: Date.now() });
      return null;
    } finally {
      avatarInFlight.delete(username);
    }
  })();

  avatarInFlight.set(username, promise);
  return promise;
}

function isNearBottom(container) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < 80;
}

function formatTime(ts) {
  const date = new Date(typeof ts === "number" ? ts : Date.now());
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addMessage({ id, from, text, ts }, { stickToBottom }) {
  const row = document.createElement("li");
  row.className = from === user ? "msg-row msg-row--me" : "msg-row";
  if (id) row.dataset.id = id;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.dataset.username = from || "";

  const fallback = document.createElement("span");
  fallback.className = "avatar__fallback";
  fallback.textContent = initials(from);
  avatar.appendChild(fallback);

  const bubble = document.createElement("div");
  bubble.className = from === user ? "msg msg--me" : "msg";

  const header = document.createElement("div");
  header.className = "msg__meta";

  const name = document.createElement("span");
  name.className = "msg__user";
  name.textContent = from || "unknown";

  const time = document.createElement("time");
  time.className = "msg__time";
  time.textContent = formatTime(ts);

  header.appendChild(name);
  header.appendChild(time);

  const body = document.createElement("div");
  body.className = "msg__body";
  body.textContent = text || "";

  bubble.appendChild(header);
  bubble.appendChild(body);

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesEl.appendChild(row);

  getAvatarSrc(from).then(() => {});

  if (stickToBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  return row;
}

const baseRef = ref(database, `dmThreads/${threadId}`);
const messagesRef = ref(database, `dmThreads/${threadId}/messages`);
const metaRef = ref(database, `dmThreads/${threadId}/meta`);
const messagesQuery = query(messagesRef, limitToLast(100));

const messageNodeById = new Map();
const pendingRemovals = new Set();

function markRemoved(id) {
  if (!id) return;
  pendingRemovals.add(id);
}

function flushRemovals() {
  if (pendingRemovals.size === 0) return;
  for (const id of pendingRemovals) {
    const node =
      messageNodeById.get(id) ||
      messagesEl.querySelector(`.msg-row[data-id="${CSS.escape(id)}"]`);
    node?.remove();
    messageNodeById.delete(id);
    pendingRemovals.delete(id);
  }
}

onChildAdded(messagesQuery, (snap) => {
  const stickToBottom = isNearBottom(messagesEl);
  const value = snap.val() || {};
  const id = snap.key;
  const node = addMessage(
    {
      id,
      from: value.from,
      text: value.text,
      ts: value.ts,
    },
    { stickToBottom }
  );

  if (id && node) messageNodeById.set(id, node);
  flushRemovals();
});

onChildRemoved(messagesRef, (snap) => {
  const id = snap.key;
  if (!id) return;
  markRemoved(id);
});

onChildChanged(messagesRef, (snap) => {
  const id = snap.key;
  if (!id) return;
  const value = snap.val() || {};
  const node =
    messageNodeById.get(id) || messagesEl.querySelector(`.msg-row[data-id="${CSS.escape(id)}"]`);
  if (!node) return;

  const body = node.querySelector(".msg__body");
  if (body) body.textContent = value.text || "";

  const time = node.querySelector(".msg__time");
  if (time) time.textContent = formatTime(value.ts);
});

const removalInterval = window.setInterval(() => {
  flushRemovals();
}, 500);
window.addEventListener("beforeunload", () => window.clearInterval(removalInterval));

composerEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = await verifyRecipient();
  if (!ok) return;

  const text = (messageInput.value || "").trim();
  if (!text) return;

  const safeText = text.slice(0, 500);

  messageInput.disabled = true;
  sendBtn.disabled = true;

  try {
    const newMsgRef = push(messagesRef);
    await set(newMsgRef, {
      from: user,
      to,
      text: safeText,
      ts: serverTimestamp(),
    });

    await update(metaRef, {
      a: user,
      b: to,
      updatedAt: serverTimestamp(),
      lastFrom: user,
      lastText: safeText.slice(0, 120),
    });

    // Ensure the thread container exists (useful for future listing/indexing)
    await update(baseRef, { exists: true });

    messageInput.value = "";
    messageInput.focus();
    setStatus("", null);
  } catch (err) {
    setStatus(err?.message || String(err), "error");
  } finally {
    messageInput.disabled = false;
    sendBtn.disabled = false;
  }
});

verifyRecipient();

