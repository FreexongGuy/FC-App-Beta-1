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
  onValue,
  query,
  limitToLast,
  serverTimestamp,
} from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

const titleEl = document.getElementById("chat-title");
const signoutEl = document.getElementById("signout");
const messagesEl = document.getElementById("messages");
const composerEl = document.getElementById("composer");
const messageInput = document.getElementById("message");
const sendBtn = document.getElementById("send");
const eventBannerEl = document.getElementById("eventBanner");
const eventTitleEl = document.getElementById("eventTitle");
const eventDescEl = document.getElementById("eventDesc");

titleEl.textContent = `FC Chat • ${user}`;
const docTitleBase = `FC Chat • ${user}`;

let unreadCount = 0;
function setUnreadCount(next) {
  unreadCount = Math.max(0, Number(next) || 0);
  document.title = unreadCount > 0 ? `(${unreadCount}) ${docTitleBase}` : docTitleBase;
}

setUnreadCount(0);

// --- Event banner (from Developer Utils)
function hideEvent() {
  if (!eventBannerEl) return;
  eventBannerEl.hidden = true;
  if (eventTitleEl) eventTitleEl.textContent = "";
  if (eventDescEl) eventDescEl.textContent = "";
}

function showEvent({ title, description }) {
  if (!eventBannerEl) return;
  const t = String(title || "").trim();
  const d = String(description || "").trim();
  if (!t && !d) {
    hideEvent();
    return;
  }
  eventBannerEl.hidden = false;
  if (eventTitleEl) eventTitleEl.textContent = t || "Event";
  if (eventDescEl) eventDescEl.textContent = d || "";
}

try {
  const eventRef = ref(database, "events/current");
  onValue(eventRef, (snap) => {
    if (!snap.exists()) {
      hideEvent();
      return;
    }
    const v = snap.val() || {};
    showEvent({
      title: v.title,
      description: v.description,
    });
  });
} catch (err) {
  console.warn("Failed to subscribe to events:", err);
  hideEvent();
}

let shutdownInFlight = false;
async function checkChatShutdown() {
  if (shutdownInFlight) return;
  shutdownInFlight = true;
  try {
    const snap = await get(ref(database, "config/chatShutdown"));
    const isShutdown = snap.exists() ? Boolean(snap.val()) : false;
    if (isShutdown) {
      window.location.href = "shutdown.html";
    }
  } catch (err) {
    console.warn("Shutdown check failed:", err);
  } finally {
    shutdownInFlight = false;
  }
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function safeFileName(name) {
  return String(name || "file")
    .replace(/[^\w.\- ]+/g, "_")
    .trim()
    .slice(0, 120) || "file";
}

function profileKey(username) {
  return String(username || "").replace(/[.#$\[\]\/]/g, "_");
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
    const ttlMs = existing.src ? 10 * 60 * 1000 : 0; // don't cache nulls (so updates apply immediately)
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

signoutEl.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

function isNearBottom(container) {
  // If user has scrolled up, don't yank scroll position on new messages.
  return container.scrollHeight - container.scrollTop - container.clientHeight < 80;
}

function maybeClearUnread() {
  if (!document.hidden && isNearBottom(messagesEl)) {
    setUnreadCount(0);
  }
}

messagesEl.addEventListener("scroll", () => {
  maybeClearUnread();
});

document.addEventListener("visibilitychange", () => {
  maybeClearUnread();
});

window.addEventListener("focus", () => {
  maybeClearUnread();
});

function formatTime(ts) {
  const date = new Date(typeof ts === "number" ? ts : Date.now());
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addMessage({ id, username, text, ts }, { stickToBottom }) {
  const row = document.createElement("li");
  row.className = username === user ? "msg-row msg-row--me" : "msg-row";
  if (id) row.dataset.id = id;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.dataset.username = username || "";

  const fallback = document.createElement("span");
  fallback.className = "avatar__fallback";
  fallback.textContent = initials(username);
  avatar.appendChild(fallback);

  const bubble = document.createElement("div");
  bubble.className = username === user ? "msg msg--me" : "msg";

  const header = document.createElement("div");
  header.className = "msg__meta";

  const name = document.createElement("span");
  name.className = "msg__user";
  name.textContent = username || "unknown";

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

  getAvatarSrc(username).then(() => {
    // getAvatarSrc will apply the avatar to any matching nodes (including this one)
  });

  if (stickToBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  return row;
}

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

const messagesRef = ref(database, "messages");
const messagesQuery = query(messagesRef, limitToLast(100));

// If chat is shutdown, redirect immediately.
checkChatShutdown();

const SHOW_ANN_KEY = "fcapp_chat_show_announcements";
function shouldShowAnnouncements() {
  return localStorage.getItem(SHOW_ANN_KEY) === "1";
}

function addAnnouncement({ title, text, author, ts }, { stickToBottom }) {
  const row = document.createElement("li");
  row.className = "msg-row msg-row--system";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  const fallback = document.createElement("span");
  fallback.className = "avatar__fallback";
  fallback.textContent = "!";
  avatar.appendChild(fallback);

  const bubble = document.createElement("div");
  bubble.className = "msg msg--system";

  const header = document.createElement("div");
  header.className = "msg__meta";

  const name = document.createElement("span");
  name.className = "msg__user";
  name.textContent = "Announcement";

  const time = document.createElement("time");
  time.className = "msg__time";
  time.textContent = formatTime(ts);

  header.appendChild(name);
  header.appendChild(time);

  const body = document.createElement("div");
  body.className = "msg__body";
  const head = title ? `${title}\n` : "";
  const by = author ? `— ${author}\n` : "";
  body.textContent = `${head}${by}${text || ""}`.trim();

  bubble.appendChild(header);
  bubble.appendChild(body);

  row.appendChild(avatar);
  row.appendChild(bubble);
  messagesEl.appendChild(row);

  if (stickToBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  return row;
}

let initialBatch = true;
let initialBatchTimer = null;
function bumpInitialBatchDone() {
  if (!initialBatch) return;
  window.clearTimeout(initialBatchTimer);
  initialBatchTimer = window.setTimeout(() => {
    initialBatch = false;
    maybeClearUnread();
  }, 250);
}

let initialAnnBatch = true;
let initialAnnBatchTimer = null;
function bumpInitialAnnBatchDone() {
  if (!initialAnnBatch) return;
  window.clearTimeout(initialAnnBatchTimer);
  initialAnnBatchTimer = window.setTimeout(() => {
    initialAnnBatch = false;
  }, 250);
}

onChildAdded(messagesQuery, (snap) => {
  const stickToBottom = isNearBottom(messagesEl);
  const value = snap.val() || {};
  const id = snap.key;
  const node = addMessage(
    {
      id,
      username: value.username,
      text: value.text,
      ts: value.ts,
    },
    { stickToBottom }
  );

  if (id && node) messageNodeById.set(id, node);
  flushRemovals();

  bumpInitialBatchDone();
  if (!initialBatch && (document.hidden || !stickToBottom)) {
    setUnreadCount(unreadCount + 1);
  } else {
    maybeClearUnread();
  }
});

const announcementsRef = ref(database, "announcements");
const announcementsQuery = query(announcementsRef, limitToLast(50));
onChildAdded(announcementsQuery, (snap) => {
  const value = snap.val() || {};
  bumpInitialAnnBatchDone();
  if (initialAnnBatch) return;
  if (!shouldShowAnnouncements()) return;

  const stickToBottom = isNearBottom(messagesEl);
  addAnnouncement(
    {
      title: value.title,
      text: value.text,
      author: value.author,
      ts: value.ts,
    },
    { stickToBottom }
  );

  if (document.hidden || !stickToBottom) {
    setUnreadCount(unreadCount + 1);
  } else {
    maybeClearUnread();
  }
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

// Every 0.5s, check if any messages need removal and if chat is shutdown.
const removalInterval = window.setInterval(() => {
  flushRemovals();
  checkChatShutdown();
}, 500);
window.addEventListener("beforeunload", () => window.clearInterval(removalInterval));

composerEl.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = (messageInput.value || "").trim();
  if (!text) return;

  // Basic guard rails against spammy payloads.
  const safeText = text.slice(0, 500);

  messageInput.disabled = true;
  sendBtn.disabled = true;

  try {
    const newMsgRef = push(messagesRef);
    const base = {
      username: user,
      text: safeText,
      ts: serverTimestamp(),
    };

    await set(newMsgRef, base);

    messageInput.value = "";
    messageInput.focus();
  } catch (err) {
    // Minimal UI: fall back to alert so failures aren't silent.
    alert(err?.message || String(err));
  } finally {
    messageInput.disabled = false;
    sendBtn.disabled = false;
  }
});
