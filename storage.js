"use strict";
// Android Chrome: only user-selected sharing targets can save into Pictures.
window.PNGCameraStorage = {
  share(blob, filename) {
    const file = new File([blob], filename, {type: blob.type || "application/octet-stream"});
    if (!window.isSecureContext) throw new Error("HTTPS接続が必要です。");
    if (typeof navigator.share !== "function") throw new Error("このChromeでは共有機能を利用できません。");
    if (typeof navigator.canShare === "function" && !navigator.canShare({files:[file]})) throw new Error("この端末は画像ファイルの共有に対応していません。");
    // Call synchronously in the button's user-activation handler.
    return navigator.share({files:[file], title:filename});
  },
  canvasPngBlobSync(canvas) {
    const encoded = canvas.toDataURL("image/png").split(",")[1];
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes], {type:"image/png"});
  },
  error(error) {
    if (error?.name === "AbortError") return "共有をキャンセルしました。";
    return `共有できませんでした：${error?.name || "Error"} / ${error?.message || "原因不明"}`;
  }
};
