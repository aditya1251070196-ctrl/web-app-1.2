// ===========================
// 🔔 Safety Notification Configuration
// ===========================
const SIGN_NOTIFICATIONS = {
  // --- Speed Limits ---
  "Speed limit (20km/h)": { title: "Speed Zone: 20km/h", body: "⚠️ Slow down. Strictly maintain 20 km/h or less." },
  "Speed limit (30km/h)": { title: "Speed Zone: 30km/h", body: "Drive carefully. Limit is 30 km/h." },
  "Speed limit (50km/h)": { title: "Speed Zone: 50km/h", body: "Standard urban limit. Watch for cross traffic." },
  "Speed limit (60km/h)": { title: "Speed Zone: 60km/h", body: "Maintain 60 km/h max. Check speedometer." },
  "Speed limit (70km/h)": { title: "Speed Zone: 70km/h", body: "Limit is 70 km/h. Watch for merging traffic." },
  "Speed limit (80km/h)": { title: "Speed Zone: 80km/h", body: "Limit is 80 km/h. Maintain safe following distance." },
  "End of speed limit (80km/h)": { title: "End of 80km/h Zone", body: "Speed limit has changed. Adjust speed accordingly." },
  "Speed limit (100km/h)": { title: "Speed Zone: 100km/h", body: "Highway speed. Keep right unless passing." },
  "Speed limit (120km/h)": { title: "Speed Zone: 120km/h", body: "High speed zone. Maintain focus and safe distance." },

  // --- Prohibitions ---
  "No passing": { title: "⛔ No Passing", body: "Do not overtake other vehicles in this zone." },
  "No passing for vehicles over 3.5 metric tons": { title: "⛔ No Heavy Truck Passing", body: "Heavy vehicles strictly prohibited from overtaking." },
  "No vehicles": { title: "⛔ Road Closed to Vehicles", body: "No vehicles allowed beyond this point." },
  "Vehicles over 3.5 metric tons prohibited": { title: "⛔ No Heavy Trucks", body: "Weight limit in effect. Heavy trucks not allowed." },
  "No entry": { title: "⛔ NO ENTRY", body: "Wrong way! Do not enter this road." },

  // --- Priority & Warnings ---
  "Right-of-way at the next intersection": { title: "Priority Intersection", body: "You have the right-of-way at the upcoming junction." },
  "Priority road": { title: "Priority Road", body: "You have right-of-way on this road." },
  "Yield": { title: "⚠️ YIELD Ahead", body: "Slow down. Prepare to stop for other traffic." },
  "Stop": { title: "🛑 STOP Sign Detected", body: "FULL STOP required. Check left, right, then left again." },
  "General caution": { title: "⚠️ General Caution", body: "Hazard ahead. Drive with extra care." },
  "Dangerous curve to the left": { title: "↩️ Sharp Left Curve", body: "Slow down before the bend." },
  "Dangerous curve to the right": { title: "↪️ Sharp Right Curve", body: "Slow down before the bend." },
  "Double curve": { title: "⚠️ Double Curve", body: "Winding road ahead. Reduce speed." },
  "Bumpy road": { title: "⚠️ Bumpy Road", body: "Uneven surface. Slow down to avoid damage." },
  "Slippery road": { title: "❄️ Slippery Surface", body: "Risk of skidding. Avoid sudden braking or steering." },
  "Road narrows on the right": { title: "⚠️ Road Narrows", body: "Merge left safely. Lane ends." },
  "Road work": { title: "🚧 Road Work Ahead", body: "Watch for workers and equipment. Reduce speed." },
  "Traffic signals": { title: "🚦 Traffic Signals", body: "Be prepared to stop at lights ahead." },
  "Pedestrians": { title: "🚶 Pedestrians Crossing", body: "Yield to people crossing the street." },
  "Children crossing": { title: "🚸 School Zone / Children", body: "CAUTION: Children nearby. Drive very slowly." },
  "Bicycles crossing": { title: "🚲 Cycle Crossing", body: "Watch for cyclists crossing the road." },
  "Beware of ice/snow": { title: "❄️ Ice / Snow Warning", body: "Road may be frozen. drive with extreme caution." },
  "Wild animals crossing": { title: "🦌 Wildlife Crossing", body: "Watch for deer or other animals on road." },

  // --- End of Restrictions ---
  "End of all speed and passing limits": { title: "✅ Restrictions End", body: "Standard traffic rules apply. Drive safely." },
  "End of no passing": { title: "✅ Passing Allowed", body: "You may overtake when safe to do so." },
  "End of no passing by vehicles over 3.5 metric tons": { title: "✅ Truck Passing Allowed", body: "Heavy vehicles may overtake when safe." },

  // --- Directions ---
  "Turn right ahead": { title: "➡️ Turn Right", body: "Prepare to turn right." },
  "Turn left ahead": { title: "⬅️ Turn Left", body: "Prepare to turn left." },
  "Ahead only": { title: "⬆️ Straight Only", body: "Do not turn. Continue straight." },
  "Go straight or right": { title: "⬆️➡️ Straight or Right", body: "Allowed directions: Straight or Right." },
  "Go straight or left": { title: "⬆️⬅️ Straight or Left", body: "Allowed directions: Straight or Left." },
  "Keep right": { title: "↘️ Keep Right", body: "Pass obstacle on the right side." },
  "Keep left": { title: "↙️ Keep Left", body: "Pass obstacle on the left side." },
  "Roundabout mandatory": { title: "🔄 Roundabout", body: "Yield to traffic in circle. Enter counter-clockwise." }
};

const DEFAULT_NOTIFICATION = {
  title: "Traffic Sign Detected",
  body: "Please verify the sign visually while driving."
};

// Global State
let isSafetyEnabled = false;

// ===========================
// 2. Initialize (Run on Load)
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("notifyToggle");
  const savedPref = localStorage.getItem("safety_notifications_enabled");
  
  if (savedPref === "true" && Notification.permission === "granted") {
    isSafetyEnabled = true;
    if (toggle) toggle.checked = true;
  } else {
    isSafetyEnabled = false;
    if (toggle) toggle.checked = false;
  }
});

// ===========================
// 3. Toggle Action (Called by Switch)
// ===========================
async function toggleSafetyNotifications() {
  const toggle = document.getElementById("notifyToggle");
  
  if (toggle.checked) {
    // --- TURNING ON ---
    if (!("Notification" in window)) {
      alert("⚠️ Notifications are not supported in this browser.");
      toggle.checked = false;
      return;
    }

    if (Notification.permission === "denied") {
      alert("⚠️ Notifications are blocked! Please enable them in your browser settings (Top left lock icon).");
      toggle.checked = false;
      return;
    }

    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toggle.checked = false; // User said no
        return;
      }
    }

    // Success!
    isSafetyEnabled = true;
    localStorage.setItem("safety_notifications_enabled", "true");
    
    // SEND TEST NOTIFICATION
    new Notification("Safety Alerts Active", {
      body: "System is ready to warn you.",
      icon: "./icons/icon-192.png"
    });

  } else {
    // --- TURNING OFF ---
    isSafetyEnabled = false;
    localStorage.setItem("safety_notifications_enabled", "false");
  }
}
// ===========================
// 4. Send Function (Forced Simple Mode)
// ===========================
// [file: safety-logic.js]
// Replace your existing sendSafetyNotification function with this:

function sendSafetyNotification(label, confidenceStr) {
  // 1. MASTER CHECK: If toggle is off, do nothing.
  if (!isSafetyEnabled) {
    console.log("Notification skipped: Safety Mode is OFF");
    return;
  }

  // 2. Browser Permission Check
  if (Notification.permission !== "granted") {
    console.log("Notification skipped: Permission not granted");
    return;
  }

  // 3. Prepare Data
  const noteData = SIGN_NOTIFICATIONS[label] || DEFAULT_NOTIFICATION;
  const title = noteData.title || `Detected: ${label}`;
  
  const options = {
    body: `${noteData.body}\n(Confidence: ${confidenceStr})`,
    icon: './icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'safety-scan-tag', 
    renotify: true
  };

  // 4. ROBUST DELIVERY: Use Service Worker if available
  // This fixes the issue where notifications fail on Android/Deployed sites
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification(title, options);
    }).catch(err => {
      console.error("SW Notification failed, trying fallback:", err);
      // Fallback for systems where SW isn't ready
      new Notification(title, options);
    });
  } else {
    // Fallback for older browsers
    new Notification(title, options);
  }
}
// ===========================
// 5. CRITICAL: EXPOSE TO HTML
// ===========================
window.toggleSafetyNotifications = toggleSafetyNotifications;

window.sendSafetyNotification = sendSafetyNotification;
