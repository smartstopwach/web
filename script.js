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

let lastFaceForward = false;
let lastWritingPose = false;

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

function isWritingPose(landmarks) {
  const headY = landmarks[0].y;
  const leftWristY = landmarks[15].y;
  const rightWristY = landmarks[16].y;
  return (headY < leftWristY && headY < rightWristY);
}

function isFaceForward(landmarks) {
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];
  const nose = landmarks[1];

  const leftDist = Math.abs(nose.x - leftCheek.x);
  const rightDist = Math.abs(nose.x - rightCheek.x);
  const ratio = leftDist / rightDist;

  return ratio > 0.75 && ratio < 1.25;
}

function evaluateStudyCondition() {
  if (lastWritingPose && lastFaceForward) {
    statusText.textContent = "Focused — Studying";
    startTimer();
  } else {
    statusText.textContent = lastWritingPose
      ? "Face not forward — Paused"
      : "No writing posture — Paused";
    pauseTimer();
  }
}

window.onload = async () => {
  await requestWakeLock();
  loadStoredTime();

  const pose = new Pose.Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
  });
  pose.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  pose.onResults((results) => {
    if (results.poseLandmarks) {
      lastWritingPose = isWritingPose(results.poseLandmarks);
      evaluateStudyCondition();
    }
  });

  const faceMesh = new FaceMesh.FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  faceMesh.onResults((results) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      lastFaceForward = isFaceForward(results.multiFaceLandmarks[0]);
      evaluateStudyCondition();
    } else {
      lastFaceForward = false;
      evaluateStudyCondition();
    }
  });

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await pose.send({ image: videoElement });
      await faceMesh.send({ image: videoElement });
    },
    width: 640,
    height: 480,
  });

  camera.start();
};
