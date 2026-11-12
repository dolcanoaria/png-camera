"use strict";
// Version bump required whenever application shell changes.
const CACHE = "png-camera-shell-v1.4.0";
const SHELL = ["./", "./index.html", "./style.css", "./camera.js", "./library.js", "./pwa.js", "./cutout.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
const shellPaths = new Set(SHELL.map((path) => new URL(path, self.registration.scope).pathname));
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Fail installation if any required file is unavailable; do not install a partial offline app.
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("png-camera-shell-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "CHECK_OFFLINE") {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const ready = (await Promise.all(SHELL.map((path) => cache.match(new URL(path, self.registration.scope))))).every(Boolean);
      event.source?.postMessage({ type: "OFFLINE_READY", ready });
    })());
  }
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  // App shell is guaranteed by installation. Network-first permits updates online.
  if (req.mode === "navigate" || shellPaths.has(url.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(req);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(req, response.clone());
        }
        return response;
      } catch (error) {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        if (req.mode === "navigate") {
          const fallback = await cache.match(new URL("./index.html", self.registration.scope));
          if (fallback) return fallback;
        }
        throw error;
      }
    })());
  }
});
