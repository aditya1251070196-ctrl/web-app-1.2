const CACHE_NAME = "traffic-sign-cache-v7"; // 🔁 bump on every deploy

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
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
self.addEventListener("install", event => {
  console.log("[SW] Installing");

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(
        ASSETS.map(
          url => new Request(url, { cache: "reload" })
        )
      )
    )
  );

  self.skipWaiting();
});

// ===========================
// ACTIVATE
// ===========================
self.addEventListener("activate", event => {
  console.log("[SW] Activated");

  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

// ===========================
// FETCH
// ===========================
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  // ✅ NETWORK-FIRST FOR HTML (CRITICAL)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put("./index.html", clone);
          });
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // ✅ CACHE-FIRST FOR EVERYTHING ELSE
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached ||
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache =>
            cache.put(event.request, clone)
          );
        }
        return response;
      })
    )
  );
});
