"use strict";

const byId = (id) => document.getElementById(id);
const video = byId("video");
const preview = byId("preview");
const context = preview.getContext("2d", { alpha: false });
const camera = byId("camera");
const capture = byId("capture");
const download = byId("download");
const layerSelect = byId("layer-select");
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
  camera.textContent = stream && !starting ? "カメラを停止" : "背面カメラを起動";
  capture.disabled = starting || saving || !hasBackground();
  byId("clear-background").disabled = !background;
  const selected = !!selectedLayer();
  for (const id of ["reset", "remove", "front", "back"]) byId(id).disabled = !selected;
  byId("empty").hidden = hasBackground();
  updateLayerSelect();
}
function layerSize(layer, width, height) {
  const fit = Math.min(width * .55 / layer.bitmap.width, height * .65 / layer.bitmap.height);
  return { w: layer.bitmap.width * fit * layer.pose.scale, h: layer.bitmap.height * fit * layer.pose.scale };
}
function draw(target, width, height, showSelection = false) {
  target.fillStyle = "#202925";
  target.fillRect(0, 0, width, height);
  if (background) target.drawImage(background, 0, 0, width, height);
  else if (hasCamera()) target.drawImage(video, 0, 0, width, height);
  for (const layer of layers) {
    const { w, h } = layerSize(layer, width, height);
    target.save();
    target.translate(layer.pose.x * width, layer.pose.y * height);
    target.rotate(layer.pose.angle);
    target.drawImage(layer.bitmap, -w / 2, -h / 2, w, h);
    if (showSelection && layer.id === selectedId) {
      target.strokeStyle = "#f4d18c";
      target.lineWidth = Math.max(2, width / 500);
      target.setLineDash([Math.max(5, width / 100), Math.max(4, width / 140)]);
      target.strokeRect(-w / 2, -h / 2, w, h);
    }
    target.restore();
  }
}
function paint() { draw(context, preview.width, preview.height, true); }
function loop() { paint(); frame = requestAnimationFrame(loop); }
function setPreviewDimensions(width, height) {
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  preview.width = Math.max(1, Math.round(width * ratio));
  preview.height = Math.max(1, Math.round(height * ratio));
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
    if (background) { background.close(); background = undefined; backgroundRequest++; }
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

byId("background-file").addEventListener("change", async (event) => {
  const file = event.target.files[0]; event.target.value = "";
  if (!file) return;
  const request = ++backgroundRequest;
  try {
    if (!file.type.startsWith("image/")) throw new Error("Not an image");
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (request !== backgroundRequest) { bitmap.close(); return; }
    stopCamera();
    background?.close(); background = bitmap;
    setPreviewDimensions(bitmap.width, bitmap.height);
    updateControls(); status("背景写真を読み込みました。キャラクターを配置して保存できます。");
  } catch {
    if (request === backgroundRequest) status("背景写真を読み込めませんでした。JPEGやPNGなどの画像を選んでください。");
  }
});
byId("clear-background").addEventListener("click", () => {
  backgroundRequest++; background?.close(); background = undefined;
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
  layer.pose = defaultPose(); points.clear(); gestureLayer = null; paint();
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
function hitTest(layer, point) {
  const { w, h } = layerSize(layer, preview.width, preview.height);
  const dx = point.x - layer.pose.x * preview.width;
  const dy = point.y - layer.pose.y * preview.height;
  const cos = Math.cos(layer.pose.angle), sin = Math.sin(layer.pose.angle);
  const localX = cos * dx + sin * dy;
  const localY = -sin * dx + cos * dy;
  return Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2;
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
  const scale = pinching ? Math.min(8, Math.max(.12, pose.scale * after.distance / before.distance)) : pose.scale;
  const rotation = pinching ? after.angle - before.angle : 0;
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

capture.addEventListener("click", () => {
  if (!hasBackground() || saving) return;
  saving = true; updateControls();
  const photo = document.createElement("canvas");
  photo.width = preview.width; photo.height = preview.height;
  draw(photo.getContext("2d", { alpha: false }), photo.width, photo.height, false);
  photo.toBlob((blob) => {
    saving = false; updateControls();
    if (!blob) { status("写真を作成できませんでした。もう一度お試しください。"); return; }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(blob);
    download.href = photoUrl;
    download.download = "png-camera-" + new Date().toISOString().replace(/[:.]/g, "-") + ".jpg";
    download.hidden = false; download.click();
    status("合成写真を作成しました。元の写真は変更されません。Chromeのダウンロードで確認できます。");
  }, "image/jpeg", .94);
});
window.addEventListener("pagehide", () => {
  stopCamera(); background?.close();
  layers.forEach((layer) => layer.bitmap.close());
  if (photoUrl) URL.revokeObjectURL(photoUrl);
});
screen.orientation?.addEventListener("change", () => { points.clear(); gestureLayer = null; });
updateControls(); paint();
