import { database, ref, push, set, get } from "./firebase.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) window.location.href = "index.html";

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

const titleEl = document.getElementById("title");
const canvas = document.getElementById("c");
const toolLabelEl = document.getElementById("toolLabel");
const toolSelectEl = document.getElementById("toolSelect");
const toolCubeEl = document.getElementById("toolCube");
const toolSphereEl = document.getElementById("toolSphere");
const toolLightEl = document.getElementById("toolLight");
const toolModelEl = document.getElementById("toolModel");
const modelPickEl = document.getElementById("modelPick");
const delObjEl = document.getElementById("delObj");
const publishBtnEl = document.getElementById("publishBtn");

const gameNameEl = document.getElementById("gameName");
const gameDescEl = document.getElementById("gameDesc");
const statusEl = document.getElementById("status");

const noSelectionEl = document.getElementById("noSelection");
const inspectorEl = document.getElementById("inspector");
const objTypeEl = document.getElementById("objType");
const objXEl = document.getElementById("objX");
const objYEl = document.getElementById("objY");
const objZEl = document.getElementById("objZ");
const objRYEl = document.getElementById("objRY");
const objSEl = document.getElementById("objS");
const objColorEl = document.getElementById("objColor");

titleEl.textContent = `3D Studio • ${user}`;

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

function clampText(value, maxLen) {
  const s = String(value || "").trim();
  return maxLen ? s.slice(0, Math.max(0, maxLen)) : s;
}

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

const STORAGE_KEY = `fcapp_studio3d_${user}`;

const state = {
  tool: "select", // select | cube | sphere | light | model
  objects: [], // {id,type,x,y,z,s,color,intensity}
  selectedId: null,
  modelDefs: new Map(), // modelId -> { owner, name, parts }
};

function defaultScene() {
  return {
    meta: { name: "My 3D game", description: "" },
    objects: [
      { id: uid(), type: "light", x: 3, y: 6, z: 2, s: 1, color: "#ffffff", intensity: 1.2 },
      { id: uid(), type: "cube", x: 0, y: 0.5, z: 0, s: 1, color: "#3be6c1" },
      { id: uid(), type: "cube", x: 2, y: 0.5, z: 0, s: 1, color: "#ff5b6e" },
    ],
  };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    if (!Array.isArray(v.objects)) return null;
    return v;
  } catch {
    return null;
  }
}

function saveLocal(scene) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scene));
}

function applySceneToUi(scene) {
  const meta = scene?.meta || {};
  gameNameEl.value = typeof meta.name === "string" ? meta.name : "My 3D game";
  gameDescEl.value = typeof meta.description === "string" ? meta.description : "";
  state.objects = Array.isArray(scene.objects) ? scene.objects.map((o) => ({ ...o })) : [];
  state.selectedId = null;
  refreshInspector();
  syncScene();
}

function getSceneFromUi() {
  const name = clampText(gameNameEl.value, 40) || "My 3D game";
  const description = clampText(gameDescEl.value, 200);
  return {
    meta: { name, description },
    objects: state.objects.map((o) => ({ ...o })),
  };
}

function setTool(next) {
  const t = next === "cube" || next === "sphere" || next === "light" || next === "model" ? next : "select";
  state.tool = t;
  toolLabelEl.textContent = t === "select" ? "Select" : t[0].toUpperCase() + t.slice(1);
}

toolSelectEl.addEventListener("click", () => setTool("select"));
toolCubeEl.addEventListener("click", () => setTool("cube"));
toolSphereEl.addEventListener("click", () => setTool("sphere"));
toolLightEl.addEventListener("click", () => setTool("light"));
toolModelEl?.addEventListener("click", () => setTool("model"));

// --- Three.js setup
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

const scene3 = new THREE.Scene();
scene3.background = null;

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
camera.position.set(5, 5, 7);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0x334466, 0.65);
scene3.add(hemi);

const grid = new THREE.GridHelper(50, 50, 0x3be6c1, 0x223355);
grid.material.opacity = 0.24;
grid.material.transparent = true;
scene3.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // ground plane y=0

const threeById = new Map(); // id -> Object3D

function parseColor(c, fallback = 0xffffff) {
  try {
    return new THREE.Color(String(c || "")).getHex();
  } catch {
    return fallback;
  }
}

function makeMeshFor(obj) {
  if (obj.type === "light") {
    const light = new THREE.PointLight(parseColor(obj.color, 0xffffff), Math.max(0, obj.intensity || 1), 80);
    light.position.set(obj.x, obj.y, obj.z);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    light.add(bulb);
    light.userData = { id: obj.id, type: obj.type };
    return light;
  }

  const s = Math.max(0.1, Number(obj.s) || 1);
  const geometry =
    obj.type === "sphere"
      ? new THREE.SphereGeometry(0.5 * s, 24, 16)
      : new THREE.BoxGeometry(1 * s, 1 * s, 1 * s);
  const material = new THREE.MeshStandardMaterial({
    color: parseColor(obj.color, 0xffffff),
    roughness: 0.85,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(obj.x, obj.y, obj.z);
  mesh.rotation.y = (Number(obj.ry) || 0) * (Math.PI / 180);
  mesh.userData = { id: obj.id, type: obj.type };
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function makeModelGroup(instance) {
  const group = new THREE.Group();
  group.userData = { id: instance.id, type: "model" };

  const def = state.modelDefs.get(instance.modelId);
  if (!def || !Array.isArray(def.parts)) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5b6e, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    return group;
  }

  for (const p of def.parts) {
    if (!p) continue;
    const type = p.type === "sphere" ? "sphere" : "cube";
    const geometry =
      type === "sphere"
        ? new THREE.SphereGeometry(0.5, 24, 16)
        : new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: parseColor(p.color, 0xffffff),
      roughness: 0.85,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0);
    mesh.rotation.set(
      (Number(p.rx) || 0) * (Math.PI / 180),
      (Number(p.ry) || 0) * (Math.PI / 180),
      (Number(p.rz) || 0) * (Math.PI / 180)
    );
    mesh.scale.setScalar(Math.max(0.1, Number(p.s) || 1));
    group.add(mesh);
  }
  return group;
}

function syncScene() {
  // Remove deleted
  for (const [id, obj3] of Array.from(threeById.entries())) {
    if (!state.objects.some((o) => o.id === id)) {
      scene3.remove(obj3);
      threeById.delete(id);
    }
  }
  // Add/update
  for (const o of state.objects) {
    let obj3 = threeById.get(o.id);
    if (!obj3) {
      obj3 = o.type === "model" ? makeModelGroup(o) : makeMeshFor(o);
      obj3.position.set(o.x, o.y, o.z);
      if (o.type === "model" && obj3.isGroup) {
        obj3.rotation.y = (Number(o.ry) || 0) * (Math.PI / 180);
        obj3.scale.setScalar(Math.max(0.1, Number(o.s) || 1));
      }
      threeById.set(o.id, obj3);
      scene3.add(obj3);
      continue;
    }
    obj3.position.set(o.x, o.y, o.z);
    if (o.type === "model" && obj3.isGroup) {
      obj3.rotation.y = (Number(o.ry) || 0) * (Math.PI / 180);
      obj3.scale.setScalar(Math.max(0.1, Number(o.s) || 1));
    }
    if (o.type === "light" && obj3.isLight) {
      obj3.color.setHex(parseColor(o.color, 0xffffff));
      obj3.intensity = Math.max(0, Number(o.intensity) || 1);
    } else if (obj3.isMesh) {
      obj3.material.color.setHex(parseColor(o.color, 0xffffff));
      obj3.rotation.y = (Number(o.ry) || 0) * (Math.PI / 180);
    }
  }
  refreshInspector();
}

function refreshInspector() {
  const selected = state.objects.find((o) => o.id === state.selectedId) || null;
  if (!selected) {
    noSelectionEl.hidden = false;
    inspectorEl.hidden = true;
    return;
  }
  noSelectionEl.hidden = true;
  inspectorEl.hidden = false;
  objTypeEl.value = selected.type;
  objXEl.value = String(selected.x);
  objYEl.value = String(selected.y);
  objZEl.value = String(selected.z);
  objRYEl.value = String(selected.ry ?? 0);
  objSEl.value = String(selected.s ?? 1);
  objColorEl.value = String(selected.color || "");
}

function applyInspector() {
  const selected = state.objects.find((o) => o.id === state.selectedId) || null;
  if (!selected) return;
  selected.x = n(objXEl.value, selected.x);
  selected.y = n(objYEl.value, selected.y);
  selected.z = n(objZEl.value, selected.z);
  selected.ry = n(objRYEl.value, selected.ry ?? 0);
  selected.s = Math.max(0.1, Math.min(25, n(objSEl.value, selected.s ?? 1)));
  selected.color = clampText(objColorEl.value, 16) || selected.color;
  syncScene();
}

[objXEl, objYEl, objZEl, objRYEl, objSEl, objColorEl].forEach((el) => {
  el?.addEventListener("input", applyInspector);
  el?.addEventListener("change", applyInspector);
});

function resize() {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(320, Math.floor(rect.width));
  const h = Math.max(240, Math.floor(rect.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

function pointerToRay(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) / rect.width;
  const sy = (e.clientY - rect.top) / rect.height;
  pointer.x = sx * 2 - 1;
  pointer.y = -(sy * 2 - 1);
  raycaster.setFromCamera(pointer, camera);
}

function intersectGround(e) {
  pointerToRay(e);
  const out = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, out);
  return out;
}

function pickObject(e) {
  pointerToRay(e);
  const hits = raycaster.intersectObjects(Array.from(threeById.values()), true);
  const hit = hits[0]?.object;
  const root = hit ? (hit.userData?.id ? hit : hit.parent) : null;
  const id = root?.userData?.id || null;
  return id;
}

canvas.addEventListener("pointerdown", (e) => {
  // If select tool, try pick
  if (state.tool === "select") {
    const id = pickObject(e);
    state.selectedId = id;
    refreshInspector();
    return;
  }

  const p = intersectGround(e);
  if (!p) return;

  const id = uid();
  const base = { id, type: state.tool, x: p.x, y: 0.5, z: p.z, s: 1, ry: 0, color: "#ffffff" };
  if (state.tool === "cube") base.color = "#3be6c1";
  if (state.tool === "sphere") base.color = "#ff5b6e";
  if (state.tool === "light") {
    base.color = "#ffffff";
    base.y = 6;
    base.intensity = 1.2;
  }
  if (state.tool === "model") {
    const modelId = String(modelPickEl?.value || "").trim();
    const def = modelId ? state.modelDefs.get(modelId) : null;
    if (!modelId || !def) {
      setStatus("Pick a model first.", "error");
      return;
    }
    base.y = 0;
    base.modelId = modelId;
    base.modelOwner = def.owner || "";
    base.color = "#ffffff";
  }
  state.objects.push(base);
  state.selectedId = id;
  syncScene();
});

delObjEl.addEventListener("click", () => {
  if (!state.selectedId) return;
  state.objects = state.objects.filter((o) => o.id !== state.selectedId);
  state.selectedId = null;
  syncScene();
});

function animate() {
  resize();
  controls.update();
  renderer.render(scene3, camera);
  requestAnimationFrame(animate);
}

publishBtnEl.addEventListener("click", async () => {
  setStatus("", null);
  const scene = getSceneFromUi();
  const name = scene.meta.name || "My 3D game";
  const description = scene.meta.description || "";
  publishBtnEl.disabled = true;
  try {
    saveLocal(scene);
    const gamesRef = ref(database, "publishedGames");
    const newRef = push(gamesRef);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    await set(newRef, {
      owner: user,
      name,
      description,
      engine: "studio3d",
      scene,
      createdAt: nowIso,
      createdAtMs: nowMs,
      updatedAt: nowIso,
      updatedAtMs: nowMs,
    });

    setStatus("Published.", "ok");
    window.location.href = `play.html?id=${encodeURIComponent(newRef.key)}`;
  } catch (err) {
    setStatus(err?.message || String(err), "error");
  } finally {
    publishBtnEl.disabled = false;
  }
});

// Init
const existing = loadLocal() || defaultScene();
applySceneToUi(existing);
animate();

async function loadModels() {
  if (!modelPickEl) return;
  modelPickEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Pick model…";
  modelPickEl.appendChild(opt0);
  try {
    const snap = await get(ref(database, "publishedModels"));
    const raw = snap.exists() ? snap.val() || {} : {};
    const list = [];
    state.modelDefs.clear();
    for (const [id, v] of Object.entries(raw)) {
      if (!v || typeof v !== "object") continue;
      const owner = typeof v.owner === "string" ? v.owner : "";
      const isPublic = Boolean(v.public);
      if (!isPublic && owner !== user) continue;
      const name = typeof v.name === "string" ? v.name : "Model";
      const parts = Array.isArray(v.parts) ? v.parts : [];
      state.modelDefs.set(id, { owner, name, parts });
      list.push({ id, owner, name });
    }
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    for (const m of list) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name}${m.owner ? ` • ${m.owner}` : ""}`;
      modelPickEl.appendChild(opt);
    }
  } catch (err) {
    console.warn("Failed to load models:", err);
  }
}

loadModels();
