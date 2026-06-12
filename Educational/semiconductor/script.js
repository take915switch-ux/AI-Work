const stageData = [
  {
    label: "Stage 1 / 5",
    short: "接触前",
    anchor: 0.02,
    title: "接触前: n型とp型はまだ別々",
    narration:
      "まだ接合していないので、n型には移動しやすい電子が多く、p型にはホールが多い状態です。",
    bullets: [
      "n型ではドナー不純物に由来する自由電子が多い",
      "p型ではアクセプタ不純物に由来するホールが多い",
      "この時点では境界がないため、内部電場も空乏層もない",
    ],
    takeaway:
      "接合前は、両側とも自分の結晶の中でキャリアが熱運動しているだけで、境界由来の現象はまだ起きていません。",
  },
  {
    label: "Stage 2 / 5",
    short: "接合",
    anchor: 0.2,
    title: "接合: キャリア濃度の差が向きのある動きを生む",
    narration:
      "接合すると、電子は濃いn側からp側へ、ホールは濃いp側からn側へ、濃度差をならす向きに動き始めます。",
    bullets: [
      "電子は n → p に拡散しやすい",
      "ホールは p → n に拡散しやすい",
      "最初の駆動力は電圧ではなく濃度勾配による拡散",
    ],
    takeaway:
      "最初に起こるのは拡散です。キャリアは『多い場所から少ない場所へ』広がろうとします。",
  },
  {
    label: "Stage 3 / 5",
    short: "拡散と再結合",
    anchor: 0.44,
    title: "拡散と再結合: 境界付近の移動キャリアが減っていく",
    narration:
      "境界近くへ来た電子とホールは再結合し、自由に動けるキャリアとしては消えていきます。",
    bullets: [
      "電子がp側へ入り、ホールと再結合する",
      "ホールがn側へ入り、電子と再結合する",
      "その結果、境界近くでは移動キャリアが少なくなる",
    ],
    takeaway:
      "再結合は『動けるキャリアを消す』働きをするので、境界付近から自由電子とホールが減り始めます。",
  },
  {
    label: "Stage 4 / 5",
    short: "空乏層と電場",
    anchor: 0.8,
    title: "空乏層と内部電場: 取り残された固定イオンが境界を帯電させる",
    narration:
      "電子やホールが去ったあと、その場には動けないドナーイオンとアクセプタイオンが残り、空乏層と内部電場を作ります。",
    bullets: [
      "n側の境界近くには正に帯電したドナーイオンが残る",
      "p側の境界近くには負に帯電したアクセプタイオンが残る",
      "正から負へ向かう内部電場 F が形成される",
    ],
    takeaway:
      "空乏層は『移動キャリアが乏しい領域』であり、同時に内部電場の発生源でもあります。",
  },
  {
    label: "Stage 5 / 5",
    short: "平衡",
    anchor: 0.96,
    title: "平衡: 拡散と内部電場による押し戻しがつり合う",
    narration:
      "内部電場が十分に育つと、空乏層へキャリアが入り込みにくくなり、再結合も止まった平衡状態になります。",
    bullets: [
      "内部電場は電子とホールの拡散を抑える向きに働く",
      "この模式図では空乏層への流入が止まり、再結合演出も消える",
      "平衡ではフェルミ準位がそろった状態として扱える",
    ],
    takeaway:
      "平衡では『拡散したい力』と『電場で戻す力』が一致し、空乏層に新しく入るキャリアも再結合も見かけ上止まります。",
  },
];

const svg = document.querySelector("#junctionViz");
const stageTitle = document.querySelector("#stageTitle");
const stageBadge = document.querySelector("#stageBadge");
const stageNarration = document.querySelector("#stageNarration");
const bulletList = document.querySelector("#bulletList");
const takeaway = document.querySelector("#takeaway");
const playPauseButton = document.querySelector("#playPauseButton");
const stepPlayButton = document.querySelector("#stepPlayButton");
const resetButton = document.querySelector("#resetButton");
const timelineSlider = document.querySelector("#timelineSlider");
const stepButtonsContainer = document.querySelector("#stepButtons");

const ns = "http://www.w3.org/2000/svg";

const state = {
  playing: true,
  progress: 0,
  lastTimestamp: 0,
  cycleMs: 16000,
  stepTarget: null,
};

const scene = {
  donors: [],
  acceptors: [],
  movingElectrons: [],
  movingHoles: [],
  sparks: [],
  fieldLines: [],
};

function createSvgElement(tag, attrs = {}) {
  const node = document.createElementNS(ns, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function smoothstep(min, max, value) {
  const x = clamp((value - min) / (max - min));
  return x * x * (3 - 2 * x);
}

function phaseBetween(progress, start, end) {
  return smoothstep(start, end, progress);
}

function initializeScene() {
  const defs = createSvgElement("defs");
  const bgGradient = createSvgElement("linearGradient", {
    id: "panelGlow",
    x1: "0%",
    x2: "0%",
    y1: "0%",
    y2: "100%",
  });
  bgGradient.append(
    createSvgElement("stop", { offset: "0%", "stop-color": "#ffffff" }),
    createSvgElement("stop", { offset: "100%", "stop-color": "#eef6ff" })
  );

  const leftGradient = createSvgElement("linearGradient", {
    id: "nBlock",
    x1: "0%",
    x2: "100%",
    y1: "0%",
    y2: "100%",
  });
  leftGradient.append(
    createSvgElement("stop", { offset: "0%", "stop-color": "#d8ecff" }),
    createSvgElement("stop", { offset: "100%", "stop-color": "#93bfff" })
  );

  const rightGradient = createSvgElement("linearGradient", {
    id: "pBlock",
    x1: "0%",
    x2: "100%",
    y1: "0%",
    y2: "100%",
  });
  rightGradient.append(
    createSvgElement("stop", { offset: "0%", "stop-color": "#dfe4ff" }),
    createSvgElement("stop", { offset: "100%", "stop-color": "#b9c8ff" })
  );

  const depletionGradient = createSvgElement("linearGradient", {
    id: "depletion",
    x1: "0%",
    x2: "100%",
    y1: "0%",
    y2: "0%",
  });
  depletionGradient.append(
    createSvgElement("stop", {
      offset: "0%",
      "stop-color": "rgba(255, 224, 194, 0)",
    }),
    createSvgElement("stop", {
      offset: "18%",
      "stop-color": "rgba(255, 198, 141, 0.58)",
    }),
    createSvgElement("stop", {
      offset: "50%",
      "stop-color": "rgba(255, 255, 255, 0.85)",
    }),
    createSvgElement("stop", {
      offset: "82%",
      "stop-color": "rgba(255, 198, 141, 0.58)",
    }),
    createSvgElement("stop", {
      offset: "100%",
      "stop-color": "rgba(255, 224, 194, 0)",
    })
  );

  const fieldMarker = createSvgElement("marker", {
    id: "fieldArrow",
    markerWidth: "12",
    markerHeight: "12",
    refX: "8",
    refY: "6",
    orient: "auto",
  });
  fieldMarker.append(
    createSvgElement("path", {
      d: "M0,0 L12,6 L0,12 z",
      fill: "#ff8a3a",
    })
  );

  const electronMarker = createSvgElement("marker", {
    id: "electronArrow",
    markerWidth: "12",
    markerHeight: "12",
    refX: "8",
    refY: "6",
    orient: "auto",
  });
  electronMarker.append(
    createSvgElement("path", {
      d: "M0,0 L12,6 L0,12 z",
      fill: "#5063df",
    })
  );

  const holeMarker = createSvgElement("marker", {
    id: "holeArrow",
    markerWidth: "12",
    markerHeight: "12",
    refX: "8",
    refY: "6",
    orient: "auto",
  });
  holeMarker.append(
    createSvgElement("path", {
      d: "M0,0 L12,6 L0,12 z",
      fill: "#8d55d6",
    })
  );

  defs.append(
    bgGradient,
    leftGradient,
    rightGradient,
    depletionGradient,
    fieldMarker,
    electronMarker,
    holeMarker
  );
  svg.append(defs);

  svg.append(
    createSvgElement("rect", {
      x: "0",
      y: "0",
      width: "960",
      height: "620",
      fill: "url(#panelGlow)",
    })
  );

  scene.backgroundLines = createSvgElement("g", { opacity: "0.18" });
  for (let i = 0; i < 12; i += 1) {
    scene.backgroundLines.append(
      createSvgElement("path", {
        d: `M ${90 + i * 64} 42 Q ${140 + i * 64} 62 ${96 + i * 64} 84`,
        fill: "none",
        stroke: "#86add9",
        "stroke-width": "2",
      })
    );
  }
  svg.append(scene.backgroundLines);

  scene.nBlock = createSvgElement("rect", {
    rx: "24",
    ry: "24",
    width: "290",
    height: "290",
    fill: "url(#nBlock)",
    stroke: "rgba(54, 89, 184, 0.14)",
  });
  scene.pBlock = createSvgElement("rect", {
    rx: "24",
    ry: "24",
    width: "290",
    height: "290",
    fill: "url(#pBlock)",
    stroke: "rgba(141, 85, 214, 0.14)",
  });

  scene.depletionBand = createSvgElement("rect", {
    y: "146",
    height: "278",
    rx: "26",
    fill: "url(#depletion)",
    opacity: "0",
  });

  scene.blockShadow = createSvgElement("g", { opacity: "0.4" });
  scene.blockShadow.append(
    createSvgElement("rect", {
      x: "0",
      y: "0",
      width: "290",
      height: "290",
      rx: "24",
      fill: "rgba(36, 66, 117, 0.08)",
    })
  );

  scene.labels = createSvgElement("g");
  scene.nTypeLabel = createSvgElement("text", {
    "font-size": "24",
    "font-weight": "800",
    fill: "#284d97",
    "text-anchor": "middle",
  });
  scene.nTypeLabel.textContent = "n型半導体";
  scene.pTypeLabel = createSvgElement("text", {
    "font-size": "24",
    "font-weight": "800",
    fill: "#7b4ebd",
    "text-anchor": "middle",
  });
  scene.pTypeLabel.textContent = "p型半導体";

  scene.depletionText = createSvgElement("text", {
    "font-size": "22",
    "font-weight": "800",
    fill: "#99511e",
    "text-anchor": "middle",
    opacity: "0",
  });
  scene.depletionText.textContent = "空乏層";

  scene.fieldText = createSvgElement("text", {
    "font-size": "24",
    "font-weight": "800",
    fill: "#8f4f18",
    "text-anchor": "middle",
    opacity: "0",
  });
  scene.fieldText.textContent = "内部電場 F";

  scene.diffusionHints = createSvgElement("g", { opacity: "0" });
  scene.electronHintLine = createSvgElement("line", {
    stroke: "#5063df",
    "stroke-width": "4",
    "stroke-linecap": "round",
    "marker-end": "url(#electronArrow)",
  });
  scene.electronHintText = createSvgElement("text", {
    "font-size": "20",
    "font-weight": "800",
    fill: "#5063df",
    "text-anchor": "end",
  });
  scene.electronHintText.textContent = "電子の拡散";
  scene.holeHintLine = createSvgElement("line", {
    stroke: "#8d55d6",
    "stroke-width": "4",
    "stroke-linecap": "round",
    "marker-end": "url(#holeArrow)",
  });
  scene.holeHintText = createSvgElement("text", {
    "font-size": "20",
    "font-weight": "800",
    fill: "#8d55d6",
    "text-anchor": "start",
  });
  scene.holeHintText.textContent = "ホールの拡散";
  scene.diffusionHints.append(
    scene.electronHintLine,
    scene.electronHintText,
    scene.holeHintLine,
    scene.holeHintText
  );

  scene.topPlus = createSvgElement("g", { opacity: "0" });
  scene.topMinus = createSvgElement("g", { opacity: "0" });
  [scene.topPlus, scene.topMinus].forEach((group) => {
    group.append(
      createSvgElement("circle", {
        r: "21",
        fill: "white",
        stroke: "rgba(28, 53, 82, 0.22)",
        "stroke-width": "2.5",
      })
    );
  });
  const plusText = createSvgElement("text", {
    "font-size": "24",
    "font-weight": "900",
    fill: "#ea5f2f",
    "text-anchor": "middle",
    y: "8",
  });
  plusText.textContent = "+";
  const minusText = createSvgElement("text", {
    "font-size": "28",
    "font-weight": "900",
    fill: "#4c63cf",
    "text-anchor": "middle",
    y: "9",
  });
  minusText.textContent = "−";
  scene.topPlus.append(plusText);
  scene.topMinus.append(minusText);

  scene.topFieldLine = createSvgElement("line", {
    y1: "88",
    y2: "88",
    stroke: "#ff8a3a",
    "stroke-width": "7",
    "stroke-linecap": "round",
    "marker-end": "url(#fieldArrow)",
    opacity: "0",
  });

  scene.fieldLinesGroup = createSvgElement("g", { opacity: "0" });
  for (let i = 0; i < 4; i += 1) {
    const line = createSvgElement("line", {
      stroke: "#ff8a3a",
      "stroke-width": "4.2",
      "stroke-linecap": "round",
      "marker-end": "url(#fieldArrow)",
      opacity: "0.9",
    });
    scene.fieldLines.push(line);
    scene.fieldLinesGroup.append(line);
  }

  scene.sparkGroup = createSvgElement("g");
  for (let i = 0; i < 5; i += 1) {
    const spark = createSvgElement("circle", {
      r: "10",
      fill: "rgba(255, 176, 81, 0.75)",
      opacity: "0",
    });
    scene.sparks.push(spark);
    scene.sparkGroup.append(spark);
  }

  scene.donorGroup = createSvgElement("g");
  scene.acceptorGroup = createSvgElement("g");
  scene.movingCarrierGroup = createSvgElement("g");

  buildLattice(scene.donorGroup, scene.donors, "n");
  buildLattice(scene.acceptorGroup, scene.acceptors, "p");
  buildMovingCarriers();

  scene.labels.append(
    scene.nTypeLabel,
    scene.pTypeLabel,
    scene.depletionText,
    scene.fieldText,
    scene.diffusionHints
  );

  svg.append(
    scene.nBlock,
    scene.pBlock,
    scene.depletionBand,
    scene.donorGroup,
    scene.acceptorGroup,
    scene.fieldLinesGroup,
    scene.sparkGroup,
    scene.topFieldLine,
    scene.topPlus,
    scene.topMinus,
    scene.labels,
    scene.movingCarrierGroup
  );
}

function buildLattice(group, registry, side) {
  const rows = 5;
  const cols = 5;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const ionGroup = createSvgElement("g");
      const ionCircle = createSvgElement("circle", {
        r: "12",
        fill: side === "n" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.42)",
        stroke: side === "n" ? "#3659b8" : "#8d55d6",
        "stroke-width": "2.4",
      });
      const ionText = createSvgElement("text", {
        "font-size": "17",
        "font-weight": "900",
        fill: side === "n" ? "#3659b8" : "#8d55d6",
        "text-anchor": "middle",
        y: "6",
      });
      ionText.textContent = side === "n" ? "+" : "−";

      const mobileCarrier = createSvgElement("circle", {
        r: "8",
        fill: side === "n" ? "#5c4fd6" : "#ffffff",
        stroke: side === "n" ? "rgba(255,255,255,0.28)" : "#bfd1f2",
        "stroke-width": "2",
      });

      ionGroup.append(ionCircle, ionText, mobileCarrier);
      group.append(ionGroup);

      registry.push({
        side,
        row,
        col,
        ionGroup,
        ionCircle,
        ionText,
        mobileCarrier,
      });
    }
  }
}

function buildMovingCarriers() {
  const electronSpecs = [
    { row: 0, offset: 0.14 },
    { row: 1, offset: 0.3 },
    { row: 2, offset: 0.48 },
    { row: 3, offset: 0.68 },
    { row: 4, offset: 0.84 },
  ];

  const holeSpecs = [
    { row: 0, offset: 0.18 },
    { row: 1, offset: 0.36 },
    { row: 2, offset: 0.54 },
    { row: 3, offset: 0.7 },
    { row: 4, offset: 0.88 },
  ];

  electronSpecs.forEach((spec, index) => {
    const circle = createSvgElement("circle", {
      r: "8.5",
      fill: "#5c4fd6",
      stroke: "rgba(255,255,255,0.35)",
      "stroke-width": "2",
      opacity: "0",
    });
    scene.movingCarrierGroup.append(circle);
    scene.movingElectrons.push({ ...spec, circle, index });
  });

  holeSpecs.forEach((spec, index) => {
    const circle = createSvgElement("circle", {
      r: "8.5",
      fill: "#ffffff",
      stroke: "#bfd1f2",
      "stroke-width": "2",
      opacity: "0",
    });
    scene.movingCarrierGroup.append(circle);
    scene.movingHoles.push({ ...spec, circle, index });
  });
}

function stageIndexForProgress(progress) {
  if (progress < 0.16) return 0;
  if (progress < 0.32) return 1;
  if (progress < 0.62) return 2;
  if (progress < 0.84) return 3;
  return 4;
}

function populateStepButtons() {
  stageData.forEach((stage, index) => {
    const button = document.createElement("button");
    button.className = "step-button";
    button.type = "button";
    button.innerHTML = `<strong>${index + 1}. ${stage.short}</strong><span>${stage.title}</span>`;
    button.addEventListener("click", () => {
      state.playing = false;
      state.stepTarget = null;
      state.progress = stage.anchor;
      state.lastTimestamp = performance.now();
      updatePlaybackButton();
    });
    stage.button = button;
    stepButtonsContainer.append(button);
  });
}

function updateStageContent(progress) {
  const index = stageIndexForProgress(progress);
  const stage = stageData[index];
  stageTitle.textContent = stage.title;
  stageBadge.textContent = stage.label;
  stageNarration.textContent = stage.narration;
  takeaway.textContent = stage.takeaway;
  bulletList.innerHTML = stage.bullets.map((bullet) => `<li>${bullet}</li>`).join("");

  stageData.forEach((entry, stageIndex) => {
    entry.button.classList.toggle("active", stageIndex === index);
  });
}

function updatePlaybackButton() {
  playPauseButton.textContent = state.playing ? "一時停止" : "再生";
  stepPlayButton.disabled = nextStageIndex(state.progress) === null;
}

function nextStageIndex(progress) {
  const currentStageIndex = stageIndexForProgress(progress);
  return currentStageIndex < stageData.length - 1 ? currentStageIndex + 1 : null;
}

function beginSingleStepPlayback() {
  const nextIndex = nextStageIndex(state.progress);
  if (nextIndex === null) {
    return;
  }

  state.stepTarget = stageData[nextIndex].anchor;
  state.playing = true;
  state.lastTimestamp = performance.now();
  updatePlaybackButton();
}

function layoutMetrics(progress) {
  const centerX = 480;
  const blockWidth = 290;
  const blockY = 140;
  const blockHeight = 290;
  const approach = phaseBetween(progress, 0.06, 0.26);
  const gap = lerp(112, 0, approach);
  const leftX = centerX - blockWidth - gap / 2;
  const rightX = centerX + gap / 2;
  const junctionX = leftX + blockWidth;
  const depletionStrength = phaseBetween(progress, 0.42, 0.74);
  const depletionWidth = lerp(0, 126, depletionStrength);

  return {
    leftX,
    rightX,
    blockY,
    blockWidth,
    blockHeight,
    junctionX,
    depletionWidth,
  };
}

function sitePosition(side, row, col, metrics) {
  const paddingX = 42;
  const paddingY = 44;
  const spacingX = 50;
  const spacingY = 48;
  const xBase = side === "n" ? metrics.leftX : metrics.rightX;
  return {
    x: xBase + paddingX + col * spacingX,
    y: metrics.blockY + paddingY + row * spacingY,
  };
}

function updateLattice(time, progress, metrics) {
  const depletionStart = metrics.junctionX - metrics.depletionWidth;
  const depletionEnd = metrics.junctionX + metrics.depletionWidth;
  const fieldStrength = phaseBetween(progress, 0.44, 0.78);

  scene.donors.forEach((site, index) => {
    const position = sitePosition("n", site.row, site.col, metrics);
    site.ionGroup.setAttribute("transform", `translate(${position.x} ${position.y})`);

    const wobbleX = Math.sin(time * 0.0015 + index * 0.8) * 2.5;
    const wobbleY = Math.cos(time * 0.0019 + index * 0.4) * 2.1;
    const mobileX = 14 + wobbleX;
    const mobileY = 15 + wobbleY;
    const depletionLocal = clamp(
      (position.x + 18 - depletionStart) / Math.max(metrics.depletionWidth, 1)
    );
    const electronFade = smoothstep(0.02, 0.42, depletionLocal) * fieldStrength;
    const electronOpacity = clamp(1 - electronFade * 1.42, 0, 1);

    site.mobileCarrier.setAttribute("cx", mobileX);
    site.mobileCarrier.setAttribute("cy", mobileY);
    site.mobileCarrier.setAttribute("opacity", electronOpacity);

    const ionGlow = clamp(depletionLocal * fieldStrength * 0.9, 0, 0.85);
    site.ionCircle.setAttribute(
      "fill",
      `rgba(255,255,255,${0.34 + ionGlow * 0.36})`
    );
    site.ionCircle.setAttribute("stroke-width", 2.4 + ionGlow * 1.6);
  });

  scene.acceptors.forEach((site, index) => {
    const position = sitePosition("p", site.row, site.col, metrics);
    site.ionGroup.setAttribute("transform", `translate(${position.x} ${position.y})`);

    const wobbleX = Math.sin(time * 0.0013 + index * 0.7) * 2.3;
    const wobbleY = Math.cos(time * 0.0021 + index * 0.5) * 2;
    const mobileX = -13 + wobbleX;
    const mobileY = 16 + wobbleY;
    const depletionLocal = clamp(
      (depletionEnd - (position.x - 18)) / Math.max(metrics.depletionWidth, 1)
    );
    const holeFade = smoothstep(0.02, 0.42, depletionLocal) * fieldStrength;
    const holeOpacity = clamp(1 - holeFade * 1.42, 0, 1);

    site.mobileCarrier.setAttribute("cx", mobileX);
    site.mobileCarrier.setAttribute("cy", mobileY);
    site.mobileCarrier.setAttribute("opacity", holeOpacity);

    const ionGlow = clamp(depletionLocal * fieldStrength * 0.9, 0, 0.85);
    site.ionCircle.setAttribute(
      "fill",
      `rgba(255,255,255,${0.3 + ionGlow * 0.34})`
    );
    site.ionCircle.setAttribute("stroke-width", 2.4 + ionGlow * 1.6);
  });
}

function updateMovingCarriers(time, progress, metrics) {
  const diffusion = phaseBetween(progress, 0.28, 0.68);
  const fadeOut = phaseBetween(progress, 0.58, 0.82);

  scene.movingElectrons.forEach((carrier) => {
    const start = sitePosition("n", carrier.row, 4, metrics);
    const endX = metrics.junctionX + 14 + carrier.index * 3;
    const endY = start.y - 6 + Math.sin(carrier.index) * 9;
    const travel = clamp((diffusion - carrier.offset) / 0.24);
    const x = lerp(start.x + 14, endX, travel);
    const y = lerp(start.y + 15, endY, travel);
    const blink = 0.82 + Math.sin(time * 0.006 + carrier.index) * 0.18;
    const recombinationFade = smoothstep(0.62, 0.9, travel);
    const opacity =
      travel > 0 ? (1 - fadeOut) * (1 - recombinationFade) * blink : 0;

    carrier.circle.setAttribute("cx", x);
    carrier.circle.setAttribute("cy", y);
    carrier.circle.setAttribute("opacity", clamp(opacity, 0, 1));
  });

  scene.movingHoles.forEach((carrier) => {
    const start = sitePosition("p", carrier.row, 0, metrics);
    const endX = metrics.junctionX - 14 - carrier.index * 3;
    const endY = start.y + 6 - Math.cos(carrier.index) * 8;
    const travel = clamp((diffusion - carrier.offset) / 0.24);
    const x = lerp(start.x - 13, endX, travel);
    const y = lerp(start.y + 16, endY, travel);
    const blink = 0.82 + Math.cos(time * 0.006 + carrier.index) * 0.18;
    const recombinationFade = smoothstep(0.62, 0.9, travel);
    const opacity =
      travel > 0 ? (1 - fadeOut) * (1 - recombinationFade) * blink : 0;

    carrier.circle.setAttribute("cx", x);
    carrier.circle.setAttribute("cy", y);
    carrier.circle.setAttribute("opacity", clamp(opacity, 0, 1));
  });
}

function updateSparks(time, progress, metrics) {
  const activityRise = phaseBetween(progress, 0.36, 0.58);
  const activityFall = 1 - phaseBetween(progress, 0.82, 0.92);
  const activity = activityRise * activityFall;
  scene.sparks.forEach((spark, index) => {
    const pulse = clamp(
      Math.sin(time * 0.009 + index * 1.2) * 0.5 + 0.5,
      0,
      1
    );
    const opacity = activity * pulse * 0.82;
    const y = 196 + index * 46 + Math.sin(time * 0.003 + index) * 8;
    const x = metrics.junctionX + (index % 2 === 0 ? -8 : 10);

    spark.setAttribute("cx", x);
    spark.setAttribute("cy", y);
    spark.setAttribute("r", 6 + pulse * 10);
    spark.setAttribute("opacity", opacity);
  });
}

function updateField(progress, metrics) {
  const fieldStrength = phaseBetween(progress, 0.44, 0.78);
  const depletionOpacity = clamp(fieldStrength * 0.95, 0, 0.9);
  scene.depletionBand.setAttribute("x", metrics.junctionX - metrics.depletionWidth);
  scene.depletionBand.setAttribute("width", metrics.depletionWidth * 2);
  scene.depletionBand.setAttribute("opacity", depletionOpacity);

  scene.topFieldLine.setAttribute("x1", metrics.junctionX - 52);
  scene.topFieldLine.setAttribute("x2", metrics.junctionX + 76);
  scene.topFieldLine.setAttribute("opacity", fieldStrength);

  scene.topPlus.setAttribute(
    "transform",
    `translate(${metrics.junctionX - 92} 82)`
  );
  scene.topMinus.setAttribute(
    "transform",
    `translate(${metrics.junctionX + 110} 82)`
  );
  scene.topPlus.setAttribute("opacity", fieldStrength);
  scene.topMinus.setAttribute("opacity", fieldStrength);

  scene.fieldLinesGroup.setAttribute("opacity", fieldStrength);
  scene.fieldLines.forEach((line, index) => {
    const y = 198 + index * 52;
    const spread = 6 + index * 4;
    line.setAttribute("x1", metrics.junctionX - metrics.depletionWidth + 18);
    line.setAttribute("y1", y);
    line.setAttribute("x2", metrics.junctionX + metrics.depletionWidth - spread);
    line.setAttribute("y2", y);
  });

  scene.depletionText.setAttribute("x", metrics.junctionX);
  scene.depletionText.setAttribute("y", 454);
  scene.depletionText.setAttribute("opacity", clamp(fieldStrength * 1.2, 0, 1));

  scene.fieldText.setAttribute("x", metrics.junctionX + 20);
  scene.fieldText.setAttribute("y", 34);
  scene.fieldText.setAttribute("opacity", clamp(fieldStrength * 1.1, 0, 1));
}

function updateCallouts(progress, metrics) {
  const diffusionOpacity = phaseBetween(progress, 0.28, 0.42) * (1 - phaseBetween(progress, 0.62, 0.78));
  scene.diffusionHints.setAttribute("opacity", clamp(diffusionOpacity, 0, 1));

  scene.electronHintLine.setAttribute("x1", metrics.junctionX - 110);
  scene.electronHintLine.setAttribute("y1", 480);
  scene.electronHintLine.setAttribute("x2", metrics.junctionX + 36);
  scene.electronHintLine.setAttribute("y2", 480);
  scene.electronHintText.setAttribute("x", metrics.junctionX - 122);
  scene.electronHintText.setAttribute("y", 458);

  scene.holeHintLine.setAttribute("x1", metrics.junctionX + 110);
  scene.holeHintLine.setAttribute("y1", 520);
  scene.holeHintLine.setAttribute("x2", metrics.junctionX - 36);
  scene.holeHintLine.setAttribute("y2", 520);
  scene.holeHintText.setAttribute("x", metrics.junctionX + 124);
  scene.holeHintText.setAttribute("y", 548);
}

function updateBlocks(progress, metrics) {
  const approach = phaseBetween(progress, 0.06, 0.26);
  scene.nBlock.setAttribute("x", metrics.leftX);
  scene.nBlock.setAttribute("y", metrics.blockY);
  scene.pBlock.setAttribute("x", metrics.rightX);
  scene.pBlock.setAttribute("y", metrics.blockY);

  const nOpacity = 0.88 + approach * 0.12;
  const pOpacity = 0.88 + approach * 0.12;
  scene.nBlock.setAttribute("opacity", nOpacity);
  scene.pBlock.setAttribute("opacity", pOpacity);

  scene.nTypeLabel.setAttribute("x", metrics.leftX + metrics.blockWidth / 2);
  scene.nTypeLabel.setAttribute("y", 122);
  scene.pTypeLabel.setAttribute("x", metrics.rightX + metrics.blockWidth / 2);
  scene.pTypeLabel.setAttribute("y", 122);
}

function render(timestamp) {
  if (!state.lastTimestamp) {
    state.lastTimestamp = timestamp;
  }

  if (state.playing) {
    const delta = timestamp - state.lastTimestamp;
    if (state.stepTarget !== null) {
      const nextProgress = state.progress + delta / state.cycleMs;
      if (nextProgress >= state.stepTarget) {
        state.progress = state.stepTarget;
        state.playing = false;
        state.stepTarget = null;
      } else {
        state.progress = nextProgress;
      }
    } else {
      state.progress = (state.progress + delta / state.cycleMs) % 1;
    }
  }

  state.lastTimestamp = timestamp;
  timelineSlider.value = String(Math.round(state.progress * 1000));
  updateStageContent(state.progress);
  updatePlaybackButton();

  const metrics = layoutMetrics(state.progress);
  updateBlocks(state.progress, metrics);
  updateLattice(timestamp, state.progress, metrics);
  updateMovingCarriers(timestamp, state.progress, metrics);
  updateSparks(timestamp, state.progress, metrics);
  updateField(state.progress, metrics);
  updateCallouts(state.progress, metrics);

  requestAnimationFrame(render);
}

playPauseButton.addEventListener("click", () => {
  state.stepTarget = null;
  state.playing = !state.playing;
  state.lastTimestamp = performance.now();
  updatePlaybackButton();
});

stepPlayButton.addEventListener("click", () => {
  beginSingleStepPlayback();
});

resetButton.addEventListener("click", () => {
  state.playing = false;
  state.stepTarget = null;
  state.progress = 0;
  state.lastTimestamp = performance.now();
  updatePlaybackButton();
});

timelineSlider.addEventListener("input", (event) => {
  state.playing = false;
  state.stepTarget = null;
  state.progress = Number(event.target.value) / 1000;
  state.lastTimestamp = performance.now();
  updatePlaybackButton();
});

initializeScene();
populateStepButtons();
updateStageContent(0);
updatePlaybackButton();
requestAnimationFrame(render);
