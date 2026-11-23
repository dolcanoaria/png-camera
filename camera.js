"use strict";

const byId = (id) => document.getElementById(id);
const video = byId("video");
const preview = byId("preview");
const context = preview.getContext("2d", { alpha: false });
const camera = byId("camera");
const capture = byId("capture");
const download = byId("download");
const sharePhoto = byId("share-photo");
let latestPhotoBlob = null;
let latestPhotoName = "";
let backgroundExif = {};
const layerSelect = byId("layer-select");
const anchorButton = byId("anchor");
const clearAnchorButton = byId("clear-anchor");
const shadowButton = byId("shadow");
const center = { x: .5, y: .5 };
let anchorLayer;
let anchorDraft;
const anchorEditor = byId("anchor-editor");
const anchorDetail = byId("anchor-detail");
const anchorContext = anchorDetail.getContext("2d");
const points = new Map();
const maxEdge = 1920;
const maxLayers = 3;
const layers = [];
let stream, frame, photoUrl, background;
let selectedId = null;
let nextId = 1;
let starting = false;
let saving = false;
let cameraRequest = 0;
let imageRequest = 0;
let backgroundRequest = 0;
let gestureLayer = null;

const cameraZoom = document.createElement("input");
cameraZoom.type = "range";
cameraZoom.min = "1";
cameraZoom.max = "4";
cameraZoom.step = "0.1";
cameraZoom.value = "1";
cameraZoom.disabled = true;
const zoomLabel = document.createElement("label");
zoomLabel.style.cssText = "display:flex;align-items:center;gap:.5rem;flex-wrap:wrap";
const zoomText = document.createElement("span");
zoomText.textContent = "カメラズーム 1.0×";
zoomLabel.append(zoomText, cameraZoom);
camera.parentElement.after(zoomLabel);
cameraZoom.addEventListener("input", () => {
  if (!background && hasCamera()) clearPerspective();
  zoomText.textContent = "カメラズーム " + Number(cameraZoom.value).toFixed(1) + "×";
  paint();
});

let referenceImage;
let referenceRequest = 0;
const referenceLabel = document.createElement("label");
referenceLabel.className = "picker";
referenceLabel.textContent = "構図合わせ用の画像を選ぶ";
const referenceFile = document.createElement("input");
referenceFile.type = "file";
referenceFile.accept = "image/*";
referenceLabel.append(referenceFile);
const referenceToggle = document.createElement("button");
referenceToggle.type = "button";
let referenceVisible = false;
zoomLabel.after(referenceLabel, referenceToggle);

referenceFile.addEventListener("change", async () => {
  const file = referenceFile.files[0];
  referenceFile.value = "";
  if (!file) return;
  const request = ++referenceRequest;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (request !== referenceRequest) { bitmap.close(); return; }
    referenceImage?.close();
    referenceImage = bitmap;
    referenceVisible = true;
    updateControls();
    paint();
    status(hasCamera() ? "作品画像を50%で重ねています。" : "背面カメラを起動すると、作品画像が重なります。");
  } catch {
    if (request === referenceRequest) status("構図合わせ用の画像を読み込めませんでした。");
  }
});
referenceToggle.addEventListener("click", () => {
  referenceVisible = !referenceVisible;
  updateControls();
  paint();
});

function status(message) { byId("status").textContent = message; }
function defaultPose() { return { x: .5, y: .55, scale: 1, angle: 0 }; }
function selectedLayer() { return layers.find((layer) => layer.id === selectedId); }
function hasCamera() { return !!stream && video.readyState >= 2; }
function hasBackground() { return !!background || hasCamera(); }
function updateLayerSelect() {
  layerSelect.replaceChildren(...layers.map((layer, index) => new Option(`${index + 1}. ${layer.name}`, String(layer.id))));
  if (selectedLayer()) layerSelect.value = String(selectedId);
  layerSelect.disabled = !layers.length;
}
function updateControls() {
  camera.disabled = starting;
  referenceToggle.disabled = !referenceImage;
  referenceToggle.textContent = referenceVisible ? "構図合わせをオフ" : "構図合わせをオン";
  referenceToggle.setAttribute("aria-pressed", String(referenceVisible));
  cameraZoom.disabled = starting || !hasCamera();
  camera.textContent = stream && !starting ? "カメラを停止" : "背面カメラを起動";
  capture.disabled = starting || saving || !hasBackground();
  byId("clear-background").disabled = !background;
  const layer = selectedLayer();
  const selected = !!layer;
  if (anchorLayer !== layer?.id) anchorLayer = undefined;
  anchorButton.disabled = !selected;
  anchorButton.setAttribute("aria-pressed", String(anchorLayer !== undefined));
  anchorButton.textContent = anchorLayer !== undefined ? "足元の指定をキャンセル" : "足元を指定";
  clearAnchorButton.disabled = !layer?.anchor;
  shadowButton.disabled = !layer?.anchor;
  const shadowEnabled = !!layer?.shadow;
  shadowButton.textContent = shadowEnabled ? "足元の影をオフ" : "足元の影をオン";
  shadowButton.setAttribute("aria-pressed", String(shadowEnabled));
  const perspective = layer?.perspective;
  byId("perspective-near").disabled = byId("perspective-far").disabled = !layer?.anchor || !hasBackground();
  byId("clear-perspective").disabled = !perspective;
  byId("perspective-status").textContent = perspective?.near && perspective?.far
    ? "サイズ補助が有効です。ピンチで微調整できます。"
    : perspective?.near ? "手前を登録済み。次は奥を登録してください。"
    : perspective?.far ? "奥を登録済み。次は手前を登録してください。" : "";
  for (const id of ["reset", "remove", "front", "back"]) byId(id).disabled = !selected;
  byId("empty").hidden = hasBackground();
  updateLayerSelect();
}
function layerSize(layer, width, height) {
  const fit = Math.min(width * .55 / layer.bitmap.width, height * .65 / layer.bitmap.height);
  return { w: layer.bitmap.width * fit * layer.pose.scale, h: layer.bitmap.height * fit * layer.pose.scale };
}
function drawShadow(target, width, height) {
  const radius = Math.min(width * .38, height * .21);
  target.save();
  target.scale(radius, radius * .28);
  const gradient = target.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, "rgba(0, 0, 0, .42)");
  gradient.addColorStop(.5, "rgba(0, 0, 0, .22)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  target.fillStyle = gradient;
  target.fillRect(-1, -1, 2, 2);
  target.restore();
}
function draw(target, width, height, showSelection = false) {
  target.fillStyle = "#202925";
  target.fillRect(0, 0, width, height);
  if (background) target.drawImage(background, 0, 0, width, height);
  else if (hasCamera()) {
    const zoom = Number(cameraZoom.value);
    const cropWidth = video.videoWidth / zoom;
    const cropHeight = video.videoHeight / zoom;
    target.drawImage(video, (video.videoWidth - cropWidth) / 2,
      (video.videoHeight - cropHeight) / 2, cropWidth, cropHeight, 0, 0, width, height);
  }
  if (showSelection && !background && hasCamera() && referenceVisible && referenceImage) {
    const scale = Math.max(width / referenceImage.width, height / referenceImage.height);
    const w = referenceImage.width * scale;
    const h = referenceImage.height * scale;
    target.save();
    target.globalAlpha = .5;
    target.drawImage(referenceImage, (width - w) / 2, (height - h) / 2, w, h);
    target.restore();
  }
  for (const layer of layers) {
    const { w, h } = layerSize(layer, width, height);
    target.save();
    target.translate(layer.pose.x * width, layer.pose.y * height);
    if (layer.anchor && layer.shadow) drawShadow(target, w, h);
    target.rotate(layer.pose.angle);
    const anchor = layer.anchor ?? center;
    const left = -w * anchor.x;
    const top = -h * anchor.y;
    target.drawImage(layer.bitmap, left, top, w, h);
    if (showSelection && layer.id === selectedId) {
      target.strokeStyle = "#f4d18c";
      target.lineWidth = Math.max(2, width / 500);
      target.setLineDash([Math.max(5, width / 100), Math.max(4, width / 140)]);
      target.strokeRect(left, top, w, h);
      if (layer.anchor) {
        target.fillStyle = "#f4d18c";
        target.beginPath();
        target.arc(0, 0, Math.max(5, width / 120), 0, 2 * Math.PI);
        target.fill();
      }
    }
    target.restore();
  }
}
function paint() { draw(context, preview.width, preview.height, true); }
function loop() { paint(); frame = requestAnimationFrame(loop); }
function setPreviewDimensions(width, height) {
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  const nextWidth = Math.max(1, Math.round(width * ratio));
  const nextHeight = Math.max(1, Math.round(height * ratio));
  if (preview.width !== nextWidth || preview.height !== nextHeight) clearPerspective();
  preview.width = nextWidth;
  preview.height = nextHeight;
  points.clear(); gestureLayer = null;
  paint();
}
function resizePreview() {
  if (background || !hasCamera()) return;
  setPreviewDimensions(video.videoWidth, video.videoHeight);
}
function stopCamera() {
  cameraRequest++;
  starting = false;
  const oldStream = stream;
  stream = undefined;
  clearPerspective();
  oldStream?.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
  cancelAnimationFrame(frame);
  points.clear(); gestureLayer = null;
  updateControls(); paint();
}
camera.addEventListener("click", async () => {
  if (stream) { stopCamera(); status("カメラを停止しました。"); return; }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    status("ChromeでHTTPSの公開URLを開いてください。"); return;
  }
  const request = ++cameraRequest;
  starting = true; updateControls();
  status("カメラへのアクセスを許可してください。");
  try {
    let opened;
    try {
      opened = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch (error) {
      if (error.name !== "OverconstrainedError") throw error;
      opened = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } });
    }
    if (request !== cameraRequest) { opened.getTracks().forEach((track) => track.stop()); return; }
    stream = opened;
    opened.getVideoTracks()[0].addEventListener("ended", () => {
      if (stream !== opened) return;
      stopCamera(); status("カメラの接続が切れました。もう一度起動してください。");
    });
    video.srcObject = opened;
    await video.play();
    if (request !== cameraRequest) return;
    if (background) { background.close(); background = undefined; backgroundRequest++; backgroundExif = {}; }
    resizePreview();
    starting = false; updateControls(); loop();
    status("背面カメラで撮影できます。");
  } catch (error) {
    if (request !== cameraRequest) return;
    stopCamera();
    const messages = {
      NotAllowedError: "Chromeのサイト設定とAndroidのアプリ設定でカメラを許可してください。",
      OverconstrainedError: "利用できる背面カメラが見つかりません。",
      NotFoundError: "利用できるカメラが見つかりません。",
      NotReadableError: "カメラを開けません。他のカメラアプリを閉じて再試行してください。"
    };
    status(messages[error.name] || "カメラを起動できませんでした。もう一度お試しください。");
  }
});
video.addEventListener("resize", resizePreview);
video.addEventListener("loadeddata", updateControls);

async function loadBackgroundFile(file, documentMode = false) {
  if (!file) return;
  const request = ++backgroundRequest;
  try {
    if (documentMode && !(/\.jpe?g$/i.test(file.name) || /image\/jpeg/i.test(file.type))) {
      status("JPEGファイルを指定してください。PNGなどは通常の『背景写真を選ぶ』から読み込めます。");
      return;
    }
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error("Not an image");
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (request !== backgroundRequest) { bitmap.close(); return; }
    const metadata = await PNGCameraExif.fromFile(file);
    if (request !== backgroundRequest) { bitmap.close(); return; }
    stopCamera();
    background?.close(); background = bitmap;
    backgroundExif = metadata;
    setPreviewDimensions(bitmap.width, bitmap.height);
    updateControls();
    const hasGPS = Number.isFinite(metadata.lat) && Number.isFinite(metadata.lon);
    const hasDate = !!metadata.date;
    status(`${documentMode ? "ファイル選択" : "写真選択"}で背景を読み込みました。ファイル: ${file.name || "名前不明"} / ${file.type || "種類不明"} / ${Math.round(file.size/1024)}KB。EXIF: 撮影日時${hasDate ? "あり" : "なし"}、GPS${hasGPS ? "あり" : "なし"}。`);
  } catch {
    if (request === backgroundRequest) status("背景写真を読み込めませんでした。JPEGやPNGなどの画像を選んでください。");
  }
}
for (const [id, documentMode] of [["background-file", false], ["background-document", true]]) {
  byId(id).addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    await loadBackgroundFile(file, documentMode);
  });
}
byId("clear-background").addEventListener("click", () => {
  backgroundRequest++; background?.close(); background = undefined; backgroundExif = {};
  clearPerspective();
  points.clear(); gestureLayer = null;
  updateControls(); paint(); status("背景写真を外しました。");
});

async function isPng(file) {
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  return header.join(",") === "137,80,78,71,13,10,26,10";
}
async function loadOverlay(file, name = file.name || "キャラクター") {
  if (layers.length >= maxLayers) { status("同時に配置できるキャラクターは3人までです。不要なキャラを外してください。"); return false; }
  const request = ++imageRequest;
  try {
    if (!await isPng(file)) throw new Error("Not PNG");
    const bitmap = await createImageBitmap(file);
    if (request !== imageRequest) { bitmap.close(); return false; }
    if (layers.length >= maxLayers) { bitmap.close(); status("キャラクターは3人までです。"); return false; }
    const layer = { id: nextId++, bitmap, name, pose: defaultPose() };
    layers.push(layer); selectedId = layer.id;
    points.clear(); gestureLayer = null;
    updateControls(); paint(); status(`「${name}」を追加しました（${layers.length}/3）。`);
    return true;
  } catch {
    if (request === imageRequest) status("PNGを読み込めませんでした。別のPNGを選んでください。");
    return false;
  }
}
byId("file").addEventListener("change", async (event) => {
  const file = event.target.files[0]; event.target.value = "";
  if (file) await loadOverlay(file);
});
layerSelect.addEventListener("change", () => {
  selectedId = Number(layerSelect.value); points.clear(); gestureLayer = null; paint(); updateControls();
});
byId("reset").addEventListener("click", () => {
  const layer = selectedLayer(); if (!layer) return;
  layer.pose = defaultPose();
  layer.perspective = undefined;
  points.clear(); gestureLayer = null; updateControls(); paint();
});
byId("remove").addEventListener("click", () => {
  const index = layers.findIndex((layer) => layer.id === selectedId);
  if (index < 0) return;
  imageRequest++;
  layers[index].bitmap.close(); layers.splice(index, 1);
  selectedId = layers.length ? layers[Math.min(index, layers.length - 1)].id : null;
  points.clear(); gestureLayer = null; updateControls(); paint(); status("選択中のキャラクターを外しました。");
});
function moveLayer(toFront) {
  const index = layers.findIndex((layer) => layer.id === selectedId);
  if (index < 0) return;
  const [layer] = layers.splice(index, 1);
  if (toFront) layers.push(layer); else layers.unshift(layer);
  updateControls(); paint();
}
byId("front").addEventListener("click", () => moveLayer(true));
byId("back").addEventListener("click", () => moveLayer(false));

function position(event) {
  const rect = preview.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * preview.width / rect.width, y: (event.clientY - rect.top) * preview.height / rect.height };
}
function imagePoint(layer, point) {
  const { w, h } = layerSize(layer, preview.width, preview.height);
  const dx = point.x - layer.pose.x * preview.width;
  const dy = point.y - layer.pose.y * preview.height;
  const cos = Math.cos(layer.pose.angle), sin = Math.sin(layer.pose.angle);
  const localX = cos * dx + sin * dy;
  const localY = -sin * dx + cos * dy;
  const anchor = layer.anchor ?? center;
  return { x: localX / w + anchor.x, y: localY / h + anchor.y };
}
function hitTest(layer, point) {
  const { x, y } = imagePoint(layer, point);
  return x >= 0 && x <= 1 && y >= 0 && y <= 1;
}
function setAnchor(layer, anchor) {
  const previous = layer.anchor ?? center;
  const next = anchor ?? center;
  const { w, h } = layerSize(layer, preview.width, preview.height);
  const dx = (next.x - previous.x) * w;
  const dy = (next.y - previous.y) * h;
  const cos = Math.cos(layer.pose.angle), sin = Math.sin(layer.pose.angle);
  layer.pose.x += (cos * dx - sin * dy) / preview.width;
  layer.pose.y += (sin * dx + cos * dy) / preview.height;
  layer.anchor = anchor;
  if (!anchor) layer.shadow = false;
  layer.perspective = undefined;
  anchorLayer = undefined;
  points.clear();
  gestureLayer = null;
  updateControls();
  paint();
}
anchorButton.addEventListener("click", () => {
  const layer = selectedLayer();
  if (!layer) return;
  anchorLayer = anchorLayer === layer.id ? undefined : layer.id;
  points.clear();
  gestureLayer = null;
  updateControls();
  status(anchorLayer === undefined ? "足元の指定をキャンセルしました。" : "選択中のキャラの靴底付近をタップしてください。拡大して微調整できます。");
});
clearAnchorButton.addEventListener("click", () => {
  const layer = selectedLayer();
  if (layer?.anchor) setAnchor(layer, undefined);
  status("足元の指定を解除しました。");
});
shadowButton.addEventListener("click", () => {
  const layer = selectedLayer();
  if (!layer?.anchor) return;
  layer.shadow = !layer.shadow;
  updateControls();
  paint();
});
function detailScale(layer) {
  return anchorDetail.height * 5 / layer.bitmap.height;
}
function drawAnchorDetail() {
  const { layer, x, y } = anchorDraft;
  const { width, height } = anchorDetail;
  const scale = detailScale(layer);
  anchorContext.fillStyle = "#525959";
  anchorContext.fillRect(0, 0, width, height);
  anchorContext.drawImage(layer.bitmap, width / 2 - x * scale, height / 2 - y * scale,
    layer.bitmap.width * scale, layer.bitmap.height * scale);
  anchorContext.beginPath();
  anchorContext.moveTo(width / 2 - 9, height / 2);
  anchorContext.lineTo(width / 2 + 9, height / 2);
  anchorContext.moveTo(width / 2, height / 2 - 9);
  anchorContext.lineTo(width / 2, height / 2 + 9);
  anchorContext.strokeStyle = "#111";
  anchorContext.lineWidth = 3;
  anchorContext.stroke();
  anchorContext.strokeStyle = "#fff";
  anchorContext.lineWidth = 1;
  anchorContext.stroke();
}
function moveAnchorDraft(dx, dy) {
  const { layer } = anchorDraft;
  anchorDraft.x = Math.max(0, Math.min(layer.bitmap.width, anchorDraft.x + dx));
  anchorDraft.y = Math.max(0, Math.min(layer.bitmap.height, anchorDraft.y + dy));
  drawAnchorDetail();
}
const anchorSteps = { left: [-1, 0], up: [0, -1], down: [0, 1], right: [1, 0] };
for (const button of anchorEditor.querySelectorAll("[data-anchor-step]")) {
  button.addEventListener("click", () => {
    const [x, y] = anchorSteps[button.dataset.anchorStep];
    const step = 3 / detailScale(anchorDraft.layer);
    moveAnchorDraft(x * step, y * step);
  });
}
anchorDetail.addEventListener("click", (event) => {
  const rect = anchorDetail.getBoundingClientRect();
  const scale = detailScale(anchorDraft.layer);
  const x = (event.clientX - rect.left) * anchorDetail.width / rect.width - anchorDetail.width / 2;
  const y = (event.clientY - rect.top) * anchorDetail.height / rect.height - anchorDetail.height / 2;
  moveAnchorDraft(x / scale, y / scale);
});
byId("confirm-anchor").addEventListener("click", () => {
  const { layer, x, y } = anchorDraft;
  setAnchor(layer, { x: x / layer.bitmap.width, y: y / layer.bitmap.height });
  anchorEditor.close("confirmed");
  status("足元を設定しました。2本指で拡大・縮小しても足元が固定されます。");
});
byId("cancel-anchor").addEventListener("click", () => anchorEditor.close());
anchorEditor.addEventListener("close", () => {
  anchorDraft = undefined;
  if (anchorEditor.returnValue !== "confirmed") {
    anchorLayer = undefined;
    updateControls();
    status("足元の指定をキャンセルしました。");
  }
});
function pickAnchor(point) {
  const layer = selectedLayer();
  if (!layer || layer.id !== anchorLayer) return false;
  if (hitTest(layer, point)) {
    const { x, y } = imagePoint(layer, point);
    anchorDraft = { layer, x: x * layer.bitmap.width, y: y * layer.bitmap.height };
    drawAnchorDetail();
    anchorEditor.returnValue = "";
    anchorEditor.showModal();
  } else {
    status("選択枠の内側で靴底をタップしてください。");
  }
  return true;
}
function clearPerspective() {
  for (const layer of layers) layer.perspective = undefined;
  updateControls();
}
function perspectiveScale(layer, y) {
  const { near, far } = layer.perspective ?? {};
  if (!near || !far) return 1;
  const t = Math.max(0, Math.min(1, (y - far.y) / (near.y - far.y)));
  return far.scale + (near.scale - far.scale) * t;
}
for (const side of ["near", "far"]) {
  byId("perspective-" + side).addEventListener("click", () => {
    const layer = selectedLayer();
    if (!layer?.anchor || !hasBackground()) return;
    const sample = { y: layer.pose.y, scale: layer.pose.scale };
    const calibration = { ...layer.perspective, [side]: sample };
    const { near, far } = calibration;
    if (near && far && (near.y - far.y < .03 || near.scale <= far.scale)) {
      status("手前は奥より画面の下側に置き、大きめにして登録してください。");
      return;
    }
    layer.perspective = calibration;
    updateControls();
    status(side === "near" ? "手前の基準を登録しました。" : "奥の基準を登録しました。");
  });
}
byId("clear-perspective").addEventListener("click", () => {
  const layer = selectedLayer();
  if (!layer) return;
  layer.perspective = undefined;
  updateControls();
  status("遠近感の設定を解除しました。");
});
function clampScale(value) {
  return Math.min(8, Math.max(.12, value));
}
function gesture() {
  const [a, b] = points.values();
  if (!b) return { x: a.x, y: a.y, distance: 0, angle: 0 };
  const dx = b.x - a.x, dy = b.y - a.y;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}
preview.addEventListener("pointerdown", (event) => {
  if (!layers.length || event.button !== 0 || points.size >= 2) return;
  const point = position(event);
  if (pickAnchor(point)) return;
  if (!points.size) {
    const picked = [...layers].reverse().find((layer) => hitTest(layer, point));
    if (!picked) return;
    selectedId = picked.id;
    gestureLayer = picked.id;
    updateControls(); paint();
  }
  if (!selectedLayer() || gestureLayer !== selectedId) return;
  preview.setPointerCapture(event.pointerId);
  points.set(event.pointerId, point);
});
preview.addEventListener("pointermove", (event) => {
  if (!points.has(event.pointerId)) return;
  const layer = selectedLayer(); if (!layer || layer.id !== gestureLayer) return;
  const before = gesture();
  points.set(event.pointerId, position(event));
  const after = gesture();
  const pose = layer.pose;
  const pinching = before.distance > 2 && after.distance > 2;
  const scale = pinching ? clampScale(pose.scale * after.distance / before.distance) : pose.scale;
  const rotation = pinching ? after.angle - before.angle : 0;
  if (layer.anchor) {
    if (points.size === 2) {
      pose.scale = scale;
      pose.angle += rotation;
    } else {
      const y = pose.y + (after.y - before.y) / preview.height;
      pose.x += (after.x - before.x) / preview.width;
      const correction = perspectiveScale(layer, y) / perspectiveScale(layer, pose.y);
      pose.scale = clampScale(pose.scale * correction);
      pose.y = y;
    }
    paint();
    return;
  }
  const dx = pose.x * preview.width - before.x;
  const dy = pose.y * preview.height - before.y;
  const factor = scale / pose.scale;
  pose.x = (after.x + factor * (dx * Math.cos(rotation) - dy * Math.sin(rotation))) / preview.width;
  pose.y = (after.y + factor * (dx * Math.sin(rotation) + dy * Math.cos(rotation))) / preview.height;
  pose.scale = scale; pose.angle += rotation;
  paint();
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  preview.addEventListener(type, (event) => {
    points.delete(event.pointerId);
    if (!points.size) gestureLayer = null;
  });
}

capture.addEventListener("click", async () => {
  if (!hasBackground() || saving) return;
  saving = true; updateControls();
  const usingBackground = !!background;
  const sourceExif = usingBackground ? {...backgroundExif} : {};
  // Capture date is the original photo's date for imported JPEGs, or shutter time for live camera.
  const date = sourceExif.date || PNGCameraExif.dateString(new Date());
  const photo = document.createElement("canvas");
  photo.width = preview.width; photo.height = preview.height;
  draw(photo.getContext("2d", { alpha: false }), photo.width, photo.height, false);
  try {
    const raw = await new Promise(resolve => photo.toBlob(resolve, "image/jpeg", .94));
    if (!raw) throw new Error("JPEGの作成に失敗しました");
    let gps = Number.isFinite(sourceExif.lat) && Number.isFinite(sourceExif.lon)
      ? {lat:sourceExif.lat,lon:sourceExif.lon} : null;
    // For camera captures, request current position. For an imported photo without GPS,
    // do not substitute the phone's current position (it may be a different place).
    if (!usingBackground && !gps) {
      status("位置情報を取得しています。許可すると撮影場所をJPEGに記録します…");
      gps = await PNGCameraExif.locate();
    }
    const blob = await PNGCameraExif.write(raw,{date,...gps});
    // Re-read the generated JPEG bytes before Android's download/share step.
    const checked = await PNGCameraExif.fromFile(new File([blob], "exif-check.jpg", {type:"image/jpeg"}));
    const savedGPS = Number.isFinite(checked.lat) && Number.isFinite(checked.lon);
    const savedDate = !!checked.date;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(blob);
    download.href = photoUrl;
    download.download = "png-camera-" + new Date().toISOString().replace(/[:.]/g, "-") + ".jpg";
    latestPhotoBlob = blob;
    latestPhotoName = download.download;
    sharePhoto.hidden = false;
    download.hidden = false; download.click();
    status(`JPEG生成後の検査: 撮影日時${savedDate ? "あり" : "なし"}、GPS${savedGPS ? "あり" : "なし"}。` +
      (gps && !savedGPS ? " EXIF書き込み・読み取り処理を確認してください。" :
      (!gps && usingBackground ? " 背景写真の選択時点でGPSを取得できていません。" : "")));
  } catch (error) {
    status("写真の保存に失敗しました: " + error.message);
  } finally {
    saving = false; updateControls();
  }
});
sharePhoto.addEventListener("click", () => {
  if (!latestPhotoBlob) {status("先に合成写真を保存してください。");return;}
  status("Androidの共有画面を呼び出しています…");
  try {
    PNGCameraStorage.share(latestPhotoBlob,latestPhotoName)
      .then(()=>status("共有画面を閉じました。保存結果は共有先で確認してください。"))
      .catch(error=>status(PNGCameraStorage.error(error)));
  } catch(error) {status(PNGCameraStorage.error(error));}
});
window.addEventListener("pagehide", (event) => {
  if (event.persisted) { stopCamera(); return; }
  referenceRequest++; referenceImage?.close();
  stopCamera(); background?.close();
  layers.forEach((layer) => layer.bitmap.close());
  if (photoUrl) URL.revokeObjectURL(photoUrl);
});
screen.orientation?.addEventListener("change", () => { points.clear(); gestureLayer = null; });
updateControls(); paint();


