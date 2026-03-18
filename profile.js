import {
  database,
  storage,
  ref,
  update,
  get,
  serverTimestamp,
  storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

const profileUserParam = (new URL(window.location.href).searchParams.get("user") || "").trim();
const profileUser = profileUserParam || user;
const isOwnProfile = profileUser === user;

const titleEl = document.getElementById("profile-title");
const signoutEl = document.getElementById("signout");
const formEl = document.getElementById("profile-form");
const fileEl = document.getElementById("avatarFile");
const avatarLabelEl = document.getElementById("avatarLabel");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");
const avatarPreviewEl = document.getElementById("avatarPreview");
const avatarFallbackEl = document.getElementById("avatarFallback");
const uploadUiEl = document.getElementById("uploadUi");
const uploadLabelEl = document.getElementById("uploadLabel");
const uploadPctEl = document.getElementById("uploadPct");
const uploadProgressEl = document.getElementById("uploadProgress");
const bioEl = document.getElementById("bio");
const favoriteEl = document.getElementById("favorite");
const gamesEmptyEl = document.getElementById("gamesEmpty");
const gamesListEl = document.getElementById("gamesList");
const publishLinkEl = document.getElementById("publishLink");

titleEl.textContent = `Profile • ${profileUser}`;

signoutEl.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

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

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

function clampText(value, maxLen) {
  const s = String(value || "").trim();
  if (!maxLen) return s;
  return s.slice(0, Math.max(0, maxLen));
}

function showUploadUi(label, { indeterminate = false, pct = null } = {}) {
  uploadUiEl.hidden = false;
  uploadLabelEl.textContent = label || "";

  if (indeterminate) {
    uploadProgressEl.removeAttribute("value");
    uploadPctEl.textContent = "";
    return;
  }

  const safePct = typeof pct === "number" ? Math.max(0, Math.min(100, pct)) : 0;
  uploadProgressEl.value = safePct;
  uploadPctEl.textContent = `${Math.round(safePct)}%`;
}

function hideUploadUi() {
  uploadUiEl.hidden = true;
  uploadLabelEl.textContent = "";
  uploadPctEl.textContent = "";
  uploadProgressEl.value = 0;
}

function renderAvatar(url) {
  avatarPreviewEl.textContent = "";
  if (!url) {
    avatarFallbackEl.textContent = initials(profileUser);
    avatarPreviewEl.appendChild(avatarFallbackEl);
    return;
  }

  const img = document.createElement("img");
  img.alt = "Your profile picture";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.src = url;
  img.addEventListener("error", () => {
    renderAvatar(null);
  });
  avatarPreviewEl.appendChild(img);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.readAsDataURL(blob);
  });
}

async function makeAvatarBlob(file) {
  const img = await loadImageFromFile(file);

  const side = Math.min(img.naturalWidth || 0, img.naturalHeight || 0);
  if (!side) throw new Error("Could not read image dimensions.");

  const sx = Math.floor(((img.naturalWidth || 0) - side) / 2);
  const sy = Math.floor(((img.naturalHeight || 0) - side) / 2);

  const out = 256;
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas is not available.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#0b1d35";
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);

  let quality = 0.86;
  let blob = await canvasToJpegBlob(canvas, quality);
  if (!blob) throw new Error("Failed to encode image.");

  const maxBytes = 220 * 1024;
  while (blob.size > maxBytes && quality > 0.5) {
    quality = Math.max(0.5, quality - 0.08);
    blob = await canvasToJpegBlob(canvas, quality);
    if (!blob) throw new Error("Failed to encode image.");
  }

  return blob;
}

async function loadExisting() {
  renderAvatar(null);
  try {
    const snap = await get(ref(database, `profiles/${profileKey(profileUser)}`));
    const value = snap.exists() ? snap.val() || {} : {};
    const url =
      (typeof value.photoURL === "string" && value.photoURL) ||
      (typeof value.photoDataURL === "string" && value.photoDataURL) ||
      null;
    renderAvatar(url);
    if (bioEl) bioEl.value = typeof value.bio === "string" ? value.bio : "";
    if (favoriteEl) favoriteEl.value = typeof value.favorite === "string" ? value.favorite : "";
  } catch {
    renderAvatar(null);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderGames(games) {
  if (!gamesListEl || !gamesEmptyEl) return;
  gamesListEl.innerHTML = "";
  gamesEmptyEl.hidden = Array.isArray(games) && games.length > 0;
  if (!Array.isArray(games) || games.length === 0) return;

  for (const g of games) {
    const li = document.createElement("li");
    li.className = "profile-game";
    li.innerHTML = `
      <div class="profile-game__title">${escapeHtml(g.name || "Untitled")}</div>
      <div class="profile-game__desc">${escapeHtml(g.description || "")}</div>
      <div class="profile-game__meta">${escapeHtml(g.meta || "")}</div>
      <a class="btn-quiet btn-quiet--sm" href="play.html?id=${encodeURIComponent(g.id)}">Play</a>
    `;
    gamesListEl.appendChild(li);
  }
}

async function loadGames() {
  try {
    const snap = await get(ref(database, "publishedGames"));
    const all = snap.exists() ? snap.val() || {} : {};
    const list = [];
    for (const [id, raw] of Object.entries(all)) {
      if (!raw || typeof raw !== "object") continue;
      if (raw.owner !== profileUser) continue;
      const createdAt = raw.createdAt || raw.updatedAt || null;
      const createdStr = createdAt ? new Date(createdAt).toLocaleString() : "";
      list.push({
        id,
        name: typeof raw.name === "string" ? raw.name : "",
        description: typeof raw.description === "string" ? raw.description : "",
        createdAt: createdAt ? new Date(createdAt).getTime() : 0,
        meta: createdStr ? `Created ${createdStr}` : "",
      });
    }
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderGames(list);
  } catch {
    renderGames([]);
  }
}

fileEl.addEventListener("change", () => {
  if (!isOwnProfile) return;
  const file = fileEl.files?.[0];
  if (!file) return;
  const tempUrl = URL.createObjectURL(file);
  renderAvatar(tempUrl);
});

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isOwnProfile) return;
  setStatus("", null);
  hideUploadUi();

  const bio = clampText(bioEl?.value, 280);
  const favorite = clampText(favoriteEl?.value, 60);
  const file = fileEl.files?.[0] || null;

  if (file) {
    if (!file.type.startsWith("image/")) {
      setStatus("That file is not an image.", "error");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setStatus("Image is too large (max 8MB).", "error");
      return;
    }
  }

  saveBtn.disabled = true;
  fileEl.disabled = true;
  if (bioEl) bioEl.disabled = true;
  if (favoriteEl) favoriteEl.disabled = true;

  try {
    const key = profileKey(user);
    const profileRef = ref(database, `profiles/${key}`);
    const patch = {
      username: user,
      bio,
      favorite,
      updatedAt: serverTimestamp(),
    };

    let avatarBlob = null;
    let photoDataURL = null;
    let photoURL = null;

    if (file) {
      showUploadUi("Preparing image...", { indeterminate: true });
      avatarBlob = await makeAvatarBlob(file);

      // Store the picture itself in Realtime Database (base64 data URL).
      // This avoids Storage rules/auth issues and makes avatars immediately readable by the chat UI.
      showUploadUi("Encoding...", { indeterminate: true });
      photoDataURL = await blobToDataURL(avatarBlob);

      // Optional best-effort Storage upload (kept for future use); DB remains the source of truth.
      try {
        if (storage) {
          const objRef = storageRef(storage, `avatars/${encodeURIComponent(key)}/avatar.jpg`);
          showUploadUi("Uploading (optional)...", { indeterminate: false, pct: 0 });

          await new Promise((resolve, reject) => {
            const task = uploadBytesResumable(objRef, avatarBlob, { contentType: "image/jpeg" });
            task.on(
              "state_changed",
              (snap) => {
                const total = snap.totalBytes || 0;
                const sent = snap.bytesTransferred || 0;
                const pct = total ? (sent / total) * 100 : 0;
                showUploadUi("Uploading (optional)...", { indeterminate: false, pct });
              },
              (err) => reject(err),
              () => resolve()
            );
          });

          const downloadURL = await getDownloadURL(objRef);
          photoURL = `${downloadURL}${downloadURL.includes("?") ? "&" : "?"}v=${Date.now()}`;
        }
      } catch (storageErr) {
        photoURL = null;
        console.warn("Optional Storage upload failed; using DB avatar only.", storageErr);
      }

      patch.photoURL = photoURL;
      patch.photoDataURL = photoDataURL;
      patch.photoContentType = "image/jpeg";
      patch.photoBytes = avatarBlob.size;
    }

    showUploadUi(file ? "Saving to database..." : "Saving...", { indeterminate: true });
    await update(profileRef, patch);

    if (file) {
      showUploadUi("Verifying...", { indeterminate: true });
      const verifySnap = await get(profileRef);
      const verify = verifySnap.exists() ? verifySnap.val() || {} : {};
      const verifySrc =
        (typeof verify.photoDataURL === "string" && verify.photoDataURL) ||
        (typeof verify.photoURL === "string" && verify.photoURL) ||
        null;
      if (!verifySrc) {
        throw new Error("Saved, but could not read back the profile picture (check DB rules).");
      }

      renderAvatar(photoURL || photoDataURL);
      showUploadUi("Done", { indeterminate: false, pct: 100 });
    } else {
      hideUploadUi();
    }

    setStatus("Saved.", "ok");
    loadGames();
  } catch (err) {
    showUploadUi("Failed", { indeterminate: false, pct: 100 });
    setStatus(err?.message || String(err), "error");
  } finally {
    saveBtn.disabled = false;
    fileEl.disabled = false;
    if (bioEl) bioEl.disabled = false;
    if (favoriteEl) favoriteEl.disabled = false;
  }
});

if (!isOwnProfile) {
  if (fileEl) fileEl.hidden = true;
  if (avatarLabelEl) avatarLabelEl.hidden = true;
  if (saveBtn) saveBtn.hidden = true;
  if (uploadUiEl) uploadUiEl.hidden = true;
  if (publishLinkEl) publishLinkEl.hidden = true;
  if (bioEl) bioEl.disabled = true;
  if (favoriteEl) favoriteEl.disabled = true;
}

loadExisting();
loadGames();
