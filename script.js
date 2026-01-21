// ===========================
// PWA + TF.js Setup
// ===========================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').then((registration) => {
    console.log('SW Registered');
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload(); 
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
// Image processing (UPDATED FOR CROP)
// ===========================
function processImage(source, size = 32) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // 1. Handle Camera Stream (Crop to Guide Box)
  if (source.tagName === "VIDEO") {
    const vw = source.videoWidth;
    const vh = source.videoHeight;
    
    // In CSS, the guide box is roughly 60% of the container.
    // We calculate the shortest dimension of the video to center the crop.
    const minDim = Math.min(vw, vh);
    
    // The Crop Size: 60% of the smallest dimension 
    // This matches your .guide-box { width: 60% } in CSS
    const cropSize = minDim * 0.60; 

    // Calculate center coordinates
    const sx = (vw - cropSize) / 2;
    const sy = (vh - cropSize) / 2;

    // Draw only the cropped area into the 32x32 canvas
    ctx.drawImage(source, sx, sy, cropSize, cropSize, 0, 0, size, size);
  } 
  // 2. Handle Uploaded Images (Use Full Image)
  else {
    // For uploads, we usually want the whole image as the user likely cropped it already
    // or the subject is the main focus.
    ctx.drawImage(source, 0, 0, size, size);
  }

  return canvas;
}

// ===========================
// Run prediction
// ===========================
async function runPrediction(img) {
  await loadModelAndLabels();

  // Note: 'img' here is already the processed 32x32 canvas from processImage
  const tensor = tf.browser.fromPixels(img)
    // No need to resize here as canvas is already 32x32, but keeping it is safe
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
async function startCamera() {
  if (cameraRunning) return;

  clearResult();
  
  // ... (existing code: preview hiding, clearBtn disabling) ...

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

    // --- NEW CODE: Update Button UI ---
    const toggleBtn = document.getElementById("camToggleBtn");
    if (toggleBtn) {
      toggleBtn.innerText = "🛑 Stop Camera";
      // Optional: Change style to look like a 'danger' button
      // toggleBtn.classList.remove("btn-secondary");
      // toggleBtn.classList.add("btn-primary"); 
    }
    // ----------------------------------

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

  // --- NEW CODE: Reset Button UI ---
  const toggleBtn = document.getElementById("camToggleBtn");
  if (toggleBtn) {
    toggleBtn.innerText = "📸 Open Cam";
    // Optional: Revert style
    // toggleBtn.classList.add("btn-secondary");
    // toggleBtn.classList.remove("btn-primary");
  }
  // ---------------------------------
}

// ===========================
// Camera Toggle Logic
// ===========================
function toggleCamera() {
  if (cameraRunning) {
    stopCamera();
  } else {
    startCamera();
  }
}

// ===========================
// Timed scan (camera)
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

    // Capture frame (Now crops to guide box)
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

    // Use a simpler status update if needed
    // console.log(`Scanning: ${label} ${toPercent(confidence)}`);
  }, interval);

  predictionTimeout = setTimeout(stopTimedPrediction, duration);
}

// ===========================
// Safe Stop Prediction
// ===========================
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

  // THRESHOLD CHECK
  if (bestAvgConfidence < 0.60) {
    finalLabel = "Unknown";
  }

  const confStr = toPercent(bestAvgConfidence);

  showMatchResult(finalLabel, confStr);
  speakSign(finalLabel);
  
  if (finalLabel !== "Unknown") {
    sendSafetyNotification(finalLabel, confStr);
  }

  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200]);
  }

  if (lastFrameDataURL) {
    const preview = document.getElementById("cameraPreview");
    if (preview) {
      // This will now show the CROPPED image, confirming to the user what was seen
      preview.src = lastFrameDataURL; 
      preview.style.display = "block";
    }
    addToHistory(finalLabel, confStr);
  }

  showScanOverlay(false);
  isScanning = false;
  unlockButtons(true, false);
  
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) clearBtn.disabled = false;
}

// ===========================
// File upload handler
// ===========================
function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const block = document.getElementById("uploadBlock");
  const placeholder = document.getElementById("uploadPlaceholder");
  const previewImg = document.getElementById("preview");
  const processedImg = document.getElementById("processedPreview");

  if (!block || !placeholder || !previewImg) return;
  
  document.getElementById("clearBtn").disabled = false;

  imageFromUpload = true;
  lockButtons(false, false);
  clearResult();

  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      // Process image for AI (No crop for uploads)
      const canvas = processImage(img);
      processedImg.src = canvas.toDataURL();

      previewImg.src = ev.target.result;
      placeholder.style.display = "none";
      previewImg.style.display = "block";
      block.classList.add("has-image");
      unlockButtons(true, true);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ===========================
// Detect (UPLOAD ONLY)
// ===========================
async function detectImage() {
  if (!imageFromUpload || isScanning) return;

  const img = document.getElementById("processedPreview");
  if (!img.src) return;

  lockButtons();
  
  let { label, confidence } = await runPrediction(img);
  
  if (confidence < 0.60) {
    label = "Unknown";
  }
  
  const confStr = toPercent(confidence);

  showMatchResult(label, confStr);
  speakSign(label);
  
  if (label !== "Unknown") {
    sendSafetyNotification(label, confStr);
  }

  addToHistory(label, confStr);
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

function clearResult() {
  const container = document.getElementById("resultContainer");
  if (container) {
    container.style.display = "none";
  }
}

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
// Sidebar & History
// ===========================
function toggleSidebar() {
  const sidebar = document.getElementById("historySidebar");
  sidebar.classList.toggle("open");
}

function addToHistory(label, confidence) {
  const list = document.getElementById("sidebarList");
  if (!list) return;

  // Ensure SIGN_NOTIFICATIONS is available (from safety-logic.js)
  const data = (typeof SIGN_NOTIFICATIONS !== 'undefined' && SIGN_NOTIFICATIONS[label]) 
    ? SIGN_NOTIFICATIONS[label] 
    : { title: label, body: "No details available", img: "./icons/icon-192.png" };
    
  // Use default if match is Unknown
  const displayTitle = label === "Unknown" ? "Unknown Sign" : data.title;
  const standardImage = data.img || "./icons/icon-192.png"; 

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const item = document.createElement("div");
  item.className = "history-item";

  item.innerHTML = `
    <img src="${standardImage}" class="history-thumb" alt="Reference">
    <div class="history-details">
      <span class="history-label">${displayTitle}</span>
      <span class="history-match-rate">Match: ${confidence}</span>
      <span class="history-time">${timeStr}</span>
    </div>
  `;

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

  const data = (typeof SIGN_NOTIFICATIONS !== 'undefined' && SIGN_NOTIFICATIONS[label]) 
    ? SIGN_NOTIFICATIONS[label] 
    : SIGN_NOTIFICATIONS["default"];

  labelEl.innerText = data.title;
  confEl.innerText = `Confidence: ${confidenceStr}`;
  descEl.innerText = data.body;
  imgEl.src = data.img || "./icons/icon-192.png"; 

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
window.toggleCamera = toggleCamera;
window.detectImage = detectImage;
window.clearInput = clearInput;
window.hardRefresh = hardRefresh;
window.toggleSidebar = toggleSidebar;

// ===========================
// Utility: Clear/Reset
// ===========================
function clearInput() {
  const fileInput = document.getElementById("imageInput");
  if (fileInput) fileInput.value = ""; 

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

  const cameraPreview = document.getElementById("cameraPreview");
  if (cameraPreview) {
    cameraPreview.style.display = "none";
    cameraPreview.src = "";
  }

  const resultContainer = document.getElementById("resultContainer");
  if (resultContainer) {
    resultContainer.style.display = "none";
  }

  imageFromUpload = false;
  const detectBtn = document.getElementById("detectBtn");
  if (detectBtn) detectBtn.disabled = true; 
  
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) clearBtn.disabled = true;
}

// ===========================
// Utility: Hard Refresh
// ===========================
async function hardRefresh() {
  if (confirm("Clear data and refresh?")) {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) await registration.unregister();
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      window.location.reload(); 
    } catch (error) {
      console.error(error);
      window.location.reload();
    }
  }
}

// ===========================
// Voice Assistant
// ===========================
let isVoiceEnabled = false; 

function speakSign(label) {
  if (!isVoiceEnabled || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  let textToSay = "";

  if (label === "Unknown") {
    textToSay = "Unknown sign. Please rescan.";
  } else {
    const noteData = (typeof SIGN_NOTIFICATIONS !== 'undefined') ? SIGN_NOTIFICATIONS[label] : null;
    if (noteData && noteData.body) {
      textToSay = `${label}. ${noteData.body}`;
    } else {
      textToSay = `Caution. ${label}.`;
    }
  }

  const utterance = new SpeechSynthesisUtterance(textToSay);
  utterance.lang = 'en-US'; 
  utterance.rate = 1.0; 
  window.speechSynthesis.speak(utterance);
}

function toggleVoice(checkbox) {
  isVoiceEnabled = checkbox.checked;
  if (isVoiceEnabled) {
    const warmUp = new SpeechSynthesisUtterance("Voice active.");
    window.speechSynthesis.speak(warmUp);
  } else {
    window.speechSynthesis.cancel();
  }
}
window.toggleVoice = toggleVoice;

// ===========================
// Landing Page Logic
// ===========================
function enterApp() {
  const landing = document.getElementById("landing-page");
  const app = document.getElementById("main-app");
  
  if(landing) {
    landing.style.opacity = '0';
    landing.style.transition = 'opacity 0.5s ease';
    setTimeout(() => {
      landing.style.display = "none";
      if(app) {
        app.style.display = "block";
        app.style.opacity = '0';
        app.style.transition = 'opacity 0.5s ease';
        setTimeout(() => app.style.opacity = '1', 50);
      }
    }, 500);
  }
}
window.enterApp = enterApp;
