import { database, ref, push, set } from "./firebase.js";
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
titleEl.textContent = `3D Model Studio • ${user}`;

const canvas = document.getElementById("c");
const toolLabelEl = document.getElementById("toolLabel");
const toolSelectEl = document.getElementById("toolSelect");
const toolCubeEl = document.getElementById("toolCube");
const toolSphereEl = document.getElementById("toolSphere");
const dupBtnEl = document.getElementById("dupBtn");
const delBtnEl = document.getElementById("delBtn");
const saveLocalEl = document.getElementById("saveLocal");
const publishBtnEl = document.getElementById("publishBtn");

const modelNameEl = document.getElementById("modelName");
const modelDescEl = document.getElementById("modelDesc");
const statusEl = document.getElementById("status");

const noSelectionEl = document.getElementById("noSelection");
const inspectorEl = document.getElementById("inspector");
const partTypeEl = document.getElementById("partType");
const pxEl = document.getElementById("px");
const pyEl = document.getElementById("py");
const pzEl = document.getElementById("pz");
const rxEl = document.getElementById("rx");
const ryEl = document.getElementById("ry");
const rzEl = document.getElementById("rz");
const sEl = document.getElementById("s");
const colorEl = document.getElementById("color");

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

function clampText(v, maxLen) {
  const s = String(v || "").trim();
  return maxLen ? s.slice(0, Math.max(0, maxLen)) : s;
}

function n(v, f = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : f;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function degToRad(d) {
  return (Number(d) || 0) * (Math.PI / 180);
}

function radToDeg(r) {
  return (Number(r) || 0) * (180 / Math.PI);
}

function parseColorHex(value, fallback = "#ffffff") {
  const s = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  return fallback;
}

const STORAGE_KEY = `fcapp_modelstudio_${user}`;

const state = {
  tool: "select", // select | cube | sphere
  parts: [], // {id,type,x,y,z,rx,ry,rz,s,color}
  selectedId: null,
};

function defaultModel() {
  return {
    meta: { name: "My model", description: "" },
    parts: [
      { id: uid(), type: "cube", x: 0, y: 0.5, z: 0, rx: 0, ry: 0, rz: 0, s: 1, color: "#3be6c1" },
      { id: uid(), type: "cube", x: 1.1, y: 0.5, z: 0, rx: 0, ry: 0, rz: 0, s: 1, color: "#ff5b6e" },
    ],
  };
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    if (!Array.isArray(v.parts)) return null;
    return v;
  } catch {
    return null;
  }
}

function saveLocal(model) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
}

function applyModelToUi(model) {
  const meta = model?.meta || {};
  modelNameEl.value = typeof meta.name === "string" ? meta.name : "My model";
  modelDescEl.value = typeof meta.description === "string" ? meta.description : "";
  state.parts = Array.isArray(model.parts) ? model.parts.map((p) => ({ ...p })) : [];
  state.selectedId = null;
  refreshInspector();
  syncScene();
}

function getModelFromUi() {
  const name = clampText(modelNameEl.value, 40) || "My model";
  const description = clampText(modelDescEl.value, 200);
  return {
    meta: { name, description },
    parts: state.parts.map((p) => ({ ...p })),
  };
}

function setTool(next) {
  const t = next === "cube" || next === "sphere" ? next : "select";
  state.tool = t;
  toolLabelEl.textContent = t === "select" ? "Select" : `Add ${t[0].toUpperCase()}${t.slice(1)}`;
}

toolSelectEl.addEventListener("click", () => setTool("select"));
toolCubeEl.addEventListener("click", () => setTool("cube"));
toolSphereEl.addEventListener("click", () => setTool("sphere"));

// --- Three.js setup
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

const scene3 = new THREE.Scene();
scene3.background = null;

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
camera.position.set(6, 6, 8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0x334466, 0.65);
scene3.add(hemi);

const grid = new THREE.GridHelper(30, 30, 0x3be6c1, 0x223355);
grid.material.opacity = 0.24;
grid.material.transparent = true;
scene3.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const threeById = new Map(); // id -> Object3D

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

function parseThreeColor(hex) {
  try {
    return new THREE.Color(String(hex || "#ffffff"));
  } catch {
    return new THREE.Color("#ffffff");
  }
}

function makeMeshFor(part) {
  const s = Math.max(0.1, Number(part.s) || 1);
  const geometry =
    part.type === "sphere"
      ? new THREE.SphereGeometry(0.5, 24, 16)
      : new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: parseThreeColor(part.color),
    roughness: 0.85,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(s);
  mesh.position.set(part.x, part.y, part.z);
  mesh.rotation.set(degToRad(part.rx), degToRad(part.ry), degToRad(part.rz));
  mesh.userData = { id: part.id, type: part.type };
  return mesh;
}

function syncScene() {
  for (const [id, obj3] of Array.from(threeById.entries())) {
    if (!state.parts.some((p) => p.id === id)) {
      scene3.remove(obj3);
      threeById.delete(id);
    }
  }
  for (const p of state.parts) {
    let obj3 = threeById.get(p.id);
    if (!obj3) {
      obj3 = makeMeshFor(p);
      threeById.set(p.id, obj3);
      scene3.add(obj3);
      continue;
    }
    obj3.position.set(p.x, p.y, p.z);
    obj3.rotation.set(degToRad(p.rx), degToRad(p.ry), degToRad(p.rz));
    obj3.scale.setScalar(Math.max(0.1, Number(p.s) || 1));
    if (obj3.isMesh) obj3.material.color.copy(parseThreeColor(p.color));
  }
  highlightSelection();
}

function highlightSelection() {
  for (const [id, obj3] of threeById.entries()) {
    if (!obj3.isMesh) continue;
    const mat = obj3.material;
    if (id === state.selectedId) {
      mat.emissive = new THREE.Color(0x3be6c1);
      mat.emissiveIntensity = 0.35;
    } else {
      mat.emissive = new THREE.Color(0x000000);
      mat.emissiveIntensity = 0.0;
    }
  }
}

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

function pickPartId(e) {
  pointerToRay(e);
  const hits = raycaster.intersectObjects(Array.from(threeById.values()), true);
  const hit = hits[0]?.object;
  const id = hit?.userData?.id || hit?.parent?.userData?.id || null;
  return id;
}

function refreshInspector() {
  const selected = state.parts.find((p) => p.id === state.selectedId) || null;
  if (!selected) {
    noSelectionEl.hidden = false;
    inspectorEl.hidden = true;
    return;
  }
  noSelectionEl.hidden = true;
  inspectorEl.hidden = false;
  partTypeEl.value = selected.type;
  pxEl.value = String(selected.x);
  pyEl.value = String(selected.y);
  pzEl.value = String(selected.z);
  rxEl.value = String(selected.rx || 0);
  ryEl.value = String(selected.ry || 0);
  rzEl.value = String(selected.rz || 0);
  sEl.value = String(selected.s ?? 1);
  colorEl.value = String(selected.color || "");
}

function applyInspector() {
  const selected = state.parts.find((p) => p.id === state.selectedId) || null;
  if (!selected) return;
  selected.x = n(pxEl.value, selected.x);
  selected.y = n(pyEl.value, selected.y);
  selected.z = n(pzEl.value, selected.z);
  selected.rx = n(rxEl.value, selected.rx || 0);
  selected.ry = n(ryEl.value, selected.ry || 0);
  selected.rz = n(rzEl.value, selected.rz || 0);
  selected.s = Math.max(0.1, Math.min(25, n(sEl.value, selected.s ?? 1)));
  selected.color = parseColorHex(colorEl.value, selected.color || "#ffffff");
  refreshInspector();
  syncScene();
}

[pxEl, pyEl, pzEl, rxEl, ryEl, rzEl, sEl, colorEl].forEach((el) => {
  el?.addEventListener("input", applyInspector);
  el?.addEventListener("change", applyInspector);
});

canvas.addEventListener("pointerdown", (e) => {
  if (state.tool === "select") {
    state.selectedId = pickPartId(e);
    refreshInspector();
    highlightSelection();
    return;
  }

  const p = intersectGround(e);
  if (!p) return;
  const id = uid();
  const part = {
    id,
    type: state.tool,
    x: p.x,
    y: state.tool === "sphere" ? 0.5 : 0.5,
    z: p.z,
    rx: 0,
    ry: 0,
    rz: 0,
    s: 1,
    color: state.tool === "cube" ? "#3be6c1" : "#ff5b6e",
  };
  state.parts.push(part);
  state.selectedId = id;
  refreshInspector();
  syncScene();
});

dupBtnEl.addEventListener("click", () => {
  const selected = state.parts.find((p) => p.id === state.selectedId) || null;
  if (!selected) return;
  const copy = { ...selected, id: uid(), x: selected.x + 1.1, z: selected.z + 0.4 };
  state.parts.push(copy);
  state.selectedId = copy.id;
  refreshInspector();
  syncScene();
});

delBtnEl.addEventListener("click", () => {
  if (!state.selectedId) return;
  state.parts = state.parts.filter((p) => p.id !== state.selectedId);
  state.selectedId = null;
  refreshInspector();
  syncScene();
});

saveLocalEl.addEventListener("click", () => {
  const model = getModelFromUi();
  saveLocal(model);
  setStatus("Saved to this browser.", "ok");
});

publishBtnEl.addEventListener("click", async () => {
  setStatus("", null);
  const model = getModelFromUi();
  const name = model.meta.name || "My model";
  if (!model.parts.length) {
    setStatus("Add at least one part first.", "error");
    return;
  }

  publishBtnEl.disabled = true;
  try {
    saveLocal(model);
    const modelsRef = ref(database, "publishedModels");
    const newRef = push(modelsRef);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    await set(newRef, {
      owner: user,
      name,
      description: model.meta.description || "",
      parts: model.parts,
      public: true,
      createdAt: nowIso,
      createdAtMs: nowMs,
      updatedAt: nowIso,
      updatedAtMs: nowMs,
    });
    setStatus("Published model.", "ok");
  } catch (err) {
    setStatus(err?.message || String(err), "error");
  } finally {
    publishBtnEl.disabled = false;
  }
});

function animate() {
  resize();
  controls.update();
  renderer.render(scene3, camera);
  requestAnimationFrame(animate);
}

// Init
const existing = loadLocal() || defaultModel();
applyModelToUi(existing);
animate();

