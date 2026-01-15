// ===========================
// PWA + TF.js Setup
// ===========================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js")
    .then(() => console.log("Service Worker registered"))
    .catch(() => console.log("SW registration failed"));
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
function stopTimedPrediction() {
  clearInterval(predictionInterval);
  clearTimeout(predictionTimeout);
  stopCamera();

  let finalLabel = "Unknown";
  let bestAvgConfidence = 0;

  for (const label in predictionStats) {
    const avg = predictionStats[label].sum / predictionStats[label].count;
    if (avg > bestAvgConfidence) {
      bestAvgConfidence = avg;
      finalLabel = label;
    }
  }

  // --- FIX START: Define confStr here ---
  const confStr = toPercent(bestAvgConfidence);
  // --- FIX END ---

  setResult(`Detected: ${finalLabel}\nConfidence: ${confStr}`);

  // Now you can safely pass it to the notification
  sendSafetyNotification(finalLabel, confStr);

  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200]);
  }

  // SAFETY CHECK: Show last frame only if element exists
  if (lastFrameDataURL) {
    const preview = document.getElementById("cameraPreview");
    if (preview) {
      preview.src = lastFrameDataURL;
      preview.style.display = "block";
    }
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
async function detectImage() {
  if (!imageFromUpload || isScanning) return;

  const img = document.getElementById("processedPreview");
  if (!img.src) return;

  lockButtons();
  const { label, confidence } = await runPrediction(img);
  
  // --- FIX START: Define confStr before using it ---
  const confStr = toPercent(confidence);
  // --- FIX END ---

  setResult(`Detected: ${label}\nConfidence: ${confStr}`);
  
  // Now this works because confStr is defined above
  sendSafetyNotification(label, confStr);

  unlockButtons(true, true);
}

// ===========================
// Helpers
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
  setResult("Ready to detect");
}

function setResult(text) {
  document.getElementById("result").innerText = text;
}



function showScanOverlay(show) {
  document.getElementById("scanOverlay").classList.toggle("hidden", !show);
}

function toPercent(value) {
  return (value * 100).toFixed(1) + "%";
}

// ===========================
// Event Listener
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  const imageInput = document.getElementById("imageInput");
  if (imageInput) {
    imageInput.addEventListener("change", handleImageUpload);
  }
});

// Expose functions to global scope for HTML buttons
window.startCamera = startCamera;
window.startTimedCameraPrediction = startTimedCameraPrediction;
window.stopCamera = stopCamera;
window.detectImage = detectImage;
window.clearInput = clearInput;
window.refreshPage= refreshPage;

function refreshPage() {
  window.location.reload();
}

// Make sure to expose it to the HTML
window.refreshPage = refreshPage;

// ===========================
// 3. Safe Clear Input
// ===========================
function clearInput() {
  document.getElementById("imageInput").value = "";

  const block = document.getElementById("uploadBlock");
  const placeholder = document.getElementById("uploadPlaceholder");
  const previewImg = document.getElementById("preview");
  const processedImg = document.getElementById("processedPreview");
  const clearBtn = document.getElementById("clearBtn");
  const detectBtn = document.getElementById("detectBtn");
  const cameraPreview = document.getElementById("cameraPreview");

  // Reset File Upload UI
  if (previewImg) {
    previewImg.style.display = "none";
    previewImg.src = "";
  }
  if (placeholder) placeholder.style.display = ""; 
  if (block) block.classList.remove("has-image");

  // Reset Camera Preview (SAFETY CHECK)
  if (cameraPreview) {
    cameraPreview.style.display = "none";
    cameraPreview.src = "";
  }

  // Reset State
  imageFromUpload = false;
  if (processedImg) processedImg.src = ""; 
  setResult("Ready to detect");
  
  if (detectBtn) detectBtn.disabled = true;
  if (clearBtn) clearBtn.disabled = true; 
}

function clearResult() {
  document.getElementById("result").innerText = "Ready to detect";
}

