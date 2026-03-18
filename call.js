import {
  database,
  ref,
  get,
  set,
  update,
  push,
  remove,
  onChildAdded,
  onChildRemoved,
  onValue,
  serverTimestamp,
} from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) window.location.href = "index.html";

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

function profileKey(username) {
  return String(username || "").replace(/[.#$\[\]\/]/g, "_");
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

const myId = profileKey(user);
const params = new URL(window.location.href).searchParams;
let room = (params.get("room") || "").trim();
if (!room) {
  room = `room_${uid()}`;
  params.set("room", room);
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
}

const callTitleEl = document.getElementById("callTitle");
const roomMetaEl = document.getElementById("roomMeta");
const copyLinkEl = document.getElementById("copyLink");
const muteBtnEl = document.getElementById("muteBtn");
const hangBtnEl = document.getElementById("hangBtn");
const peersEl = document.getElementById("peers");
const statusEl = document.getElementById("status");

callTitleEl.textContent = `Call • ${room}`;
roomMetaEl.textContent = `Room: ${room}`;

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

copyLinkEl.addEventListener("click", async () => {
  const url = new URL(window.location.href);
  url.searchParams.set("room", room);
  try {
    await navigator.clipboard.writeText(url.toString());
    setStatus("Invite link copied.", "ok");
  } catch {
    prompt("Copy this invite link:", url.toString());
  }
});

const rtcConfig = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
};

let localStream = null;
let muted = false;

async function ensureMic() {
  if (localStream) return localStream;
  setStatus("Requesting microphone permission…", null);
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  setStatus("", null);
  return localStream;
}

function setMuted(next) {
  muted = Boolean(next);
  muteBtnEl.textContent = muted ? "Unmute" : "Mute";
  if (localStream) {
    for (const t of localStream.getAudioTracks()) t.enabled = !muted;
  }
}

muteBtnEl.addEventListener("click", () => setMuted(!muted));
setMuted(false);

// Firebase locations
const roomRef = ref(database, `callRooms/${room}`);
const participantsRef = ref(database, `callRooms/${room}/participants`);
const offersToMeRef = ref(database, `callRooms/${room}/offers/${myId}`);
const answersToMeRef = ref(database, `callRooms/${room}/answers/${myId}`);
const iceToMeRef = ref(database, `callRooms/${room}/ice/${myId}`);

// Peer state
const pcs = new Map(); // peerId -> RTCPeerConnection
const peerRows = new Map(); // peerId -> li element
const remoteAudio = new Map(); // peerId -> HTMLAudioElement

function addPeerRow(peerId, username) {
  if (peerRows.has(peerId)) return peerRows.get(peerId);
  const li = document.createElement("li");
  li.className = "profile-game";
  li.dataset.peerId = peerId;
  li.innerHTML = `
    <div class="profile-game__title">${username || peerId}</div>
    <div class="profile-game__meta" data-meta="1">Connecting…</div>
  `;
  peersEl.appendChild(li);
  peerRows.set(peerId, li);
  return li;
}

function setPeerMeta(peerId, text) {
  const li = peerRows.get(peerId);
  const meta = li?.querySelector('[data-meta="1"]');
  if (meta) meta.textContent = text || "";
}

function removePeerRow(peerId) {
  peerRows.get(peerId)?.remove();
  peerRows.delete(peerId);
}

async function createPcFor(peerId) {
  if (pcs.has(peerId)) return pcs.get(peerId);
  const pc = new RTCPeerConnection(rtcConfig);
  pcs.set(peerId, pc);

  const stream = await ensureMic();
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }

  pc.onicecandidate = async (e) => {
    if (!e.candidate) return;
    try {
      const bucket = ref(database, `callRooms/${room}/ice/${peerId}/${myId}`);
      await push(bucket, e.candidate.toJSON());
    } catch (err) {
      console.warn("ICE push failed:", err);
    }
  };

  pc.onconnectionstatechange = () => {
    setPeerMeta(peerId, pc.connectionState);
  };

  pc.ontrack = (e) => {
    let audio = remoteAudio.get(peerId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      remoteAudio.set(peerId, audio);
      document.body.appendChild(audio);
    }
    const [stream0] = e.streams;
    if (stream0) audio.srcObject = stream0;
  };

  return pc;
}

async function makeOffer(peerId) {
  const pc = await createPcFor(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await set(ref(database, `callRooms/${room}/offers/${peerId}/${myId}`), {
    sdp: offer.sdp,
    type: offer.type,
    from: myId,
    fromUser: user,
    at: Date.now(),
  });
}

async function handleOffer(fromPeerId, offerObj) {
  if (!offerObj?.sdp) return;
  const pc = await createPcFor(fromPeerId);
  await pc.setRemoteDescription({ type: "offer", sdp: offerObj.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await set(ref(database, `callRooms/${room}/answers/${fromPeerId}/${myId}`), {
    sdp: answer.sdp,
    type: answer.type,
    from: myId,
    fromUser: user,
    at: Date.now(),
  });
  // Best-effort cleanup
  remove(ref(database, `callRooms/${room}/offers/${myId}/${fromPeerId}`)).catch(() => {});
}

async function handleAnswer(fromPeerId, answerObj) {
  if (!answerObj?.sdp) return;
  const pc = pcs.get(fromPeerId);
  if (!pc) return;
  if (pc.currentRemoteDescription) return;
  await pc.setRemoteDescription({ type: "answer", sdp: answerObj.sdp });
  remove(ref(database, `callRooms/${room}/answers/${myId}/${fromPeerId}`)).catch(() => {});
}

async function handleIce(fromPeerId, iceObj) {
  if (!iceObj) return;
  const pc = pcs.get(fromPeerId);
  if (!pc) return;
  try {
    await pc.addIceCandidate(iceObj);
  } catch (err) {
    console.warn("addIceCandidate failed:", err);
  }
}

function shouldInitiateTo(peerId) {
  // Deterministic: lower id initiates to higher id.
  return String(myId) < String(peerId);
}

async function joinRoom() {
  setStatus("Joining room…", null);
  try {
    await update(roomRef, { updatedAt: serverTimestamp() });
    await set(ref(database, `callRooms/${room}/participants/${myId}`), {
      username: user,
      joinedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    });
    setStatus("Joined. Waiting for others…", "ok");
  } catch (err) {
    setStatus(err?.message || String(err), "error");
  }
}

hangBtnEl.addEventListener("click", async () => {
  if (!confirm("Leave this call?")) return;
  try {
    await remove(ref(database, `callRooms/${room}/participants/${myId}`));
  } catch {}
  for (const pc of pcs.values()) pc.close();
  pcs.clear();
  for (const a of remoteAudio.values()) a.remove();
  remoteAudio.clear();
  window.location.href = "contacts.html";
});

// Participants list
onChildAdded(participantsRef, async (snap) => {
  const peerId = snap.key;
  if (!peerId) return;
  const v = snap.val() || {};
  const username = typeof v.username === "string" ? v.username : peerId;
  addPeerRow(peerId, username);
  if (peerId === myId) {
    setPeerMeta(peerId, "you");
    return;
  }

  if (!pcs.has(peerId) && shouldInitiateTo(peerId)) {
    try {
      await makeOffer(peerId);
    } catch (err) {
      console.warn("Offer failed:", err);
    }
  }
});

onChildRemoved(participantsRef, (snap) => {
  const peerId = snap.key;
  if (!peerId) return;
  pcs.get(peerId)?.close();
  pcs.delete(peerId);
  remoteAudio.get(peerId)?.remove();
  remoteAudio.delete(peerId);
  removePeerRow(peerId);
});

// Offers to me
onChildAdded(offersToMeRef, async (snap) => {
  const fromPeerId = snap.key;
  if (!fromPeerId) return;
  const offerObj = snap.val();
  try {
    await handleOffer(fromPeerId, offerObj);
  } catch (err) {
    console.warn("Handle offer failed:", err);
  }
});

// Answers to me
onChildAdded(answersToMeRef, async (snap) => {
  const fromPeerId = snap.key;
  if (!fromPeerId) return;
  const answerObj = snap.val();
  try {
    await handleAnswer(fromPeerId, answerObj);
  } catch (err) {
    console.warn("Handle answer failed:", err);
  }
});

// ICE to me: /ice/myId/fromPeerId/{pushId}
onChildAdded(iceToMeRef, (snap) => {
  const fromPeerId = snap.key;
  if (!fromPeerId) return;
  const bucket = ref(database, `callRooms/${room}/ice/${myId}/${fromPeerId}`);
  onChildAdded(bucket, async (candSnap) => {
    const cand = candSnap.val();
    try {
      await handleIce(fromPeerId, cand);
    } catch {}
    // Best-effort cleanup
    remove(ref(database, `callRooms/${room}/ice/${myId}/${fromPeerId}/${candSnap.key}`)).catch(() => {});
  });
});

// Room status (optional)
onValue(roomRef, (snap) => {
  if (!snap.exists()) return;
});

// Start
(async () => {
  try {
    await ensureMic();
  } catch (err) {
    setStatus("Microphone blocked: " + (err?.message || String(err)), "error");
    muteBtnEl.disabled = true;
    return;
  }
  await joinRoom();
})();

