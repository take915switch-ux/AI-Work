const PHYSICS = Object.freeze({
  g: 9.81,
  mass: 1,
  diskRadius: 1.2,
  objectRadius: 0.09,
  muStatic: 0.34,
  muKinetic: 0.26,
  maxAngularAccel: 1.35,
});

const HOME_POS = Object.freeze({ x: 1.82, y: 0.7 });
const OBJECT_PALETTES = Object.freeze([
  { rim: "#72491f", body: "#d99c49", face: "#edc371" },
  { rim: "#74433b", body: "#cc715b", face: "#e49b87" },
  { rim: "#486036", body: "#83a25d", face: "#a9c681" },
  { rim: "#31505a", body: "#5f98a5", face: "#83b9c3" },
  { rim: "#6f5e31", body: "#b69b53", face: "#d3bc7a" },
]);

const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");
const omegaSlider = document.getElementById("omegaSlider");
const targetOmegaLabel = document.getElementById("targetOmegaLabel");
const stopButton = document.getElementById("stopButton");
const resetButton = document.getElementById("resetButton");
const objectStateEl = document.getElementById("objectState");
const omegaValueEl = document.getElementById("omegaValue");
const alphaValueEl = document.getElementById("alphaValue");
const radiusValueEl = document.getElementById("radiusValue");
const frictionValueEl = document.getElementById("frictionValue");
const limitValueEl = document.getElementById("limitValue");
const statusNoteEl = document.getElementById("statusNote");

let nextObjectId = 1;

function createObject(pos = HOME_POS, mode = "ready") {
  const id = nextObjectId;
  nextObjectId += 1;
  return {
    id,
    palette: OBJECT_PALETTES[(id - 1) % OBJECT_PALETTES.length],
    mode,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    localPos: { x: 0, y: 0 },
    friction: { x: 0, y: 0 },
  };
}

const state = {
  diskAngle: 0,
  omega: 0,
  targetOmega: 0,
  alpha: 0,
  lastTimestamp: 0,
  view: {
    centerX: 0,
    centerY: 0,
    scale: 1,
  },
  dragPointerId: null,
  dragObjectId: null,
  dragSourceMode: null,
  dragOffset: { x: 0, y: 0 },
  focusObjectId: null,
  objects: [],
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function mul(v, scalar) {
  return { x: v.x * scalar, y: v.y * scalar };
}

function lengthOf(v) {
  return Math.hypot(v.x, v.y);
}

function normalize(v) {
  const magnitude = lengthOf(v);
  if (magnitude < 1e-8) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / magnitude, y: v.y / magnitude };
}

function rotate(v, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c,
  };
}

function perp(v) {
  return { x: -v.y, y: v.x };
}

function formatNumber(value, digits = 2) {
  return `${value.toFixed(digits)}`;
}

function getObjectById(id) {
  return state.objects.find((object) => object.id === id) ?? null;
}

function bringObjectToFront(objectId) {
  const index = state.objects.findIndex((object) => object.id === objectId);
  if (index === -1) {
    return;
  }
  const [object] = state.objects.splice(index, 1);
  state.objects.push(object);
}

function objectOnDisk(object) {
  return object.mode === "stuck" || object.mode === "sliding";
}

function isDraggable(object) {
  if (object.mode === "ready" || object.mode === "dragging" || object.mode === "off-disk") {
    return true;
  }
  return object.mode === "stuck" && Math.abs(state.omega) < 0.12;
}

function grabRadiusForObject(object) {
  const baseRadius = PHYSICS.objectRadius * 1.5;
  const minTouchRadiusPx =
    object.mode === "ready" || object.mode === "dragging" ? 36 : 28;
  const touchRadius = minTouchRadiusPx / state.view.scale;
  return Math.max(baseRadius, touchRadius);
}

function currentRadius(object) {
  if (!object) {
    return 0;
  }
  if (object.mode === "stuck") {
    return lengthOf(object.localPos);
  }
  return lengthOf(object.pos);
}

function updateCanvasSize() {
  const frame = canvas.parentElement;
  const rect = frame.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  state.view.centerX = width * 0.42;
  state.view.centerY = height * 0.52;
  state.view.scale = Math.min(width * 0.255, height * 0.36);
}

function worldToScreen(v) {
  return {
    x: state.view.centerX + v.x * state.view.scale,
    y: state.view.centerY - v.y * state.view.scale,
  };
}

function screenToWorld(x, y) {
  return {
    x: (x - state.view.centerX) / state.view.scale,
    y: (state.view.centerY - y) / state.view.scale,
  };
}

function getPointerWorldPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
}

function staticFrictionLimit() {
  return PHYSICS.muStatic * PHYSICS.mass * PHYSICS.g;
}

function requiredStaticFriction(worldPos) {
  const centripetal = mul(worldPos, -PHYSICS.mass * state.omega * state.omega);
  const tangential = mul(perp(worldPos), PHYSICS.mass * state.alpha);
  return add(centripetal, tangential);
}

function setTargetOmega(nextOmega) {
  state.targetOmega = clamp(nextOmega, 0, Number(omegaSlider.max));
  omegaSlider.value = state.targetOmega;
  targetOmegaLabel.textContent = `${formatNumber(state.targetOmega)} rad/s`;
}

function clearObjectMotion(object) {
  object.vel = { x: 0, y: 0 };
  object.localPos = { x: 0, y: 0 };
  object.friction = { x: 0, y: 0 };
}

function resetObjectToHome(object) {
  object.mode = "ready";
  object.pos = { ...HOME_POS };
  clearObjectMotion(object);
}

function setObjectOffDisk(object) {
  object.mode = "off-disk";
  object.localPos = { x: 0, y: 0 };
  object.friction = { x: 0, y: 0 };
}

function ensureSupplyObject() {
  const hasSupply = state.objects.some((object) => object.mode === "ready");
  if (hasSupply) {
    return;
  }
  const supply = createObject();
  state.objects.push(supply);
  if (!state.focusObjectId) {
    state.focusObjectId = supply.id;
  }
}

function resetObjects() {
  nextObjectId = 1;
  state.objects = [createObject()];
  state.focusObjectId = state.objects[0].id;
  state.dragObjectId = null;
  state.dragSourceMode = null;
  state.dragPointerId = null;
  state.dragOffset = { x: 0, y: 0 };
}

function hardReset() {
  state.diskAngle = 0;
  state.omega = 0;
  state.alpha = 0;
  state.lastTimestamp = 0;
  canvas.classList.remove("dragging");
  setTargetOmega(0);
  resetObjects();
}

function modeLabel(mode) {
  switch (mode) {
    case "dragging":
      return "ドラッグ中";
    case "stuck":
      return "静止摩擦で一体回転中";
    case "sliding":
      return "すべり中";
    case "off-disk":
      return "円板の外へ飛び出し";
    default:
      return "待機中";
  }
}

function modeDescription(mode) {
  switch (mode) {
    case "dragging":
      return "このまま円板の内側で指を離すと、その位置に物体を置けます。";
    case "stuck":
      return "静止摩擦が向きを変えながら、物体を円板と一緒に回しています。";
    case "sliding":
      return "必要な静止摩擦力が上限を超えたため、物体はすべり始めました。";
    case "off-disk":
      return "物体は円板から離れたので、摩擦力はもう働いていません。";
    default:
      return "待機位置から新しい物体を円板へドラッグできます。";
  }
}

function focusedObject() {
  if (state.dragObjectId) {
    return getObjectById(state.dragObjectId);
  }
  const focus = getObjectById(state.focusObjectId);
  if (focus) {
    return focus;
  }
  return state.objects[state.objects.length - 1] ?? null;
}

function pickObject(worldPoint) {
  for (let index = state.objects.length - 1; index >= 0; index -= 1) {
    const object = state.objects[index];
    if (!isDraggable(object)) {
      continue;
    }
    if (lengthOf(sub(worldPoint, object.pos)) <= grabRadiusForObject(object)) {
      return object;
    }
  }
  return null;
}

function attachObjectAt(object, worldPos) {
  object.mode = "stuck";
  object.pos = { ...worldPos };
  object.localPos = rotate(worldPos, -state.diskAngle);
  object.vel = mul(perp(worldPos), state.omega);
  object.friction = requiredStaticFriction(worldPos);
  maybeStartSliding(object);
}

function maybeStartSliding(object) {
  if (object.mode !== "stuck") {
    return;
  }
  const friction = requiredStaticFriction(object.pos);
  object.friction = friction;
  if (lengthOf(friction) <= staticFrictionLimit()) {
    return;
  }
  object.mode = "sliding";
  object.vel = mul(perp(object.pos), state.omega);
}

function beginDrag(event) {
  event.preventDefault();
  const worldPoint = getPointerWorldPosition(event);
  const object = pickObject(worldPoint);
  if (!object) {
    return;
  }

  state.dragPointerId = event.pointerId;
  state.dragObjectId = object.id;
  state.dragSourceMode = object.mode;
  state.focusObjectId = object.id;
  bringObjectToFront(object.id);
  object.mode = "dragging";
  object.vel = { x: 0, y: 0 };
  object.friction = { x: 0, y: 0 };
  state.dragOffset = sub(object.pos, worldPoint);
  canvas.classList.add("dragging");
  canvas.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  event.preventDefault();
  if (state.dragPointerId !== event.pointerId || state.dragObjectId === null) {
    return;
  }

  const object = getObjectById(state.dragObjectId);
  if (!object || object.mode !== "dragging") {
    return;
  }

  const worldPoint = getPointerWorldPosition(event);
  const dragged = add(worldPoint, state.dragOffset);
  object.pos = {
    x: clamp(dragged.x, -1.95, 2.25),
    y: clamp(dragged.y, -1.55, 1.55),
  };
}

function finishDrag(event, cancelled = false) {
  if (state.dragPointerId !== event.pointerId) {
    return;
  }

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  canvas.classList.remove("dragging");

  const object = getObjectById(state.dragObjectId);
  const sourceMode = state.dragSourceMode;

  state.dragPointerId = null;
  state.dragObjectId = null;
  state.dragSourceMode = null;

  if (!object) {
    return;
  }

  if (cancelled) {
    if (sourceMode === "ready") {
      resetObjectToHome(object);
    } else {
      setObjectOffDisk(object);
    }
    return;
  }

  if (lengthOf(object.pos) <= PHYSICS.diskRadius) {
    attachObjectAt(object, object.pos);
    state.focusObjectId = object.id;
    ensureSupplyObject();
    return;
  }

  if (sourceMode === "ready") {
    resetObjectToHome(object);
    state.focusObjectId = object.id;
    return;
  }

  setObjectOffDisk(object);
  state.focusObjectId = object.id;
}

function updateDisk(dt) {
  const previousOmega = state.omega;
  const difference = state.targetOmega - state.omega;
  if (Math.abs(difference) < 1e-8) {
    state.alpha = 0;
    state.omega = state.targetOmega;
  } else {
    const maxStep = PHYSICS.maxAngularAccel * dt;
    if (Math.abs(difference) <= maxStep) {
      state.omega = state.targetOmega;
      state.alpha = dt > 0 ? (state.omega - previousOmega) / dt : 0;
    } else {
      state.alpha = Math.sign(difference) * PHYSICS.maxAngularAccel;
      state.omega += state.alpha * dt;
    }
  }

  state.diskAngle += (previousOmega + state.omega) * 0.5 * dt;
}

function updateAttachedObject(object) {
  object.pos = rotate(object.localPos, state.diskAngle);
  maybeStartSliding(object);
}

function slidingFrictionForce(object) {
  const relativeVelocity = sub(
    object.vel,
    mul(perp(object.pos), state.omega)
  );

  if (lengthOf(relativeVelocity) > 1e-5) {
    return mul(
      normalize(relativeVelocity),
      -PHYSICS.muKinetic * PHYSICS.mass * PHYSICS.g
    );
  }

  const fallbackDirection = normalize(requiredStaticFriction(object.pos));
  return mul(
    fallbackDirection,
    PHYSICS.muKinetic * PHYSICS.mass * PHYSICS.g
  );
}

function updateSlidingObject(object, dt) {
  if (lengthOf(object.pos) <= PHYSICS.diskRadius) {
    object.friction = slidingFrictionForce(object);
  } else {
    object.mode = "off-disk";
    object.friction = { x: 0, y: 0 };
  }

  const acceleration = mul(object.friction, 1 / PHYSICS.mass);
  object.vel = add(object.vel, mul(acceleration, dt));
  object.pos = add(object.pos, mul(object.vel, dt));

  if (object.mode === "sliding" && lengthOf(object.pos) > PHYSICS.diskRadius) {
    object.mode = "off-disk";
    object.friction = { x: 0, y: 0 };
  }
}

function updateOffDiskObject(object, dt) {
  object.friction = { x: 0, y: 0 };
  object.pos = add(object.pos, mul(object.vel, dt));
}

function updateSimulation(timestamp) {
  if (state.lastTimestamp === 0) {
    state.lastTimestamp = timestamp;
  }
  const dt = clamp((timestamp - state.lastTimestamp) / 1000, 0, 0.025);
  state.lastTimestamp = timestamp;

  updateDisk(dt);

  for (const object of state.objects) {
    if (object.mode === "stuck") {
      updateAttachedObject(object);
    } else if (object.mode === "sliding") {
      updateSlidingObject(object, dt);
    } else if (object.mode === "off-disk") {
      updateOffDiskObject(object, dt);
    }
  }

  drawScene();
  updateStats();
  requestAnimationFrame(updateSimulation);
}

function drawBackground(width, height) {
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "rgba(255, 252, 244, 0.98)");
  background.addColorStop(1, "rgba(211, 232, 234, 0.78)");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(28, 57, 66, 0.05)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawDisk() {
  const center = worldToScreen({ x: 0, y: 0 });
  const radiusPx = PHYSICS.diskRadius * state.view.scale;

  ctx.save();
  ctx.translate(center.x, center.y);

  ctx.fillStyle = "rgba(12, 44, 54, 0.12)";
  ctx.beginPath();
  ctx.ellipse(0, 18, radiusPx * 0.98, radiusPx * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();

  const diskGradient = ctx.createRadialGradient(
    -radiusPx * 0.24,
    -radiusPx * 0.3,
    radiusPx * 0.15,
    0,
    0,
    radiusPx
  );
  diskGradient.addColorStop(0, "#6aa4b0");
  diskGradient.addColorStop(0.55, "#3d7382");
  diskGradient.addColorStop(1, "#173746");

  ctx.fillStyle = diskGradient;
  ctx.beginPath();
  ctx.arc(0, 0, radiusPx, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  // Canvas coordinates have y growing downward, so invert the sign here to
  // match the object's counterclockwise motion in the simulation world.
  ctx.rotate(-state.diskAngle);

  ctx.strokeStyle = "rgba(232, 249, 255, 0.23)";
  ctx.lineWidth = Math.max(1.5, radiusPx * 0.012);
  for (let i = 0; i < 12; i += 1) {
    ctx.rotate(Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(radiusPx * 0.12, 0);
    ctx.lineTo(radiusPx * 0.92, 0);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 228, 170, 0.32)";
  ctx.lineWidth = Math.max(5, radiusPx * 0.035);
  ctx.beginPath();
  ctx.arc(0, 0, radiusPx * 0.78, -0.24, 0.24);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = "rgba(244, 255, 255, 0.22)";
  ctx.lineWidth = Math.max(2, radiusPx * 0.01);
  ctx.beginPath();
  ctx.arc(0, 0, radiusPx * 0.64, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radiusPx * 0.34, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#fff4d8";
  ctx.beginPath();
  ctx.arc(0, 0, radiusPx * 0.05, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHomeMarker() {
  const marker = worldToScreen(HOME_POS);
  const radiusPx = PHYSICS.objectRadius * state.view.scale * 1.7;
  ctx.save();
  ctx.strokeStyle = "rgba(14, 116, 144, 0.34)";
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, radiusPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(14, 116, 144, 0.8)";
  ctx.font = '600 15px "Avenir Next", "Hiragino Kaku Gothic ProN", sans-serif';
  ctx.fillText("待機位置", marker.x - radiusPx * 0.9, marker.y - radiusPx - 12);
  ctx.restore();
}

function drawObject(object) {
  const objectScreen = worldToScreen(object.pos);
  const radiusPx = PHYSICS.objectRadius * state.view.scale;
  const isFocused = object.id === state.focusObjectId || object.id === state.dragObjectId;

  ctx.save();
  ctx.translate(objectScreen.x, objectScreen.y);

  ctx.fillStyle = object.palette.body;
  ctx.beginPath();
  ctx.arc(0, 0, radiusPx, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = object.palette.rim;
  ctx.lineWidth = Math.max(3, radiusPx * 0.18);
  ctx.stroke();

  ctx.fillStyle = object.palette.face;
  ctx.beginPath();
  ctx.arc(0, 0, radiusPx * 0.76, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(50, 28, 10, 0.22)";
  ctx.lineWidth = Math.max(1.2, radiusPx * 0.05);
  ctx.stroke();

  if (isFocused) {
    ctx.strokeStyle = "rgba(15, 98, 121, 0.9)";
    ctx.lineWidth = Math.max(2, radiusPx * 0.08);
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, radiusPx * 1.18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "rgba(49, 34, 15, 0.72)";
  ctx.font = `700 ${Math.max(12, radiusPx * 0.45)}px "Avenir Next", "Hiragino Kaku Gothic ProN", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${object.id}`, 0, 1);

  ctx.restore();
}

function drawFrictionVector(object) {
  if (!objectOnDisk(object)) {
    return;
  }

  const force = object.friction;
  const magnitude = lengthOf(force);
  const start = worldToScreen(object.pos);
  const color = object.mode === "stuck" ? "#f59e0b" : "#ef4444";

  if (magnitude < 1e-6) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(start.x, start.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const minLength = 18;
  const maxLength = 96;
  const lengthPx =
    minLength + (magnitude / (staticFrictionLimit() * 1.15)) * (maxLength - minLength);
  const direction = normalize(force);
  const end = {
    x: start.x + direction.x * clamp(lengthPx, minLength, maxLength),
    y: start.y - direction.y * clamp(lengthPx, minLength, maxLength),
  };

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  const arrowAngle = Math.atan2(end.y - start.y, end.x - start.x);
  ctx.translate(end.x, end.y);
  ctx.rotate(arrowAngle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-14, -8);
  ctx.lineTo(-14, 8);
  ctx.closePath();
  ctx.fill();

  ctx.rotate(-arrowAngle);
  ctx.translate(-end.x, -end.y);
  ctx.restore();
}

function drawScene() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  drawBackground(width, height);
  drawDisk();
  drawHomeMarker();

  for (const object of state.objects) {
    drawObject(object);
  }
  for (const object of state.objects) {
    drawFrictionVector(object);
  }
}

function buildStatusNote(object) {
  const onDiskCount = state.objects.filter(objectOnDisk).length;
  const readyCount = state.objects.filter((item) => item.mode === "ready").length;
  const countsNote = `円板上に ${onDiskCount} 個、画面上に ${state.objects.length} 個あります。`;

  if (!object) {
    return `${countsNote} 待機位置から新しい物体を円板へドラッグしてください。`;
  }

  const supplyNote =
    readyCount > 0 && object.mode !== "ready"
      ? "次の物体は待機位置に補充されています。"
      : "";

  return `${countsNote} ${modeDescription(object.mode)} ${supplyNote}`.trim();
}

function updateStats() {
  const object = focusedObject();
  objectStateEl.textContent = object ? `物体 ${object.id}: ${modeLabel(object.mode)}` : "未配置";
  omegaValueEl.textContent = `${formatNumber(state.omega)} rad/s`;
  alphaValueEl.textContent = `${formatNumber(state.alpha)} rad/s²`;
  radiusValueEl.textContent = object ? `${formatNumber(currentRadius(object))} m` : "0.00 m";
  frictionValueEl.textContent = object ? `${formatNumber(lengthOf(object.friction))} N` : "0.00 N";
  limitValueEl.textContent = `${formatNumber(staticFrictionLimit())} N`;
  statusNoteEl.textContent = buildStatusNote(object);
}

omegaSlider.addEventListener("input", (event) => {
  setTargetOmega(Number(event.target.value));
});

stopButton.addEventListener("click", () => {
  setTargetOmega(0);
});

resetButton.addEventListener("click", () => {
  hardReset();
});

canvas.addEventListener("pointerdown", beginDrag);
canvas.addEventListener("pointermove", moveDrag);
canvas.addEventListener("pointerup", (event) => {
  finishDrag(event, false);
});
canvas.addEventListener("pointercancel", (event) => {
  finishDrag(event, true);
});
canvas.addEventListener("pointerleave", (event) => {
  if (state.dragPointerId === event.pointerId && state.dragObjectId !== null) {
    moveDrag(event);
  }
});

window.addEventListener("resize", updateCanvasSize);

setTargetOmega(0);
resetObjects();
updateCanvasSize();
updateStats();
drawScene();
requestAnimationFrame(updateSimulation);
