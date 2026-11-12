"use strict";
(() => {
  const display = document.getElementById("offline-status");
  const setMessage = (message) => { display.textContent = message; };
  const connectionText = () => navigator.onLine ? "オンライン" : "オフライン";
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    setMessage("オフライン利用にはHTTPS上の対応ブラウザが必要です。");
    return;
  }
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "OFFLINE_READY") {
      setMessage(event.data.ready
        ? `オフライン準備完了（現在：${connectionText()}）。機内モードでも起動できます。`
        : "オフライン用ファイルが不足しています。通信可能な場所で再読み込みしてください。");
    }
  });
  const check = () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CHECK_OFFLINE" });
    } else {
      setMessage("オフライン利用の準備中です。通信可能な場所で再読み込みしてください。");
    }
  };
  navigator.serviceWorker.addEventListener("controllerchange", check);
  window.addEventListener("online", check);
  window.addEventListener("offline", check);
  navigator.serviceWorker.register("./sw.js", { scope: "./" })
    .then(() => navigator.serviceWorker.ready)
    .then(check)
    .catch(() => setMessage("オフライン準備に失敗しました。通信可能な場所で再読み込みしてください。"));
})();
