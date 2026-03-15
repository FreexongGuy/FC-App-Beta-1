import {
  database,
  storage,
  ref,
  set,
  get,
  serverTimestamp,
  storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
} from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

const titleEl = document.getElementById("profile-title");
const signoutEl = document.getElementById("signout");
const formEl = document.getElementById("profile-form");
const fileEl = document.getElementById("avatarFile");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");
const avatarPreviewEl = document.getElementById("avatarPreview");
const avatarFallbackEl = document.getElementById("avatarFallback");
const uploadUiEl = document.getElementById("uploadUi");
const uploadLabelEl = document.getElementById("uploadLabel");
const uploadPctEl = document.getElementById("uploadPct");
const uploadProgressEl = document.getElementById("uploadProgress");

titleEl.textContent = `Profile • ${user}`;

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
    avatarFallbackEl.textContent = initials(user);
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
    const snap = await get(ref(database, `profiles/${profileKey(user)}`));
    const value = snap.exists() ? snap.val() || {} : {};
    const url =
      (typeof value.photoURL === "string" && value.photoURL) ||
      (typeof value.photoDataURL === "string" && value.photoDataURL) ||
      null;
    renderAvatar(url);
  } catch {
    renderAvatar(null);
  }
}

fileEl.addEventListener("change", () => {
  const file = fileEl.files?.[0];
  if (!file) return;
  const tempUrl = URL.createObjectURL(file);
  renderAvatar(tempUrl);
});

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("", null);
  hideUploadUi();

  const file = fileEl.files?.[0];
  if (!file) {
    setStatus("Choose an image first.", "error");
    return;
  }

  if (!file.type.startsWith("image/")) {
    setStatus("That file is not an image.", "error");
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    setStatus("Image is too large (max 8MB).", "error");
    return;
  }

  saveBtn.disabled = true;
  fileEl.disabled = true;

  try {
    const key = profileKey(user);
    showUploadUi("Preparing image...", { indeterminate: true });
    const avatarBlob = await makeAvatarBlob(file);

    // Store the picture itself in Realtime Database (base64 data URL).
    // This avoids Storage rules/auth issues and makes avatars immediately readable by the chat UI.
    showUploadUi("Encoding...", { indeterminate: true });
    const photoDataURL = await blobToDataURL(avatarBlob);

    // Optional best-effort Storage upload (kept for future use); DB remains the source of truth.
    let photoURL = null;
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

    showUploadUi("Saving to database...", { indeterminate: true });

    await set(ref(database, `profiles/${key}`), {
      username: user,
      photoURL,
      photoDataURL,
      photoContentType: "image/jpeg",
      photoBytes: avatarBlob.size,
      updatedAt: serverTimestamp(),
    });

    // Verify it actually wrote (helps catch permission-denied rules).
    showUploadUi("Verifying...", { indeterminate: true });
    const verifySnap = await get(ref(database, `profiles/${key}`));
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
    setStatus("Saved to database.", "ok");
  } catch (err) {
    showUploadUi("Failed", { indeterminate: false, pct: 100 });
    setStatus(err?.message || String(err), "error");
  } finally {
    saveBtn.disabled = false;
    fileEl.disabled = false;
  }
});

loadExisting();
