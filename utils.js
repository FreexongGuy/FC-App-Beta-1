import {
  database,
  ref,
  get,
  set,
  update,
  push,
  remove,
  query,
  limitToLast,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  serverTimestamp,
} from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

if (localStorage.getItem("fcapp_dev") !== "1") {
  window.location.href = "developerverification.html";
}

const titleEl = document.getElementById("utils-title");
const signoutEl = document.getElementById("signout");
const messagesEl = document.getElementById("admin-messages");
const accountsTbodyEl = document.getElementById("accounts-tbody");
const accountsStatusEl = document.getElementById("accounts-status");
const shutdownBtnEl = document.getElementById("shutdown-chat");
const reopenBtnEl = document.getElementById("reopen-chat");
const shutdownStatusEl = document.getElementById("shutdown-status");

const announceFormEl = document.getElementById("announce-form");
const announceTitleEl = document.getElementById("announce-title");
const announceTextEl = document.getElementById("announce-text");
const announceSendEl = document.getElementById("announce-send");
const announceStatusEl = document.getElementById("announce-status");
const announceListEl = document.getElementById("announce-list");

titleEl.textContent = `Developer Utils • ${user}`;

signoutEl.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

function setStatus(el, message, kind) {
  el.textContent = message || "";
  el.className = "";
  if (kind === "ok") el.classList.add("status--ok");
  if (kind === "error") el.classList.add("status--error");
}

const NO_CONFIRM_DELETE_MSG_KEY = "fcapp_utils_no_confirm_delete_message";
const NO_CONFIRM_DELETE_ANN_KEY = "fcapp_utils_no_confirm_delete_announcement";
function shouldConfirmMessageDelete() {
  return localStorage.getItem(NO_CONFIRM_DELETE_MSG_KEY) !== "1";
}
function shouldConfirmAnnouncementDelete() {
  return localStorage.getItem(NO_CONFIRM_DELETE_ANN_KEY) !== "1";
}

function formatTime(ts) {
  const date = new Date(typeof ts === "number" ? ts : Date.now());
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderAdminRow({ id, title, subtitle, body, onDelete, onEdit }) {
  const li = document.createElement("li");
  li.className = "admin-row";
  li.dataset.id = id;

  const meta = document.createElement("div");
  meta.className = "admin-row__meta";

  const left = document.createElement("div");
  left.className = "admin-row__left";

  const h = document.createElement("div");
  h.className = "admin-row__title";
  h.textContent = title;

  const s = document.createElement("div");
  s.className = "admin-row__subtitle";
  s.textContent = subtitle;

  left.appendChild(h);
  left.appendChild(s);

  const actions = document.createElement("div");
  actions.className = "admin-row__actions";

  if (typeof onEdit === "function") {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn-quiet";
    edit.textContent = "Edit";
    edit.addEventListener("click", onEdit);
    actions.appendChild(edit);
  }

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn-quiet btn-quiet--danger";
  del.textContent = "Remove";
  del.addEventListener("click", onDelete);

  actions.appendChild(del);
  meta.appendChild(left);
  meta.appendChild(actions);

  const b = document.createElement("div");
  b.className = "admin-row__body";
  b.textContent = body || "";

  li.appendChild(meta);
  li.appendChild(b);
  return li;
}

function updateAdminRow(node, { title, subtitle, body }) {
  if (!node) return;
  const titleEl = node.querySelector(".admin-row__title");
  const subtitleEl = node.querySelector(".admin-row__subtitle");
  const bodyEl = node.querySelector(".admin-row__body");
  if (titleEl && title != null) titleEl.textContent = title;
  if (subtitleEl && subtitle != null) subtitleEl.textContent = subtitle;
  if (bodyEl && body != null) bodyEl.textContent = body;
}

// --- Chat shutdown controls
const shutdownRef = ref(database, "config/chatShutdown");
const shutdownMetaRef = ref(database, "config/chatShutdownMeta");

async function refreshShutdownStatus() {
  try {
    const snap = await get(shutdownRef);
    const isShutdown = snap.exists() ? Boolean(snap.val()) : false;
    shutdownStatusEl.textContent = isShutdown ? "Status: SHUTDOWN" : "Status: OPEN";
    shutdownStatusEl.className = "admin-actions__status";
    if (isShutdown) shutdownStatusEl.classList.add("status--error");
    else shutdownStatusEl.classList.add("status--ok");

    shutdownBtnEl.disabled = isShutdown;
    reopenBtnEl.disabled = !isShutdown;
  } catch (err) {
    shutdownStatusEl.textContent = `Status: unknown (${err?.message || String(err)})`;
    shutdownStatusEl.className = "admin-actions__status status--error";
  }
}

shutdownBtnEl.addEventListener("click", async () => {
  if (!confirm("Shutdown chat for everyone?")) return;
  shutdownBtnEl.disabled = true;
  reopenBtnEl.disabled = true;
  try {
    await set(shutdownRef, true);
    await set(shutdownMetaRef, { by: user, at: serverTimestamp() });
  } catch (err) {
    alert(err?.message || String(err));
  } finally {
    refreshShutdownStatus();
  }
});

reopenBtnEl.addEventListener("click", async () => {
  if (!confirm("Reopen chat?")) return;
  shutdownBtnEl.disabled = true;
  reopenBtnEl.disabled = true;
  try {
    await set(shutdownRef, false);
    await set(shutdownMetaRef, { by: user, at: serverTimestamp() });
  } catch (err) {
    alert(err?.message || String(err));
  } finally {
    refreshShutdownStatus();
  }
});

refreshShutdownStatus();

// --- Accounts table
const usersRef = ref(database, "users");
const seenUsers = new Set();

function profileKey(username) {
  return String(username || "").replace(/[.#$\[\]\/]/g, "_");
}

function isValidUsername(username) {
  const u = String(username || "").trim();
  if (!u) return false;
  if (u.length > 32) return false;
  // Firebase RTDB keys disallow: . # $ [ ] /
  if (/[.#$\[\]\/]/.test(u)) return false;
  return true;
}

function maskPassword(pw) {
  if (typeof pw !== "string" || !pw) return "—";
  return "••••••••";
}

function eyeIconSvg() {
  return `
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12 5c5.5 0 9.6 4.4 10.9 6.2.2.3.2.8 0 1.1C21.6 14.1 17.5 18.5 12 18.5S2.4 14.1 1.1 12.3a1 1 0 0 1 0-1.1C2.4 9.4 6.5 5 12 5Zm0 2C8.1 7 4.9 10.1 3.2 12c1.7 1.9 4.9 5 8.8 5s7.1-3.1 8.8-5C19.1 10.1 15.9 7 12 7Zm0 1.8A3.2 3.2 0 1 1 12 15.2 3.2 3.2 0 0 1 12 8.8Zm0 2A1.2 1.2 0 1 0 12 13.2 1.2 1.2 0 0 0 12 10.8Z"/>
    </svg>
  `;
}

function setPasswordCell(tr, password, revealed) {
  const pwText = tr.querySelector(".pw-text");
  const toggle = tr.querySelector(".pw-toggle");
  if (!pwText || !toggle) return;

  const hasPw = typeof password === "string" && password.length > 0;
  const show = Boolean(revealed) && hasPw;

  pwText.textContent = show ? password : maskPassword(password);
  toggle.disabled = !hasPw;
  toggle.setAttribute("aria-pressed", show ? "true" : "false");
  toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
  toggle.title = show ? "Hide" : "Show";
  tr.dataset.pwRevealed = show ? "1" : "0";
}

onChildAdded(usersRef, (snap) => {
  const username = snap.key;
  if (!username) return;
  if (seenUsers.has(username)) return;
  seenUsers.add(username);

  const value = snap.val() || {};
  const password = typeof value.password === "string" ? value.password : "";

  const tr = document.createElement("tr");
  tr.dataset.username = username;
  tr.dataset.password = password;

  const tdUser = document.createElement("td");
  tdUser.textContent = username;

  const tdPw = document.createElement("td");
  const pwSpan = document.createElement("span");
  pwSpan.className = "pw-text";
  tdPw.appendChild(pwSpan);

  const tdReveal = document.createElement("td");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn pw-toggle";
  btn.innerHTML = eyeIconSvg();
  btn.addEventListener("click", () => {
    const next = tr.dataset.pwRevealed !== "1";
    setPasswordCell(tr, tr.dataset.password || "", next);
  });
  tdReveal.appendChild(btn);

  const tdChange = document.createElement("td");
  const changeBtn = document.createElement("button");
  changeBtn.type = "button";
  changeBtn.className = "btn-quiet btn-quiet--sm";
  changeBtn.textContent = "Change";
  changeBtn.addEventListener("click", async () => {
    const newPw = prompt(`Enter a new password for:\n\n${username}`);
    if (newPw === null) return;
    const trimmed = String(newPw).trim();
    if (!trimmed) {
      alert("Password cannot be empty.");
      return;
    }

    try {
      await set(ref(database, `users/${username}/password`), trimmed);
      tr.dataset.password = trimmed;
      const isRevealed = tr.dataset.pwRevealed === "1";
      setPasswordCell(tr, trimmed, isRevealed);
    } catch (err) {
      alert(err?.message || String(err));
    }
  });
  tdChange.appendChild(changeBtn);

  const tdRename = document.createElement("td");
  const renameBtn = document.createElement("button");
  renameBtn.type = "button";
  renameBtn.className = "btn-quiet btn-quiet--sm";
  renameBtn.textContent = "Rename";
  renameBtn.addEventListener("click", async () => {
    const current = tr.dataset.username || username;
    const nextRaw = prompt(`Rename account:\n\n${current}\n\nto:`);
    if (nextRaw === null) return;
    const next = String(nextRaw || "").trim();

    if (next === current) return;
    if (!isValidUsername(next)) {
      alert("Invalid username. Use up to 32 characters and avoid: . # $ [ ] /");
      return;
    }

    try {
      const existingSnap = await get(ref(database, `users/${next}`));
      if (existingSnap.exists()) {
        alert("That username already exists.");
        return;
      }

      const userSnap = await get(ref(database, `users/${current}`));
      if (!userSnap.exists()) {
        alert("Account no longer exists.");
        return;
      }

      const userValue = userSnap.val() || {};
      const pw = typeof userValue.password === "string" ? userValue.password : "";

      const oldProfileKey = profileKey(current);
      const newProfileKey = profileKey(next);
      const profileSnap = await get(ref(database, `profiles/${oldProfileKey}`));
      const profileValue = profileSnap.exists() ? profileSnap.val() || {} : null;

      const updates = {};
      updates[`users/${next}`] = { ...userValue, username: next, password: pw };
      updates[`users/${current}`] = null;

      if (profileValue) {
        updates[`profiles/${newProfileKey}`] = { ...profileValue, username: next };
        updates[`profiles/${oldProfileKey}`] = null;
      }

      await update(ref(database), updates);
    } catch (err) {
      alert(err?.message || String(err));
    }
  });
  tdRename.appendChild(renameBtn);

  const tdRemove = document.createElement("td");
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-quiet btn-quiet--danger btn-quiet--sm";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", async () => {
    const typed = prompt(`Type the username to confirm deletion:\n\n${username}`);
    if (typed !== username) return;

    try {
      await remove(ref(database, `users/${username}`));
      await remove(ref(database, `profiles/${profileKey(username)}`));
    } catch (err) {
      alert(err?.message || String(err));
    }
  });
  tdRemove.appendChild(removeBtn);

  tr.appendChild(tdUser);
  tr.appendChild(tdPw);
  tr.appendChild(tdReveal);
  tr.appendChild(tdChange);
  tr.appendChild(tdRename);
  tr.appendChild(tdRemove);
  accountsTbodyEl.appendChild(tr);

  setPasswordCell(tr, password, false);
});

onChildChanged(usersRef, (snap) => {
  const username = snap.key;
  if (!username) return;
  const tr = accountsTbodyEl.querySelector(`tr[data-username="${CSS.escape(username)}"]`);
  if (!tr) return;

  const value = snap.val() || {};
  const password = typeof value.password === "string" ? value.password : "";
  tr.dataset.password = password;
  setPasswordCell(tr, password, tr.dataset.pwRevealed === "1");
});

onChildRemoved(usersRef, (snap) => {
  const username = snap.key;
  if (!username) return;
  seenUsers.delete(username);
  const row = accountsTbodyEl.querySelector(`tr[data-username="${CSS.escape(username)}"]`);
  row?.remove();
});

get(usersRef)
  .then(() => setStatus(accountsStatusEl, "", null))
  .catch((err) =>
    setStatus(accountsStatusEl, `Accounts read blocked: ${err?.message || String(err)}`, "error")
  );

// --- Chat moderation
const messagesRef = ref(database, "messages");
const messagesQuery = query(messagesRef, limitToLast(200));

onChildAdded(messagesQuery, (snap) => {
  const value = snap.val() || {};
  const id = snap.key;
  if (!id) return;

  const row = renderAdminRow({
    id,
    title: value.username || "unknown",
    subtitle: formatTime(value.ts),
    body: value.text || "",
    onEdit: async () => {
      const currentText =
        messagesEl
          .querySelector(`.admin-row[data-id="${CSS.escape(id)}"]`)
          ?.querySelector(".admin-row__body")?.textContent || "";
      const next = prompt("Edit message text:", currentText);
      if (next === null) return;
      const trimmed = String(next).trim().slice(0, 500);
      if (!trimmed) {
        alert("Message cannot be empty.");
        return;
      }
      try {
        await update(ref(database, `messages/${id}`), {
          text: trimmed,
          editedAt: serverTimestamp(),
          editedBy: user,
        });
      } catch (err) {
        alert(err?.message || String(err));
      }
    },
    onDelete: async () => {
      if (shouldConfirmMessageDelete() && !confirm("Remove this message?")) return;
      try {
        await remove(ref(database, `messages/${id}`));
      } catch (err) {
        alert(err?.message || String(err));
      }
    },
  });

  messagesEl.appendChild(row);
});

onChildRemoved(messagesRef, (snap) => {
  const id = snap.key;
  if (!id) return;
  const node = messagesEl.querySelector(`.admin-row[data-id="${CSS.escape(id)}"]`);
  node?.remove();
});

onChildChanged(messagesRef, (snap) => {
  const id = snap.key;
  if (!id) return;
  const value = snap.val() || {};
  const node = messagesEl.querySelector(`.admin-row[data-id="${CSS.escape(id)}"]`);
  if (!node) return;
  const edited = value.editedAt ? " • edited" : "";
  updateAdminRow(node, {
    title: value.username || "unknown",
    subtitle: `${formatTime(value.ts)}${edited}`,
    body: value.text || "",
  });
});

// --- Announcements admin
const announcementsRef = ref(database, "announcements");
const announcementsQuery = query(announcementsRef, limitToLast(200));

announceFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus(announceStatusEl, "", null);

  const title = String(announceTitleEl.value || "").trim().slice(0, 80);
  const text = String(announceTextEl.value || "").trim().slice(0, 280);
  if (!text) return;

  announceSendEl.disabled = true;
  announceTitleEl.disabled = true;
  announceTextEl.disabled = true;

  try {
    const newRef = push(announcementsRef);
    await set(newRef, {
      title,
      text,
      author: user,
      ts: serverTimestamp(),
    });

    announceTitleEl.value = "";
    announceTextEl.value = "";
    setStatus(announceStatusEl, "Posted.", "ok");
  } catch (err) {
    setStatus(announceStatusEl, err?.message || String(err), "error");
  } finally {
    announceSendEl.disabled = false;
    announceTitleEl.disabled = false;
    announceTextEl.disabled = false;
  }
});

onChildAdded(announcementsQuery, (snap) => {
  const value = snap.val() || {};
  const id = snap.key;
  if (!id) return;

  const header = value.title ? value.title : "Announcement";
  const subtitle = `${value.author || "unknown"} • ${formatTime(value.ts)}`;
  const row = renderAdminRow({
    id,
    title: header,
    subtitle,
    body: value.text || "",
    onDelete: async () => {
      if (shouldConfirmAnnouncementDelete() && !confirm("Remove this announcement?")) return;
      try {
        await remove(ref(database, `announcements/${id}`));
      } catch (err) {
        alert(err?.message || String(err));
      }
    },
  });

  announceListEl.appendChild(row);
});

onChildRemoved(announcementsRef, (snap) => {
  const id = snap.key;
  if (!id) return;
  const node = announceListEl.querySelector(`.admin-row[data-id="${CSS.escape(id)}"]`);
  node?.remove();
});

// Quick permission sanity check (helps show rules issues early).
get(announcementsRef).catch((err) => {
  setStatus(
    announceStatusEl,
    `Announcements read blocked: ${err?.message || String(err)}`,
    "error"
  );
});
