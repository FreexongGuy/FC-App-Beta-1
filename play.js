import { database, ref, get } from "./firebase.js";

const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  localStorage.removeItem("fcapp_dev");
  localStorage.removeItem("fcapp_dev_at");
  window.location.href = "index.html";
});

const titleEl = document.getElementById("title");
const nameEl = document.getElementById("gameName");
const metaEl = document.getElementById("gameMeta");
const statusEl = document.getElementById("status");
const frameEl = document.getElementById("frame");
const ownerLinkEl = document.getElementById("ownerLink");

function setStatus(message, kind) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  if (kind === "ok") statusEl.classList.add("status--ok");
  if (kind === "error") statusEl.classList.add("status--error");
}

function makeSrcdoc(userHtml) {
  const baseCss = `
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; background: #0b1d35; color: rgba(255,255,255,0.92); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      canvas { display: block; margin: 0 auto; background: rgba(255,255,255,0.06); }
    </style>
  `;
  const safe = String(userHtml || "").slice(0, 50_000);
  return `<!doctype html><meta charset="utf-8">${baseCss}${safe}`;
}

function makeStudio2dSrcdoc(scene) {
  const payload = JSON.stringify(scene || {});
  const baseCss = `
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; background: #0b1d35; color: rgba(255,255,255,0.92); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .hud { position: fixed; left: 12px; top: 10px; padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(7,17,31,0.45); font-size: 12px; }
      canvas { display: block; width: 100vw; height: 100vh; }
    </style>
  `;

  const script = `
    <script>
      const scene = ${payload};
      const meta = scene && scene.meta || {};
      const objects = Array.isArray(scene && scene.objects) ? scene.objects : [];
      const canvas = document.getElementById('c');
      const ctx = canvas.getContext('2d');
      const hud = document.getElementById('hud');

      function n(v, f){ const x=Number(v); return Number.isFinite(x)?x:f; }
      function resize(){
        const dpr = Math.min(2, window.devicePixelRatio||1);
        canvas.width = Math.floor(window.innerWidth*dpr);
        canvas.height = Math.floor(window.innerHeight*dpr);
        ctx.setTransform(dpr,0,0,dpr,0,0);
      }
      window.addEventListener('resize', resize);
      resize();

      const gravity = Math.max(0, Math.min(5000, n(meta.gravity, 800)));
      const player = { x: 60, y: 60, vx: 0, vy: 0, w: 28, h: 28 };
      const keys = new Set();
      window.addEventListener('keydown', e=>keys.add(e.key));
      window.addEventListener('keyup', e=>keys.delete(e.key));

      function rectsOverlap(a,b){ return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }
      function resolve(player, solids){
        for(const s of solids){
          if(!rectsOverlap(player,s)) continue;
          const dx1 = s.x + s.w - player.x;
          const dx2 = player.x + player.w - s.x;
          const dy1 = s.y + s.h - player.y;
          const dy2 = player.y + player.h - s.y;
          const minX = Math.min(dx1, dx2);
          const minY = Math.min(dy1, dy2);
          if(minX < minY){ player.x += dx1 < dx2 ? dx1 : -dx2; player.vx=0; }
          else { player.y += dy1 < dy2 ? dy1 : -dy2; player.vy=0; }
        }
      }

      const spawn = objects.find(o=>o && o.type==='spawn');
      if(spawn){
        player.x = spawn.x + spawn.w/2 - player.w/2;
        player.y = spawn.y + spawn.h/2 - player.h/2;
      }
      const goal = objects.find(o=>o && o.type==='goal') || null;
      const solids = objects.filter(o=>o && o.solid);

      let won = false;
      let lastT = performance.now();
      function tick(t){
        const dt = Math.min(0.03, Math.max(0.001, (t-lastT)/1000));
        lastT = t;

        const left = keys.has('ArrowLeft')||keys.has('a')||keys.has('A');
        const right = keys.has('ArrowRight')||keys.has('d')||keys.has('D');
        const up = keys.has('ArrowUp')||keys.has('w')||keys.has('W');
        const jumpKey = keys.has(' ')||up;
        const speed = 240, jump=420;

        player.vx = (right?1:0 - (left?1:0))*speed;
        player.vy += gravity*dt;

        player.x += player.vx*dt;
        resolve(player, solids);

        player.y += player.vy*dt;
        const beforeVy = player.vy;
        resolve(player, solids);
        const grounded = beforeVy>0 && player.vy===0;
        if(grounded && jumpKey) player.vy = -jump;

        if(goal && rectsOverlap(player, goal)) won = true;

        render();
        requestAnimationFrame(tick);
      }

      function render(){
        ctx.clearRect(0,0,canvas.width,canvas.height);
        // camera follow
        const cx = player.x - window.innerWidth/2 + player.w/2;
        const cy = player.y - window.innerHeight/2 + player.h/2;
        ctx.save();
        ctx.translate(-cx, -cy);

        // draw objects
        for(const o of objects){
          if(!o) continue;
          ctx.fillStyle = o.color || 'rgba(255,255,255,0.9)';
          if(o.type==='circle'){
            const r = Math.min(o.w,o.h)/2;
            ctx.beginPath();
            ctx.ellipse(o.x+o.w/2,o.y+o.h/2,r,r,0,0,Math.PI*2);
            ctx.fill();
          } else {
            ctx.fillRect(o.x,o.y,o.w,o.h);
          }
        }
        // player
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(player.x, player.y, player.w, player.h);
        ctx.restore();

        hud.textContent = won ? 'You reached the goal! (WASD / arrows, Space jump)' : 'WASD / arrows to move, Space to jump';
      }

      requestAnimationFrame(tick);
    </script>
  `;

  return `<!doctype html><meta charset="utf-8">${baseCss}<div id="hud" class="hud"></div><canvas id="c"></canvas>${script}`;
}

function makeStudio3dSrcdoc(scene, modelsById) {
  const payload = JSON.stringify(scene || {});
  const modelsPayload = JSON.stringify(modelsById || {});
  const baseCss = `
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; background: #0b1d35; color: rgba(255,255,255,0.92); font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; overflow: hidden; }
      .hud { position: fixed; left: 12px; top: 10px; padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(7,17,31,0.45); font-size: 12px; }
      canvas { width: 100vw; height: 100vh; display: block; }
    </style>
  `;

  // Uses Three.js from CDN inside the iframe as well.
  const script = `
    <script type="importmap">
      {
        "imports": {
          "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
          "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
        }
      }
    </script>
    <script type="module">
      import * as THREE from "three";
      import { OrbitControls } from "three/addons/controls/OrbitControls.js";

      const sceneData = ${payload};
      const modelsById = ${modelsPayload};
      const meta = sceneData && sceneData.meta || {};
      const objects = Array.isArray(sceneData && sceneData.objects) ? sceneData.objects : [];
      document.getElementById('hud').textContent = (meta.name ? meta.name + " • " : "") + "Drag to orbit, wheel to zoom";

      const canvas = document.getElementById('c');
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

      const scene = new THREE.Scene();
      scene.background = null;

      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
      camera.position.set(6, 5, 8);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.target.set(0, 1, 0);

      const hemi = new THREE.HemisphereLight(0xffffff, 0x334466, 0.65);
      scene.add(hemi);
      const grid = new THREE.GridHelper(50, 50, 0x3be6c1, 0x223355);
      grid.material.opacity = 0.24;
      grid.material.transparent = true;
      scene.add(grid);

      function parseColor(c, fallback=0xffffff){
        try { return new THREE.Color(String(c||"")).getHex(); } catch { return fallback; }
      }

      for(const o of objects){
        if(!o) continue;
        if(o.type === 'model'){
          const def = o.modelId ? modelsById[o.modelId] : null;
          const group = new THREE.Group();
          group.position.set(Number(o.x)||0, Number(o.y)||0, Number(o.z)||0);
          group.rotation.y = (Number(o.ry)||0) * (Math.PI/180);
          group.scale.setScalar(Math.max(0.1, Number(o.s)||1));
          if(def && Array.isArray(def.parts)){
            for(const p of def.parts){
              if(!p) continue;
              const isSphere = p.type === 'sphere';
              const geometry = isSphere
                ? new THREE.SphereGeometry(0.5, 24, 16)
                : new THREE.BoxGeometry(1,1,1);
              const material = new THREE.MeshStandardMaterial({ color: parseColor(p.color, 0xffffff), roughness: 0.85, metalness: 0.05 });
              const mesh = new THREE.Mesh(geometry, material);
              mesh.position.set(Number(p.x)||0, Number(p.y)||0, Number(p.z)||0);
              mesh.rotation.set(
                (Number(p.rx)||0) * (Math.PI/180),
                (Number(p.ry)||0) * (Math.PI/180),
                (Number(p.rz)||0) * (Math.PI/180)
              );
              mesh.scale.setScalar(Math.max(0.1, Number(p.s)||1));
              group.add(mesh);
            }
          } else {
            const geo = new THREE.BoxGeometry(1,1,1);
            const mat = new THREE.MeshStandardMaterial({ color: 0xff5b6e, roughness: 0.9 });
            group.add(new THREE.Mesh(geo, mat));
          }
          scene.add(group);
          continue;
        }
        if(o.type === 'light'){
          const light = new THREE.PointLight(parseColor(o.color, 0xffffff), Math.max(0, Number(o.intensity)||1), 80);
          light.position.set(Number(o.x)||0, Number(o.y)||6, Number(o.z)||0);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          light.add(bulb);
          scene.add(light);
          continue;
        }
        const s = Math.max(0.1, Number(o.s)||1);
        const geometry = o.type === 'sphere'
          ? new THREE.SphereGeometry(0.5*s, 24, 16)
          : new THREE.BoxGeometry(1*s,1*s,1*s);
        const material = new THREE.MeshStandardMaterial({ color: parseColor(o.color, 0xffffff), roughness: 0.85, metalness: 0.05 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(Number(o.x)||0, Number(o.y)||0.5, Number(o.z)||0);
        mesh.rotation.y = (Number(o.ry)||0) * (Math.PI/180);
        scene.add(mesh);
      }

      function resize(){
        const w = Math.max(320, Math.floor(window.innerWidth));
        const h = Math.max(240, Math.floor(window.innerHeight));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      window.addEventListener('resize', resize);
      resize();

      function animate(){
        controls.update();
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }
      animate();
    </script>
  `;

  return `<!doctype html><meta charset="utf-8">${baseCss}<div id="hud" class="hud"></div><canvas id="c"></canvas>${script}`;
}

async function load() {
  const id = (new URL(window.location.href).searchParams.get("id") || "").trim();
  if (!id) {
    setStatus("Missing game id.", "error");
    nameEl.textContent = "Not found";
    return;
  }

  setStatus("Loading…", null);

  try {
    const snap = await get(ref(database, `publishedGames/${id}`));
    if (!snap.exists()) {
      setStatus("Game not found.", "error");
      nameEl.textContent = "Not found";
      return;
    }

    const v = snap.val() || {};
    const name = typeof v.name === "string" ? v.name : "Untitled";
    const description = typeof v.description === "string" ? v.description : "";
    const owner = typeof v.owner === "string" ? v.owner : "";
    const createdAt = typeof v.createdAt === "string" ? v.createdAt : "";

    titleEl.textContent = `Play • ${name}`;
    nameEl.textContent = name;
    metaEl.textContent = `${owner ? `By ${owner}` : ""}${createdAt ? ` • ${new Date(createdAt).toLocaleString()}` : ""}${
      description ? `\n${description}` : ""
    }`.trim();

    ownerLinkEl.textContent = owner ? `@${owner}` : "Owner";
    ownerLinkEl.href = owner ? `profile.html?user=${encodeURIComponent(owner)}` : "profile.html";

    if (typeof v.html === "string" && v.html.trim()) {
      frameEl.srcdoc = makeSrcdoc(v.html || "");
    } else if (v.engine === "studio2d") {
      frameEl.srcdoc = makeStudio2dSrcdoc(v.scene);
    } else if (v.engine === "studio3d") {
      const modelsById = {};
      try {
        const objects = Array.isArray(v.scene?.objects) ? v.scene.objects : [];
        const ids = Array.from(
          new Set(
            objects
              .filter((o) => o && o.type === "model" && typeof o.modelId === "string")
              .map((o) => o.modelId)
              .filter(Boolean)
          )
        );
        await Promise.all(
          ids.map(async (id) => {
            const msnap = await get(ref(database, `publishedModels/${id}`));
            if (!msnap.exists()) return;
            const mv = msnap.val() || {};
            if (!mv || typeof mv !== "object") return;
            if (!Array.isArray(mv.parts)) return;
            modelsById[id] = { parts: mv.parts };
          })
        );
      } catch (err) {
        console.warn("Failed to load models for scene:", err);
      }
      frameEl.srcdoc = makeStudio3dSrcdoc(v.scene, modelsById);
    } else {
      frameEl.srcdoc = makeSrcdoc("<div style='padding:16px'>No playable content for this game.</div>");
    }
    setStatus("", null);
  } catch (err) {
    setStatus(err?.message || String(err), "error");
    nameEl.textContent = "Error";
  }
}

load();
