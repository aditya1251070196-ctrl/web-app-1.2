const CACHE_NAME = "traffic-sign-app-v23";// 🔁 bump on every deploy

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./safety-logic.js",
  "./manifest.json",
  "./tf.min.js",
  // --- Reference Images (Explicit List) ---
  "./images/reference/Bumpy road.jpg",
  "./images/reference/ahead_only.jpg",
  "./images/reference/beaware_ice.jpg",
  "./images/reference/bicycle_crossing.jpg",
  "./images/reference/child_crossing.jpg",
  "./images/reference/dang_left.jpg",
  "./images/reference/dang_right.jpg",
  "./images/reference/double_curve.jpg",
  "./images/reference/end_limit.jpg",
  "./images/reference/end_passing.jpg",
  "./images/reference/end_passing_3.5.jpg",
  "./images/reference/end_speed_80.jpg",
  "./images/reference/general_caution.jpg",
  "./images/reference/keep_left.jpg",
  "./images/reference/keep_right.jpg",
  "./images/reference/no_entry.jpg",
  "./images/reference/no_passing.jpg",
  "./images/reference/no_passing_3.5.jpg",
  "./images/reference/no_vehicles.jpg",
  "./images/reference/pedestrian.jpg",
  "./images/reference/priority_road.jpg",
  "./images/reference/right_to_way.jpg",
  "./images/reference/road_narrow_right.jpg",
  "./images/reference/road_work.jpg",
  "./images/reference/round_madetory.jpg",
  "./images/reference/slip_road.jpg",
  "./images/reference/speed_100.jpg",
  "./images/reference/speed_120.jpg",
  "./images/reference/speed_20.jpg",
  "./images/reference/speed_30.jpg",
  "./images/reference/speed_50.jpg",
  "./images/reference/speed_60.jpg",
  "./images/reference/speed_70.jpg",
  "./images/reference/speed_80.jpg",
  "./images/reference/stop.jpg",
  "./images/reference/straight_or_left.jpg",
  "./images/reference/straight_or_right.jpg",
  "./images/reference/traffic_lights.jpg",
  "./images/reference/turn_left.jpg",
  "./images/reference/turn_right.jpg",
  "./images/reference/vehicles_3.5_prohibited.jpg",
  "./images/reference/wild_animals.jpg",
  "./images/reference/yield.jpg",

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







