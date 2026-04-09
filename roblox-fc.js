import {
  database,
  ref,
  get,
  set,
  update,
  push,
  onValue,
  serverTimestamp,
} from "./firebase.js";
import * as THREE from "three";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) window.location.href = "index.html";

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

const titleEl = document.getElementById("title");
if (titleEl) titleEl.textContent = `Roblox: FC EDITION • ${user}`;

function clampText(value, maxLen) {
  const s = String(value || "").trim();
  return maxLen ? s.slice(0, Math.max(0, maxLen)) : s;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function fmtInt(value) {
  const x = Math.max(0, Math.floor(Number(value) || 0));
  return x.toLocaleString();
}

function safeKey(value) {
  return String(value || "").replace(/[.#$\[\]\/]/g, "_");
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nowMinute() {
  return Math.floor(Date.now() / 60000);
}

function parseColor(value, fallbackHex = 0xffffff) {
  try {
    return new THREE.Color(String(value || "")).getHex();
  } catch {
    return fallbackHex;
  }
}

// ---- Tabs
const tabButtons = [...document.querySelectorAll(".tab[data-tab]")];
const tabDiscover = document.getElementById("tab-discover");
const tabPlay = document.getElementById("tab-play");
const tabStudio = document.getElementById("tab-studio");

function setActiveTab(name) {
  for (const btn of tabButtons) btn.classList.toggle("is-active", btn.dataset.tab === name);
  if (tabDiscover) tabDiscover.hidden = name !== "discover";
  if (tabPlay) tabPlay.hidden = name !== "play";
  if (tabStudio) tabStudio.hidden = name !== "studio";

  if (name === "play") ensurePlayInit();
  if (name === "studio") ensureStudioInit();
}

for (const btn of tabButtons) {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab || "discover"));
}

// ---- Discover (20+ experiences + explorer)
const searchEl = document.getElementById("search");
const newExperienceEl = document.getElementById("newExperience");
const experienceListEl = document.getElementById("experienceList");

const expTitleEl = document.getElementById("expTitle");
const expDescEl = document.getElementById("expDesc");
const expCreatedEl = document.getElementById("expCreated");
const expDevEl = document.getElementById("expDev");
const expVisitsEl = document.getElementById("expVisits");
const expLiveEl = document.getElementById("expLive");
const playExperienceEl = document.getElementById("playExperience");
const openExplorerEl = document.getElementById("openExplorer");
const assetListEl = document.getElementById("assetList");
const assetTitleEl = document.getElementById("assetTitle");
const assetBodyEl = document.getElementById("assetBody");

const VISITS_KEY = `fcapp_robloxfc_visits_${safeKey(user)}`;
const USER_EXPS_KEY = `fcapp_robloxfc_user_exps_${safeKey(user)}`;

function loadVisits() {
  try {
    const raw = localStorage.getItem(VISITS_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function saveVisits(v) {
  localStorage.setItem(VISITS_KEY, JSON.stringify(v || {}));
}

function loadUserExperiences() {
  try {
    const raw = localStorage.getItem(USER_EXPS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveUserExperiences(list) {
  localStorage.setItem(USER_EXPS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
}

function baseExperiences() {
  // 20+ experiences (some launch existing FC minigames).
  return [
    {
      id: "robloxfc-hangout",
      title: "Roblox FC Hangout",
      description: "3D multiplayer hangout. Join a room and move around with friends.",
      createdAt: "2026-04-09",
      developer: "FC Team",
      launch: { kind: "playTab" },
      assets: [
        { id: "Map_Ground", type: "Model", data: "Ground + props (generated in Three.js)" },
        { id: "PlayerRig", type: "Model", data: "Box rig + name sprite" },
        { id: "MovementScript", type: "Script", data: "Client movement + Firebase sync" },
      ],
    },
    {
      id: "fc-snake",
      title: "Snake Classic",
      description: "Retro snake, quick and clean.",
      createdAt: "2026-02-14",
      developer: "FC Arcade",
      launch: { kind: "page", href: "snake.html" },
      assets: [
        { id: "BoardText", type: "TextPart", data: "Score / UI text" },
        { id: "SnakeScript", type: "Script", data: "Movement + collision logic" },
      ],
    },
    {
      id: "fc-tetris",
      title: "Tetris Blocks",
      description: "Stack, clear lines, beat your score.",
      createdAt: "2026-02-14",
      developer: "FC Arcade",
      launch: { kind: "page", href: "tetris.html" },
      assets: [
        { id: "HUDText", type: "TextPart", data: "Score + level UI" },
        { id: "TetrisScript", type: "Script", data: "Piece logic + line clears" },
      ],
    },
    {
      id: "fc-pingpong",
      title: "Ping Pong",
      description: "Fast paddle action.",
      createdAt: "2026-02-14",
      developer: "FC Arcade",
      launch: { kind: "page", href: "pingpong.html" },
      assets: [{ id: "BallScript", type: "Script", data: "Ball physics + scoring" }],
    },
    {
      id: "fc-ttt",
      title: "Tic Tac Toe",
      description: "Play vs. yourself (local).",
      createdAt: "2026-02-14",
      developer: "FC Arcade",
      launch: { kind: "page", href: "tictactoe.html" },
      assets: [{ id: "GridText", type: "TextPart", data: "X/O renders" }],
    },
    {
      id: "fc-ttt-online",
      title: "Tic Tac Toe (Online)",
      description: "Online rooms using Firebase.",
      createdAt: "2026-03-01",
      developer: "FC Multiplayer",
      launch: { kind: "page", href: "tictactoe-mp.html" },
      assets: [{ id: "RoomSync", type: "Script", data: "Room state sync (Firebase)" }],
    },
    {
      id: "fc-guardians",
      title: "Guardians Attack! (Beta)",
      description: "Spawn guards, wipe the enemy.",
      createdAt: "2026-03-08",
      developer: "FC Multiplayer",
      launch: { kind: "page", href: "guardians-attack.html" },
      assets: [{ id: "GuardAI", type: "Script", data: "Guard behavior + combat" }],
    },
    // Extra Roblox-style “experiences” (hub-only MVP placeholders).
    {
      id: "obby",
      title: "Neon Obby",
      description: "Jump across floating platforms. (Hub preview)",
      createdAt: "2026-04-01",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [
        { id: "Platforms", type: "Model", data: "Obstacle platforms (generated)" },
        { id: "CheckpointText", type: "TextPart", data: "Checkpoint labels" },
      ],
    },
    {
      id: "tycoon",
      title: "Mini Tycoon",
      description: "Collect, upgrade, and build. (Hub preview)",
      createdAt: "2026-04-02",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [
        { id: "ButtonsUI", type: "TextPart", data: "Upgrade labels" },
        { id: "EconomyScript", type: "Script", data: "Cash + upgrades loop" },
      ],
    },
    {
      id: "racing",
      title: "Block Racing",
      description: "Drift on a simple track. (Hub preview)",
      createdAt: "2026-04-03",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "TrackModel", type: "Model", data: "Track mesh (generated)" }],
    },
    {
      id: "hide-seek",
      title: "Hide & Seek",
      description: "Find players in a boxy map. (Hub preview)",
      createdAt: "2026-04-03",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "MapModel", type: "Model", data: "Rooms + corridors (generated)" }],
    },
    {
      id: "tower-defense",
      title: "Tiny Tower Defense",
      description: "Place towers, stop waves. (Hub preview)",
      createdAt: "2026-04-04",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "WaveScript", type: "Script", data: "Wave spawner + HP" }],
    },
    {
      id: "fps",
      title: "Cardboard FPS",
      description: "Aim and shoot targets. (Hub preview)",
      createdAt: "2026-04-05",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "WeaponScript", type: "Script", data: "Raycast hits + cooldown" }],
    },
    {
      id: "simulator",
      title: "Click Simulator",
      description: "Click to get stronger. (Hub preview)",
      createdAt: "2026-04-05",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "StatsText", type: "TextPart", data: "Power + rank display" }],
    },
    {
      id: "adopt",
      title: "Adopt-a-Pet (Mini)",
      description: "Collect pets & roam. (Hub preview)",
      createdAt: "2026-04-06",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "PetModels", type: "Model", data: "Pet cubes + colors" }],
    },
    {
      id: "survival",
      title: "Night Survival",
      description: "Survive waves at night. (Hub preview)",
      createdAt: "2026-04-06",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "EnemyScript", type: "Script", data: "Enemy chase logic" }],
    },
    {
      id: "parkour",
      title: "Parkour City",
      description: "Run and jump across rooftops. (Hub preview)",
      createdAt: "2026-04-07",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "RooftopsModel", type: "Model", data: "Building blocks" }],
    },
    {
      id: "build",
      title: "Build & Chill",
      description: "Place blocks freely. (Use Studio!)",
      createdAt: "2026-04-07",
      developer: "FC Creators",
      launch: { kind: "studioTab" },
      assets: [{ id: "StudioLink", type: "TextPart", data: "Launches Roblox FC Studio" }],
    },
    {
      id: "music",
      title: "Music Room",
      description: "Chat and play beats. (Hub preview)",
      createdAt: "2026-04-07",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "BeatSound", type: "Sound", data: "Beat loop (not bundled)" }],
    },
    {
      id: "roleplay",
      title: "School Roleplay",
      description: "Roleplay with friends. (Hub preview)",
      createdAt: "2026-04-08",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "DialogText", type: "TextPart", data: "NPC chat bubbles" }],
    },
    {
      id: "zombies",
      title: "Zombies!",
      description: "Boxy zombies swarm you. (Hub preview)",
      createdAt: "2026-04-08",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "ZombieAI", type: "Script", data: "Chase + damage loop" }],
    },
    {
      id: "soccer",
      title: "FC Soccer Arena",
      description: "Kick a ball with friends. (Hub preview)",
      createdAt: "2026-04-08",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "BallModel", type: "Model", data: "Sphere + physics" }],
    },
    {
      id: "story",
      title: "Story: The Lost Key",
      description: "A short mystery story. (Hub preview)",
      createdAt: "2026-04-08",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "NarrationText", type: "TextPart", data: "Chapters + dialogue" }],
    },
    {
      id: "sword",
      title: "Sword Training",
      description: "Practice hits on dummies. (Hub preview)",
      createdAt: "2026-04-09",
      developer: "FC Creators",
      launch: { kind: "playTab" },
      assets: [{ id: "SwordScript", type: "Script", data: "Swing + hit detection" }],
    },
    {
      id: "art",
      title: "Art Plaza",
      description: "Showcase drawings. (Links to Draw)",
      createdAt: "2026-04-09",
      developer: "FC Creators",
      launch: { kind: "page", href: "draw.html" },
      assets: [{ id: "Canvas", type: "Model", data: "2D canvas tool" }],
    },
  ];
}

function computeLiveCount(expId) {
  // Deterministic “live” approximation (updates every minute).
  const base = (hashString(expId) % 12) + 1;
  const wobble = (hashString(expId + ":" + nowMinute()) % 8) - 3;
  return Math.max(0, base + wobble);
}

function computeVisits(visitsById, expId) {
  const v = visitsById?.[expId];
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string" && v.trim()) return Math.max(0, Math.floor(Number(v) || 0));
  return 0;
}

let selectedExperienceId = null;
let selectedAssetId = null;

function mergeExperiences() {
  const base = baseExperiences();
  const mine = loadUserExperiences();
  const normalizedMine = mine
    .filter((x) => x && typeof x === "object" && typeof x.id === "string")
    .map((x) => ({
      ...x,
      isUserCreated: true,
      launch: { kind: "studioPreview", id: x.id },
      createdAt: typeof x.createdAt === "string" ? x.createdAt : "2026-04-09",
      developer: typeof x.developer === "string" ? x.developer : user,
    }));
  return [...normalizedMine, ...base];
}

function getExperienceById(id) {
  return mergeExperiences().find((e) => e.id === id) || null;
}

function experienceMatchesQuery(exp, q) {
  if (!q) return true;
  const hay = `${exp.title}\n${exp.description}\n${exp.developer}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderExperienceList() {
  if (!experienceListEl) return;
  const visitsById = loadVisits();
  const q = clampText(searchEl?.value || "", 60);
  const list = mergeExperiences().filter((exp) => experienceMatchesQuery(exp, q));

  experienceListEl.textContent = "";
  for (const exp of list) {
    const li = document.createElement("li");
    li.className = "game-card";
    li.dataset.id = exp.id;
    if (exp.id === selectedExperienceId) li.classList.add("robloxfc__selected");

    const t = document.createElement("div");
    t.className = "game-card__title";
    t.textContent = exp.title;

    const d = document.createElement("div");
    d.className = "game-card__desc";
    d.textContent = exp.description;

    const live = computeLiveCount(exp.id);
    const visits = computeVisits(visitsById, exp.id);
    const meta = document.createElement("div");
    meta.className = "game-card__meta";
    meta.textContent = `${exp.developer} • ${exp.createdAt} • ${fmtInt(visits)} visits • ${fmtInt(live)} live`;

    li.appendChild(t);
    li.appendChild(d);
    li.appendChild(meta);
    li.addEventListener("click", () => selectExperience(exp.id));
    experienceListEl.appendChild(li);
  }
}

function clearAssetSelection() {
  selectedAssetId = null;
  if (assetTitleEl) assetTitleEl.textContent = "Select an asset";
  if (assetBodyEl) assetBodyEl.textContent = "";
  if (assetListEl) assetListEl.querySelectorAll(".robloxfc__asset.is-selected").forEach((n) => n.classList.remove("is-selected"));
}

function renderAssets(exp) {
  if (!assetListEl) return;
  assetListEl.textContent = "";
  clearAssetSelection();

  const assets = Array.isArray(exp?.assets) ? exp.assets : [];
  if (!assets.length) {
    const empty = document.createElement("li");
    empty.className = "robloxfc__asset";
    empty.textContent = "(No assets listed)";
    assetListEl.appendChild(empty);
    return;
  }

  for (const a of assets) {
    const row = document.createElement("li");
    row.className = "robloxfc__asset";
    row.dataset.assetId = a.id;
    const type = document.createElement("span");
    type.className = "robloxfc__assetType";
    type.textContent = String(a.type || "");
    const name = document.createElement("span");
    name.className = "robloxfc__assetName";
    name.textContent = String(a.id || "");
    row.appendChild(type);
    row.appendChild(name);
    row.addEventListener("click", () => {
      selectedAssetId = a.id;
      assetListEl.querySelectorAll(".robloxfc__asset").forEach((n) => n.classList.remove("is-selected"));
      row.classList.add("is-selected");
      if (assetTitleEl) assetTitleEl.textContent = `${a.type} • ${a.id}`;
      if (assetBodyEl) assetBodyEl.textContent = String(a.data || "");
    });
    assetListEl.appendChild(row);
  }
}

function selectExperience(id) {
  selectedExperienceId = id;
  renderExperienceList();

  const visitsById = loadVisits();
  const exp = getExperienceById(id);
  if (!exp) return;

  if (expTitleEl) expTitleEl.textContent = exp.title;
  if (expDescEl) expDescEl.textContent = exp.description;
  if (expCreatedEl) expCreatedEl.textContent = exp.createdAt || "—";
  if (expDevEl) expDevEl.textContent = exp.developer || "—";
  if (expVisitsEl) expVisitsEl.textContent = fmtInt(computeVisits(visitsById, id));
  if (expLiveEl) expLiveEl.textContent = fmtInt(computeLiveCount(id));

  if (playExperienceEl) playExperienceEl.disabled = false;
  if (openExplorerEl) openExplorerEl.disabled = false;

  renderAssets(exp);
}

function bumpVisits(expId) {
  const visitsById = loadVisits();
  visitsById[expId] = computeVisits(visitsById, expId) + 1;
  saveVisits(visitsById);
  if (selectedExperienceId === expId) {
    if (expVisitsEl) expVisitsEl.textContent = fmtInt(computeVisits(visitsById, expId));
  }
}

playExperienceEl?.addEventListener("click", () => {
  const exp = getExperienceById(selectedExperienceId);
  if (!exp) return;
  bumpVisits(exp.id);

  const launch = exp.launch || {};
  if (launch.kind === "page" && launch.href) {
    window.location.href = String(launch.href);
    return;
  }
  if (launch.kind === "studioTab" || launch.kind === "studioPreview") {
    setActiveTab("studio");
    if (launch.kind === "studioPreview" && launch.id) {
      studioLoadExperience(String(launch.id));
    }
    return;
  }
  // default: open Play tab
  setActiveTab("play");
});

openExplorerEl?.addEventListener("click", () => {
  document.getElementById("assetList")?.scrollIntoView({ block: "start", behavior: "smooth" });
});

searchEl?.addEventListener("input", () => renderExperienceList());

newExperienceEl?.addEventListener("click", () => {
  setActiveTab("studio");
  studioNewExperience();
});

renderExperienceList();

// Update “live” numbers every ~5s so the UI feels alive.
window.setInterval(() => {
  if (selectedExperienceId) {
    if (expLiveEl) expLiveEl.textContent = fmtInt(computeLiveCount(selectedExperienceId));
  }
  renderExperienceList();
}, 5000);

// ---- Play (3D multiplayer hangout)
let playInit = false;
let playDispose = null;

function ensurePlayInit() {
  if (playInit) return;
  playInit = true;
  playDispose = initPlay();
}

function normalizeRoomCode(input) {
  const raw = clampText(input, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.slice(0, 12);
}

function randomRoomCode() {
  const a = Math.random().toString(36).slice(2, 6).toUpperCase();
  const b = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `FC${a}${b}`.slice(0, 10);
}

function initPlay() {
  const canvas = document.getElementById("playCanvas");
  const roomCodeEl = document.getElementById("roomCode");
  const createBtn = document.getElementById("createRoom");
  const joinBtn = document.getElementById("joinRoom");
  const leaveBtn = document.getElementById("leaveRoom");
  const statusEl = document.getElementById("roomStatus");
  const touchUiEl = document.getElementById("touchUi");
  const stickEl = document.getElementById("stick");
  const stickKnobEl = document.getElementById("stickKnob");
  const jumpBtnEl = document.getElementById("jumpBtn");

  if (!canvas) return () => {};

  const isTouch = (navigator.maxTouchPoints || 0) > 0;
  if (touchUiEl) touchUiEl.style.display = isTouch ? "flex" : "none";

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(canvas.clientWidth || 960, canvas.clientHeight || 640, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07111f);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
  camera.position.set(0, 4.5, 7);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223355, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(6, 12, 5);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x0b1c33, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(120, 60, 0x3be6c1, 0x223355);
  grid.material.opacity = 0.25;
  grid.material.transparent = true;
  scene.add(grid);

  // Props
  const propGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(
      propGeo,
      new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0xff5b6e : i % 3 === 1 ? 0x3be6c1 : 0x7aa7ff })
    );
    m.position.set((Math.random() - 0.5) * 24, 0.5, (Math.random() - 0.5) * 24);
    m.scale.setScalar(0.6 + Math.random() * 1.3);
    scene.add(m);
  }

  // Player
  const myColor = new THREE.Color().setHSL((hashString(user) % 360) / 360, 0.75, 0.55);
  const playerMat = new THREE.MeshStandardMaterial({ color: myColor.getHex(), roughness: 0.85, metalness: 0.05 });
  const player = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), playerMat);
  player.position.set(0, 0.8, 0);
  scene.add(player);

  function nameSprite(text) {
    const t = clampText(text, 24) || "Player";
    const canvas2 = document.createElement("canvas");
    const ctx = canvas2.getContext("2d");
    canvas2.width = 512;
    canvas2.height = 128;
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, canvas2.width, canvas2.height);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "700 54px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t, canvas2.width / 2, canvas2.height / 2);
    const texture = new THREE.CanvasTexture(canvas2);
    texture.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(3.2, 0.8, 1);
    return sprite;
  }

  const myName = nameSprite(user);
  myName.position.set(0, 2.35, 0);
  player.add(myName);

  let yaw = 0;
  let cameraPitch = -0.2;

  // Input
  const keys = new Set();
  const joy = { x: 0, y: 0 };
  let jumpPressed = false;

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.toggle("status--ok", kind === "ok");
    statusEl.classList.toggle("status--error", kind === "error");
  }

  function onKeyDown(e) {
    keys.add(e.code);
    if (e.code === "Space") jumpPressed = true;
  }
  function onKeyUp(e) {
    keys.delete(e.code);
    if (e.code === "Space") jumpPressed = false;
  }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // Mouse / touch drag to rotate camera.
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  function beginDrag(x, y) {
    dragging = true;
    lastX = x;
    lastY = y;
  }
  function moveDrag(x, y) {
    if (!dragging) return;
    const dx = x - lastX;
    const dy = y - lastY;
    lastX = x;
    lastY = y;
    yaw -= dx * 0.01;
    cameraPitch = Math.max(-0.7, Math.min(0.35, cameraPitch - dy * 0.008));
  }
  function endDrag() {
    dragging = false;
  }

  canvas.addEventListener("mousedown", (e) => beginDrag(e.clientX, e.clientY));
  window.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY));
  window.addEventListener("mouseup", () => endDrag());

  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches?.length) return;
      const t = e.touches[0];
      beginDrag(t.clientX, t.clientY);
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (!e.touches?.length) return;
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
    },
    { passive: true }
  );
  canvas.addEventListener("touchend", () => endDrag(), { passive: true });

  // Mobile joystick
  let stickActive = false;
  let stickBase = { x: 0, y: 0 };
  const stickRadius = 46;

  function setStick(x, y) {
    const dx = x - stickBase.x;
    const dy = y - stickBase.y;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(stickRadius, len);
    const nx = (dx / len) * (clamped / stickRadius);
    const ny = (dy / len) * (clamped / stickRadius);
    joy.x = nx;
    joy.y = ny;
    if (stickKnobEl) {
      stickKnobEl.style.transform = `translate(${nx * stickRadius}px, ${ny * stickRadius}px)`;
    }
  }

  function resetStick() {
    joy.x = 0;
    joy.y = 0;
    if (stickKnobEl) stickKnobEl.style.transform = "translate(0px, 0px)";
  }

  function stickDown(clientX, clientY) {
    stickActive = true;
    const rect = stickEl.getBoundingClientRect();
    stickBase = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    setStick(clientX, clientY);
  }

  if (stickEl) {
    stickEl.addEventListener("pointerdown", (e) => {
      stickEl.setPointerCapture(e.pointerId);
      stickDown(e.clientX, e.clientY);
    });
    stickEl.addEventListener("pointermove", (e) => {
      if (!stickActive) return;
      setStick(e.clientX, e.clientY);
    });
    stickEl.addEventListener("pointerup", () => {
      stickActive = false;
      resetStick();
    });
    stickEl.addEventListener("pointercancel", () => {
      stickActive = false;
      resetStick();
    });
  }

  if (jumpBtnEl) {
    jumpBtnEl.addEventListener("pointerdown", () => {
      jumpPressed = true;
    });
    jumpBtnEl.addEventListener("pointerup", () => {
      jumpPressed = false;
    });
    jumpBtnEl.addEventListener("pointercancel", () => {
      jumpPressed = false;
    });
  }

  // Physics
  const vel = new THREE.Vector3(0, 0, 0);
  let onGround = true;

  function getMoveInput() {
    const forward = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) + (keys.has("KeyS") || keys.has("ArrowDown") ? -1 : 0);
    const right = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) + (keys.has("KeyA") || keys.has("ArrowLeft") ? -1 : 0);
    // joystick: y is down positive, so invert
    const jx = joy.x;
    const jz = -joy.y;
    return { x: right + jx, z: forward + jz };
  }

  // Multiplayer (Firebase)
  let roomCode = "";
  let playerId = uid();
  let roomUnsub = null;
  let players = new Map(); // id -> { mesh, name, lastSeen }
  let inRoom = false;
  let lastNetSend = 0;

  function playersRefFor(code) {
    return ref(database, `robloxfc/rooms/${safeKey(code)}/players`);
  }
  function myRefFor(code) {
    return ref(database, `robloxfc/rooms/${safeKey(code)}/players/${safeKey(playerId)}`);
  }

  function upsertRemotePlayer(pid, data) {
    const x = n(data?.x, 0);
    const y = n(data?.y, 0.8);
    const z = n(data?.z, 0);
    const name = clampText(data?.name || "Player", 24);
    const color = String(data?.color || "#3be6c1");
    const ts = n(data?.ts, Date.now());

    let p = players.get(pid);
    if (!p) {
      const mat = new THREE.MeshStandardMaterial({ color: parseColor(color, 0x3be6c1), roughness: 0.85 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), mat);
      mesh.position.set(x, y, z);
      const label = nameSprite(name);
      label.position.set(0, 2.35, 0);
      mesh.add(label);
      scene.add(mesh);
      p = { mesh, name, lastSeen: ts };
      players.set(pid, p);
    } else {
      p.lastSeen = ts;
      p.mesh.position.set(x, y, z);
    }
  }

  function pruneRemotePlayers() {
    const cutoff = Date.now() - 25_000;
    for (const [pid, p] of players) {
      if (p.lastSeen < cutoff) {
        scene.remove(p.mesh);
        p.mesh.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose?.();
          if (obj.material) obj.material.dispose?.();
        });
        players.delete(pid);
      }
    }
  }

  async function createRoom() {
    const code = normalizeRoomCode(roomCodeEl?.value || "") || randomRoomCode();
    if (roomCodeEl) roomCodeEl.value = code;
    const roomMetaRef = ref(database, `robloxfc/rooms/${safeKey(code)}/meta`);
    await set(roomMetaRef, { createdBy: user, createdAt: serverTimestamp() });
    await joinRoom(code);
  }

  async function joinRoom(code) {
    const c = normalizeRoomCode(code);
    if (!c) return;
    roomCode = c;
    inRoom = true;
    if (leaveBtn) leaveBtn.disabled = false;
    setStatus(`Room: ${roomCode}`, "ok");

    if (roomUnsub) {
      roomUnsub();
      roomUnsub = null;
    }

    const pref = playersRefFor(roomCode);
    const unsub = onValue(pref, (snap) => {
      const v = snap.exists() ? snap.val() || {} : {};
      const mineKey = safeKey(playerId);
      for (const [pid, data] of Object.entries(v)) {
        if (pid === mineKey) continue;
        upsertRemotePlayer(pid, data);
      }
    });
    roomUnsub = unsub;

    // Register me
    await set(myRefFor(roomCode), {
      name: user,
      color: myColor.getStyle(),
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      ts: serverTimestamp(),
    });
  }

  async function leaveRoom() {
    if (!inRoom) return;
    inRoom = false;
    if (leaveBtn) leaveBtn.disabled = true;
    setStatus("Left room", "");
    try {
      await set(myRefFor(roomCode), null);
    } catch {
      // ignore
    }
    if (roomUnsub) {
      roomUnsub();
      roomUnsub = null;
    }
    roomCode = "";
    for (const [, p] of players) scene.remove(p.mesh);
    players.clear();
  }

  createBtn?.addEventListener("click", () => {
    createRoom().catch((err) => setStatus(err?.message || String(err), "error"));
  });

  joinBtn?.addEventListener("click", () => {
    const code = normalizeRoomCode(roomCodeEl?.value || "");
    joinRoom(code).catch((err) => setStatus(err?.message || String(err), "error"));
  });

  leaveBtn?.addEventListener("click", () => {
    leaveRoom().catch(() => {});
  });

  if (roomCodeEl) {
    roomCodeEl.value = randomRoomCode();
    roomCodeEl.addEventListener("input", () => {
      roomCodeEl.value = normalizeRoomCode(roomCodeEl.value);
    });
  }

  function resize() {
    const w = canvas.clientWidth || 960;
    const h = Math.max(220, canvas.clientHeight || 640);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  let raf = 0;
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;

    // Movement (relative to yaw)
    const input = getMoveInput();
    const dir = new THREE.Vector3(input.x, 0, input.z);
    if (dir.lengthSq() > 0.0001) dir.normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    const speed = 6.0;
    player.position.x += dir.x * speed * dt;
    player.position.z += dir.z * speed * dt;

    // Gravity + jump
    const gravity = -18;
    vel.y += gravity * dt;
    player.position.y += vel.y * dt;

    if (player.position.y <= 0.8) {
      player.position.y = 0.8;
      vel.y = 0;
      onGround = true;
    } else {
      onGround = false;
    }

    if (jumpPressed && onGround) {
      vel.y = 7.5;
      onGround = false;
    }

    // Camera follow
    const back = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const camPos = new THREE.Vector3().copy(player.position).add(back.multiplyScalar(7)).add(new THREE.Vector3(0, 3.8 + cameraPitch * 2.5, 0));
    camera.position.lerp(camPos, 0.12);
    camera.lookAt(player.position.x, player.position.y + 1.2, player.position.z);

    pruneRemotePlayers();

    // Network update at ~10Hz
    const now = performance.now();
    if (inRoom && roomCode && now - lastNetSend > 100) {
      lastNetSend = now;
      update(myRefFor(roomCode), {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        ts: serverTimestamp(),
      }).catch(() => {});
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  window.addEventListener("beforeunload", () => {
    leaveRoom().catch(() => {});
  });

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    leaveRoom().catch(() => {});
    renderer.dispose();
  };
}

// ---- Studio (3D no-code + coding + explorer)
let studioInit = false;
let studioApi = null;

function ensureStudioInit() {
  if (studioInit) return;
  studioInit = true;
  studioApi = initStudio();
}

function initStudio() {
  const canvas = document.getElementById("studioCanvas");
  const explorerEl = document.getElementById("studioExplorer");
  const statusEl = document.getElementById("studioStatus");

  const btnSelect = document.getElementById("studioSelect");
  const btnPart = document.getElementById("studioPart");
  const btnSphere = document.getElementById("studioSphere");
  const btnText = document.getElementById("studioText");
  const btnImage = document.getElementById("studioImage");
  const btnLight = document.getElementById("studioLight");
  const btnDelete = document.getElementById("studioDelete");
  const btnPlay = document.getElementById("studioPlay");
  const btnSave = document.getElementById("studioSave");

  const gameTitleEl = document.getElementById("studioGameTitle");
  const gameDescEl = document.getElementById("studioGameDesc");

  const noSelEl = document.getElementById("studioNoSel");
  const propsWrapEl = document.getElementById("studioProps");
  const propNameEl = document.getElementById("propName");
  const propTypeEl = document.getElementById("propType");
  const propXEl = document.getElementById("propX");
  const propYEl = document.getElementById("propY");
  const propZEl = document.getElementById("propZ");
  const propSEl = document.getElementById("propS");
  const propColorEl = document.getElementById("propColor");
  const propTextEl = document.getElementById("propText");
  const propImageEl = document.getElementById("propImage");

  const scriptEl = document.getElementById("scriptEditor");
  const scriptTemplateEl = document.getElementById("scriptTemplate");
  const scriptClearEl = document.getElementById("scriptClear");

  if (!canvas || !explorerEl) return {};

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.toggle("status--ok", kind === "ok");
    statusEl.classList.toggle("status--error", kind === "error");
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07111f);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);
  camera.position.set(8, 7, 9);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223355, 0.8);
  scene.add(hemi);

  const grid = new THREE.GridHelper(80, 40, 0x3be6c1, 0x223355);
  grid.material.opacity = 0.25;
  grid.material.transparent = true;
  scene.add(grid);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x0b1c33, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  let tool = "select"; // select | part | sphere | text | image | light
  let playing = false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const state = {
    meta: { title: "My Roblox FC game", description: "" },
    objects: [], // {id,name,type,x,y,z,s,color,text,image,script}
    selectedId: null,
  };

  const meshesById = new Map(); // id -> Object3D

  function makeMesh(o) {
    if (o.type === "Light") {
      const light = new THREE.PointLight(parseColor(o.color, 0xffffff), Math.max(0.2, n(o.intensity, 1)), 120);
      light.position.set(n(o.x, 0), n(o.y, 4), n(o.z, 0));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      light.add(bulb);
      light.userData = { id: o.id };
      return light;
    }

    const s = Math.max(0.1, n(o.s, 1));
    const geo =
      o.type === "Sphere"
        ? new THREE.SphereGeometry(0.5 * s, 20, 14)
        : new THREE.BoxGeometry(1 * s, 1 * s, 1 * s);
    const mat = new THREE.MeshStandardMaterial({
      color: parseColor(o.color, 0x3be6c1),
      roughness: 0.85,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(n(o.x, 0), n(o.y, 0.5), n(o.z, 0));
    mesh.userData = { id: o.id };
    return mesh;
  }

  function syncScene() {
    const seen = new Set(state.objects.map((o) => o.id));
    for (const [id, obj] of meshesById) {
      if (!seen.has(id)) {
        scene.remove(obj);
        obj.traverse((n) => {
          n.geometry?.dispose?.();
          n.material?.dispose?.();
        });
        meshesById.delete(id);
      }
    }

    for (const o of state.objects) {
      let mesh = meshesById.get(o.id);
      if (!mesh) {
        mesh = makeMesh(o);
        meshesById.set(o.id, mesh);
        scene.add(mesh);
      } else {
        mesh.position.set(n(o.x, 0), n(o.y, 0), n(o.z, 0));
        if (mesh.isMesh && mesh.material && mesh.material.color) {
          mesh.material.color.set(String(o.color || "#3be6c1"));
        }
      }
    }
  }

  function select(id) {
    state.selectedId = id || null;
    refreshInspector();
    refreshExplorer();
  }

  function selectedObj() {
    return state.objects.find((o) => o.id === state.selectedId) || null;
  }

  function refreshExplorer() {
    explorerEl.textContent = "";

    const root = document.createElement("li");
    root.className = "robloxfc__treeItem robloxfc__treeItem--root";
    root.textContent = state.meta.title || "Game";
    explorerEl.appendChild(root);

    for (const o of state.objects) {
      const row = document.createElement("li");
      row.className = "robloxfc__treeItem";
      row.dataset.id = o.id;
      row.textContent = `${o.name || o.type} (${o.type})`;
      if (o.id === state.selectedId) row.classList.add("is-selected");
      row.addEventListener("click", () => select(o.id));
      explorerEl.appendChild(row);

      if (o.type === "TextPart" && o.text) {
        const child = document.createElement("li");
        child.className = "robloxfc__treeItem robloxfc__treeItem--child";
        child.textContent = `Text: "${clampText(o.text, 40)}"`;
        explorerEl.appendChild(child);
      }
      if (o.type === "ImagePart" && o.image) {
        const child = document.createElement("li");
        child.className = "robloxfc__treeItem robloxfc__treeItem--child";
        child.textContent = `Image: ${clampText(o.image, 44)}`;
        explorerEl.appendChild(child);
      }
      if (o.script && o.script.trim()) {
        const child = document.createElement("li");
        child.className = "robloxfc__treeItem robloxfc__treeItem--child";
        child.textContent = "Script";
        explorerEl.appendChild(child);
      }
    }
  }

  function showProps(show) {
    if (noSelEl) noSelEl.hidden = show;
    if (propsWrapEl) propsWrapEl.hidden = !show;
  }

  function refreshInspector() {
    const o = selectedObj();
    if (!o) {
      showProps(false);
      if (scriptEl) scriptEl.value = "";
      return;
    }
    showProps(true);
    if (propNameEl) propNameEl.value = o.name || "";
    if (propTypeEl) propTypeEl.value = o.type || "";
    if (propXEl) propXEl.value = String(n(o.x, 0));
    if (propYEl) propYEl.value = String(n(o.y, 0));
    if (propZEl) propZEl.value = String(n(o.z, 0));
    if (propSEl) propSEl.value = String(n(o.s, 1));
    if (propColorEl) propColorEl.value = String(o.color || "");
    if (propTextEl) propTextEl.value = String(o.text || "");
    if (propImageEl) propImageEl.value = String(o.image || "");
    if (scriptEl) scriptEl.value = String(o.script || "");
  }

  function setTool(next) {
    tool =
      next === "part" || next === "sphere" || next === "text" || next === "image" || next === "light"
        ? next
        : "select";
    setStatus(playing ? "Play mode: tools disabled" : `Tool: ${tool}`, "ok");
  }

  btnSelect?.addEventListener("click", () => setTool("select"));
  btnPart?.addEventListener("click", () => setTool("part"));
  btnSphere?.addEventListener("click", () => setTool("sphere"));
  btnText?.addEventListener("click", () => setTool("text"));
  btnImage?.addEventListener("click", () => setTool("image"));
  btnLight?.addEventListener("click", () => setTool("light"));

  btnDelete?.addEventListener("click", () => {
    if (!state.selectedId) return;
    state.objects = state.objects.filter((o) => o.id !== state.selectedId);
    state.selectedId = null;
    syncScene();
    refreshExplorer();
    refreshInspector();
  });

  function placeAtPointer(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    pointer.set(x, y);
    raycaster.setFromCamera(pointer, camera);
    const hit = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, hit);
    return hit;
  }

  function findHitObject(ev) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -(((ev.clientY - rect.top) / rect.height) * 2 - 1));
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...meshesById.values()], true);
    return hits[0]?.object || null;
  }

  canvas.addEventListener("click", (ev) => {
    if (playing) return;
    if (tool === "select") {
      const obj = findHitObject(ev);
      const id = obj?.userData?.id || obj?.parent?.userData?.id || null;
      select(id);
      return;
    }

    const p = placeAtPointer(ev);
    const id = uid();
    const common = {
      id,
      x: Math.round(p.x * 10) / 10,
      y: tool === "light" ? 4 : 0.5,
      z: Math.round(p.z * 10) / 10,
      s: 1,
      color: tool === "light" ? "#ffffff" : "#3be6c1",
      name:
        tool === "text"
          ? "TextPart"
          : tool === "image"
          ? "ImagePart"
          : tool === "sphere"
          ? "Sphere"
          : tool === "light"
          ? "Light"
          : "Part",
      script: "",
    };

    let obj = null;
    if (tool === "sphere") obj = { ...common, type: "Sphere" };
    else if (tool === "light") obj = { ...common, type: "Light", intensity: 1.1 };
    else if (tool === "text") obj = { ...common, type: "TextPart", text: "Hello" };
    else if (tool === "image") obj = { ...common, type: "ImagePart", image: "" };
    else obj = { ...common, type: "Part" };

    state.objects.push(obj);
    syncScene();
    select(id);
  });

  function applyPropsToSelected() {
    const o = selectedObj();
    if (!o) return;
    o.name = clampText(propNameEl?.value, 40);
    o.x = n(propXEl?.value, o.x);
    o.y = n(propYEl?.value, o.y);
    o.z = n(propZEl?.value, o.z);
    o.s = Math.max(0.1, n(propSEl?.value, o.s));
    o.color = clampText(propColorEl?.value, 16) || o.color;
    if (o.type === "TextPart") o.text = clampText(propTextEl?.value, 80);
    if (o.type === "ImagePart") o.image = clampText(propImageEl?.value, 240);
    syncScene();
    refreshExplorer();
  }

  for (const el of [propNameEl, propXEl, propYEl, propZEl, propSEl, propColorEl, propTextEl, propImageEl]) {
    el?.addEventListener("input", () => applyPropsToSelected());
  }

  scriptEl?.addEventListener("input", () => {
    const o = selectedObj();
    if (!o) return;
    o.script = String(scriptEl.value || "");
    refreshExplorer();
  });

  scriptTemplateEl?.addEventListener("click", () => {
    const o = selectedObj();
    if (!o || !scriptEl) return;
    scriptEl.value =
      `// Runs every frame in Play mode\n` +
      `// self = selected object\n` +
      `// dt = delta time (seconds)\n` +
      `// api.move(self, dx, dy, dz)\n` +
      `\n` +
      `api.spin(self, dt);\n`;
    o.script = scriptEl.value;
    refreshExplorer();
  });

  scriptClearEl?.addEventListener("click", () => {
    const o = selectedObj();
    if (!o || !scriptEl) return;
    scriptEl.value = "";
    o.script = "";
    refreshExplorer();
  });

  function resize() {
    const w = canvas.clientWidth || 960;
    const h = Math.max(260, canvas.clientHeight || 640);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // Simple orbit-ish camera via drag
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let yaw = -0.8;
  let pitch = -0.45;
  let dist = 14;

  function updateCamera() {
    const target = new THREE.Vector3(0, 1.2, 0);
    const x = Math.cos(yaw) * Math.cos(pitch) * dist;
    const z = Math.sin(yaw) * Math.cos(pitch) * dist;
    const y = Math.sin(pitch) * dist + 5;
    camera.position.set(target.x + x, target.y + y, target.z + z);
    camera.lookAt(target);
  }

  updateCamera();

  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    yaw -= dx * 0.008;
    pitch = Math.max(-1.0, Math.min(-0.05, pitch - dy * 0.008));
    updateCamera();
  });
  window.addEventListener("mouseup", () => (dragging = false));

  // Play mode script runner
  function buildApi() {
    return {
      move(self, dx, dy, dz) {
        self.x = n(self.x, 0) + n(dx, 0);
        self.y = n(self.y, 0) + n(dy, 0);
        self.z = n(self.z, 0) + n(dz, 0);
      },
      spin(self, dt) {
        // Stored as a custom field for simple animation; viewport uses it only for meshes.
        self._spin = n(self._spin, 0) + n(dt, 0);
      },
      log(...args) {
        console.log("[Roblox FC Studio]", ...args);
      },
    };
  }

  function runScripts(dt) {
    const api = buildApi();
    for (const o of state.objects) {
      const code = String(o.script || "").trim();
      if (!code) continue;
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function("api", "dt", "self", `"use strict";\n${code}`);
        fn(api, dt, o);
      } catch (err) {
        setStatus(`Script error in ${o.name || o.id}: ${err?.message || String(err)}`, "error");
      }
    }
  }

  // Apply spin to meshes each frame
  function applyAnimations() {
    for (const o of state.objects) {
      const mesh = meshesById.get(o.id);
      if (mesh?.isMesh && o._spin) {
        mesh.rotation.y = o._spin;
      }
    }
  }

  btnPlay?.addEventListener("click", () => {
    playing = !playing;
    btnPlay.textContent = playing ? "Stop" : "Play";
    setStatus(playing ? "Play mode: scripts running" : "Edit mode", "ok");
  });

  function serializeExperience() {
    const title = clampText(gameTitleEl?.value, 40) || "My Roblox FC game";
    const description = clampText(gameDescEl?.value, 200);
    const assets = [];
    for (const o of state.objects) {
      assets.push({ id: o.name || o.id, type: o.type === "Part" ? "Model" : o.type, data: JSON.stringify(o, null, 2) });
      if (o.type === "TextPart") assets.push({ id: `${o.name || o.id}_Text`, type: "TextPart", data: String(o.text || "") });
      if (o.type === "ImagePart") assets.push({ id: `${o.name || o.id}_Image`, type: "ImagePart", data: String(o.image || "") });
      if (o.script && o.script.trim()) assets.push({ id: `${o.name || o.id}_Script`, type: "Script", data: String(o.script) });
    }
    return {
      id: `my-${safeKey(user)}-${uid()}`.slice(0, 48),
      title,
      description,
      createdAt: new Date().toISOString().slice(0, 10),
      developer: user,
      assets,
      studioState: { meta: { title, description }, objects: state.objects.map((x) => ({ ...x })) },
    };
  }

  btnSave?.addEventListener("click", () => {
    try {
      const exp = serializeExperience();
      const list = loadUserExperiences();
      list.unshift(exp);
      saveUserExperiences(list.slice(0, 50));
      setStatus("Saved! Your experience now appears in Discover.", "ok");
      renderExperienceList();
      selectExperience(exp.id);
      setActiveTab("discover");
    } catch (err) {
      setStatus(err?.message || String(err), "error");
    }
  });

  function applyMeta() {
    state.meta.title = clampText(gameTitleEl?.value, 40) || "My Roblox FC game";
    state.meta.description = clampText(gameDescEl?.value, 200);
    refreshExplorer();
  }
  gameTitleEl?.addEventListener("input", applyMeta);
  gameDescEl?.addEventListener("input", applyMeta);

  function defaultScene() {
    state.objects = [
      { id: uid(), name: "Spawn", type: "Part", x: 0, y: 0.5, z: 0, s: 1, color: "#3be6c1", script: "" },
      { id: uid(), name: "Block", type: "Part", x: 2, y: 0.5, z: 0, s: 1, color: "#ff5b6e", script: "" },
      { id: uid(), name: "Sun", type: "Light", x: 4, y: 5, z: 2, s: 1, color: "#ffffff", intensity: 1.2, script: "" },
    ];
    state.selectedId = null;
    syncScene();
    refreshExplorer();
    refreshInspector();
    setTool("select");
  }

  defaultScene();

  let raf = 0;
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;

    if (playing) runScripts(dt);
    syncScene();
    applyAnimations();

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function cleanup() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    renderer.dispose();
  }

  function newExperience() {
    if (gameTitleEl) gameTitleEl.value = "My Roblox FC game";
    if (gameDescEl) gameDescEl.value = "";
    applyMeta();
    defaultScene();
    setStatus("New experience ready.", "ok");
  }

  function loadExperience(expId) {
    const exp = loadUserExperiences().find((x) => x.id === expId);
    if (!exp?.studioState) {
      setStatus("Could not load experience state.", "error");
      return;
    }
    if (gameTitleEl) gameTitleEl.value = exp.title || "My Roblox FC game";
    if (gameDescEl) gameDescEl.value = exp.description || "";
    applyMeta();
    const nextObjects = Array.isArray(exp.studioState.objects) ? exp.studioState.objects : [];
    state.objects = nextObjects.map((o) => ({ ...o }));
    state.selectedId = null;
    syncScene();
    refreshExplorer();
    refreshInspector();
    setStatus(`Loaded: ${exp.title}`, "ok");
  }

  // Expose minimal hooks
  return { cleanup, newExperience, loadExperience };
}

function studioNewExperience() {
  ensureStudioInit();
  studioApi?.newExperience?.();
}

function studioLoadExperience(id) {
  ensureStudioInit();
  studioApi?.loadExperience?.(id);
}
