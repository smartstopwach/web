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

// Pose Detection Logic
function isWritingPose(landmarks) {
  const headY = landmarks[0].y;
  const leftWristY = landmarks[15].y;
  const rightWristY = landmarks[16].y;
  return (headY < leftWristY && headY < rightWristY);
}

function isPhonePosture(landmarks) {
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const nose = landmarks[0];

  const nearFace = (wrist) => {
    const dx = wrist.x - nose.x;
    const dy = wrist.y - nose.y;
    return Math.sqrt(dx * dx + dy * dy) < 0.1;
  };

  return nearFace(leftWrist) && nearFace(rightWrist);
}

function onResults(results) {
  if (!results.poseLandmarks) {
    statusText.textContent = "No person detected — paused";
    pauseTimer();
    return;
  }

  if (isPhonePosture(results.poseLandmarks)) {
    statusText.textContent = "Phone posture detected — paused";
    pauseTimer();
  } else if (isWritingPose(results.poseLandmarks)) {
    statusText.textContent = "Studying posture detected — running";
    startTimer();
  } else {
    statusText.textContent = "Idle posture — paused";
    pauseTimer();
  }
}

window.onload = async () => {
  await requestWakeLock();
  loadStoredTime();

  const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`,
  });

  pose.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  pose.onResults(onResults);

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await pose.send({ image: videoElement });
    },
    width: 640,
    height: 480,
  });

  camera.start();
};
