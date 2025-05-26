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

let isWriting = false;
let faceForward = false;
let isPhonePose = false;
let visibleJoints = { leftWrist: false, rightWrist: false };

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

// BlazePose writing detection
function isWritingPose(landmarks) {
  const headY = landmarks[0].y;
  const leftWristY = landmarks[15].y;
  const rightWristY = landmarks[16].y;
  return (headY < leftWristY && headY < rightWristY);
}

// FaceMesh front detection
function checkFaceForward(landmarks) {
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];
  const center = (leftEye.x + rightEye.x) / 2;
  const angle = nose.x - center;
  return Math.abs(angle) < 0.03;
}

// Smart phone detection
function detectPhonePose(poseLandmarks) {
  const nose = poseLandmarks[0];
  const leftWrist = poseLandmarks[15];
  const rightWrist = poseLandmarks[16];

  visibleJoints.leftWrist = leftWrist.visibility > 0.5;
  visibleJoints.rightWrist = rightWrist.visibility > 0.5;

  const dist = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const wristNearNose =
    dist(leftWrist, nose) < 0.1 && dist(rightWrist, nose) < 0.1;

  const wristHidden =
    !visibleJoints.leftWrist && !visibleJoints.rightWrist;

  return wristNearNose || wristHidden;
}

// ✅ Set status + background
function evaluateStatus() {
  if (isPhonePose) {
    statusText.textContent = "Phone posture — paused";
    document.body.style.backgroundColor = "#2b0000"; // red when distracted
    pauseTimer();
  } else if (isWriting && faceForward) {
    statusText.textContent = "Focused — Studying";
    document.body.style.backgroundColor = "#000000"; // black when studying
    startTimer();
  } else {
    statusText.textContent = "Not focused — paused";
    document.body.style.backgroundColor = "#2b0000"; // red background
    pauseTimer();
  }
}

window.onload = async () => {
  await requestWakeLock();
  loadStoredTime();

  const pose = new Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`
  });

  const faceMesh = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${file}`
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
      isPhonePose = detectPhonePose(results.poseLandmarks);
      evaluateStatus();
    }
  });

  faceMesh.onResults((results) => {
    if (
      results.multiFaceLandmarks &&
      results.multiFaceLandmarks.length > 0
    ) {
      faceForward = checkFaceForward(results.multiFaceLandmarks[0]);
      evaluateStatus();
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
