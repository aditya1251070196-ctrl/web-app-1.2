// ===========================
// PWA + TF.js Setup
// ===========================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').then((registration) => {
    // Optional: Log registration success
    console.log('SW Registered');
  });

  // 🔄 THE FIX: Listen for the "controlling" service worker to change
  // This triggers when the new SW runs clients.claim()
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload(); // Reloads the page to show the new version
    }
  });
}
tf.env().set("WEBGL_DELETE_TEXTURE_THRESHOLD", 0);

let model = null;
let labels = [];

// ===========================
// UI State
// ===========================
let isScanning = false;
let imageFromUpload = false;
let cameraRunning = false;

// ===========================
// Camera prediction state
// ===========================
let predictionInterval = null;
let predictionTimeout = null;
let predictionStats = {};
let lastFrameDataURL = null;

// ===========================
// DOM refs
// ===========================
const video = document.getElementById("video");
const detectBtn = document.getElementById("detectBtn");
const scanBtn = document.getElementById("scanBtn");

// ===========================
// Load model + labels
// ===========================
async function loadModelAndLabels() {
  if (!model) {
    model = await tf.loadLayersModel("./tfjs_lenet/model.json");
  }
  if (labels.length === 0) {
    const res = await fetch("./tfjs_lenet/labels.json");
    labels = await res.json();
  }
}

// ===========================
// Image processing
// ===========================
function processImage(source, size = 32) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const sw = source.videoWidth || source.width;
  const sh = source.videoHeight || source.height;

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, size, size);

  return canvas;
}

// ===========================
// Run prediction
// ===========================
async function runPrediction(img) {
  await loadModelAndLabels();

  const tensor = tf.browser.fromPixels(img)
    .resizeBilinear([32, 32])
    .mean(2)
    .toFloat()
    .div(255)
    .expandDims(0)
    .expandDims(-1);

  const logits = model.predict(tensor);
  const probsTensor = tf.softmax(logits);
  const probs = await probsTensor.data();

  let max = probs[0];
  let index = 0;

  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > max) {
      max = probs[i];
      index = i;
    }
  }

  tensor.dispose();
  logits.dispose();
  probsTensor.dispose();

  return {
    label: labels[index],
    confidence: max
  };
}

// ===========================
// Camera control
// ===========================
// ===========================
// 1. Safe Start Camera
// ===========================
async function startCamera() {
  if (cameraRunning) return;

  clearResult();
  
  // SAFETY CHECK: Only hide preview if it exists
  const preview = document.getElementById("cameraPreview");
  if (preview) {
    preview.style.display = "none";
  }
  
  // Enable clear button logic
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) clearBtn.disabled = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });

    video.srcObject = stream;
    await video.play();

    cameraRunning = true;
    scanBtn.disabled = false;
    imageFromUpload = false;
    detectBtn.disabled = true;

  } catch (err) {
    alert("Camera access failed or denied.");
    console.error(err);
  }
}


function stopCamera() {
  if (isScanning) {
    clearInterval(predictionInterval);
    clearTimeout(predictionTimeout);
    isScanning = false;
    showScanOverlay(false);
  }

  scanBtn.disabled = true;

  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }

  cameraRunning = false;
}


// ===========================
// Timed scan (camera) - MISSING FUNCTION
// ===========================
async function startTimedCameraPrediction(duration = 4000, interval = 250) {
  if (!cameraRunning) {
    alert("Please start the camera first");
    return;
  }

  if (isScanning) return;

  isScanning = true;
  imageFromUpload = false;
  lockButtons();

  predictionStats = {}; 
  lastFrameDataURL = null;
  clearResult();

  showScanOverlay(true);

  predictionInterval = setInterval(async () => {
    if (!video.videoWidth) return;

    // Capture frame
    const canvas = processImage(video);
    lastFrameDataURL = canvas.toDataURL();

    const img = new Image();
    img.src = lastFrameDataURL;
    await img.decode();

    // Predict
    const { label, confidence } = await runPrediction(img);

    // Track stats
    if (!predictionStats[label]) {
      predictionStats[label] = { sum: 0, count: 0 };
    }
    predictionStats[label].sum += confidence;
    predictionStats[label].count += 1;

    setResult(`Detecting: ${label} (${toPercent(confidence)})`);
  }, interval);

  predictionTimeout = setTimeout(stopTimedPrediction, duration);
}
// ===========================
// 2. Safe Stop Prediction
// ===========================
// [file: script.js] - Replace the existing stopTimedPrediction function

function stopTimedPrediction() {
  clearInterval(predictionInterval);
  clearTimeout(predictionTimeout);
  stopCamera();

  let finalLabel = "Unknown";
  let bestAvgConfidence = 0;

  // Calculate best result from the scan
  for (const label in predictionStats) {
    const avg = predictionStats[label].sum / predictionStats[label].count;
    if (avg > bestAvgConfidence) {
      bestAvgConfidence = avg;
      finalLabel = label;
    }
  }

  const confStr = toPercent(bestAvgConfidence);

  //setResult(`Detected: ${finalLabel}\nConfidence: ${confStr}`);
  showMatchResult(finalLabel, confStr);
  // Send Notification
  sendSafetyNotification(finalLabel, confStr);

  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200]);
  }

  // Show the last frame in the preview area
  if (lastFrameDataURL) {
    const preview = document.getElementById("cameraPreview");
    if (preview) {
      preview.src = lastFrameDataURL;
      preview.style.display = "block";
    }

    // --- NEW: Add to History ---
    // We pass the captured camera frame (lastFrameDataURL)
    addToHistory(finalLabel, confStr);
    // ---------------------------
  }

  showScanOverlay(false);
  isScanning = false;
  unlockButtons(true, false);
  
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) clearBtn.disabled = false;
}



// ===========================
// Finalize camera scan
// ===========================


// ===========================
// File upload handler (THE CORRECT VERSION)
// ===========================
function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  // UI References
  const block = document.getElementById("uploadBlock");
  const placeholder = document.getElementById("uploadPlaceholder");
  const previewImg = document.getElementById("preview");
  const processedImg = document.getElementById("processedPreview");

  if (!block || !placeholder || !previewImg) {
    console.error("UI elements missing");
    return;
  }
  
  document.getElementById("clearBtn").disabled = false;

  imageFromUpload = true;
  lockButtons(false, false);
  
  clearResult();

  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      // 1. Process image for AI
      const canvas = processImage(img);
      processedImg.src = canvas.toDataURL();

      // 2. Update UI: Expand the block
      previewImg.src = ev.target.result;
      
      // Toggle visibility
      placeholder.style.display = "none";
      previewImg.style.display = "block";
      
      // Update container style
      block.classList.add("has-image");
      
      // Enable Detect button
      unlockButtons(true, true);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ===========================
// Detect (UPLOAD ONLY)
// ===========================
// [file: script.js] - Replace the existing detectImage function

async function detectImage() {
  if (!imageFromUpload || isScanning) return;

  const img = document.getElementById("processedPreview");
  if (!img.src) return;

  lockButtons();
  const { label, confidence } = await runPrediction(img);
  
  const confStr = toPercent(confidence);

  //setResult(`Detected: ${label}\nConfidence: ${confStr}`);
  showMatchResult(label, confStr);
  sendSafetyNotification(label, confStr);

  // --- NEW: Add to History ---
  // We use the original 'preview' (high quality) instead of 'processedPreview' (blurry)
  const displayImage = document.getElementById("preview").src;
  addToHistory(label, confStr);
  // ---------------------------

  unlockButtons(true, true);
}


// ===========================
// Helpers & UI Logic
// ===========================

function lockButtons(scan = false, detect = false) {
  scanBtn.disabled = scan || isScanning;
  detectBtn.disabled = detect || !imageFromUpload || isScanning;
}

function unlockButtons(scan = true, detect = false) {
  scanBtn.disabled = !scan;
  detectBtn.disabled = !detect;
}

// --- FIX 1: Updated to match your new index.html ---
function clearResult() {
  // Hide the result container instead of trying to clear text
  const container = document.getElementById("resultContainer");
  if (container) {
    container.style.display = "none";
  }
}

// Note: 'setResult' is no longer needed because we use showMatchResult, 
// but we keep an empty one just in case old code calls it.
function setResult(text) { 
  console.log("Status:", text); 
}

function showScanOverlay(show) {
  document.getElementById("scanOverlay").classList.toggle("hidden", !show);
}

function toPercent(value) {
  return (value * 100).toFixed(1) + "%";
}

// ===========================
// Sidebar & History Logic
// ===========================

function toggleSidebar() {
  const sidebar = document.getElementById("historySidebar");
  sidebar.classList.toggle("open");
}

// --- FIX 2: Corrected History Function (Standard Image Version) ---
function addToHistory(label, confidence) {
  const list = document.getElementById("sidebarList");
  if (!list) return;

  // 1. Get Data from safety-logic.js (Standard Reference)
  const data = SIGN_NOTIFICATIONS[label] || SIGN_NOTIFICATIONS["default"];
  const standardImage = data.img || "./icons/icon-192.png"; 
  const description = data.body;
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 2. Create Card
  const item = document.createElement("div");
  item.className = "history-item";

  item.innerHTML = `
    <img src="${standardImage}" class="history-thumb" alt="Reference">
    <div class="history-details">
      <span class="history-label">${data.title}</span>
      <span class="history-match-rate">Match: ${confidence}</span>
      <span class="history-time">${timeStr}</span>
    </div>
  `;

  // 3. Add to list
  list.insertBefore(item, list.firstChild);
  if (list.children.length > 10) list.removeChild(list.lastChild);
}

// ===========================
// Result Display Logic
// ===========================

function showMatchResult(label, confidenceStr) {
  const container = document.getElementById("resultContainer");
  const labelEl = document.getElementById("resultLabel");
  const confEl = document.getElementById("resultConfidence");
  const imgEl = document.getElementById("refImage");
  const descEl = document.getElementById("refDescription");

  // 1. Get Data from Safety Logic
  const data = SIGN_NOTIFICATIONS[label] || SIGN_NOTIFICATIONS["default"];

  // 2. Update Text
  labelEl.innerText = data.title; // Show nice title (e.g. "Speed Zone 50")
  confEl.innerText = `Confidence: ${confidenceStr}`;
  descEl.innerText = data.body;

  // 3. Update Image
  imgEl.src = data.img || "./icons/icon-192.png"; 

  // 4. Show the container
  container.style.display = "block";
}

// ===========================
// Initialization
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  const imageInput = document.getElementById("imageInput");
  if (imageInput) {
    imageInput.addEventListener("change", handleImageUpload);
  }
});

// Expose functions to HTML
window.startCamera = startCamera;
window.startTimedCameraPrediction = startTimedCameraPrediction;
window.stopCamera = stopCamera;
window.detectImage = detectImage;
window.clearInput = clearInput;
window.hardRefresh = hardRefresh;
window.toggleSidebar = toggleSidebar;

function clearInput() {
  // 1. Reset the actual file input
  const fileInput = document.getElementById("imageInput");
  if (fileInput) {
    fileInput.value = ""; 
  }

  // 2. Reset the Upload UI Elements
  const block = document.getElementById("uploadBlock");
  const placeholder = document.getElementById("uploadPlaceholder");
  const previewImg = document.getElementById("preview");
  const processedImg = document.getElementById("processedPreview");

  if (block) block.classList.remove("has-image");
  if (placeholder) placeholder.style.display = "flex"; 
  if (previewImg) {
    previewImg.style.display = "none";
    previewImg.src = ""; 
  }
  if (processedImg) processedImg.src = "";

  // 3. Reset the Camera Preview (The Fix)
  const cameraPreview = document.getElementById("cameraPreview");
  if (cameraPreview) {
    cameraPreview.style.display = "none";
    cameraPreview.src = "";
  }

  // 4. Hide the result container 
  const resultContainer = document.getElementById("resultContainer");
  if (resultContainer) {
    resultContainer.style.display = "none";
  }

  // 5. Reset Logic State
  imageFromUpload = false;

  // 6. Reset Buttons
  const detectBtn = document.getElementById("detectBtn");
  if (detectBtn) detectBtn.disabled = true; 
  
  // Disable the clear button itself since everything is cleared
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) clearBtn.disabled = true;

  console.log("Input, camera preview, and results cleared.");
}

// ===========================
// Utility: Hard Refresh (Nuclear Option)
// ===========================
async function hardRefresh() {
  if (confirm("This will clear all stored data and fetch the latest version. Continue?")) {
    try {
      // 1. Unregister Service Worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
      }

      // 2. Delete All Caches
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys.map(key => caches.delete(key))
        );
      }

      // 3. Force Reload
      // window.location.reload(true) is deprecated in some browsers but still works in many.
      // Since we cleared the cache above, a normal reload is effectively a hard reload now.
      window.location.reload(); 

    } catch (error) {
      console.error("Hard refresh failed:", error);
      alert("Error clearing cache. Please manually clear browser data.");
    }
  }
}



