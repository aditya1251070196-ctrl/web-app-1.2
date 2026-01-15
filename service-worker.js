const CACHE_NAME = "traffic-sign-app-v8";// 🔁 bump on every deploy

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./safety-logic.js",
  "./manifest.json",
  "./tf.min.js",

  "./icons/icon-192.png",
  "./icons/icon-512.png",

  "./tfjs_lenet/model.json",
  "./tfjs_lenet/labels.json",
  "./tfjs_lenet/group1-shard1of3.bin",
  "./tfjs_lenet/group1-shard2of3.bin",
  "./tfjs_lenet/group1-shard3of3.bin"
];

// ===========================
// INSTALL (ATOMIC)
// ===========================
self.addEventListener("install", (e) => {
  console.log("[SW] Installing new version:", CACHE_NAME);
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  // Force this new service worker to become active immediately
  self.skipWaiting(); 
});


// ===========================
// ACTIVATE
// ===========================
self.addEventListener("activate", (e) => {
  console.log("[SW] Activated. Cleaning old caches...");
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  // Take control of all open tabs immediately
  return self.clients.claim(); 
});


// ===========================
// FETCH
// ===========================
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      // Return cached file if found, otherwise go to network
      return response || fetch(e.request);
    })
  );
});

