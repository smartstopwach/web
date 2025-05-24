let isRunning = false;
let todaySeconds = 0;
let interval;
let isWriting = false;
let faceLookingForward = false;

const statusText = document.getElementById("status");
const todayKey = new Date().toISOString().slice(0, 10);
const digits = {
  h1: document.getElementById("h1"),
  h2: document.getElementById("h2"),
  m1: document.getElementById("m1"),
  m2: document.getElementById("m2"),
  s1: document.getElementById("s1"),
  s2: document.getElementById("s2"),
};

function updateClockDisplay(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");

  digits.h1.textContent = h[0];
  digits.h2.textContent = h[1];
  digits.m1.textContent = m[0];
  digits.m2.textContent = m[1];
  digits.s1.textContent = s[0];
  digits.s2.textContent = s[1];
}

function startTimer() {
  if (!isRunning) {
    isRunning = true;
    interval = setInterval(() => {
      todaySeconds++;
      localStorage.setItem(todayKey, todaySeconds);
      updateClockDisplay(todaySeconds);
    }, 1000);
    document.body.classList.add("fullscreen", "running");
    document.body.classList.remove("paused");
  }
}

function pauseTimer() {
  if (isRunning) {
    isRunning = false;
    clearInterval(interval);
    document.body.classList.remove("running");
    document.body.classList.add("paused");
  }
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

document.getElementById("fullscreen-btn").addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

window.onload = () => {
  const stored = localStorage.getItem(todayKey);
  if (stored) {
    todaySeconds = parseInt(stored);
    updateClockDisplay(todaySeconds);
  }

  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.style.display = "none";
  document.body.appendChild(video);

  const pose = new Pose({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${f}`
  });

  const faceMesh = new FaceMesh({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}`
  });

  pose.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  pose.onResults((res) => {
    if (res.poseLandmarks) {
      const hY = res.poseLandmarks[0].y;
      const lY = res.poseLandmarks[15].y;
      const rY = res.poseLandmarks[16].y;
      isWriting = hY < lY && hY < rY;
      evaluateStudyStatus();
    }
  });

  faceMesh.onResults((res) => {
    if (res.multiFaceLandmarks?.length > 0) {
      const lm = res.multiFaceLandmarks[0];
      const nose = lm[1].x;
      const eyesCenter = (lm[33].x + lm[263].x) / 2;
      faceLookingForward = Math.abs(nose - eyesCenter) < 0.03;
      evaluateStudyStatus();
    } else {
      faceLookingForward = false;
      evaluateStudyStatus();
    }
  });

  const camera = new Camera(video, {
    onFrame: async () => {
      await pose.send({ image: video });
      await faceMesh.send({ image: video });
    },
    width: 640,
    height: 480,
  });

  camera.start();
};
