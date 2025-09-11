const FFT_SIZE = 1024;
const OFFSET_THRESHOLD = 0.05;
const BAR_COLOR_TOP = '#416fbb'
const BAR_COLOR_BOTTOM = '#2acdc0'
const DEFAULTS = {
  vol: 1.0,
  bars: 150,
  speed: 1.0
};

const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');

const playBtn = document.getElementById('play');
const stopBtn = document.getElementById('stop');
const settingsBtn = document.getElementById('settingsBtn');
const resetBtn = document.getElementById('resetSettings');
const settingsModal = document.getElementById('settingsModal');
const closeModal = document.getElementById('closeModal');

const vol = document.getElementById('vol');
const volValue = document.getElementById('volValue');
const barsRange = document.getElementById('bars');
const barsValue = document.getElementById('barsValue');
const speedSlider = document.getElementById('speed');
const speedValue = document.getElementById('speedValue');

const visualCanvas = document.getElementById('visualCanvas');
const waveCanvas = document.getElementById('waveCanvas');
const seek = document.getElementById('seek');
const trackInfo = document.getElementById('trackInfo');
const timeInfo = document.getElementById('timeInfo');
const offsetInfo = document.getElementById('offsetInfo');
const typeInfo = document.getElementById('typeInfo');
const year = document.getElementById('year');
const footerNote = document.querySelector('.footer-note');

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
let currentUrl = null;

checkYear();
checkWebAudioSupport();
fitCanvas();

playBtn.disabled = true;
stopBtn.disabled = true;
settingsBtn.disabled = true;

// ブラウザがWeb Audio APIをサポートしているかチェック
function checkWebAudioSupport() {
  if (window.AudioContext || window.webkitAudioContext) {
    footerNote.textContent = 'Web Audio APIをサポートしているブラウザのため、正常に動作します';
    footerNote.style.color = 'lightgreen';
  } else {
    footerNote.textContent = 'Web Audio APIをサポートしていないため、正常に動作しません';
    footerNote.style.color = 'red';
  }
}

function checkYear() {
  year.textContent = new Date().getFullYear();
}

function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  visualCanvas.width = Math.floor(visualCanvas.clientWidth * dpr);
  visualCanvas.height = Math.floor(visualCanvas.clientHeight * dpr);
  waveCanvas.width = Math.floor(waveCanvas.clientWidth * dpr);
  waveCanvas.height = Math.floor(waveCanvas.clientHeight * dpr);
}
window.addEventListener('resize', fitCanvas);

// Canvasクリア
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

function setLoadingState() {
  trackInfo.textContent = 'Loading...';
  playBtn.disabled = true;
  stopBtn.disabled = true;
  settingsBtn.disabled = true;
  clearCanvas();
}

// 再生時間表示を更新
function updateTimeInfo(cur, total) {
  const format = t =>
    isNaN(t) ? '00:00' : 
    `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
  timeInfo.textContent = `${format(cur)} / ${format(total)}`;
}

// AudioContextを初期化
function createAudioContextIfNeeded() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    gainNode = audioCtx.createGain();
    gainNode.gain.value = parseFloat(vol.value);
    gainNode.connect(audioCtx.destination);
    analyser.connect(gainNode);
  }
}

// ファイルを読み込んでAudioBufferに変換
async function loadAudioFile(file) {
  if (!file.type.startsWith('audio/')) {
    alert('音声ファイルをアップロードしてください');
    return;
  }

  setLoadingState();
  createAudioContextIfNeeded();

  const arrayBuffer = await file.arrayBuffer();
  audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

  setupAudioElement(arrayBuffer);

  const rawData = audioBuffer.getChannelData(0);
  startOffset = calculateOffset(rawData, audioBuffer.sampleRate);

  trackInfo.textContent = file.name;
  offsetInfo.textContent = `OFFSET: ${startOffset.toFixed(3)}s`;
  updateTimeInfo(0, audioBuffer.duration);
  typeInfo.textContent = `TYPE: ${file.type}`;

  playBtn.disabled = false;
  settingsBtn.disabled = false;
}

// OFFSETを計算
function calculateOffset(data, sampleRate) {
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > OFFSET_THRESHOLD) return i / sampleRate;
  }
  return 0;
}

function setupAudioElement(arrayBuffer) {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  if (audioElement) {
    audioElement.pause();
    audioElement.src = '';
    audioElement.remove();
  }

  const blob = new Blob([arrayBuffer]);
  currentUrl = URL.createObjectURL(blob);
  audioElement = new Audio(currentUrl);
  audioElement.crossOrigin = 'anonymous';

  audioElement.addEventListener('timeupdate', () => {
    if (audioElement.duration) seek.value = (audioElement.currentTime / audioElement.duration) * 100;
    updateTimeInfo(audioElement.currentTime, audioElement.duration);
    offsetInfo.textContent = `OFFSET: ${startOffset.toFixed(3)}s`;
  });

  // 再生終了時
  audioElement.addEventListener('ended', () => {
    cancelAnimation();
    clearCanvas();
    seek.value = 0;
    playBtn.textContent = '▶️';
    stopBtn.disabled = true;
  });

  if (source) source.disconnect();
  source = audioCtx.createMediaElementSource(audioElement);
  source.connect(analyser);
}

// ドラッグ＆ドロップ
drop.addEventListener('dragover', e => {
  e.preventDefault();
  drop.classList.add('drag');
});
drop.addEventListener('dragleave', e => {
  e.preventDefault();
  drop.classList.remove('drag');
});
drop.addEventListener('drop', e => {
  e.preventDefault();
  drop.classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file) loadAudioFile(file);
});

// ファイル選択
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) loadAudioFile(file);
  fileInput.value = '';
});

// 再生/一時停止
playBtn.addEventListener('click', async () => {
  if (!audioElement) return;
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  if (audioElement.paused) {
    await audioElement.play();
    startVisualizer();
    playBtn.textContent = '⏸️';
    stopBtn.disabled = false;
  } else {
    audioElement.pause();
    cancelAnimation();
    playBtn.textContent = '▶️';
  }
});

// 停止
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

settingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('show');
});
closeModal.addEventListener('click', () => {
  settingsModal.classList.remove('show');
});
window.addEventListener('click', e => {
  if (e.target === settingsModal) {
    settingsModal.classList.remove('show');
  }
});


// 音量調整
vol.addEventListener('input', () => {
  if (gainNode) gainNode.gain.value = parseFloat(vol.value);
  volValue.textContent = parseFloat(vol.value).toFixed(2) + '倍';
});

// バー本数調整
barsRange.addEventListener('input', () => {
  barsValue.textContent = parseFloat(barsRange.value).toFixed(2) + '本';
});

// 再生速度調整
speedSlider.addEventListener('input', () => {
  if (audioElement) {
    audioElement.playbackRate = parseFloat(speedSlider.value);
    speedValue.textContent = parseFloat(speedSlider.value).toFixed(2) + 'x';
  }
});

// デフォルト値に戻す
resetBtn.addEventListener('click', () => {
  vol.value = DEFAULTS.vol;
  if (gainNode) gainNode.gain.value = DEFAULTS.vol;
  volValue.textContent = DEFAULTS.vol.toFixed(2) + '倍';

  barsRange.value = DEFAULTS.bars;
  barsValue.textContent = DEFAULTS.bars + '本';

  speedSlider.value = DEFAULTS.speed;
  if (audioElement) audioElement.playbackRate = DEFAULTS.speed;
  speedValue.textContent = DEFAULTS.speed.toFixed(2) + 'x';
});

// シークバー
seek.addEventListener('input', () => {
  if (audioElement && audioElement.duration) {
    audioElement.currentTime = (seek.value / 100) * audioElement.duration;
    if (audioElement.paused) clearCanvas();
  }
});

function startVisualizer() {
  cancelAnimation();
  renderVisualizer();
}

function renderVisualizer() {
  rafId = requestAnimationFrame(renderVisualizer);
  if (!analyser || !audioElement) return;

  const w = visualCanvas.width, h = visualCanvas.height;
  vCtx.clearRect(0, 0, w, h);

  // bar描画
  const barCount = parseInt(barsRange.value, 10);
  const barWidth = w / barCount * 0.8;
  const offset = (w - (barWidth + barWidth * 0.25) * barCount) / 2;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  for (let i = 0; i < barCount; i++) {
    const step = Math.floor(bufferLength / barCount);
    let sum = 0;
    for (let j = 0; j < step; j++) sum += dataArray[i * step + j] || 0;
    const val = sum / Math.max(1, step);
    const barH = Math.max(2, val / 255 * (h * 0.9));
    const x = offset + i * (barWidth + barWidth * 0.25);
    const grad = vCtx.createLinearGradient(x, 0, x, h);
    grad.addColorStop(0, BAR_COLOR_TOP);
    grad.addColorStop(1, BAR_COLOR_BOTTOM);
    vCtx.fillStyle = grad;
    vCtx.fillRect(x, h - barH, barWidth, barH);
  }

  // wave描画
  const timeData = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(timeData);
  const ww = waveCanvas.width, wh = waveCanvas.height;
  const dpr = window.devicePixelRatio || 1;
  const shift = Math.max(1, Math.floor(2 * dpr));
  const imageData = wCtx.getImageData(0, 0, ww, wh);
  wCtx.putImageData(imageData, -shift, 0);
  wCtx.clearRect(ww - shift, 0, shift, wh);

  const sampleStep = Math.max(1, Math.floor(timeData.length / wh));
  wCtx.beginPath();
  for (let y = 0; y < wh; y++) {
    const idx = Math.min(timeData.length - 1, y * sampleStep);
    const v = (timeData[idx] / 128 - 1);
    const drawY = wh / 2 + v * (wh / 2) * 0.8;
    if (y === 0) wCtx.moveTo(ww - 1, drawY);
    else wCtx.lineTo(ww - 1, drawY);
  }
  wCtx.strokeStyle = 'rgba(79,70,229,0.8)';
  wCtx.lineWidth = 1;
  wCtx.stroke();

  wCtx.beginPath();
  wCtx.moveTo(0, wh / 2);
  wCtx.lineTo(ww, wh / 2);
  wCtx.strokeStyle = 'rgba(255,255,255,0.25)';
  wCtx.lineWidth = dpr > 1 ? 0.5 * dpr : 0.5;
  wCtx.stroke();
}
