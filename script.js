let todaySeconds = 0;
let startTime = 0;
let isRunning = false;
let wakeLock = null;

const todayKey = new Date().toISOString().slice(0, 10);
const videoElement = document.createElement("video");
videoElement.setAttribute("playsinline", true);
document.body.appendChild(videoElement);

const statusText = document.getElementById("status");
const stopwatchDisplay = document.getElementById("stopwatch");
const resetBtn = document.getElementById("reset");
resetBtn.addEventListener("click", resetTimer);

let faceLookingForward = false;
let isWriting = false;

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    console.error("Wake Lock failed:", err);
  }

  document.addEventListener("visibilitychange", async () => {
    if (wakeLock && document.visibilityState === "visible") {
      await requestWakeLock();
    }
  });
}

function updateTime() {
  todaySeconds++;
  stopwatchDisplay.textContent = formatTime(todaySeconds);
  localStorage.setItem(todayKey, todaySeconds);
  updateDailyReport();
}

function formatTime(sec) {
  const hrs = String(Math.floor(sec / 3600)).padStart(2, "0");
  const mins = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const secs = String(sec % 60).padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
}

function startTimer() {
  if (!isRunning) {
    isRunning = true;
    startTime = setInterval(updateTime, 1000);
  }
}

function pauseTimer() {
  if (isRunning) {
    isRunning = false;
    clearInterval(startTime);
  }
}

function resetTimer() {
  pauseTimer();
  todaySeconds = 0;
  stopwatchDisplay.textContent = formatTime(todaySeconds);
  localStorage.removeItem(todayKey);
  updateDailyReport();
}

function loadStoredTime() {
  const saved = localStorage.getItem(todayKey);
  if (saved) {
    todaySeconds = parseInt(saved);
    stopwatchDisplay.textContent = formatTime(todaySeconds);
  }
  updateDailyReport();
}

function updateDailyReport() {
  const report = document.getElementById("daily-report");
  if (!report) return;
  report.innerHTML = "";
  Object.keys(localStorage)
    .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort()
    .reverse()
    .forEach(key => {
      const sec = parseInt(localStorage.getItem(key));
      const time = formatTime(sec);
      const li = document.createElement("li");
      li.textContent = `${key}: ${time}`;
      report.appendChild(li);
    });
}

// ✅ IMPROVED BlazePose: writing detection
function isWritingPose(landmarks) {
  const head = landmarks[0];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  if (!head || (!leftWrist && !rightWrist)) return false;

  const isHeadLower = (refPoint) => head.y < refPoint.y;

  const headBelowShoulders =
    (leftShoulder && isHeadLower(leftShoulder)) ||
    (rightShoulder && isHeadLower(rightShoulder));

  const wristAboveHead =
    (leftWrist && leftWrist.y > head.y) ||
    (rightWrist && rightWrist.y > head.y);

  const elbowsBent =
    (leftElbow && leftWrist && Math.abs(leftWrist.x - leftElbow.x) < 0.2) ||
    (rightElbow && rightWrist && Math.abs(rightWrist.x - rightElbow.x) < 0.2);

  return headBelowShoulders && wristAboveHead && elbowsBent;
}

// ✅ FaceMesh: face direction check
function checkFaceDirection(landmarks) {
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const noseTip = landmarks[1];

  const eyeDiff = Math.abs(leftEye.x - rightEye.x);
  const noseCenter = (leftEye.x + rightEye.x) / 2;
  const faceAngle = noseTip.x - noseCenter;

  return Math.abs(faceAngle) < 0.03;
}

function evaluateStudyStatus() {
  if (isWriting && faceLookingForward) {
    statusText.textContent = "Focused — Studying";
    startTimer();
  } else {
    statusText.textContent = "Not Focused — Paused";
    pauseTimer();
  }
}

window.onload = async () => {
  await requestWakeLock();
  loadStoredTime();

  const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
  });
  const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`
  });

  pose.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  pose.onResults((results) => {
    if (results.poseLandmarks) {
      isWriting = isWritingPose(results.poseLandmarks);
      evaluateStudyStatus();
    }
  });

  faceMesh.onResults((results) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      faceLookingForward = checkFaceDirection(results.multiFaceLandmarks[0]);
      evaluateStudyStatus();
    } else {
      faceLookingForward = false;
      evaluateStudyStatus();
    }
  });

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await pose.send({ image: videoElement });
      await faceMesh.send({ image: videoElement });
    },
    width: 640,
    height: 480
  });

  camera.start();
};
