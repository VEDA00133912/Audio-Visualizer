const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
const playBtn = document.getElementById('play');
const stopBtn = document.getElementById('stop');
const vol = document.getElementById('vol');
const barsRange = document.getElementById('bars');
const visualCanvas = document.getElementById('visualCanvas');
const waveCanvas = document.getElementById('waveCanvas');
const seek = document.getElementById('seek');
const trackInfo = document.getElementById('trackInfo');
const timeInfo = document.getElementById('timeInfo');
const offsetInfo = document.getElementById('offsetInfo');

const vCtx = visualCanvas.getContext('2d');
const wCtx = waveCanvas.getContext('2d');

let audioCtx = null;
let source = null;
let analyser = null;
let gainNode = null;
let audioElement = null;
let rafId = null;
let audioBuffer = null;
let startOffset = 0;
playBtn.disabled = true;
stopBtn.disabled = true;

function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  visualCanvas.width = Math.floor(visualCanvas.clientWidth * dpr);
  visualCanvas.height = Math.floor(visualCanvas.clientHeight * dpr);

  waveCanvas.width = Math.floor(waveCanvas.clientWidth * dpr);
  waveCanvas.height = Math.floor(waveCanvas.clientHeight * dpr);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

function clearCanvas() {
  vCtx.clearRect(0, 0, visualCanvas.width, visualCanvas.height);
  wCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
}

function cancelAnimation() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

drop.addEventListener('dragover', e=>{
  e.preventDefault();
  drop.classList.add('drag');
});
drop.addEventListener('dragleave', e=>{
  e.preventDefault();
  drop.classList.remove('drag');
});
// drop.addEventListener('drop', e=>{
//   e.preventDefault();
//   drop.classList.remove('drag');
//   if (e.dataTransfer.files[0]) {
//     trackInfo.textContent = "Loading...";
//     playBtn.disabled = true;
//     stopBtn.disabled = true;
//     clearCanvas();
//     handleFile(e.dataTransfer.files[0]);
//   }
// });

// fileInput.addEventListener('change', e=>{
//   if (e.target.files[0]) {
//     trackInfo.textContent = "Loading...";
//     playBtn.disabled = true;
//     stopBtn.disabled = true;
//     clearCanvas();
//     handleFile(e.target.files[0]);
//     fileInput.value = "";
//   }
// });

drop.addEventListener('drop', e => {
  e.preventDefault();
  drop.classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (!file) return;

  // 音声ファイルかどうかチェック
  if (!file.type.startsWith('audio/')) {
    alert('音声ファイルを選択してください。');
    return;
  }

  trackInfo.textContent = "Loading...";
  playBtn.disabled = true;
  stopBtn.disabled = true;
  clearCanvas();
  handleFile(file);
});

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('audio/')) {
    alert('音声ファイルを選択してください。');
    fileInput.value = ""; // 選択解除
    return;
  }

  trackInfo.textContent = "Loading...";
  playBtn.disabled = true;
  stopBtn.disabled = true;
  clearCanvas();
  handleFile(file);
  fileInput.value = "";
});

function createAudioContextIfNeeded() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    gainNode = audioCtx.createGain();
    gainNode.gain.value = parseFloat(vol.value);
    gainNode.connect(audioCtx.destination);
    analyser.connect(gainNode);
  }
}

async function handleFile(file) {
  if (audioElement) {
    try {
      audioElement.pause();
      audioElement.currentTime = 0;
    } catch (e) {}
  }
  playBtn.textContent = '▶️';
  stopBtn.disabled = true;
    
  cancelAnimation();
  createAudioContextIfNeeded();
  clearCanvas();

  const array = await file.arrayBuffer();
  audioBuffer = await audioCtx.decodeAudioData(array.slice(0));

  prepareAudioElement(array);

  const rawData = audioBuffer.getChannelData(0);
  startOffset = calculateOffset(rawData, audioBuffer.sampleRate);

  trackInfo.textContent = `${file.name} - ${Math.round(audioBuffer.duration)}s`;
  offsetInfo.textContent = `OFFSET: ${startOffset.toFixed(3)}s`;
  updateTimeInfo(0, audioBuffer.duration);
  playBtn.disabled = false;
  stopBtn.disabled = true;
}

function calculateOffset(data, sampleRate) {
  const threshold = 0.05;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > threshold) return i / sampleRate;
  }
  return 0;
}

function prepareAudioElement(arrayBuffer) {
  if (audioElement) {
    try {
      audioElement.pause();
      audioElement.src = '';
      audioElement.remove();
    } catch (e) {}
  }
  const blob = new Blob([arrayBuffer]);
  const url = URL.createObjectURL(blob);
  audioElement = new Audio(url);
  audioElement.crossOrigin = 'anonymous';

  audioElement.addEventListener('timeupdate', () => {
    if (audioElement.duration) seek.value = (audioElement.currentTime / audioElement.duration) * 100;
    updateTimeInfo(audioElement.currentTime, audioElement.duration);
    offsetInfo.textContent = `OFFSET: ${startOffset.toFixed(3)}s`;
  });

  audioElement.addEventListener('ended', () => {
    cancelAnimation();
    clearCanvas();
    seek.value = 0;
    playBtn.textContent = '▶️';
    stopBtn.disabled = true;
  });

  if (source) {
    try { source.disconnect(); } catch(e) {}
  }
  source = audioCtx.createMediaElementSource(audioElement);
  source.connect(analyser);
}

playBtn.addEventListener('click', async () => {
  if (!audioElement) return;
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  if (audioElement.paused) {
    try {
      await audioElement.play();
    } catch (e) {
      console.warn("play failed:", e);
      return;
    }
    startAnimation();
    playBtn.textContent = '⏸️';
    stopBtn.disabled = false;
  } else {
    audioElement.pause();
    cancelAnimation();
    playBtn.textContent = '▶️';
  }
});

stopBtn.addEventListener('click', () => {
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
    cancelAnimation();
    clearCanvas();
    seek.value = 0;
    playBtn.textContent = '▶️';
    stopBtn.disabled = true;
  }
});

vol.addEventListener('input', () => {
  if (gainNode) gainNode.gain.value = parseFloat(vol.value);
});

seek.addEventListener('input', () => {
  if (audioElement && audioElement.duration) {
    audioElement.currentTime = (seek.value / 100) * audioElement.duration;
    if (audioElement.paused) clearCanvas();
  }
});

function updateTimeInfo(cur, total) {
  const fmt = t => isNaN(t) ? '00:00' : `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
  timeInfo.textContent = `${fmt(cur)} / ${fmt(total)}`;
}

function startAnimation() { cancelAnimation(); renderLoop(); }
function cancelAnimationFrameIfExists() { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }

function renderLoop() {
  rafId = requestAnimationFrame(renderLoop);
  if (!analyser || !audioElement) return;

  const w = visualCanvas.width, h = visualCanvas.height;
  vCtx.clearRect(0,0,w,h);
  const barCount = parseInt(barsRange.value,10);
  const barWidth = w/barCount * 0.8;
  const offset = (w - (barWidth + barWidth*0.25) * barCount)/2;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  for (let i=0;i<barCount;i++){
    const step = Math.floor(bufferLength/barCount);
    let sum=0;
    for (let j=0;j<step;j++) sum += dataArray[i*step+j]||0;
    const val = sum/Math.max(1,step);
    const barH = Math.max(2, val/255*(h*0.9));
    const x = offset + i*(barWidth + barWidth*0.25);
    const grad = vCtx.createLinearGradient(x,0,x,h);
    grad.addColorStop(0,'rgba(79,70,229,0.95)');
    grad.addColorStop(1,'rgba(6,182,212,0.5)');
    vCtx.fillStyle = grad;
    vCtx.fillRect(x, h-barH, barWidth, barH);
  }

  const timeData = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(timeData);
  const ww = waveCanvas.width, wh = waveCanvas.height;
  const dpr = window.devicePixelRatio || 1;
  const shift = Math.max(1, Math.floor(2 * dpr));
  const imageData = wCtx.getImageData(0,0,ww,wh);
  wCtx.putImageData(imageData,-shift,0);
  wCtx.clearRect(ww-shift,0,shift,wh);

  const sampleStep = Math.max(1, Math.floor(timeData.length/wh));
  wCtx.beginPath();
  for (let y=0; y<wh; y++){
    const idx = Math.min(timeData.length-1, y*sampleStep);
    const v = (timeData[idx]/128 - 1);
    const drawY = wh/2 + v*(wh/2)*0.8;
    if (y===0) wCtx.moveTo(ww-1, drawY);
    else wCtx.lineTo(ww-1, drawY);
  }
  wCtx.strokeStyle='rgba(79,70,229,0.8)';
  wCtx.lineWidth=1;
  wCtx.stroke();

  wCtx.beginPath();
  wCtx.moveTo(0, wh / 2);
  wCtx.lineTo(ww, wh / 2);
  wCtx.strokeStyle = 'rgba(255,255,255,0.25)';
  wCtx.lineWidth = dpr > 1 ? 0.5 * dpr : 0.5;
  wCtx.stroke();
}
