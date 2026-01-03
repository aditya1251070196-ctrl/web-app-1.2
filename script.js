// ===========================
// PWA + TF.js Setup
// ===========================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js")
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

// ===========================
// Camera prediction state
// ===========================
let predictionInterval = null;
let predictionTimeout = null;
let predictionCounts = {};
let lastFrameDataURL = null;
let cameraRunning = false;


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

  const output = model.predict(tensor);
  const scores = await output.data();

  const max = Math.max(...scores);
  const index = scores.indexOf(max);

  tensor.dispose();
  output.dispose();

  return { label: labels[index], confidence: max };
}

// ===========================
// Camera control
// ===========================
async function startCamera() {
  if (cameraRunning) return;
  


  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });

    video.srcObject = stream;
    await video.play();

    cameraRunning = true;
    scanBtn.disabled = false;

    // Camera-only mode → disable Detect
    imageFromUpload = false;
    detectBtn.disabled = true;

  } catch (err) {
    alert("Camera access failed");
    console.error(err);
  }
}


function stopCamera() {
  // ✅ Stop active scan if running
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
// Timed scan (camera)
// ===========================
async function startTimedCameraPrediction(duration = 4000, interval = 250) {

  // 🚫 Camera must already be open
  if (!cameraRunning) {
    alert("Please start the camera first");
    return;
  }

  if (isScanning) return;

  isScanning = true;
  imageFromUpload = false;
  lockButtons();

  predictionCounts = {};
  lastFrameDataURL = null;
  clearResult();

  showScanOverlay(true);

  predictionInterval = setInterval(async () => {
    if (!video.videoWidth) return;

    const canvas = processImage(video);
    lastFrameDataURL = canvas.toDataURL();

    const img = new Image();
    img.src = lastFrameDataURL;
    await img.decode();

    const { label, confidence } = await runPrediction(img);

    predictionCounts[label] =
      (predictionCounts[label] || 0) + confidence;

    setResult(`Detecting: ${label}`);
  }, interval);

  predictionTimeout = setTimeout(stopTimedPrediction, duration);
}

// ===========================
// Finalize camera scan
// ===========================
function stopTimedPrediction() {
  clearInterval(predictionInterval);
  clearTimeout(predictionTimeout);
  stopCamera();

  // ✅ Confidence-weighted decision
  let finalLabel = "Unknown";
  let maxScore = 0;

  for (const label in predictionCounts) {
    if (predictionCounts[label] > maxScore) {
      maxScore = predictionCounts[label];
      finalLabel = label;
    }
  }

  setResult(`Detected: ${finalLabel}`);

  // ✅ Vibration (safe for PWA / ignored on desktop)
  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200]);
  }

  // ✅ Freeze last camera frame
  if (lastFrameDataURL) {
    document.getElementById("preview").src = lastFrameDataURL;
    document.getElementById("processedPreview").src = lastFrameDataURL;
  }

  // ✅ Hide scan animation (important)
  showScanOverlay(false);

  // ✅ Reset state & unlock UI
  isScanning = false;
  unlockButtons(true, false); // Scan enabled, Detect disabled
}

// ===========================
// File upload handler
// ===========================
document.getElementById("imageInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  imageFromUpload = true;
  lockButtons(false, false); // ✅ Enable Detect

  clearResult();

  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = processImage(img);
      document.getElementById("preview").src = ev.target.result;
      document.getElementById("processedPreview").src = canvas.toDataURL();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

// ===========================
// Detect (UPLOAD ONLY)
// ===========================
async function detectImage() {
  if (!imageFromUpload || isScanning) return;

  const img = document.getElementById("processedPreview");
  if (!img.src) return;

  lockButtons();
  const { label, confidence } = await runPrediction(img);
  setResult(`${label} (${confidence.toFixed(3)})`);
  unlockButtons(true, false);
}

// ===========================
// Button state helpers
// ===========================
function lockButtons(scan = false, detect = false) {
  scanBtn.disabled = scan || isScanning;
  detectBtn.disabled = detect || !imageFromUpload || isScanning;
}

function unlockButtons(scan = true, detect = false) {
  scanBtn.disabled = !scan;
  detectBtn.disabled = !detect;
}

// ===========================
// Utility
// ===========================
function clearResult() {
  setResult("Ready to detect");
}

function setResult(text) {
  document.getElementById("result").innerText = text;
}

function clearInput() {
  imageFromUpload = false;
  document.getElementById("imageInput").value = "";
  document.getElementById("preview").src = "";
  document.getElementById("processedPreview").src = "";
  clearResult();
  unlockButtons(true, false);
}

function refreshPage() {
  location.reload();
}

// ===========================
// Expose
// ===========================
window.startTimedCameraPrediction = startTimedCameraPrediction;
window.detectImage = detectImage;
window.clearInput = clearInput;
window.refreshPage = refreshPage;



//Helper function
function vibrate(pattern = [100, 50, 100]) {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}


function showScanOverlay(show) {
  document.getElementById("scanOverlay")
    .classList.toggle("hidden", !show);
}


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
