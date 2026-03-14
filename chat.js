import {
  database,
  ref,
  push,
  set,
  onChildAdded,
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

titleEl.textContent = `FC Chat • ${user}`;

signoutEl.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  window.location.href = "index.html";
});

function isNearBottom(container) {
  // If user has scrolled up, don't yank scroll position on new messages.
  return container.scrollHeight - container.scrollTop - container.clientHeight < 80;
}

function formatTime(ts) {
  const date = new Date(typeof ts === "number" ? ts : Date.now());
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addMessage({ username, text, ts }, { stickToBottom }) {
  const li = document.createElement("li");
  li.className = username === user ? "msg msg--me" : "msg";

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

  li.appendChild(header);
  li.appendChild(body);
  messagesEl.appendChild(li);

  if (stickToBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

const messagesRef = ref(database, "messages");
const messagesQuery = query(messagesRef, limitToLast(100));

onChildAdded(messagesQuery, (snap) => {
  const stickToBottom = isNearBottom(messagesEl);
  const value = snap.val() || {};
  addMessage(
    {
      username: value.username,
      text: value.text,
      ts: value.ts,
    },
    { stickToBottom }
  );
});

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
    await set(newMsgRef, {
      username: user,
      text: safeText,
      ts: serverTimestamp(),
    });

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

