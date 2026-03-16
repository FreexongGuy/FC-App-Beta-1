const user = (localStorage.getItem("fcapp_user") || "").trim();
if (!user) {
  window.location.href = "index.html";
}

document.getElementById("signout")?.addEventListener("click", () => {
  localStorage.removeItem("fcapp_user");
  window.location.href = "index.html";
});

const canvas = document.getElementById("msCanvas");
const ctx = canvas.getContext("2d");
const metaEl = document.getElementById("msMeta");

const ui = {
  drag: document.getElementById("toolDrag"),
  ball: document.getElementById("toolBall"),
  box: document.getElementById("toolBox"),
  npc: document.getElementById("toolNpc"),
  platform: document.getElementById("toolPlatform"),
  explode: document.getElementById("toolExplode"),
  gravity: document.getElementById("toolGravity"),
  clear: document.getElementById("toolClear"),
};

const W = canvas.width;
const H = canvas.height;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function len(x, y) {
  return Math.hypot(x, y);
}

function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

let gravityOn = true;
let tool = "drag";
let rafId = null;
let last = performance.now();

let nextBodyId = 1;
const bodies = [];
const constraints = [];

function makeBody(b) {
  const mass = b.isStatic ? Infinity : b.mass ?? 1;
  const invMass = b.isStatic ? 0 : 1 / mass;
  return {
    id: nextBodyId++,
    type: b.type, // circle | box
    x: b.x,
    y: b.y,
    vx: b.vx ?? 0,
    vy: b.vy ?? 0,
    w: b.w ?? 0,
    h: b.h ?? 0,
    r: b.r ?? 0,
    isStatic: Boolean(b.isStatic),
    invMass,
    restitution: b.restitution ?? 0.35,
    friction: b.friction ?? 0.015,
    color: b.color ?? "rgba(255,255,255,0.85)",
    tag: b.tag ?? "",
  };
}

function addBall(x, y) {
  const r = rand(14, 26);
  bodies.push(
    makeBody({
      type: "circle",
      x,
      y,
      r,
      mass: (r * r) / 300,
      color: "rgba(59,230,193,0.9)",
    }),
  );
}

function addBox(x, y, isStatic = false) {
  const w = rand(44, 90);
  const h = rand(28, 70);
  bodies.push(
    makeBody({
      type: "box",
      x,
      y,
      w,
      h,
      isStatic,
      mass: (w * h) / 9000,
      restitution: isStatic ? 0.25 : 0.2,
      color: isStatic ? "rgba(255,255,255,0.22)" : "rgba(255,91,110,0.78)",
      tag: isStatic ? "platform" : "",
    }),
  );
}

function addNpc(x, y) {
  // Ragdoll made of circles + distance constraints
  const parts = [];
  const addPart = (dx, dy, r, color) => {
    const body = makeBody({
      type: "circle",
      x: x + dx,
      y: y + dy,
      r,
      mass: (r * r) / 260,
      restitution: 0.05,
      friction: 0.025,
      color,
      tag: "npc",
    });
    bodies.push(body);
    parts.push(body);
    return body;
  };

  const head = addPart(0, -48, 14, "rgba(255,255,255,0.86)");
  const chest = addPart(0, -22, 12, "rgba(140,92,255,0.78)");
  const hip = addPart(0, 6, 12, "rgba(140,92,255,0.78)");

  const lArm = addPart(-22, -20, 8, "rgba(255,255,255,0.72)");
  const lHand = addPart(-38, -12, 7, "rgba(255,255,255,0.72)");
  const rArm = addPart(22, -20, 8, "rgba(255,255,255,0.72)");
  const rHand = addPart(38, -12, 7, "rgba(255,255,255,0.72)");

  const lLeg = addPart(-12, 30, 9, "rgba(255,255,255,0.7)");
  const lFoot = addPart(-12, 52, 8, "rgba(255,255,255,0.7)");
  const rLeg = addPart(12, 30, 9, "rgba(255,255,255,0.7)");
  const rFoot = addPart(12, 52, 8, "rgba(255,255,255,0.7)");

  const link = (a, b, stiffness = 0.9) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    constraints.push({ aId: a.id, bId: b.id, len: Math.hypot(dx, dy), stiffness });
  };

  link(head, chest, 0.65);
  link(chest, hip, 0.85);
  link(chest, lArm, 0.75);
  link(lArm, lHand, 0.65);
  link(chest, rArm, 0.75);
  link(rArm, rHand, 0.65);
  link(hip, lLeg, 0.8);
  link(lLeg, lFoot, 0.75);
  link(hip, rLeg, 0.8);
  link(rLeg, rFoot, 0.75);

  // brace for stability
  link(lArm, rArm, 0.15);
  link(lLeg, rLeg, 0.15);

  // little randomness so NPCs don't stack perfectly
  for (const p of parts) {
    p.vx += rand(-25, 25);
    p.vy += rand(-25, 25);
  }
}

function findBodyById(id) {
  return bodies.find((b) => b.id === id) || null;
}

function pointInBody(x, y, b) {
  if (b.type === "circle") {
    const dx = x - b.x;
    const dy = y - b.y;
    return dx * dx + dy * dy <= b.r * b.r;
  }
  const hw = b.w / 2;
  const hh = b.h / 2;
  return x >= b.x - hw && x <= b.x + hw && y >= b.y - hh && y <= b.y + hh;
}

function pickBody(x, y) {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    if (b.isStatic) continue;
    if (pointInBody(x, y, b)) return b;
  }
  return null;
}

function removeBody(id) {
  const idx = bodies.findIndex((b) => b.id === id);
  if (idx >= 0) bodies.splice(idx, 1);
  for (let i = constraints.length - 1; i >= 0; i--) {
    if (constraints[i].aId === id || constraints[i].bId === id) constraints.splice(i, 1);
  }
}

function clearWorld() {
  bodies.length = 0;
  constraints.length = 0;
  // floor + a couple platforms
  addBox(W / 2, H - 18, true);
  bodies[bodies.length - 1].w = W - 60;
  bodies[bodies.length - 1].h = 18;
  bodies[bodies.length - 1].color = "rgba(255,255,255,0.16)";

  addBox(W * 0.25, H * 0.72, true);
  bodies[bodies.length - 1].w = 220;
  bodies[bodies.length - 1].h = 16;
  addBox(W * 0.74, H * 0.58, true);
  bodies[bodies.length - 1].w = 200;
  bodies[bodies.length - 1].h = 16;
}

// constraint solver
function solveConstraints(iterations) {
  for (let it = 0; it < iterations; it++) {
    for (const c of constraints) {
      const a = findBodyById(c.aId);
      const b = findBodyById(c.bId);
      if (!a || !b) continue;
      if (a.invMass === 0 && b.invMass === 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const diff = (d - c.len) / d;
      const stiffness = c.stiffness;
      const ax = dx * diff * stiffness;
      const ay = dy * diff * stiffness;

      const invSum = a.invMass + b.invMass || 1;
      const aShare = a.invMass / invSum;
      const bShare = b.invMass / invSum;

      a.x += ax * aShare;
      a.y += ay * aShare;
      b.x -= ax * bShare;
      b.y -= ay * bShare;
    }
  }
}

// collisions
function resolveCircleCircle(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const minDist = a.r + b.r;
  if (dist >= minDist) return;

  const n = { x: dx / dist, y: dy / dist };
  const pen = minDist - dist;

  const invSum = a.invMass + b.invMass || 1;
  const aMove = (pen * (a.invMass / invSum)) || 0;
  const bMove = (pen * (b.invMass / invSum)) || 0;
  if (a.invMass > 0) {
    a.x -= n.x * aMove;
    a.y -= n.y * aMove;
  }
  if (b.invMass > 0) {
    b.x += n.x * bMove;
    b.y += n.y * bMove;
  }

  // impulse
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velAlong = rvx * n.x + rvy * n.y;
  if (velAlong > 0) return;
  const e = Math.min(a.restitution, b.restitution);
  const j = (-(1 + e) * velAlong) / (a.invMass + b.invMass || 1);
  const ix = j * n.x;
  const iy = j * n.y;
  if (a.invMass > 0) {
    a.vx -= ix * a.invMass;
    a.vy -= iy * a.invMass;
  }
  if (b.invMass > 0) {
    b.vx += ix * b.invMass;
    b.vy += iy * b.invMass;
  }
}

function resolveCircleBox(c, b) {
  const hw = b.w / 2;
  const hh = b.h / 2;
  const closestX = clamp(c.x, b.x - hw, b.x + hw);
  const closestY = clamp(c.y, b.y - hh, b.y + hh);
  const dx = c.x - closestX;
  const dy = c.y - closestY;
  const dist2 = dx * dx + dy * dy;
  if (dist2 > c.r * c.r && dist2 !== 0) return;

  let n = { x: 0, y: 0 };
  let pen = 0;

  if (dist2 === 0) {
    // center is inside (or exactly on an edge) — push out towards nearest face
    const toLeft = c.x - (b.x - hw);
    const toRight = (b.x + hw) - c.x;
    const toTop = c.y - (b.y - hh);
    const toBottom = (b.y + hh) - c.y;
    const min = Math.min(toLeft, toRight, toTop, toBottom);
    if (min === toLeft) n = { x: -1, y: 0 };
    else if (min === toRight) n = { x: 1, y: 0 };
    else if (min === toTop) n = { x: 0, y: -1 };
    else n = { x: 0, y: 1 };
    pen = c.r + min;
  } else {
    const dist = Math.sqrt(dist2) || 0.0001;
    n = { x: dx / dist, y: dy / dist };
    pen = c.r - dist;
  }

  // separate
  const invSum = c.invMass + b.invMass || 1;
  const cMove = (pen * (c.invMass / invSum)) || 0;
  const bMove = (pen * (b.invMass / invSum)) || 0;
  if (c.invMass > 0) {
    c.x += n.x * cMove;
    c.y += n.y * cMove;
  }
  if (b.invMass > 0) {
    b.x -= n.x * bMove;
    b.y -= n.y * bMove;
  }

  // impulse
  const rvx = c.vx - b.vx;
  const rvy = c.vy - b.vy;
  const velAlong = rvx * n.x + rvy * n.y;
  if (velAlong > 0) return;
  const e = Math.min(c.restitution, b.restitution);
  const j = (-(1 + e) * velAlong) / (c.invMass + b.invMass || 1);
  const ix = j * n.x;
  const iy = j * n.y;
  if (c.invMass > 0) {
    c.vx -= ix * c.invMass;
    c.vy -= iy * c.invMass;
  }
  if (b.invMass > 0) {
    b.vx += ix * b.invMass;
    b.vy += iy * b.invMass;
  }
}

function resolveBoxBox(a, b) {
  const ahw = a.w / 2;
  const ahh = a.h / 2;
  const bhw = b.w / 2;
  const bhh = b.h / 2;

  const dx = b.x - a.x;
  const px = (ahw + bhw) - Math.abs(dx);
  if (px <= 0) return;
  const dy = b.y - a.y;
  const py = (ahh + bhh) - Math.abs(dy);
  if (py <= 0) return;

  // separate on min axis
  let nx = 0;
  let ny = 0;
  let pen = 0;
  if (px < py) {
    nx = dx < 0 ? -1 : 1;
    pen = px;
  } else {
    ny = dy < 0 ? -1 : 1;
    pen = py;
  }

  const invSum = a.invMass + b.invMass || 1;
  const aMove = (pen * (a.invMass / invSum)) || 0;
  const bMove = (pen * (b.invMass / invSum)) || 0;
  if (a.invMass > 0) {
    a.x -= nx * aMove;
    a.y -= ny * aMove;
  }
  if (b.invMass > 0) {
    b.x += nx * bMove;
    b.y += ny * bMove;
  }

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velAlong = rvx * nx + rvy * ny;
  if (velAlong > 0) return;
  const e = Math.min(a.restitution, b.restitution);
  const j = (-(1 + e) * velAlong) / (a.invMass + b.invMass || 1);
  const ix = j * nx;
  const iy = j * ny;
  if (a.invMass > 0) {
    a.vx -= ix * a.invMass;
    a.vy -= iy * a.invMass;
  }
  if (b.invMass > 0) {
    b.vx += ix * b.invMass;
    b.vy += iy * b.invMass;
  }
}

function collideAll() {
  // naive O(n^2) - ok for small toy worlds
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (a.invMass === 0 && b.invMass === 0) continue;

      if (a.type === "circle" && b.type === "circle") resolveCircleCircle(a, b);
      else if (a.type === "circle" && b.type === "box") resolveCircleBox(a, b);
      else if (a.type === "box" && b.type === "circle") resolveCircleBox(b, a);
      else resolveBoxBox(a, b);
    }
  }
}

function keepInBounds(b) {
  if (b.type === "circle") {
    if (b.x < 10 + b.r) {
      b.x = 10 + b.r;
      b.vx *= -b.restitution;
    }
    if (b.x > W - 10 - b.r) {
      b.x = W - 10 - b.r;
      b.vx *= -b.restitution;
    }
    if (b.y < 10 + b.r) {
      b.y = 10 + b.r;
      b.vy *= -b.restitution;
    }
    if (b.y > H - 10 - b.r) {
      b.y = H - 10 - b.r;
      b.vy *= -b.restitution;
      b.vx *= 0.99;
    }
    return;
  }

  const hw = b.w / 2;
  const hh = b.h / 2;
  if (b.x < 10 + hw) {
    b.x = 10 + hw;
    b.vx *= -b.restitution;
  }
  if (b.x > W - 10 - hw) {
    b.x = W - 10 - hw;
    b.vx *= -b.restitution;
  }
  if (b.y < 10 + hh) {
    b.y = 10 + hh;
    b.vy *= -b.restitution;
  }
  if (b.y > H - 10 - hh) {
    b.y = H - 10 - hh;
    b.vy *= -b.restitution;
    b.vx *= 0.99;
  }
}

function step(dt) {
  // integrate
  const g = gravityOn ? 900 : 0;
  for (const b of bodies) {
    if (b.invMass === 0) continue;
    b.vy += g * dt;
    b.vx *= 1 - b.friction;
    b.vy *= 1 - b.friction;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // solve joints + collisions (a few iterations looks nicer)
  solveConstraints(4);
  collideAll();
  solveConstraints(2);

  // bounds
  for (const b of bodies) {
    if (b.invMass === 0) continue;
    keepInBounds(b);
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // background
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, 0, W, H);

  // border
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  // constraints (NPC joints)
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  for (const c of constraints) {
    const a = findBodyById(c.aId);
    const b = findBodyById(c.bId);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // bodies
  for (const b of bodies) {
    ctx.fillStyle = b.color;
    if (b.type === "circle") {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
    }
  }
}

function loop(now) {
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  // fixed-ish: do 2 substeps for stability
  const sub = dt / 2;
  step(sub);
  step(sub);
  draw();
}

function setTool(next) {
  tool = next;
  metaEl.textContent = `Tool: ${tool === "drag" ? "Drag" : tool.charAt(0).toUpperCase() + tool.slice(1)}`;
  for (const el of Object.values(ui)) {
    if (!el) continue;
    el.classList.remove("is-active");
  }
  const map = {
    drag: ui.drag,
    ball: ui.ball,
    box: ui.box,
    npc: ui.npc,
    platform: ui.platform,
    explode: ui.explode,
  };
  map[tool]?.classList.add("is-active");
}

let pointer = { x: 0, y: 0, down: false };
let drag = { bodyId: null, ox: 0, oy: 0 };

function toWorld(ev) {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

function explodeAt(x, y) {
  for (const b of bodies) {
    if (b.invMass === 0) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    const d = Math.hypot(dx, dy);
    if (d < 1 || d > 280) continue;
    const n = norm(dx, dy);
    const strength = (1 - d / 280) * 860;
    const mass = b.invMass ? 1 / b.invMass : 1;
    const accel = strength / mass;
    b.vx += n.x * accel;
    b.vy += n.y * accel;
  }
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("pointerdown", (ev) => {
  const p = toWorld(ev);
  pointer = { ...p, down: true };

  if (ev.button === 2) {
    const b = pickBody(p.x, p.y);
    if (b) removeBody(b.id);
    return;
  }

  if (tool === "drag") {
    const b = pickBody(p.x, p.y);
    if (!b) return;
    drag.bodyId = b.id;
    drag.ox = b.x - p.x;
    drag.oy = b.y - p.y;
    return;
  }

  if (tool === "ball") addBall(p.x, p.y);
  if (tool === "box") addBox(p.x, p.y, false);
  if (tool === "platform") addBox(p.x, p.y, true);
  if (tool === "npc") addNpc(p.x, p.y);
  if (tool === "explode") explodeAt(p.x, p.y);
});

canvas.addEventListener("pointermove", (ev) => {
  const p = toWorld(ev);
  pointer.x = p.x;
  pointer.y = p.y;

  if (!pointer.down) return;
  if (tool !== "drag" || !drag.bodyId) return;

  const b = findBodyById(drag.bodyId);
  if (!b) return;

  // gentle mouse joint
  const targetX = p.x + drag.ox;
  const targetY = p.y + drag.oy;
  const k = 22;
  b.vx += (targetX - b.x) * k;
  b.vy += (targetY - b.y) * k;
});

canvas.addEventListener("pointerup", () => {
  pointer.down = false;
  drag.bodyId = null;
});
canvas.addEventListener("pointercancel", () => {
  pointer.down = false;
  drag.bodyId = null;
});

ui.drag.addEventListener("click", () => setTool("drag"));
ui.ball.addEventListener("click", () => setTool("ball"));
ui.box.addEventListener("click", () => setTool("box"));
ui.npc.addEventListener("click", () => setTool("npc"));
ui.platform.addEventListener("click", () => setTool("platform"));
ui.explode.addEventListener("click", () => setTool("explode"));

ui.gravity.addEventListener("click", () => {
  gravityOn = !gravityOn;
  ui.gravity.textContent = `Gravity: ${gravityOn ? "On" : "Off"}`;
});

ui.clear.addEventListener("click", () => {
  clearWorld();
});

// boot
clearWorld();
setTool("drag");
rafId = requestAnimationFrame(loop);
