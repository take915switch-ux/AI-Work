const simulationCanvas = document.getElementById("simulationCanvas");
const simulationContext = simulationCanvas.getContext("2d");
const vectorBeforeCanvas = document.getElementById("vectorBeforeCanvas");
const vectorBeforeContext = vectorBeforeCanvas.getContext("2d");
const vectorAfterCanvas = document.getElementById("vectorAfterCanvas");
const vectorAfterContext = vectorAfterCanvas.getContext("2d");
const vectorBeforePanel = document.getElementById("vectorBeforePanel");
const vectorAfterPanel = document.getElementById("vectorAfterPanel");
const phaseBadge = document.getElementById("phaseBadge");
const conservationBadge = document.getElementById("conservationBadge");
const replayButton = document.getElementById("replayButton");
const pauseButton = document.getElementById("pauseButton");
const showBeforeCheckbox = document.getElementById("showBefore");
const showAfterCheckbox = document.getElementById("showAfter");

const palette = {
  aBefore: "#4f93c0",
  bBefore: "#d1604c",
  totalShared: "#35596f",
  aAfter: "#9ad2ef",
  bAfter: "#f1aa5b",
  totalAccent: "#c79a2a",
  grid: "rgba(21, 52, 71, 0.12)",
  guide: "rgba(21, 52, 71, 0.18)",
};

// The sliders cap both masses at 5 kg and both speeds at 8 m/s, so
// the largest momentum component to show on each positive axis is 40.
// Post-collision components can dip slightly negative, but they stay within about -6.9.
const vectorWorldBounds = {
  minX: -8,
  maxX: 40,
  minY: -8,
  maxY: 40,
};

const numberFormatter = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const state = {
  inputs: {
    mass1: 4.0,
    speed1: 8.0,
    mass2: 4.0,
    speed2: 8.0,
    restitution: 0.8,
  },
  model: null,
  playing: true,
  pausedElapsed: 0,
  lastElapsed: 0,
  cycleStart: performance.now(),
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function add(v1, v2) {
  return { x: v1.x + v2.x, y: v1.y + v2.y };
}

function subtract(v1, v2) {
  return { x: v1.x - v2.x, y: v1.y - v2.y };
}

function scale(vector, factor) {
  return { x: vector.x * factor, y: vector.y * factor };
}

function dot(v1, v2) {
  return v1.x * v2.x + v1.y * v2.y;
}

function magnitude(vector) {
  return Math.hypot(vector.x, vector.y);
}

function normalize(vector) {
  const length = magnitude(vector) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function buildModel(inputs) {
  const sceneSize = { width: simulationCanvas.width, height: simulationCanvas.height };
  const radius = 24;
  const bounds = {
    minX: radius + 26,
    maxX: sceneSize.width - radius - 26,
    minY: radius + 26,
    maxY: sceneSize.height - radius - 26,
  };
  const impactMidpoint = {
    x: sceneSize.width * 0.54,
    y: sceneSize.height * 0.55,
  };

  const velocity1 = { x: inputs.speed1, y: 0 };
  const velocity2 = { x: 0, y: inputs.speed2 };
  const collisionNormal = normalize({ x: inputs.speed1, y: -inputs.speed2 });
  const tangent = { x: -collisionNormal.y, y: collisionNormal.x };

  const u1n = dot(velocity1, collisionNormal);
  const u2n = dot(velocity2, collisionNormal);
  const u1t = scale(tangent, dot(velocity1, tangent));
  const u2t = scale(tangent, dot(velocity2, tangent));
  const totalMass = inputs.mass1 + inputs.mass2;

  const v1nAfter =
    (inputs.mass1 * u1n +
      inputs.mass2 * u2n -
      inputs.mass2 * inputs.restitution * (u1n - u2n)) /
    totalMass;
  const v2nAfter =
    (inputs.mass1 * u1n +
      inputs.mass2 * u2n +
      inputs.mass1 * inputs.restitution * (u1n - u2n)) /
    totalMass;

  const postVelocity1 = add(u1t, scale(collisionNormal, v1nAfter));
  const postVelocity2 = add(u2t, scale(collisionNormal, v2nAfter));

  const impactPosition1 = subtract(impactMidpoint, scale(collisionNormal, radius));
  const impactPosition2 = add(impactMidpoint, scale(collisionNormal, radius));

  const desiredBefore = 1.55;
  const desiredAfter = 1.5;
  const preScaleLimit1 = (impactPosition1.x - bounds.minX) / (inputs.speed1 * desiredBefore);
  const preScaleLimit2 = (impactPosition2.y - bounds.minY) / (inputs.speed2 * desiredBefore);
  const postScaleLimit1 = getScaleLimitForDuration(
    impactPosition1,
    postVelocity1,
    bounds,
    desiredAfter
  );
  const postScaleLimit2 = getScaleLimitForDuration(
    impactPosition2,
    postVelocity2,
    bounds,
    desiredAfter
  );

  const pixelScale = clamp(
    Math.min(preScaleLimit1, preScaleLimit2, postScaleLimit1, postScaleLimit2, 28),
    14,
    28
  );

  const motionBefore1 = scale(velocity1, pixelScale);
  const motionBefore2 = scale(velocity2, pixelScale);
  const motionAfter1 = scale(postVelocity1, pixelScale);
  const motionAfter2 = scale(postVelocity2, pixelScale);

  const beforeDuration = Math.min(
    Math.min(
      (impactPosition1.x - bounds.minX) / motionBefore1.x,
      (impactPosition2.y - bounds.minY) / motionBefore2.y
    ) * 0.82,
    2.3
  );

  const afterDuration = Math.min(
    Math.min(
      timeToWall(impactPosition1, motionAfter1, bounds),
      timeToWall(impactPosition2, motionAfter2, bounds)
    ) * 0.78,
    2.5
  );

  const holdImpact = 0.18;
  const holdEnd = 0.9;
  const cycleDuration = beforeDuration + holdImpact + afterDuration + holdEnd;

  const startPosition1 = subtract(impactPosition1, scale(motionBefore1, beforeDuration));
  const startPosition2 = subtract(impactPosition2, scale(motionBefore2, beforeDuration));
  const endPosition1 = add(impactPosition1, scale(motionAfter1, afterDuration));
  const endPosition2 = add(impactPosition2, scale(motionAfter2, afterDuration));

  const momentum1Before = scale(velocity1, inputs.mass1);
  const momentum2Before = scale(velocity2, inputs.mass2);
  const momentum1After = scale(postVelocity1, inputs.mass1);
  const momentum2After = scale(postVelocity2, inputs.mass2);
  const totalMomentumBefore = add(momentum1Before, momentum2Before);
  const totalMomentumAfter = add(momentum1After, momentum2After);

  return {
    radius,
    bounds,
    impactMidpoint,
    impactPosition1,
    impactPosition2,
    startPosition1,
    startPosition2,
    endPosition1,
    endPosition2,
    velocity1,
    velocity2,
    postVelocity1,
    postVelocity2,
    motionBefore1,
    motionBefore2,
    motionAfter1,
    motionAfter2,
    momentum1Before,
    momentum2Before,
    momentum1After,
    momentum2After,
    totalMomentumBefore,
    totalMomentumAfter,
    timings: {
      beforeDuration,
      holdImpact,
      afterDuration,
      holdEnd,
      cycleDuration,
    },
  };
}

function getScaleLimitForDuration(position, velocity, bounds, duration) {
  const limits = [];

  if (velocity.x > 0) {
    limits.push((bounds.maxX - position.x) / (velocity.x * duration));
  } else if (velocity.x < 0) {
    limits.push((position.x - bounds.minX) / (-velocity.x * duration));
  }

  if (velocity.y > 0) {
    limits.push((bounds.maxY - position.y) / (velocity.y * duration));
  } else if (velocity.y < 0) {
    limits.push((position.y - bounds.minY) / (-velocity.y * duration));
  }

  return limits.length ? Math.min(...limits) : 28;
}

function timeToWall(position, velocity, bounds) {
  const times = [];

  if (velocity.x > 0) {
    times.push((bounds.maxX - position.x) / velocity.x);
  } else if (velocity.x < 0) {
    times.push((bounds.minX - position.x) / velocity.x);
  }

  if (velocity.y > 0) {
    times.push((bounds.maxY - position.y) / velocity.y);
  } else if (velocity.y < 0) {
    times.push((bounds.minY - position.y) / velocity.y);
  }

  const validTimes = times.filter((time) => Number.isFinite(time) && time > 0);
  return validTimes.length ? Math.min(...validTimes) : 2.5;
}

function positionForPhase(elapsed, model) {
  const { beforeDuration, holdImpact, afterDuration } = model.timings;

  if (elapsed < beforeDuration) {
    return {
      phase: "接近中",
      phaseTone: "before",
      impactGlow: 0,
      position1: add(model.startPosition1, scale(model.motionBefore1, elapsed)),
      position2: add(model.startPosition2, scale(model.motionBefore2, elapsed)),
      velocity1: model.velocity1,
      velocity2: model.velocity2,
    };
  }

  if (elapsed < beforeDuration + holdImpact) {
    const localProgress = (elapsed - beforeDuration) / holdImpact;
    const currentVelocity1 = localProgress < 0.5 ? model.velocity1 : model.postVelocity1;
    const currentVelocity2 = localProgress < 0.5 ? model.velocity2 : model.postVelocity2;
    return {
      phase: "衝突",
      phaseTone: "impact",
      impactGlow: 1 - Math.abs(localProgress * 2 - 1),
      position1: model.impactPosition1,
      position2: model.impactPosition2,
      velocity1: currentVelocity1,
      velocity2: currentVelocity2,
    };
  }

  if (elapsed < beforeDuration + holdImpact + afterDuration) {
    const postElapsed = elapsed - beforeDuration - holdImpact;
    return {
      phase: "衝突後",
      phaseTone: "after",
      impactGlow: 0,
      position1: add(model.impactPosition1, scale(model.motionAfter1, postElapsed)),
      position2: add(model.impactPosition2, scale(model.motionAfter2, postElapsed)),
      velocity1: model.postVelocity1,
      velocity2: model.postVelocity2,
    };
  }

  return {
    phase: "結果保持",
    phaseTone: "settled",
    impactGlow: 0,
    position1: model.endPosition1,
    position2: model.endPosition2,
    velocity1: model.postVelocity1,
    velocity2: model.postVelocity2,
  };
}

function toCanvasY(y) {
  return simulationCanvas.height - y;
}

function toCanvasPoint(point) {
  return { x: point.x, y: toCanvasY(point.y) };
}

function clearCanvas(context, canvas) {
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawGrid(context, canvas, spacing, color) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1;

  for (let x = spacing; x < canvas.width; x += spacing) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }

  for (let y = spacing; y < canvas.height; y += spacing) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.restore();
}

function drawSimulation(elapsed) {
  const model = state.model;
  const snapshot = positionForPhase(elapsed, model);

  clearCanvas(simulationContext, simulationCanvas);

  const sky = simulationContext.createLinearGradient(0, 0, 0, simulationCanvas.height);
  sky.addColorStop(0, "rgba(255, 246, 228, 0.95)");
  sky.addColorStop(1, "rgba(228, 243, 248, 0.95)");
  simulationContext.fillStyle = sky;
  simulationContext.fillRect(0, 0, simulationCanvas.width, simulationCanvas.height);

  drawGrid(simulationContext, simulationCanvas, 36, "rgba(21, 52, 71, 0.06)");

  const glow = simulationContext.createRadialGradient(
    model.impactMidpoint.x,
    toCanvasY(model.impactMidpoint.y),
    8,
    model.impactMidpoint.x,
    toCanvasY(model.impactMidpoint.y),
    72
  );
  glow.addColorStop(0, `rgba(241, 170, 91, ${0.24 + snapshot.impactGlow * 0.28})`);
  glow.addColorStop(1, "rgba(241, 170, 91, 0)");
  simulationContext.fillStyle = glow;
  simulationContext.fillRect(0, 0, simulationCanvas.width, simulationCanvas.height);

  drawMotionGuide(simulationContext, model.impactPosition1, scale(model.velocity1, -1), model.bounds, {
    color: palette.aBefore,
    dash: [8, 8],
    width: 2,
  });
  drawMotionGuide(simulationContext, model.impactPosition2, scale(model.velocity2, -1), model.bounds, {
    color: palette.bBefore,
    dash: [8, 8],
    width: 2,
  });
  drawMotionGuide(simulationContext, model.impactPosition1, model.postVelocity1, model.bounds, {
    color: palette.aAfter,
    dash: [12, 10],
    width: 3,
  });
  drawMotionGuide(simulationContext, model.impactPosition2, model.postVelocity2, model.bounds, {
    color: palette.bAfter,
    dash: [12, 10],
    width: 3,
  });

  drawImpactMarker(model.impactMidpoint);
  drawBall(snapshot.position1, model.radius, palette.aBefore, "A");
  drawBall(snapshot.position2, model.radius, palette.bBefore, "B");
  drawVelocityVector(snapshot.position1, snapshot.velocity1, palette.aBefore, {
    base: "v",
    subscript: "A",
  });
  drawVelocityVector(snapshot.position2, snapshot.velocity2, palette.bBefore, {
    base: "v",
    subscript: "B",
  });

  phaseBadge.textContent = snapshot.phase;
  phaseBadge.dataset.tone = snapshot.phaseTone;
  updatePhaseBadgeTone(snapshot.phaseTone);
}

function updatePhaseBadgeTone(tone) {
  const tones = {
    before: { background: "rgba(79, 147, 192, 0.14)", color: "#2f6588" },
    impact: { background: "rgba(241, 170, 91, 0.2)", color: "#8a5b17" },
    after: { background: "rgba(82, 166, 141, 0.16)", color: "#22624d" },
    settled: { background: "rgba(21, 52, 71, 0.12)", color: "#153447" },
  };

  const style = tones[tone] || tones.before;
  phaseBadge.style.background = style.background;
  phaseBadge.style.color = style.color;
}

function drawMotionGuide(context, anchor, direction, bounds, options) {
  const endpoint = rayEndFromBounds(anchor, direction, bounds);
  if (!endpoint) {
    return;
  }

  context.save();
  context.beginPath();
  context.setLineDash(options.dash);
  context.lineWidth = options.width;
  context.strokeStyle = options.color;
  context.moveTo(anchor.x, toCanvasY(anchor.y));
  context.lineTo(endpoint.x, toCanvasY(endpoint.y));
  context.stroke();
  context.restore();
}

function rayEndFromBounds(anchor, direction, bounds) {
  const times = [];

  if (direction.x > 0) {
    times.push((bounds.maxX - anchor.x) / direction.x);
  } else if (direction.x < 0) {
    times.push((bounds.minX - anchor.x) / direction.x);
  }

  if (direction.y > 0) {
    times.push((bounds.maxY - anchor.y) / direction.y);
  } else if (direction.y < 0) {
    times.push((bounds.minY - anchor.y) / direction.y);
  }

  const forwardTimes = times.filter((time) => Number.isFinite(time) && time > 0);
  if (!forwardTimes.length) {
    return null;
  }

  const distance = Math.min(...forwardTimes);
  return add(anchor, scale(direction, distance));
}

function drawImpactMarker(position) {
  simulationContext.save();
  const x = position.x;
  const y = toCanvasY(position.y);
  simulationContext.strokeStyle = "rgba(21, 52, 71, 0.34)";
  simulationContext.lineWidth = 2;

  simulationContext.beginPath();
  simulationContext.moveTo(x - 12, y);
  simulationContext.lineTo(x + 12, y);
  simulationContext.moveTo(x, y - 12);
  simulationContext.lineTo(x, y + 12);
  simulationContext.stroke();

  simulationContext.fillStyle = "rgba(21, 52, 71, 0.7)";
  simulationContext.font = '12px "Avenir Next", "Hiragino Sans", sans-serif';
  simulationContext.fillText("衝突点", x + 14, y - 12);
  simulationContext.restore();
}

function drawBall(position, radius, color, label) {
  const x = position.x;
  const y = toCanvasY(position.y);

  simulationContext.save();
  simulationContext.shadowColor = "rgba(21, 52, 71, 0.18)";
  simulationContext.shadowBlur = 18;
  simulationContext.shadowOffsetY = 12;

  const gradient = simulationContext.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.42,
    radius * 0.2,
    x,
    y,
    radius
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  gradient.addColorStop(0.28, color);
  gradient.addColorStop(1, shadeColor(color, -22));

  simulationContext.fillStyle = gradient;
  simulationContext.beginPath();
  simulationContext.arc(x, y, radius, 0, Math.PI * 2);
  simulationContext.fill();

  simulationContext.shadowColor = "transparent";
  simulationContext.strokeStyle = "rgba(255, 255, 255, 0.86)";
  simulationContext.lineWidth = 3;
  simulationContext.stroke();

  simulationContext.fillStyle = "#ffffff";
  simulationContext.font = 'bold 18px "Avenir Next", "Hiragino Sans", sans-serif';
  simulationContext.textAlign = "center";
  simulationContext.textBaseline = "middle";
  simulationContext.fillText(label, x, y + 1);
  simulationContext.restore();
}

function drawVelocityVector(position, velocity, color, label) {
  const speed = magnitude(velocity);
  if (speed < 0.001) {
    return;
  }

  const model = state.model;
  const referenceSpeed = Math.max(
    magnitude(model.velocity1),
    magnitude(model.velocity2),
    magnitude(model.postVelocity1),
    magnitude(model.postVelocity2),
    1
  );
  const vectorScale = clamp(76 / referenceSpeed, 6, 20);
  const direction = normalize(velocity);
  const start = add(position, scale(direction, model.radius + 8));
  const end = add(start, scale(velocity, vectorScale));
  const startCanvas = toCanvasPoint(start);
  const endCanvas = toCanvasPoint(end);

  drawArrowSegment(simulationContext, startCanvas, endCanvas, {
    color,
    width: 4,
    dash: [],
    halo: true,
  });

  drawIndexedLabel(
    simulationContext,
    endCanvas.x + (endCanvas.x >= startCanvas.x ? 8 : -28),
    endCanvas.y + (endCanvas.y >= startCanvas.y ? 16 : -10),
    label,
    color,
    14
  );
}

function shadeColor(hexColor, amount) {
  const color = hexColor.replace("#", "");
  const channels = color.match(/.{1,2}/g).map((channel) => parseInt(channel, 16));
  const adjusted = channels.map((channel) => clamp(channel + amount, 0, 255));
  return `rgb(${adjusted[0]}, ${adjusted[1]}, ${adjusted[2]})`;
}

function getVectorLayout(canvas) {
  const margins = {
    left: 16,
    right: 12,
    top: 12,
    bottom: 16,
  };
  const drawableWidth = canvas.width - margins.left - margins.right;
  const scale = drawableWidth / (vectorWorldBounds.maxX - vectorWorldBounds.minX);
  const worldHeight = (vectorWorldBounds.maxY - vectorWorldBounds.minY) * scale;
  const topOffset = (canvas.height - worldHeight) / 2;

  return {
    scale,
    origin: {
      x: margins.left + Math.abs(vectorWorldBounds.minX) * scale,
      y: topOffset + vectorWorldBounds.maxY * scale,
    },
    worldHeight,
  };
}

function vectorToCanvas(layout, vector) {
  return {
    x: layout.origin.x + vector.x * layout.scale,
    y: layout.origin.y - vector.y * layout.scale,
  };
}

function drawVectors() {
  const model = state.model;
  drawVectorScene({
    context: vectorBeforeContext,
    canvas: vectorBeforeCanvas,
    panel: vectorBeforePanel,
    visible: showBeforeCheckbox.checked,
    momentum1: model.momentum1Before,
    momentum2: model.momentum2Before,
    label1: { base: "p", subscript: "A", suffix: "前" },
    label2: { base: "p", subscript: "B", suffix: "前" },
    colors: {
      first: palette.aBefore,
      second: palette.bBefore,
      total: palette.totalShared,
    },
  });
  drawVectorScene({
    context: vectorAfterContext,
    canvas: vectorAfterCanvas,
    panel: vectorAfterPanel,
    visible: showAfterCheckbox.checked,
    momentum1: model.momentum1After,
    momentum2: model.momentum2After,
    label1: { base: "p", subscript: "A", suffix: "後" },
    label2: { base: "p", subscript: "B", suffix: "後" },
    colors: {
      first: palette.aBefore,
      second: palette.bBefore,
      total: palette.totalShared,
    },
  });
}

function drawVectorScene(options) {
  const { context, canvas, panel, visible, momentum1, momentum2, label1, label2, colors } =
    options;
  clearCanvas(context, canvas);

  context.fillStyle = "rgba(255, 252, 246, 0.96)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid(context, canvas, 40, "rgba(21, 52, 71, 0.08)");

  const layout = getVectorLayout(canvas);
  const totalVector = add(momentum1, momentum2);

  drawVectorAxes(context, canvas, layout);
  panel.classList.toggle("is-muted", !visible);

  if (!visible) {
    return;
  }

  drawArrow(context, layout, momentum1, {
    color: colors.first,
    label: label1,
    width: 4,
    dash: [],
    labelOffset: { x: -12, y: -16 },
    halo: true,
  });
  drawArrow(context, layout, momentum2, {
    color: colors.second,
    label: label2,
    width: 4,
    dash: [],
    labelOffset: { x: 10, y: -14 },
    halo: true,
  });
  drawArrow(context, layout, totalVector, {
    color: colors.total,
    label: "合計",
    width: 7,
    dash: [],
    labelOffset: { x: 14, y: -18 },
    halo: true,
    accentColor: palette.totalAccent,
  });
}

function drawVectorAxes(context, canvas, layout) {
  const xAxisStart = vectorToCanvas(layout, { x: vectorWorldBounds.minX, y: 0 });
  const xAxisEnd = vectorToCanvas(layout, { x: vectorWorldBounds.maxX, y: 0 });
  const yAxisStart = vectorToCanvas(layout, { x: 0, y: vectorWorldBounds.minY });
  const yAxisEnd = vectorToCanvas(layout, { x: 0, y: vectorWorldBounds.maxY });

  context.save();
  context.strokeStyle = "rgba(21, 52, 71, 0.26)";
  context.lineWidth = 2;

  context.beginPath();
  context.moveTo(xAxisStart.x, xAxisStart.y);
  context.lineTo(xAxisEnd.x, xAxisEnd.y);
  context.moveTo(yAxisStart.x, yAxisStart.y);
  context.lineTo(yAxisEnd.x, yAxisEnd.y);
  context.stroke();

  context.fillStyle = "rgba(21, 52, 71, 0.74)";
  context.font = '12px "Avenir Next", "Hiragino Sans", sans-serif';
  context.fillText("x", xAxisEnd.x - 10, xAxisEnd.y - 10);
  context.fillText("y", yAxisEnd.x + 10, yAxisEnd.y + 14);

  context.beginPath();
  context.arc(layout.origin.x, layout.origin.y, 4, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawArrow(context, layout, vector, options) {
  const destination = vectorToCanvas(layout, vector);
  drawArrowSegment(context, layout.origin, destination, {
    color: options.color,
    width: options.width,
    dash: options.dash,
    halo: options.halo,
    accentColor: options.accentColor,
  });

  if (typeof options.label === "string") {
    drawTextLabel(
      context,
      destination.x + options.labelOffset.x,
      destination.y + options.labelOffset.y,
      options.label,
      options.accentColor || options.color,
      13
    );
    return;
  }

  drawIndexedLabel(
    context,
    destination.x + options.labelOffset.x,
    destination.y + options.labelOffset.y,
    options.label,
    options.color,
    13
  );
}

function drawArrowSegment(context, start, end, options) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = 14;

  context.save();
  if (options.halo) {
    context.strokeStyle = "rgba(255, 255, 255, 0.88)";
    context.lineWidth = options.width + 4;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  context.strokeStyle = options.color;
  context.fillStyle = options.color;
  context.lineWidth = options.width;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.setLineDash(options.dash);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();

  context.setLineDash([]);
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(
    end.x - headLength * Math.cos(angle - Math.PI / 6),
    end.y - headLength * Math.sin(angle - Math.PI / 6)
  );
  context.lineTo(
    end.x - headLength * Math.cos(angle + Math.PI / 6),
    end.y - headLength * Math.sin(angle + Math.PI / 6)
  );
  context.closePath();
  context.fill();
  context.restore();
}

function drawTextLabel(context, x, y, text, color, fontSize) {
  context.save();
  context.fillStyle = color;
  context.font = `bold ${fontSize}px "Avenir Next", "Hiragino Sans", sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(text, x, y);
  context.restore();
}

function drawIndexedLabel(context, x, y, label, color, fontSize) {
  context.save();
  context.fillStyle = color;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";

  context.font = `italic bold ${fontSize}px "Avenir Next", "Hiragino Sans", sans-serif`;
  context.fillText(label.base, x, y);
  const baseWidth = context.measureText(label.base).width;

  context.font = `bold ${Math.max(fontSize - 3, 9)}px "Avenir Next", "Hiragino Sans", sans-serif`;
  context.fillText(label.subscript, x + baseWidth - 1, y + 4);
  const subWidth = context.measureText(label.subscript).width;

  if (label.suffix) {
    context.font = `bold ${Math.max(fontSize - 1, 10)}px "Avenir Next", "Hiragino Sans", sans-serif`;
    context.fillText(label.suffix, x + baseWidth + subWidth + 3, y);
  }

  context.restore();
}

function updateConservationBadge() {
  const model = state.model;
  const conservationError = magnitude(
    subtract(model.totalMomentumAfter, model.totalMomentumBefore)
  );

  conservationBadge.textContent = `保存誤差 ${numberFormatter.format(conservationError)}`;
  conservationBadge.style.background =
    conservationError < 0.01 ? "rgba(82, 166, 141, 0.14)" : "rgba(209, 96, 76, 0.14)";
  conservationBadge.style.color = conservationError < 0.01 ? "#22624d" : "#8f3d2f";
}

function syncInputs(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.key) {
    return;
  }

  if (target.value === "") {
    return;
  }

  const key = target.dataset.key;
  const min = Number(target.min);
  const max = Number(target.max);
  const step = target.step || "1";
  const decimals = step.includes(".") ? step.split(".")[1].length : 0;
  const value = clamp(Number(target.value), min, max);
  if (!Number.isFinite(value)) {
    return;
  }

  const normalizedValue = value.toFixed(decimals);
  state.inputs[key] = Number(normalizedValue);
  document
    .querySelectorAll(`input[data-key="${key}"]`)
    .forEach((input) => {
      input.value = normalizedValue;
    });

  refreshModel(true);
}

function refreshModel(restartPlayback) {
  state.model = buildModel(state.inputs);
  updateConservationBadge();
  drawVectors();

  if (restartPlayback) {
    state.pausedElapsed = 0;
    state.lastElapsed = 0;
    state.cycleStart = performance.now();
  }

  drawSimulation(state.playing ? state.lastElapsed : state.pausedElapsed);
}

function togglePlayback() {
  if (state.playing) {
    state.playing = false;
    state.pausedElapsed = state.lastElapsed;
    pauseButton.textContent = "再生する";
    pauseButton.setAttribute("aria-pressed", "true");
  } else {
    state.playing = true;
    state.cycleStart = performance.now() - state.pausedElapsed * 1000;
    pauseButton.textContent = "一時停止";
    pauseButton.setAttribute("aria-pressed", "false");
  }
}

function replay() {
  state.pausedElapsed = 0;
  state.lastElapsed = 0;
  state.cycleStart = performance.now();
  drawSimulation(0);
}

function animate(now) {
  if (state.model) {
    if (state.playing) {
      state.lastElapsed = ((now - state.cycleStart) / 1000) % state.model.timings.cycleDuration;
      drawSimulation(state.lastElapsed);
    } else {
      drawSimulation(state.pausedElapsed);
    }
  }

  requestAnimationFrame(animate);
}

document.getElementById("controls").addEventListener("input", syncInputs);
replayButton.addEventListener("click", replay);
pauseButton.addEventListener("click", togglePlayback);
showBeforeCheckbox.addEventListener("change", drawVectors);
showAfterCheckbox.addEventListener("change", drawVectors);

refreshModel(false);
requestAnimationFrame(animate);
