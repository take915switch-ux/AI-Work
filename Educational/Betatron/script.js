const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

const elements = {
    statusText: document.getElementById("statusText"),
    modeValue: document.getElementById("modeValue"),
    chargeValue: document.getElementById("chargeValue"),
    radiusValue: document.getElementById("radiusValue"),
    speedValue: document.getElementById("speedValue"),
    orbitBValue: document.getElementById("orbitBValue"),
    avgBValue: document.getElementById("avgBValue"),
    speedFactorValue: document.getElementById("speedFactorValue"),
    yawValue: document.getElementById("yawValue"),
    tiltValue: document.getElementById("tiltValue"),
    modeDescription: document.getElementById("modeDescription"),
    speedSlider: document.getElementById("speedSlider"),
    yawSlider: document.getElementById("yawSlider"),
    tiltSlider: document.getElementById("tiltSlider"),
    pauseBtn: document.getElementById("pauseBtn"),
    negativeBtn: document.getElementById("negativeBtn"),
    positiveBtn: document.getElementById("positiveBtn"),
    modeButtons: {
        reset: document.getElementById("modeResetBtn"),
        inner: document.getElementById("modeInnerBtn"),
        global: document.getElementById("modeGlobalBtn"),
        betatron: document.getElementById("modeBetatronBtn")
    }
};

const modeMeta = {
    reset: {
        label: "リセット",
        runningText: "基準軌道を表示中",
        description:
            "円運動の基準状態です。速度 v と軌道上の磁場 B がつり合い、一定半径の円軌道になります。"
    },
    inner: {
        label: "内部の磁場が増加",
        runningText: "内部の平均磁場を増加中",
        description:
            "内部だけ平均磁場を強めると誘導電場で粒子が加速し、軌道上の磁場はほぼ同じなので半径が外側へ広がっていきます。"
    },
    global: {
        label: "全体の磁場が増加",
        runningText: "全体磁場を一様に増加中",
        description:
            "軌道上の磁場も平均磁場も同じ割合で増えると、粒子は加速しても磁場の強まりが勝ちやすく、軌道半径は内側へ縮みます。"
    },
    betatron: {
        label: "ベータトロン原理",
        runningText: "ベータトロン条件を再現中",
        description:
            "平均磁場を軌道上の磁場より大きく増やすと、誘導電場で十分に加速され、軌道半径をほぼ保ったままエネルギーだけを上げられます。"
    }
};

const palette = {
    ink: "#18222d",
    muted: "#5e6a74",
    warm: "#f4b35f",
    warmSoft: "rgba(244, 179, 95, 0.18)",
    line: "rgba(24, 34, 45, 0.12)",
    chamberStroke: "rgba(42, 57, 80, 0.28)",
    chamberShadow: "rgba(39, 46, 58, 0.12)",
    fieldLow: { r: 70, g: 89, b: 116 },
    fieldHigh: { r: 217, g: 93, b: 57 },
    negative: "#0f9f8e",
    positive: "#d95d39",
    guide: "rgba(38, 95, 91, 0.55)"
};

const chamber = {
    cx: canvas.width / 2,
    cy: 560,
    radius: 295,
    innerGuide: 170,
    thickness: 28,
    particleLift: 18
};

const projection = {
    xScale: 0.95,
    zSkew: 0,
    zLift: 0,
    yScale: 1.12,
    perspective: 0.06,
    minYaw: -44,
    maxYaw: 44,
    minTilt: 22,
    maxTilt: 76,
    depthWeightX: -0.12,
    depthWeightY: 0.1,
    depthWeightZ: 0.92
};

const fieldPoints = [];
const fieldRings = [0, 82, 148, 214, 272];
for (const ring of fieldRings) {
    const count = ring === 0 ? 1 : Math.round((ring / 82) * 8);
    for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count;
        fieldPoints.push({
            x: Math.cos(angle) * ring,
            y: 0,
            z: Math.sin(angle) * ring,
            r: ring
        });
    }
}

const state = {
    mode: "reset",
    charge: -1,
    paused: false,
    speedFactor: 1,
    viewYaw: -24,
    viewTilt: 58,
    simTime: 0,
    angle: Math.PI / 2,
    orbitRadius: chamber.innerGuide,
    targetRadius: chamber.innerGuide,
    speed: chamber.innerGuide,
    targetSpeed: chamber.innerGuide,
    orbitB: 1,
    avgB: 1,
    phaseTime: 0,
    trail: [],
    lastFrame: performance.now()
};

const dragState = {
    active: false,
    startX: 0,
    startY: 0,
    startYaw: state.viewYaw,
    startTilt: state.viewTilt
};

const displayTuning = {
    fieldVisualGain: 3,
    globalResetRadiusRatio: 0.11
};

function resetSimulation(mode = state.mode) {
    state.mode = mode;
    state.simTime = 0;
    state.phaseTime = 0;
    state.angle = Math.PI / 2;
    state.orbitRadius = chamber.innerGuide;
    state.targetRadius = chamber.innerGuide;
    state.speed = chamber.innerGuide;
    state.targetSpeed = chamber.innerGuide;
    state.orbitB = 1;
    state.avgB = 1;
    state.trail = [];
    syncUi();
}

function setCharge(charge) {
    state.charge = charge;
    state.angle = Math.PI / 2;
    state.trail = [];
    syncUi();
}

function setMode(mode) {
    state.mode = mode;
    resetSimulation(mode);
}

function setPause(paused) {
    state.paused = paused;
    elements.pauseBtn.textContent = paused ? "再開" : "停止";
    syncUi();
}

function changeSpeedFactor(delta) {
    const next = clamp(state.speedFactor + delta, 0.5, 3);
    state.speedFactor = round(next, 2);
    elements.speedSlider.value = String(state.speedFactor);
    syncUi();
}

function setSpeedFactor(value) {
    state.speedFactor = clamp(Number(value), 0.5, 3);
    syncUi();
}

function setViewYaw(value) {
    state.viewYaw = clamp(Number(value), projection.minYaw, projection.maxYaw);
    elements.yawSlider.value = String(Math.round(state.viewYaw));
    syncUi();
}

function setViewTilt(value) {
    state.viewTilt = clamp(Number(value), projection.minTilt, projection.maxTilt);
    elements.tiltSlider.value = String(Math.round(state.viewTilt));
    syncUi();
}

function updateModel(dt) {
    state.simTime += dt;
    state.phaseTime += dt;

    const orbitRadiusBefore = state.orbitRadius;
    const growth = 0.18;

    if (state.mode === "inner") {
        const prevAvgB = state.avgB;
        state.avgB += growth * dt;
        state.orbitB = 1;
        state.targetSpeed += 0.62 * chamber.innerGuide * (state.avgB - prevAvgB);
    } else if (state.mode === "global") {
        const prevOrbitB = state.orbitB;
        state.orbitB += growth * dt;
        state.avgB = state.orbitB;
        state.targetSpeed *= Math.sqrt(state.orbitB / prevOrbitB);
    } else if (state.mode === "betatron") {
        const prevOrbitB = state.orbitB;
        state.orbitB += growth * dt;
        state.avgB += growth * 2 * dt;
        state.targetSpeed *= state.orbitB / prevOrbitB;
    } else {
        state.orbitB = 1;
        state.avgB = 1;
        state.targetSpeed = chamber.innerGuide;
    }

    const speedCap = state.mode === "betatron" ? 2400 : 1200;
    state.targetSpeed = clamp(state.targetSpeed, 90, speedCap);
    const speedFollow = state.mode === "betatron" ? 0.072 : 0.055;
    state.speed = lerp(state.speed, state.targetSpeed, speedFollow);

    const rawRadius = state.speed / Math.max(state.orbitB, 0.0001);
    state.targetRadius = clamp(rawRadius, chamber.radius * 0.08, chamber.radius * 1.08);
    state.orbitRadius = lerp(state.orbitRadius, state.targetRadius, 0.075);

    if (state.mode !== "reset" && state.orbitRadius >= chamber.radius * 0.975) {
        resetSimulation(state.mode);
        return;
    }
    if (state.mode === "global" && state.orbitRadius <= chamber.radius * displayTuning.globalResetRadiusRatio) {
        resetSimulation(state.mode);
        return;
    }

    const angularSpeed = state.speed / Math.max(state.orbitRadius, 1);
    state.angle += angularSpeed * dt * (state.charge > 0 ? 1 : -1);

    const pos = getParticleWorldPosition(0);
    state.trail.push({ x: pos.x, z: pos.z });
    if (state.trail.length > 260) {
        state.trail.shift();
    }
}

function getFieldStrengthAtRadius(r) {
    const norm = clamp(r / chamber.radius, 0, 1);

    if (state.mode === "inner") {
        if (norm < 0.58) {
            return lerp(1, state.avgB, 1 - norm / 0.58);
        }
        return 1;
    }

    if (state.mode === "betatron") {
        const centerField = state.orbitB + (state.avgB - state.orbitB) * 2;
        return lerp(state.orbitB, centerField, 1 - Math.pow(norm, 1.5));
    }

    return state.orbitB;
}

function getDisplayedFieldStrength(strength) {
    return 1 + Math.max(0, strength - 1) * displayTuning.fieldVisualGain;
}

function getParticleWorldPosition(lift = chamber.particleLift) {
    return {
        x: Math.cos(state.angle) * state.orbitRadius,
        y: lift,
        z: Math.sin(state.angle) * state.orbitRadius
    };
}

function projectPoint(point) {
    const yaw = (state.viewYaw * Math.PI) / 180;
    const tilt = (state.viewTilt * Math.PI) / 180;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);
    const yawedX = point.x * cosYaw - point.z * sinYaw;
    const yawedZ = point.x * sinYaw + point.z * cosYaw;
    const rotatedY = point.y * cosTilt - yawedZ * sinTilt;
    const rotatedZ = point.y * sinTilt + yawedZ * cosTilt;
    const scale = 1 + (rotatedZ / chamber.radius) * projection.perspective;
    return {
        x: chamber.cx + (yawedX * projection.xScale + rotatedZ * projection.zSkew) * scale,
        y: chamber.cy + (-rotatedY * projection.yScale + rotatedZ * projection.zLift) * scale,
        scale,
        depth:
            rotatedZ * projection.depthWeightZ +
            yawedX * projection.depthWeightX +
            rotatedY * projection.depthWeightY
    };
}

function circlePoints(radius, y = 0, segments = 96) {
    const points = [];
    for (let i = 0; i <= segments; i += 1) {
        const angle = (Math.PI * 2 * i) / segments;
        points.push(
            projectPoint({
                x: Math.cos(angle) * radius,
                y,
                z: Math.sin(angle) * radius
            })
        );
    }
    return points;
}

function drawBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, "#fffaf1");
    bg.addColorStop(1, "#f5ecdb");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.strokeStyle = "rgba(24, 34, 45, 0.04)";
    ctx.lineWidth = 1;
    for (let x = 32; x < canvas.width; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 32; y < canvas.height; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawProjectedPath(points) {
    if (!points.length) {
        return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
}

function drawBoardSurface() {
    const bottom = circlePoints(chamber.radius, -chamber.thickness);
    const top = circlePoints(chamber.radius, 0);
    const innerGuide = circlePoints(chamber.innerGuide, 1);

    ctx.save();
    ctx.fillStyle = palette.chamberShadow;
    drawProjectedPath(bottom);
    ctx.fill();

    drawProjectedPath(top);
    ctx.save();
    ctx.clip();
    const surface = ctx.createLinearGradient(140, 300, 780, 760);
    surface.addColorStop(0, "rgba(255, 255, 255, 0.98)");
    surface.addColorStop(0.5, "rgba(247, 242, 232, 0.96)");
    surface.addColorStop(1, "rgba(225, 214, 194, 0.96)");
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const highlight = ctx.createRadialGradient(400, 460, 30, 420, 520, 280);
    highlight.addColorStop(0, "rgba(255, 255, 255, 0.92)");
    highlight.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = highlight;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.chamberStroke;
    drawProjectedPath(top);
    ctx.stroke();

    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = "rgba(38, 95, 91, 0.34)";
    drawProjectedPath(innerGuide);
    ctx.stroke();
    ctx.setLineDash([]);

    const axisA = [
        projectPoint({ x: -chamber.radius - 16, y: 1, z: 0 }),
        projectPoint({ x: chamber.radius + 16, y: 1, z: 0 })
    ];
    const axisB = [
        projectPoint({ x: 0, y: 1, z: -chamber.radius - 16 }),
        projectPoint({ x: 0, y: 1, z: chamber.radius + 16 })
    ];

    ctx.strokeStyle = "rgba(24, 34, 45, 0.08)";
    ctx.lineWidth = 1.4;
    drawLine(axisA[0], axisA[1]);
    drawLine(axisB[0], axisB[1]);

    ctx.restore();
}

function drawFieldVectors() {
    const arrows = fieldPoints
        .map((point) => {
            const strength = getFieldStrengthAtRadius(point.r);
            const displayedStrength = getDisplayedFieldStrength(strength);
            const t = clamp((displayedStrength - 1) / 1.8, 0, 1);
            const color = blendColor(palette.fieldLow, palette.fieldHigh, t);
            const height = 34 + displayedStrength * 28;
            const base = projectPoint(point);
            const tip = projectPoint({ x: point.x, y: height, z: point.z });
            return { base, tip, color, depth: base.depth };
        })
        .sort((a, b) => a.depth - b.depth);

    for (const arrow of arrows) {
        const dx = arrow.tip.x - arrow.base.x;
        const dy = arrow.tip.y - arrow.base.y;
        const length = Math.hypot(dx, dy) || 1;
        const ux = dx / length;
        const uy = dy / length;
        const px = -uy;
        const py = ux;

        ctx.save();
        ctx.strokeStyle = arrow.color;
        ctx.fillStyle = arrow.color;
        ctx.lineWidth = 4.2 * arrow.base.scale;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(arrow.base.x, arrow.base.y);
        ctx.lineTo(arrow.tip.x, arrow.tip.y);
        ctx.stroke();

        const headLength = 12 * arrow.tip.scale;
        const headWidth = 6.5 * arrow.tip.scale;
        ctx.beginPath();
        ctx.moveTo(arrow.tip.x, arrow.tip.y);
        ctx.lineTo(
            arrow.tip.x - ux * headLength + px * headWidth,
            arrow.tip.y - uy * headLength + py * headWidth
        );
        ctx.lineTo(
            arrow.tip.x - ux * headLength - px * headWidth,
            arrow.tip.y - uy * headLength - py * headWidth
        );
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(42, 57, 80, 0.2)";
        ctx.beginPath();
        ctx.ellipse(
            arrow.base.x,
            arrow.base.y + 2,
            4.6 * arrow.base.scale,
            2.3 * arrow.base.scale,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
    }
}

function drawTrail() {
    if (state.trail.length < 2) {
        return;
    }

    ctx.save();
    for (let i = 1; i < state.trail.length; i += 1) {
        const from = projectPoint({ x: state.trail[i - 1].x, y: chamber.particleLift * 0.8, z: state.trail[i - 1].z });
        const to = projectPoint({ x: state.trail[i].x, y: chamber.particleLift * 0.8, z: state.trail[i].z });
        const alpha = i / state.trail.length;
        ctx.strokeStyle =
            state.charge > 0
                ? `rgba(217, 93, 57, ${alpha * 0.65})`
                : `rgba(15, 159, 142, ${alpha * 0.65})`;
        ctx.lineWidth = 2.6 * ((from.scale + to.scale) / 2);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawCurrentOrbit() {
    const orbitPoints = circlePoints(state.orbitRadius, chamber.particleLift * 0.5, 88);
    ctx.save();
    ctx.setLineDash([7, 9]);
    ctx.strokeStyle = palette.guide;
    ctx.lineWidth = 2.1;
    drawProjectedPath(orbitPoints);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function getInducedFieldStrength() {
    if (state.mode === "inner") {
        return clamp((state.avgB - 1) / 1.25, 0.18, 1.35);
    }
    if (state.mode === "global") {
        return clamp((state.avgB - 1) / 1.15, 0.12, 0.95);
    }
    if (state.mode === "betatron") {
        return clamp((state.avgB - 1) / 2.2, 0.2, 1.2);
    }
    return 0;
}

function drawInducedFieldArc() {
    const strength = getInducedFieldStrength();
    if (strength <= 0) {
        return;
    }

    // Increasing upward magnetic flux gives one fixed circulation of induced E;
    // the electric field direction itself does not depend on the sign of the charge.
    const direction = 1;
    const orbitLift = chamber.particleLift * 0.68;
    const span = lerp(0.42, 1.38, clamp(strength / 1.2, 0, 1));
    const startAngle = direction > 0 ? 0.14 : 0.14 + span;
    const endAngle = startAngle + direction * span;
    const segments = 36;
    const arcPoints = [];

    for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const angle = lerp(startAngle, endAngle, t);
        arcPoints.push(
            projectPoint({
                x: Math.cos(angle) * state.orbitRadius,
                y: orbitLift,
                z: Math.sin(angle) * state.orbitRadius
            })
        );
    }

    ctx.save();
    ctx.strokeStyle = `rgba(54, 109, 203, ${0.62 + strength * 0.16})`;
    ctx.lineWidth = 9.3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(arcPoints[0].x, arcPoints[0].y);
    for (let i = 1; i < arcPoints.length; i += 1) {
        ctx.lineTo(arcPoints[i].x, arcPoints[i].y);
    }
    ctx.stroke();

    const tip = arcPoints[arcPoints.length - 1];
    const prev = arcPoints[arcPoints.length - 2];
    const dx = tip.x - prev.x;
    const dy = tip.y - prev.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const headLength = 20 * tip.scale;
    const headWidth = 11.5 * tip.scale;

    ctx.fillStyle = "rgba(54, 109, 203, 0.92)";
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - ux * headLength + px * headWidth, tip.y - uy * headLength + py * headWidth);
    ctx.lineTo(tip.x - ux * headLength - px * headWidth, tip.y - uy * headLength - py * headWidth);
    ctx.closePath();
    ctx.fill();

    const labelIndex = Math.floor(arcPoints.length * 0.5);
    const anchorPoint = arcPoints[labelIndex];
    const orbitAngle = lerp(startAngle, endAngle, labelIndex / segments);
    const labelRadius = state.orbitRadius + 72;
    const labelPoint = projectPoint({
        x: Math.cos(orbitAngle) * labelRadius,
        y: orbitLift + 4,
        z: Math.sin(orbitAngle) * labelRadius
    });
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    roundRect(ctx, labelPoint.x - 74, labelPoint.y - 48, 148, 42, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(54, 109, 203, 0.14)";
    ctx.lineWidth = 1;
    roundRect(ctx, labelPoint.x - 74, labelPoint.y - 48, 148, 42, 14);
    ctx.stroke();

    ctx.strokeStyle = "rgba(54, 109, 203, 0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(anchorPoint.x, anchorPoint.y - 2);
    ctx.lineTo(labelPoint.x - 20, labelPoint.y - 10);
    ctx.stroke();

    ctx.fillStyle = "#366dcb";
    ctx.font = "700 30px 'Avenir Next', 'Hiragino Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("誘導電場", labelPoint.x, labelPoint.y - 27);
    ctx.restore();
}

function drawParticle() {
    const shadowPoint = projectPoint(getParticleWorldPosition(0));
    const particlePoint = projectPoint(getParticleWorldPosition(chamber.particleLift));
    const fill = state.charge > 0 ? palette.positive : palette.negative;
    const radius = 13 * particlePoint.scale;

    ctx.save();
    ctx.fillStyle = "rgba(24, 34, 45, 0.16)";
    ctx.beginPath();
    ctx.ellipse(
        shadowPoint.x + 4,
        shadowPoint.y + 8,
        16 * shadowPoint.scale,
        7 * shadowPoint.scale,
        0,
        0,
        Math.PI * 2
    );
    ctx.fill();

    const body = ctx.createRadialGradient(
        particlePoint.x - radius * 0.32,
        particlePoint.y - radius * 0.46,
        radius * 0.2,
        particlePoint.x,
        particlePoint.y,
        radius * 1.2
    );
    body.addColorStop(0, state.charge > 0 ? "#ffd5c6" : "#d7fbf4");
    body.addColorStop(0.35, fill);
    body.addColorStop(1, darkenHex(fill, 0.2));

    ctx.shadowColor = state.charge > 0 ? "rgba(217, 93, 57, 0.28)" : "rgba(15, 159, 142, 0.28)";
    ctx.shadowBlur = 20;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(particlePoint.x, particlePoint.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "white";
    ctx.font = `700 ${18 * particlePoint.scale}px 'Avenir Next', 'Hiragino Sans', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(state.charge > 0 ? "+" : "−", particlePoint.x, particlePoint.y + 1);
    ctx.restore();
}

function drawInfoBox() {
    const boxWidth = 252;
    const boxHeight = 124;
    const x = canvas.width - boxWidth - 28;
    const y = canvas.height - boxHeight - 28;

    ctx.save();
    ctx.fillStyle = "rgba(24, 34, 45, 0.78)";
    roundRect(ctx, x, y, boxWidth, boxHeight, 18);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.font = "600 18px 'Avenir Next', 'Hiragino Sans', sans-serif";
    ctx.fillText("Mode", x + 18, y + 28);
    ctx.font = "700 22px 'Avenir Next', 'Hiragino Sans', sans-serif";
    ctx.fillText(modeMeta[state.mode].label, x + 18, y + 56);

    ctx.font = "500 16px 'Avenir Next', 'Hiragino Sans', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.74)";
    ctx.fillText(
        `r = ${state.orbitRadius.toFixed(1)}   v = ${state.speed.toFixed(1)}`,
        x + 18,
        y + 88
    );
    ctx.fillText(
        `B_orbit = ${state.orbitB.toFixed(2)}   B_avg = ${state.avgB.toFixed(2)}`,
        x + 18,
        y + 110
    );
    ctx.restore();
}

function render() {
    drawBackground();
    drawBoardSurface();
    drawFieldVectors();
    drawTrail();
    drawCurrentOrbit();
    drawInducedFieldArc();
    drawParticle();
    drawInfoBox();
}

function syncUi() {
    elements.statusText.textContent = state.paused ? "一時停止中" : modeMeta[state.mode].runningText;
    elements.modeValue.textContent = modeMeta[state.mode].label;
    elements.chargeValue.textContent = state.charge > 0 ? "正" : "負";
    elements.radiusValue.textContent = `${state.orbitRadius.toFixed(1)}`;
    elements.speedValue.textContent = `${state.speed.toFixed(1)}`;
    elements.orbitBValue.textContent = `${state.orbitB.toFixed(2)}`;
    elements.avgBValue.textContent = `${state.avgB.toFixed(2)}`;
    elements.speedFactorValue.textContent = `${state.speedFactor.toFixed(2)}x`;
    elements.yawValue.textContent = `${Math.round(state.viewYaw)}°`;
    elements.tiltValue.textContent = `${Math.round(state.viewTilt)}°`;
    elements.modeDescription.innerHTML = modeMeta[state.mode].description;

    const statusDot = document.querySelector(".status-dot");
    if (statusDot) {
        statusDot.style.background = state.paused
            ? palette.warm
            : state.charge > 0
              ? palette.positive
              : palette.negative;
        statusDot.style.boxShadow = state.paused
            ? "0 0 0 6px rgba(244, 179, 95, 0.18)"
            : state.charge > 0
              ? "0 0 0 6px rgba(217, 93, 57, 0.14)"
              : "0 0 0 6px rgba(15, 159, 142, 0.14)";
    }

    elements.negativeBtn.classList.toggle("is-active", state.charge < 0);
    elements.positiveBtn.classList.toggle("is-active", state.charge > 0);

    Object.entries(elements.modeButtons).forEach(([key, button]) => {
        button.classList.toggle("is-active", key === state.mode);
        button.classList.toggle("is-running", key === state.mode && !state.paused && key !== "reset");
    });
}

function animate(now) {
    const elapsed = Math.min((now - state.lastFrame) / 1000, 0.033);
    state.lastFrame = now;

    if (!state.paused) {
        updateModel(elapsed * state.speedFactor);
        syncUi();
    }

    render();
    requestAnimationFrame(animate);
}

function drawLine(a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
}

function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
}

function blendColor(a, b, t) {
    const r = Math.round(lerp(a.r, b.r, t));
    const g = Math.round(lerp(a.g, b.g, t));
    const bl = Math.round(lerp(a.b, b.b, t));
    return `rgb(${r}, ${g}, ${bl})`;
}

function darkenHex(hex, amount) {
    const value = hex.replace("#", "");
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgb(${Math.round(r * (1 - amount))}, ${Math.round(g * (1 - amount))}, ${Math.round(
        b * (1 - amount)
    )})`;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

document.getElementById("speedUpBtn").addEventListener("click", () => changeSpeedFactor(0.25));
document.getElementById("speedDownBtn").addEventListener("click", () => changeSpeedFactor(-0.25));
elements.pauseBtn.addEventListener("click", () => setPause(!state.paused));
elements.speedSlider.addEventListener("input", (event) => setSpeedFactor(event.target.value));
elements.yawSlider.addEventListener("input", (event) => setViewYaw(event.target.value));
elements.tiltSlider.addEventListener("input", (event) => setViewTilt(event.target.value));

elements.negativeBtn.addEventListener("click", () => setCharge(-1));
elements.positiveBtn.addEventListener("click", () => setCharge(1));

elements.modeButtons.reset.addEventListener("click", () => setMode("reset"));
elements.modeButtons.inner.addEventListener("click", () => setMode("inner"));
elements.modeButtons.global.addEventListener("click", () => setMode("global"));
elements.modeButtons.betatron.addEventListener("click", () => setMode("betatron"));

document.getElementById("backBtn").addEventListener("click", () => {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        setMode("reset");
    }
});

canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
        return;
    }
    dragState.active = true;
    dragState.startX = event.clientX;
    dragState.startY = event.clientY;
    dragState.startYaw = state.viewYaw;
    dragState.startTilt = state.viewTilt;
    canvas.classList.add("is-dragging");
    canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
    if (!dragState.active) {
        return;
    }
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    setViewYaw(dragState.startYaw + deltaX * 0.16);
    setViewTilt(dragState.startTilt + deltaY * 0.16);
});

function endCanvasDrag(event) {
    if (!dragState.active) {
        return;
    }
    dragState.active = false;
    canvas.classList.remove("is-dragging");
    if (event?.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
    }
}

canvas.addEventListener("pointerup", endCanvasDrag);
canvas.addEventListener("pointercancel", endCanvasDrag);
canvas.addEventListener("lostpointercapture", endCanvasDrag);

resetSimulation("reset");
syncUi();
render();
requestAnimationFrame(animate);
