const CONFIG = Object.freeze({
  g: 9.81,
  mass: 1,
  stringLength: 1.6,
  bobRadius: 0.08,
  defaultNailDistance: 0.8,
  minNailDistance: 0.24,
  maxNailDistance: 1.28,
  defaultTimeScale: 1,
  minTimeScale: 0.1,
  maxTimeScale: 1,
  dragMinAngle: -Math.PI / 2,
  dragMaxAngle: Math.PI / 2,
  maxTrailPoints: 420,
  trailSpacing: 0.014,
  substep: 1 / 240,
});

const VIEWPORT = Object.freeze({
  minX: -2.0,
  maxX: 2.1,
  minY: -0.18,
  maxY: 2.92,
  padding: 34,
});

const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");
const nailSlider = document.getElementById("nailSlider");
const nailValueEl = document.getElementById("nailValue");
const speedSlider = document.getElementById("speedSlider");
const speedScaleValueEl = document.getElementById("speedScaleValue");
const launchButton = document.getElementById("launchButton");
const pauseButton = document.getElementById("pauseButton");
const resetButton = document.getElementById("resetButton");
const exampleButton = document.getElementById("exampleButton");
const phaseValueEl = document.getElementById("phaseValue");
const pivotValueEl = document.getElementById("pivotValue");
const angleValueEl = document.getElementById("angleValue");
const speedValueEl = document.getElementById("speedValue");
const tensionValueEl = document.getElementById("tensionValue");
const radiusValueEl = document.getElementById("radiusValue");
const t1ValueEl = document.getElementById("t1Value");
const t2ValueEl = document.getElementById("t2Value");
const detachAngleValueEl = document.getElementById("detachAngleValue");
const detachCosValueEl = document.getElementById("detachCosValue");
const statusNoteEl = document.getElementById("statusNote");

const state = {
  lastTimestamp: 0,
  paused: false,
  mode: "ready",
  preparedAngle: CONFIG.dragMinAngle,
  releaseAngle: CONFIG.dragMinAngle,
  angle: CONFIG.dragMinAngle,
  angVel: 0,
  pos: { x: 0, y: 0 },
  vel: { x: 0, y: 0 },
  tension: 0,
  activePivot: "A",
  currentRadius: CONFIG.stringLength,
  nailDistance: CONFIG.defaultNailDistance,
  timeScale: CONFIG.defaultTimeScale,
  dragPointerId: null,
  trail: [],
  hasCaughtNail: false,
  projectileWentInsideCircle: false,
  view: {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lengthOf(vector) {
  return Math.hypot(vector.x, vector.y);
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceFromNail(point) {
  return distanceBetween(point, { x: 0, y: state.nailDistance });
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(vector, scalar) {
  return { x: vector.x * scalar, y: vector.y * scalar };
}

function normalize(vector) {
  const magnitude = lengthOf(vector);
  if (magnitude < 1e-8) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "0.00";
  }
  return value.toFixed(digits);
}

function formatSignedNumber(value, digits = 1) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function radiansToDegrees(angle) {
  return (angle * 180) / Math.PI;
}

function nailRadius() {
  return CONFIG.stringLength - state.nailDistance;
}

function isMotionMode(mode = state.mode) {
  return mode === "swing_a" || mode === "swing_nail" || mode === "projectile";
}

function activePivotPosition() {
  if (state.activePivot === "A") {
    return { x: 0, y: 0 };
  }
  if (state.activePivot === "O") {
    return { x: 0, y: state.nailDistance };
  }
  return null;
}

function positionOnOriginalCircle(angle) {
  return {
    x: CONFIG.stringLength * Math.sin(angle),
    y: CONFIG.stringLength * Math.cos(angle),
  };
}

function velocityOnOriginalCircle(angle, angularVelocity) {
  return {
    x: CONFIG.stringLength * angularVelocity * Math.cos(angle),
    y: -CONFIG.stringLength * angularVelocity * Math.sin(angle),
  };
}

function positionOnNailCircle(angle) {
  const radius = nailRadius();
  return {
    x: radius * Math.sin(angle),
    y: state.nailDistance + radius * Math.cos(angle),
  };
}

function velocityOnNailCircle(angle, angularVelocity) {
  const radius = nailRadius();
  return {
    x: radius * angularVelocity * Math.cos(angle),
    y: -radius * angularVelocity * Math.sin(angle),
  };
}

function pendulumAcceleration(angle, radius) {
  return -(CONFIG.g / radius) * Math.sin(angle);
}

function tensionForCircularMotion(radius, angle, angularVelocity) {
  return CONFIG.mass * (radius * angularVelocity * angularVelocity + CONFIG.g * Math.cos(angle));
}

function previewTension(angle) {
  return Math.max(0, CONFIG.mass * CONFIG.g * Math.cos(angle));
}

function bottomSpeedSquaredForAngle(angle) {
  return Math.max(0, 2 * CONFIG.g * CONFIG.stringLength * (1 - Math.cos(angle)));
}

function bottomSpeedForAngle(angle) {
  return Math.sqrt(bottomSpeedSquaredForAngle(angle));
}

function predictedScenario() {
  const speedSquared = bottomSpeedSquaredForAngle(state.preparedAngle);
  const radius = nailRadius();
  const beforeTension = CONFIG.mass * (speedSquared / CONFIG.stringLength + CONFIG.g);
  const afterTension = CONFIG.mass * (speedSquared / radius + CONFIG.g);
  const detachCos = (2 - speedSquared / (CONFIG.g * radius)) / 3;
  const leavesCircle = detachCos >= -1 && detachCos <= 1;
  const detachAngle = leavesCircle ? Math.acos(detachCos) : null;

  return {
    beforeTension,
    afterTension,
    detachCos,
    detachAngle,
    leavesCircle,
  };
}

function worldToScreen(point) {
  return {
    x: state.view.offsetX + point.x * state.view.scale,
    y: state.view.offsetY + point.y * state.view.scale,
  };
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return {
    x: (x - state.view.offsetX) / state.view.scale,
    y: (y - state.view.offsetY) / state.view.scale,
  };
}

function bobHitRadiusWorld() {
  const minPixels = 28;
  return Math.max(CONFIG.bobRadius * 1.6, minPixels / state.view.scale);
}

function syncNailLabel() {
  nailValueEl.textContent = `${formatNumber(state.nailDistance)} m`;
}

function syncTimeScaleLabel() {
  speedScaleValueEl.textContent = `${formatNumber(state.timeScale)}x`;
}

function recordTrail(force = false) {
  const lastPoint = state.trail[state.trail.length - 1];
  if (!lastPoint || force || distanceBetween(lastPoint, state.pos) >= CONFIG.trailSpacing) {
    state.trail.push({ ...state.pos });
    if (state.trail.length > CONFIG.maxTrailPoints) {
      state.trail.shift();
    }
  }
}

function setReadyPose() {
  state.mode = "ready";
  state.activePivot = "A";
  state.currentRadius = CONFIG.stringLength;
  state.angle = state.preparedAngle;
  state.angVel = 0;
  state.pos = positionOnOriginalCircle(state.angle);
  state.vel = { x: 0, y: 0 };
  state.tension = previewTension(state.angle);
}

function resetToReady(angle = state.preparedAngle) {
  state.preparedAngle = clamp(angle, CONFIG.dragMinAngle, CONFIG.dragMaxAngle);
  state.releaseAngle = state.preparedAngle;
  state.paused = false;
  state.hasCaughtNail = false;
  state.projectileWentInsideCircle = false;
  state.lastTimestamp = 0;
  setReadyPose();
  state.trail = [{ ...state.pos }];
}

function applyExamplePreset() {
  state.nailDistance = CONFIG.defaultNailDistance;
  nailSlider.value = state.nailDistance.toFixed(2);
  syncNailLabel();
  resetToReady(CONFIG.dragMinAngle);
}

function setPreparedAngle(nextAngle) {
  state.preparedAngle = clamp(nextAngle, CONFIG.dragMinAngle, CONFIG.dragMaxAngle);
  state.releaseAngle = state.preparedAngle;
  state.activePivot = "A";
  state.currentRadius = CONFIG.stringLength;
  state.angle = state.preparedAngle;
  state.angVel = 0;
  state.pos = positionOnOriginalCircle(state.angle);
  state.vel = { x: 0, y: 0 };
  state.tension = previewTension(state.angle);
}

function launchFromPreparedAngle() {
  state.mode = "swing_a";
  state.paused = false;
  state.hasCaughtNail = false;
  state.projectileWentInsideCircle = false;
  state.lastTimestamp = 0;
  state.releaseAngle = state.preparedAngle;
  state.activePivot = "A";
  state.currentRadius = CONFIG.stringLength;
  state.angle = state.preparedAngle;
  state.angVel = 0;
  state.pos = positionOnOriginalCircle(state.angle);
  state.vel = { x: 0, y: 0 };
  state.tension = tensionForCircularMotion(CONFIG.stringLength, state.angle, 0);
  state.trail = [{ ...state.pos }];
}

function relaunchCurrentCondition() {
  resetToReady(state.preparedAngle);
  launchFromPreparedAngle();
}

function syncAroundOriginalPivot() {
  state.activePivot = "A";
  state.currentRadius = CONFIG.stringLength;
  state.pos = positionOnOriginalCircle(state.angle);
  state.vel = velocityOnOriginalCircle(state.angle, state.angVel);
  state.tension = tensionForCircularMotion(CONFIG.stringLength, state.angle, state.angVel);
}

function syncAroundNailPivot() {
  const radius = nailRadius();
  state.activePivot = "O";
  state.currentRadius = radius;
  state.pos = positionOnNailCircle(state.angle);
  state.vel = velocityOnNailCircle(state.angle, state.angVel);
  state.tension = tensionForCircularMotion(radius, state.angle, state.angVel);
}

function switchToNail(directionSign) {
  const radius = nailRadius();
  const speed = bottomSpeedForAngle(state.releaseAngle);
  const sign = directionSign === 0 ? 1 : Math.sign(directionSign);

  state.mode = "swing_nail";
  state.hasCaughtNail = true;
  state.activePivot = "O";
  state.currentRadius = radius;
  state.angle = 0;
  state.angVel = sign * (speed / radius);
  state.pos = { x: 0, y: CONFIG.stringLength };
  state.vel = { x: sign * speed, y: 0 };
  state.tension = tensionForCircularMotion(radius, 0, state.angVel);
  recordTrail(true);
}

function switchToProjectile() {
  state.mode = "projectile";
  state.activePivot = null;
  state.currentRadius = 0;
  state.tension = 0;
  state.projectileWentInsideCircle = false;
}

function projectilePositionAfterTime(startPos, startVel, dt) {
  return {
    x: startPos.x + startVel.x * dt,
    y: startPos.y + startVel.y * dt + 0.5 * CONFIG.g * dt * dt,
  };
}

function projectileVelocityAfterTime(startVel, dt) {
  return {
    x: startVel.x,
    y: startVel.y + CONFIG.g * dt,
  };
}

function angleAroundNail(point) {
  return Math.atan2(point.x, point.y - state.nailDistance);
}

function stopAtProjectileRecontact(position, velocity) {
  state.mode = "recontact_stop";
  state.activePivot = "O";
  state.currentRadius = nailRadius();
  state.pos = position;
  state.vel = velocity;
  state.angle = angleAroundNail(position);
  state.tension = 0;
  state.projectileWentInsideCircle = false;
}

function stepAroundOriginalPivot(dt) {
  const previousAngle = state.angle;
  const previousAngVel = state.angVel;

  state.angVel += pendulumAcceleration(state.angle, CONFIG.stringLength) * dt;
  state.angle += state.angVel * dt;

  const crossedBottom =
    (previousAngle < 0 && state.angle >= 0) || (previousAngle > 0 && state.angle <= 0);

  if (crossedBottom) {
    const fraction = clamp(previousAngle / (previousAngle - state.angle), 0, 1);
    const remaining = dt * (1 - fraction);
    const directionSign = Math.sign(previousAngVel || state.angVel || state.angle - previousAngle || 1);

    switchToNail(directionSign);

    if (remaining > 0 && state.mode === "swing_nail") {
      stepAroundNailPivot(remaining);
    }
    return;
  }

  syncAroundOriginalPivot();
}

function stepAroundNailPivot(dt) {
  const radius = nailRadius();
  state.angVel += pendulumAcceleration(state.angle, radius) * dt;
  state.angle += state.angVel * dt;
  syncAroundNailPivot();

  if (state.tension <= 0) {
    switchToProjectile();
  }
}

function stepProjectile(dt) {
  const radius = nailRadius();
  const previousPos = { ...state.pos };
  const previousVel = { ...state.vel };
  const nextPos = projectilePositionAfterTime(previousPos, previousVel, dt);
  const nextVel = projectileVelocityAfterTime(previousVel, dt);
  const nextDistance = distanceFromNail(nextPos);

  if (nextDistance < radius - 1e-5) {
    state.projectileWentInsideCircle = true;
  }

  if (state.projectileWentInsideCircle && nextDistance >= radius) {
    let low = 0;
    let high = dt;

    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) * 0.5;
      const midDistance = distanceFromNail(
        projectilePositionAfterTime(previousPos, previousVel, mid)
      );

      if (midDistance >= radius) {
        high = mid;
      } else {
        low = mid;
      }
    }

    const hitTime = high;
    stopAtProjectileRecontact(
      projectilePositionAfterTime(previousPos, previousVel, hitTime),
      projectileVelocityAfterTime(previousVel, hitTime)
    );
    return;
  }

  state.pos = nextPos;
  state.vel = nextVel;
  state.tension = 0;
  state.activePivot = null;
  state.currentRadius = 0;
}

function advanceSimulation(dt) {
  let remaining = dt;

  while (remaining > 1e-8) {
    const step = Math.min(CONFIG.substep, remaining);

    if (state.mode === "swing_a") {
      stepAroundOriginalPivot(step);
    } else if (state.mode === "swing_nail") {
      stepAroundNailPivot(step);
    } else if (state.mode === "projectile") {
      stepProjectile(step);
    } else {
      break;
    }

    recordTrail();
    remaining -= step;
  }
}

function currentSpeed() {
  return lengthOf(state.vel);
}

function phaseLabel() {
  switch (state.mode) {
    case "dragging":
      return "持ち上げ中";
    case "swing_a":
      return "上の支点 A まわり";
    case "swing_nail":
      return "釘 O まわり";
    case "projectile":
      return "放物運動";
    case "recontact_stop":
      return "再び糸が張る位置で停止";
    default:
      return "持ち上げ待ち";
  }
}

function pivotLabel() {
  if (state.activePivot === "O") {
    return "O";
  }
  if (state.activePivot === "A") {
    return "A";
  }
  return "なし";
}

function angleLabel() {
  if (state.mode === "projectile") {
    return "角度なし";
  }
  const symbol = state.activePivot === "O" ? "φ" : "θ";
  return `${symbol} = ${formatSignedNumber(radiansToDegrees(state.angle), 1)}°`;
}

function radiusLabel() {
  if (state.mode === "projectile") {
    return "たるみ中";
  }
  return `${formatNumber(state.currentRadius)} m`;
}

function detachAngleLabel(prediction) {
  if (!prediction.leavesCircle) {
    return "離脱しない";
  }
  return `${formatNumber(radiansToDegrees(prediction.detachAngle), 1)}°`;
}

function detachCosLabel(prediction) {
  if (prediction.leavesCircle) {
    return formatNumber(prediction.detachCos, 2);
  }
  if (prediction.detachCos < -1) {
    return `${formatNumber(prediction.detachCos, 2)} (< -1)`;
  }
  return `${formatNumber(prediction.detachCos, 2)} (> 1)`;
}

function buildStatusNote(prediction) {
  if (state.paused) {
    return "一時停止中です。再開すると、ここから同じ運動を続けます。";
  }

  switch (state.mode) {
    case "dragging":
      return "この位置で手を離すと、静止状態からそのまま運動を始めます。";
    case "swing_a":
      return "まだ釘には掛かっていません。最下点を通る瞬間に支点が A から O に切り替わります。";
    case "swing_nail":
      return prediction.leavesCircle
        ? "釘に掛かった後の円運動中です。張力が 0 になる角 φ に達すると放物運動へ移ります。"
        : "釘に掛かった後も張力が保たれる条件なので、そのまま円運動を続けます。";
    case "projectile":
      return "張力が 0 になり、糸がたるんだので円軌道から離れて放物運動へ移りました。";
    case "recontact_stop":
      return "糸は切れていないので、O からの距離が再び l - AO になった瞬間でアニメーションを止めています。";
    default:
      return "小球をドラッグして高さを決めるか、そのまま左水平から手放せます。";
  }
}

function updateReadout() {
  const prediction = predictedScenario();

  phaseValueEl.textContent = phaseLabel();
  pivotValueEl.textContent = pivotLabel();
  angleValueEl.textContent = angleLabel();
  speedValueEl.textContent = `${formatNumber(currentSpeed())} m/s`;
  tensionValueEl.textContent = `${formatNumber(Math.max(0, state.tension))} N`;
  radiusValueEl.textContent = radiusLabel();
  t1ValueEl.textContent = `${formatNumber(prediction.beforeTension)} N`;
  t2ValueEl.textContent = `${formatNumber(prediction.afterTension)} N`;
  detachAngleValueEl.textContent = detachAngleLabel(prediction);
  detachCosValueEl.textContent = detachCosLabel(prediction);
  statusNoteEl.textContent = buildStatusNote(prediction);

  pauseButton.disabled = !isMotionMode();
  pauseButton.textContent = state.paused ? "再開" : "一時停止";
  launchButton.textContent = isMotionMode() ? "もう一度この条件で試す" : "この角度で手放す";
  canvas.classList.toggle("dragging", state.mode === "dragging");
}

function updateCanvasSize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const usableWidth = rect.width - VIEWPORT.padding * 2;
  const usableHeight = rect.height - VIEWPORT.padding * 2;
  const scaleX = usableWidth / (VIEWPORT.maxX - VIEWPORT.minX);
  const scaleY = usableHeight / (VIEWPORT.maxY - VIEWPORT.minY);

  state.view.scale = Math.min(scaleX, scaleY);
  state.view.offsetX = VIEWPORT.padding - VIEWPORT.minX * state.view.scale;
  state.view.offsetY = VIEWPORT.padding - VIEWPORT.minY * state.view.scale;
}

function drawBackground(width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(255, 251, 243, 0.98)");
  gradient.addColorStop(1, "rgba(215, 233, 234, 0.84)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(29, 57, 68, 0.05)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 34) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawDashedCircle(centerWorld, radius, strokeStyle) {
  const center = worldToScreen(centerWorld);
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius * state.view.scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSupportAndGuides() {
  const pivotA = worldToScreen({ x: 0, y: 0 });
  const pivotO = worldToScreen({ x: 0, y: state.nailDistance });
  const beamWidth = 110;
  const beamHeight = 14;

  ctx.save();
  ctx.fillStyle = "#6e675c";
  ctx.fillRect(pivotA.x - 24, pivotA.y - 28, beamWidth, beamHeight);
  ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
  ctx.fillRect(pivotA.x - 24, pivotA.y - 28, beamWidth, 4);

  ctx.strokeStyle = "rgba(40, 73, 84, 0.26)";
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pivotA.x, pivotA.y);
  ctx.lineTo(pivotA.x, worldToScreen({ x: 0, y: CONFIG.stringLength }).y + 18);
  ctx.stroke();
  ctx.restore();

  drawDashedCircle({ x: 0, y: 0 }, CONFIG.stringLength, "rgba(31, 61, 73, 0.26)");
  drawDashedCircle({ x: 0, y: state.nailDistance }, nailRadius(), "rgba(31, 61, 73, 0.18)");

  ctx.save();
  ctx.strokeStyle = "rgba(15, 107, 131, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pivotA.x + 20, pivotA.y);
  ctx.lineTo(pivotO.x + 20, pivotO.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pivotA.x + 14, pivotA.y);
  ctx.lineTo(pivotA.x + 26, pivotA.y);
  ctx.moveTo(pivotO.x + 14, pivotO.y);
  ctx.lineTo(pivotO.x + 26, pivotO.y);
  ctx.stroke();
  ctx.fillStyle = "#0f6b83";
  ctx.font = '600 13px "Avenir Next", "Hiragino Sans", sans-serif';
  ctx.fillText(`AO = ${formatNumber(state.nailDistance)} m`, pivotO.x + 32, (pivotA.y + pivotO.y) / 2);
  ctx.restore();
}

function drawPivots() {
  const pivotA = worldToScreen({ x: 0, y: 0 });
  const pivotO = worldToScreen({ x: 0, y: state.nailDistance });

  ctx.save();
  ctx.fillStyle = "#234753";
  ctx.beginPath();
  ctx.arc(pivotA.x, pivotA.y, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#d09b28";
  ctx.beginPath();
  ctx.arc(pivotO.x, pivotO.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8e5f00";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pivotO.x - 9, pivotO.y - 9);
  ctx.lineTo(pivotO.x + 9, pivotO.y + 9);
  ctx.moveTo(pivotO.x + 9, pivotO.y - 9);
  ctx.lineTo(pivotO.x - 9, pivotO.y + 9);
  ctx.stroke();

  ctx.fillStyle = "#17333d";
  ctx.font = '700 16px "Avenir Next", "Hiragino Sans", sans-serif';
  ctx.fillText("A", pivotA.x + 12, pivotA.y - 10);
  ctx.fillText("O", pivotO.x + 12, pivotO.y - 8);
  ctx.restore();
}

function drawTrail() {
  if (state.trail.length < 2) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(27, 135, 151, 0.55)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  state.trail.forEach((point, index) => {
    const screenPoint = worldToScreen(point);
    if (index === 0) {
      ctx.moveTo(screenPoint.x, screenPoint.y);
    } else {
      ctx.lineTo(screenPoint.x, screenPoint.y);
    }
  });

  ctx.stroke();
  ctx.restore();
}

function drawString() {
  const bob = worldToScreen(state.pos);
  const pivotA = worldToScreen({ x: 0, y: 0 });
  const pivotO = worldToScreen({ x: 0, y: state.nailDistance });

  ctx.save();
  ctx.lineWidth = 4;
  ctx.lineCap = "round";

  if (state.mode === "ready" || state.mode === "dragging" || state.mode === "swing_a") {
    ctx.strokeStyle = "#274955";
    ctx.beginPath();
    ctx.moveTo(pivotA.x, pivotA.y);
    ctx.lineTo(bob.x, bob.y);
    ctx.stroke();
  } else if (state.mode === "swing_nail" || state.mode === "recontact_stop") {
    ctx.strokeStyle = "#274955";
    ctx.beginPath();
    ctx.moveTo(pivotA.x, pivotA.y);
    ctx.lineTo(pivotO.x, pivotO.y);
    ctx.lineTo(bob.x, bob.y);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(39, 73, 85, 0.6)";
    ctx.beginPath();
    ctx.moveTo(pivotA.x, pivotA.y);
    ctx.lineTo(pivotO.x, pivotO.y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(39, 73, 85, 0.3)";
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(pivotO.x, pivotO.y);
    ctx.lineTo(bob.x, bob.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBob() {
  const bob = worldToScreen(state.pos);
  const radius = CONFIG.bobRadius * state.view.scale;

  ctx.save();
  ctx.translate(bob.x, bob.y);
  ctx.fillStyle = "rgba(30, 57, 67, 0.14)";
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.95, radius * 0.92, radius * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  const bobGradient = ctx.createRadialGradient(
    -radius * 0.28,
    -radius * 0.34,
    radius * 0.22,
    0,
    0,
    radius
  );
  bobGradient.addColorStop(0, "#f3d798");
  bobGradient.addColorStop(0.62, "#d99d41");
  bobGradient.addColorStop(1, "#7b4d12");

  ctx.fillStyle = bobGradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#6c4110";
  ctx.lineWidth = Math.max(2.2, radius * 0.16);
  ctx.stroke();

  ctx.fillStyle = "rgba(69, 38, 3, 0.8)";
  ctx.font = `700 ${Math.max(14, radius * 0.52)}px "Avenir Next", "Hiragino Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("m", 0, 1);
  ctx.restore();
}

function drawTensionVector() {
  const bob = worldToScreen(state.pos);
  const pivot = activePivotPosition();
  const magnitude = Math.max(0, state.tension);

  if (!pivot || magnitude < 1e-6) {
    ctx.save();
    ctx.strokeStyle = "#d19a23";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bob.x, bob.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#9f7318";
    ctx.font = '700 13px "Avenir Next", "Hiragino Sans", sans-serif';
    ctx.fillText("T = 0", bob.x + 18, bob.y - 16);
    ctx.restore();
    return;
  }

  const prediction = predictedScenario();
  const scaleMax = Math.max(prediction.afterTension, prediction.beforeTension, CONFIG.mass * CONFIG.g * 3);
  const direction = normalize({
    x: pivot.x - state.pos.x,
    y: pivot.y - state.pos.y,
  });
  const vectorLength = clamp(24 + (magnitude / scaleMax) * 90, 24, 118);
  const end = {
    x: bob.x + direction.x * vectorLength,
    y: bob.y + direction.y * vectorLength,
  };

  ctx.save();
  ctx.strokeStyle = "#d19a23";
  ctx.fillStyle = "#d19a23";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bob.x, bob.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  const arrowAngle = Math.atan2(end.y - bob.y, end.x - bob.x);
  ctx.translate(end.x, end.y);
  ctx.rotate(arrowAngle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-14, -8);
  ctx.lineTo(-14, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#7c5910";
  ctx.font = '700 13px "Avenir Next", "Hiragino Sans", sans-serif';
  ctx.fillText(`T = ${formatNumber(magnitude)} N`, end.x + 10, end.y - 10);
  ctx.restore();
}

function drawScene() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  drawBackground(width, height);
  drawSupportAndGuides();
  drawTrail();
  drawString();
  drawPivots();
  drawBob();
  drawTensionVector();
}

function pointerNearBob(worldPoint) {
  return distanceBetween(worldPoint, state.pos) <= bobHitRadiusWorld();
}

function beginDrag(event) {
  if (!(state.mode === "ready" || state.mode === "dragging")) {
    return;
  }

  const worldPoint = screenToWorld(event.clientX, event.clientY);
  if (!pointerNearBob(worldPoint)) {
    return;
  }

  state.mode = "dragging";
  state.dragPointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (state.mode !== "dragging" || state.dragPointerId !== event.pointerId) {
    return;
  }

  const worldPoint = screenToWorld(event.clientX, event.clientY);
  const angle = Math.atan2(worldPoint.x, worldPoint.y);
  setPreparedAngle(angle);
  state.trail = [{ ...state.pos }];
}

function finishDrag(event, shouldLaunch) {
  if (state.dragPointerId !== event.pointerId) {
    return;
  }

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  state.dragPointerId = null;

  if (shouldLaunch) {
    launchFromPreparedAngle();
  } else {
    setReadyPose();
    state.trail = [{ ...state.pos }];
  }
}

function setNailDistance(nextValue) {
  state.nailDistance = clamp(nextValue, CONFIG.minNailDistance, CONFIG.maxNailDistance);
  nailSlider.value = state.nailDistance.toFixed(2);
  syncNailLabel();

  if (isMotionMode()) {
    resetToReady(state.preparedAngle);
    return;
  }

  const wasDragging = state.mode === "dragging";
  setPreparedAngle(state.preparedAngle);
  state.mode = wasDragging ? "dragging" : "ready";
  state.trail = [{ ...state.pos }];
}

function setTimeScale(nextValue) {
  state.timeScale = clamp(nextValue, CONFIG.minTimeScale, CONFIG.maxTimeScale);
  speedSlider.value = state.timeScale.toFixed(2);
  syncTimeScaleLabel();
}

function handleLaunchButton() {
  if (state.mode === "dragging") {
    if (state.dragPointerId !== null && canvas.hasPointerCapture(state.dragPointerId)) {
      canvas.releasePointerCapture(state.dragPointerId);
    }
    state.dragPointerId = null;
    launchFromPreparedAngle();
    return;
  }

  if (isMotionMode()) {
    relaunchCurrentCondition();
    return;
  }

  launchFromPreparedAngle();
}

function animationFrame(timestamp) {
  if (state.lastTimestamp === 0) {
    state.lastTimestamp = timestamp;
  }

  const dt = clamp((timestamp - state.lastTimestamp) / 1000, 0, 0.03) * state.timeScale;
  state.lastTimestamp = timestamp;

  if (!state.paused && isMotionMode()) {
    advanceSimulation(dt);
  }

  updateReadout();
  drawScene();
  requestAnimationFrame(animationFrame);
}

nailSlider.addEventListener("input", (event) => {
  setNailDistance(Number(event.target.value));
});

speedSlider.addEventListener("input", (event) => {
  setTimeScale(Number(event.target.value));
});

launchButton.addEventListener("click", handleLaunchButton);

pauseButton.addEventListener("click", () => {
  if (!isMotionMode()) {
    return;
  }
  state.paused = !state.paused;
  state.lastTimestamp = 0;
});

resetButton.addEventListener("click", () => {
  resetToReady(state.preparedAngle);
});

exampleButton.addEventListener("click", () => {
  applyExamplePreset();
});

canvas.addEventListener("pointerdown", beginDrag);
canvas.addEventListener("pointermove", moveDrag);
canvas.addEventListener("pointerup", (event) => {
  finishDrag(event, true);
});
canvas.addEventListener("pointercancel", (event) => {
  finishDrag(event, false);
});

window.addEventListener("resize", updateCanvasSize);

updateCanvasSize();
applyExamplePreset();
setTimeScale(CONFIG.defaultTimeScale);
updateReadout();
drawScene();
requestAnimationFrame(animationFrame);
