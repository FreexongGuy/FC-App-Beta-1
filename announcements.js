import {
  database,
  ref,
  remove,
  query,
  limitToLast,
  onChildAdded,
  onChildRemoved,
} from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
const signoutEl = document.getElementById("signout");
const listEl = document.getElementById("ann-list");

if (!user) {
  // Allow viewing without login if you want later; for now keep consistent with the app.
  window.location.href = "index.html";
}

signoutEl.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

const isDev = localStorage.getItem("fcapp_dev") === "1";
const NO_CONFIRM_DELETE_ANN_KEY = "fcapp_utils_no_confirm_delete_announcement";
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

function renderAnnouncement({ id, title, text, author, ts }) {
  const li = document.createElement("li");
  li.className = "ann-item";
  li.dataset.id = id;

  const head = document.createElement("div");
  head.className = "ann-item__head";

  const t = document.createElement("div");
  t.className = "ann-item__title";
  t.textContent = title || "Announcement";

  const meta = document.createElement("div");
  meta.className = "ann-item__meta";
  meta.textContent = `${author || "unknown"} • ${formatTime(ts)}`;

  const body = document.createElement("div");
  body.className = "ann-item__body";
  body.textContent = text || "";

  head.appendChild(t);
  if (isDev) {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn-quiet btn-quiet--danger";
    del.textContent = "Remove";
    del.addEventListener("click", async () => {
      if (shouldConfirmAnnouncementDelete() && !confirm("Remove this announcement?")) return;
      try {
        await remove(ref(database, `announcements/${id}`));
      } catch (err) {
        alert(err?.message || String(err));
      }
    });
    head.appendChild(del);
  }

  li.appendChild(head);
  li.appendChild(meta);
  li.appendChild(body);
  return li;
}

const announcementsRef = ref(database, "announcements");
const announcementsQuery = query(announcementsRef, limitToLast(200));

onChildAdded(announcementsQuery, (snap) => {
  const value = snap.val() || {};
  const id = snap.key;
  if (!id) return;

  listEl.appendChild(
    renderAnnouncement({
      id,
      title: value.title,
      text: value.text,
      author: value.author,
      ts: value.ts,
    })
  );
});

onChildRemoved(announcementsRef, (snap) => {
  const id = snap.key;
  if (!id) return;
  const node = listEl.querySelector(`.ann-item[data-id="${CSS.escape(id)}"]`);
  node?.remove();
});
