"use strict";

const byId = (id) => document.getElementById(id);
const video = byId("video");
const preview = byId("preview");
const context = preview.getContext("2d", { alpha: false });
const camera = byId("camera");
const capture = byId("capture");
const download = byId("download");
const points = new Map();
const maxEdge = 1920;
let stream, overlay, frame, photoUrl;
let starting = false;
let saving = false;
let cameraRequest = 0;
let imageRequest = 0;
let pose = { x: .5, y: .55, scale: 1, angle: 0 };

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
  zoomText.textContent = "カメラズーム " + Number(cameraZoom.value).toFixed(1) + "×";
  paint();
});

function status(message) {
  byId("status").textContent = message;
}

function updateControls() {
  camera.disabled = starting;
  cameraZoom.disabled = starting || !stream;
  camera.textContent = stream && !starting ? "カメラを停止" : "背面カメラを起動";
  capture.disabled = starting || saving || !stream || video.readyState < 2;
  byId("reset").disabled = byId("remove").disabled = !overlay;
  byId("empty").hidden = Boolean(stream || overlay);
}

function draw(target, width, height) {
  target.fillStyle = "#202925";
  target.fillRect(0, 0, width, height);
  if (stream && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
    const zoom = Number(cameraZoom.value);
    const cropWidth = video.videoWidth / zoom;
    const cropHeight = video.videoHeight / zoom;
    target.drawImage(video, (video.videoWidth - cropWidth) / 2,
      (video.videoHeight - cropHeight) / 2, cropWidth, cropHeight, 0, 0, width, height);
  }
  if (!overlay) return;
  const fit = Math.min(width * .55 / overlay.width, height * .65 / overlay.height);
  const w = overlay.width * fit * pose.scale;
  const h = overlay.height * fit * pose.scale;
  target.save();
  target.translate(pose.x * width, pose.y * height);
  target.rotate(pose.angle);
  target.drawImage(overlay, -w / 2, -h / 2, w, h);
  target.restore();
}

function paint() {
  draw(context, preview.width, preview.height);
}

function loop() {
  paint();
  frame = requestAnimationFrame(loop);
}

function resizePreview() {
  if (!stream || !video.videoWidth || !video.videoHeight) return;
  const ratio = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
  preview.width = Math.max(1, Math.round(video.videoWidth * ratio));
  preview.height = Math.max(1, Math.round(video.videoHeight * ratio));
  points.clear();
  paint();
}

function stopCamera() {
  cameraRequest++;
  starting = false;
  const oldStream = stream;
  stream = undefined;
  oldStream?.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
  cancelAnimationFrame(frame);
  points.clear();
  updateControls();
  paint();
}

camera.addEventListener("click", async () => {
  if (stream) {
    stopCamera();
    status("カメラを停止しました。");
    return;
  }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    status("ChromeでHTTPSの公開URLを開いてください。");
    return;
  }
  const request = ++cameraRequest;
  starting = true;
  updateControls();
  status("カメラへのアクセスを許可してください。");
  try {
    const opened = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { exact: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    if (request !== cameraRequest) {
      opened.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = opened;
    opened.getVideoTracks()[0].addEventListener("ended", () => {
      if (stream !== opened) return;
      stopCamera();
      status("カメラの接続が切れました。もう一度起動してください。");
    });
    video.srcObject = opened;
    await video.play();
    if (request !== cameraRequest) return;
    resizePreview();
    starting = false;
    updateControls();
    loop();
    status("背面カメラで撮影できます。");
  } catch (error) {
    if (request !== cameraRequest) return;
    stopCamera();
    const messages = {
      NotAllowedError: "Chromeのサイト設定とAndroidのアプリ設定でカメラを許可してください。",
      OverconstrainedError: "利用できる背面カメラが見つかりません。",
      NotFoundError: "利用できる背面カメラが見つかりません。",
      NotReadableError: "カメラを開けません。他のカメラアプリを閉じて再試行してください。"
    };
    status(messages[error.name] || "カメラを起動できませんでした。もう一度お試しください。");
  }
});
video.addEventListener("resize", resizePreview);
video.addEventListener("loadeddata", updateControls);

function resetPose() {
  pose = { x: .5, y: .55, scale: 1, angle: 0 };
  points.clear();
  paint();
}

byId("file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  await loadOverlay(file);
});

async function isPng(file) {
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  return header.join(",") === "137,80,78,71,13,10,26,10";
}

async function loadOverlay(file) {
  const request = ++imageRequest;
  try {
    if (!await isPng(file)) throw new Error("PNG");
    const bitmap = await createImageBitmap(file);
    if (request !== imageRequest) {
      bitmap.close();
      return;
    }
    overlay?.close();
    overlay = bitmap;
    resetPose();
    updateControls();
    status("PNGを読み込みました。");
    return true;
  } catch {
    if (request === imageRequest) status("PNGを読み込めませんでした。別のPNGを選んでください。");
  }
  return false;
}
byId("reset").addEventListener("click", resetPose);
byId("remove").addEventListener("click", () => {
  imageRequest++;
  overlay?.close();
  overlay = undefined;
  resetPose();
  updateControls();
  status("PNGを外しました。");
});

function position(event) {
  const rect = preview.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * preview.width / rect.width,
    y: (event.clientY - rect.top) * preview.height / rect.height
  };
}

function gesture() {
  const [a, b] = points.values();
  if (!b) return { x: a.x, y: a.y, distance: 0, angle: 0 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}

preview.addEventListener("pointerdown", (event) => {
  if (!overlay || event.button !== 0 || points.size >= 2) return;
  preview.setPointerCapture(event.pointerId);
  points.set(event.pointerId, position(event));
});

preview.addEventListener("pointermove", (event) => {
  if (!points.has(event.pointerId)) return;
  const before = gesture();
  points.set(event.pointerId, position(event));
  const after = gesture();
  const pinching = before.distance > 2 && after.distance > 2;
  const scale = pinching ? Math.min(8, Math.max(.12, pose.scale * after.distance / before.distance)) : pose.scale;
  const rotation = pinching ? after.angle - before.angle : 0;
  const dx = pose.x * preview.width - before.x;
  const dy = pose.y * preview.height - before.y;
  const factor = scale / pose.scale;
  pose.x = (after.x + factor * (dx * Math.cos(rotation) - dy * Math.sin(rotation))) / preview.width;
  pose.y = (after.y + factor * (dx * Math.sin(rotation) + dy * Math.cos(rotation))) / preview.height;
  pose.scale = scale;
  pose.angle += rotation;
  paint();
});

for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  preview.addEventListener(type, (event) => points.delete(event.pointerId));
}

capture.addEventListener("click", () => {
  if (!stream || video.readyState < 2 || saving) return;
  saving = true;
  updateControls();
  const photo = document.createElement("canvas");
  photo.width = preview.width;
  photo.height = preview.height;
  draw(photo.getContext("2d", { alpha: false }), photo.width, photo.height);
  photo.toBlob((blob) => {
    saving = false;
    updateControls();
    if (!blob) {
      status("写真を作成できませんでした。もう一度お試しください。");
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(blob);
    download.href = photoUrl;
    download.download = "png-camera-" + new Date().toISOString().replace(/[:.]/g, "-") + ".jpg";
    download.hidden = false;
    download.click();
    status("写真を作成しました。保存先はChromeのダウンロードで確認できます。");
  }, "image/jpeg", .94);
});

window.addEventListener("pagehide", stopCamera);
screen.orientation?.addEventListener("change", () => points.clear());
updateControls();
paint();

