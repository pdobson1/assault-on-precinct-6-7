(() => {
'use strict';
const W = 384, H = 216, FLOOR_Y = 140, DEPTH = 64, STAGE_W = 2880, GRAV = 900;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
const FONT = '"Press Start 2P", monospace';
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rad = d => d * Math.PI / 180;

// ---------------------------------------------------------------- tiny 3x5 font for signage
const TF = {
  A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',
  F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',
  K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'010101101101010',
  P:'110101110100100',Q:'010101101110011',R:'110101110101101',S:'011100010001110',T:'111010010010010',
  U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',
  Z:'111001010100111','0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110',
  '4':'101101111001001','5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111',
  '9':'111101111001110','-':'000000111000000','.':'000000000000010','!':'010010010000010','?':'110001010000010',
  '£':'011010111010111',':':'000010000010000','"':'101101000000000',"'":'010010000000000','/':'001001010100100'
};
function tiny(c, s, x, y, col, sc = 1) {
  c.fillStyle = col; let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = TF[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(cx + (i % 3) * sc, y + Math.floor(i / 3) * sc, sc, sc);
    cx += 4 * sc;
  }
}
const tinyW = (s, sc = 1) => s.length * 4 * sc - sc;

function text(s, x, y, col = '#fff', size = 8, align = 'left', shadow = null) {
  ctx.font = size + 'px ' + FONT; ctx.textAlign = align; ctx.textBaseline = 'top';
  x = Math.round(x); y = Math.round(y);
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(s, x + Math.max(1, size / 8), y + Math.max(1, size / 8)); }
  ctx.fillStyle = '#000';
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(s, x + ox, y + oy);
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round((n >> 16 & 255) * f)), g = Math.min(255, Math.round((n >> 8 & 255) * f)), b = Math.min(255, Math.round((n & 255) * f));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// ---------------------------------------------------------------- audio
const A = { ctx: null, master: null, music: null, sfx: null, noise: null, buf67: null, cur67: null, muted: false };
let musicOn = false;
function unlockAudio() {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  A.ctx = new AC();
  A.master = A.ctx.createGain(); A.master.gain.value = A.muted ? 0 : 0.9; A.master.connect(A.ctx.destination);
  A.music = A.ctx.createGain(); A.music.gain.value = 0.17; A.music.connect(A.master);
  A.sfx = A.ctx.createGain(); A.sfx.gain.value = 0.6; A.sfx.connect(A.master);
  const nb = A.ctx.createBuffer(1, A.ctx.sampleRate, A.ctx.sampleRate);
  const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  A.noise = nb;
  try {
    const bin = atob(window.SFX67_B64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    A.ctx.decodeAudioData(u.buffer, b => { A.buf67 = b; }, () => {});
  } catch (e) { /* sound stays off */ }
}
function env(g, t, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function tone(type, f0, f1, dur, vol, dest = A.sfx, t = A.ctx.currentTime) {
  const o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, vol, dur); o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, ftype, freq, dest = A.sfx, t = A.ctx.currentTime) {
  const s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
  s.buffer = A.noise; f.type = ftype; f.frequency.value = freq; env(g, t, vol, dur);
  s.connect(f).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const S = {
  hit(h) { if (!A.ctx) return; noise(0.09, h ? 0.9 : 0.6, 'bandpass', h ? 900 : 1500); tone('sine', h ? 160 : 220, 45, 0.12, 0.8); },
  swing() { if (!A.ctx) return; noise(0.07, 0.18, 'highpass', 3000); },
  thud() { if (!A.ctx) return; tone('sine', 90, 30, 0.25, 0.9); noise(0.15, 0.4, 'lowpass', 400); },
  hurt() { if (!A.ctx) return; tone('square', 320, 90, 0.2, 0.25); noise(0.08, 0.5, 'bandpass', 1100); },
  pick() { if (!A.ctx) return; const t = A.ctx.currentTime; [660, 880, 1320].forEach((f, i) => tone('square', f, f, 0.08, 0.15, A.sfx, t + i * 0.06)); },
  breakIt() { if (!A.ctx) return; noise(0.25, 0.6, 'lowpass', 1800); tone('square', 140, 60, 0.15, 0.2); },
  jump() { if (!A.ctx) return; tone('square', 220, 440, 0.1, 0.08); },
  spin() { if (!A.ctx) return; noise(0.4, 0.3, 'bandpass', 2400); tone('sawtooth', 300, 900, 0.35, 0.06); },
  bonus() { if (!A.ctx) return; const t = A.ctx.currentTime; [784, 988, 1175, 1568].forEach((f, i) => tone('square', f, f, 0.07, 0.13, A.sfx, t + i * 0.05)); },
  siren(dur = 2.4) {
    if (!A.ctx) return; const t = A.ctx.currentTime;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain(), f = A.ctx.createBiquadFilter();
    o.type = 'square'; f.type = 'lowpass'; f.frequency.value = 1600;
    for (let i = 0; i * 0.42 < dur; i++) o.frequency.setValueAtTime(i % 2 ? 452 : 604, t + i * 0.42);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
    g.gain.setValueAtTime(0.09, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(A.sfx); o.start(t); o.stop(t + dur + 0.05);
  },
  jingle() { if (!A.ctx) return; const t = A.ctx.currentTime; [57, 60, 64, 69, 72, 76, 81].forEach((m, i) => tone('square', mf(m), mf(m), i === 6 ? 0.6 : 0.12, 0.12, A.sfx, t + i * 0.11)); },
  over() { if (!A.ctx) return; const t = A.ctx.currentTime; [64, 63, 62, 57].forEach((m, i) => tone('triangle', mf(m), mf(m), 0.35, 0.3, A.sfx, t + i * 0.3)); }
};
function play67() {
  if (!A.ctx || !A.buf67) return;
  stop67();
  const s = A.ctx.createBufferSource(), g = A.ctx.createGain();
  s.buffer = A.buf67; s.playbackRate.value = VOICE_RATE; g.gain.value = 1.15; s.connect(g).connect(A.sfx); s.start();
  A.cur67 = { s, g };
  A.music.gain.setTargetAtTime(0.05, A.ctx.currentTime, 0.04);
  s.onended = () => { if (A.cur67 && A.cur67.s === s) { A.cur67 = null; A.music.gain.setTargetAtTime(0.17, A.ctx.currentTime, 0.1); } };
}
function stop67() {
  if (!A.ctx || !A.cur67) return;
  const { s, g } = A.cur67; A.cur67 = null;
  const t = A.ctx.currentTime;
  g.gain.setTargetAtTime(0, t, 0.012); try { s.stop(t + 0.08); } catch (e) {}
  A.music.gain.setTargetAtTime(0.17, t, 0.1);
}
function setMuted(m) {
  A.muted = m;
  if (A.master) A.master.gain.setTargetAtTime(m ? 0 : 0.9, A.ctx.currentTime, 0.02);
  const b = document.getElementById('mute');
  b.textContent = m ? 'SOUND OFF' : 'SOUND ON'; b.setAttribute('aria-pressed', String(m));
}

// chiptune: A minor, i - VI - VII - V
// the 6-7 clip plays a touch faster and higher than recorded
const VOICE_RATE = 1.15;
const mf = m => 440 * Math.pow(2, (m - 69) / 12);
const BASS = [45, 41, 43, 40];
const LEAD = [
  76,0,74,0,72,0,69,0, 72,0,74,76,0,0,74,0,
  72,0,72,74,0,72,69,0, 65,0,69,0,72,0,0,0,
  74,0,71,0,67,0,71,0, 74,0,76,0,79,0,76,0,
  76,0,0,74,0,71,0,68, 71,0,0,0,64,0,68,0
];
const M = { step: 0, next: 0, tempo: 132 };
function startMusic(tempo = 132) { if (!A.ctx) return; musicOn = true; M.tempo = tempo; M.step = 0; M.next = A.ctx.currentTime + 0.1; }
function stopMusic() { musicOn = false; }
function musicTick() {
  if (!A.ctx || !musicOn) return;
  const now = A.ctx.currentTime, sd = 60 / M.tempo / 4;
  if (M.next < now - 0.2) M.next = now + 0.05;
  while (M.next < now + 0.12) {
    const i = M.step, bar = i >> 4, s = i & 15, t = M.next;
    if (s % 2 === 0) { const n = BASS[bar] + (s % 4 === 2 ? 12 : 0); tone('square', mf(n), mf(n), sd * 1.7, 0.5, A.music, t); }
    if (s === 0 || s === 8 || (bar === 3 && s === 10)) tone('sine', 150, 40, 0.14, 0.9, A.music, t);
    if (s === 4 || s === 12) noise(0.11, 0.5, 'bandpass', 1900, A.music, t);
    if (s % 2 === 1) noise(0.03, 0.18, 'highpass', 7000, A.music, t);
    if (LEAD[i]) tone('square', mf(LEAD[i]), mf(LEAD[i]), sd * 1.6, 0.28, A.music, t);
    M.next += sd; M.step = (M.step + 1) % 64;
  }
}

// ---------------------------------------------------------------- input
const keys = {}, buffered = {};
const KEYMAP = { ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right', ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down',
  KeyZ:'atk', KeyJ:'atk', KeyX:'jump', KeyK:'jump', Space:'jump', KeyC:'spc', KeyL:'spc', Enter:'start', KeyP:'start', Escape:'start', KeyM:'mute' };
let clock = 0;
function press(k) { unlockAudio(); if (!keys[k]) buffered[k] = clock; keys[k] = true; }
function release(k) { keys[k] = false; }
function buf(k, win = 0.16) { if (buffered[k] !== undefined && clock - buffered[k] <= win) { delete buffered[k]; return true; } return false; }
window.addEventListener('keydown', e => { const k = KEYMAP[e.code]; if (!k) return; e.preventDefault(); if (e.repeat) return; press(k); });
window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) release(k); });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
cv.addEventListener('pointerdown', e => {
  cv.focus(); unlockAudio();
  if (G.mode === 'select') {
    // tap an officer to pick them, tap them again to go on duty
    const r = cv.getBoundingClientRect(), side = e.clientX - r.left < r.width / 2 ? 0 : 1;
    if (side !== G.sel) { G.sel = side; return; }
  }
  if (G.mode !== 'play') { press('start'); setTimeout(() => release('start'), 60); }
});
document.getElementById('mute').addEventListener('click', () => { unlockAudio(); setMuted(!A.muted); });
document.querySelectorAll('.abtns button').forEach(b => {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); press(k); b.classList.add('b-on'); });
  const up = () => { release(k); b.classList.remove('b-on'); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
});
(() => {
  const pad = document.getElementById('pad'); let pid = null;
  const set = e => {
    const r = pad.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const dz = r.width * 0.14;
    keys.left = dx < -dz; keys.right = dx > dz; keys.up = dy < -dz; keys.down = dy > dz;
  };
  const clear = () => { pid = null; keys.left = keys.right = keys.up = keys.down = false; };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); unlockAudio(); pid = e.pointerId; pad.setPointerCapture(pid); set(e); });
  pad.addEventListener('pointermove', e => { if (e.pointerId === pid) set(e); });
  pad.addEventListener('pointerup', clear); pad.addEventListener('pointercancel', clear);
})();

// gamepads (standard mapping): polled once a frame and fed through press/release like keys
const PAD_BTN = { atk: [2], jump: [0], spc: [1, 3], start: [9] };
const padHeld = {};
let padsOk = true;
function pollPads() {
  if (!padsOk || !navigator.getGamepads) return;
  let pads;
  try { pads = navigator.getGamepads(); } catch (e) { padsOk = false; return; }
  const now = {};
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (b(14) || ax < -0.4) now.left = true;
    if (b(15) || ax > 0.4) now.right = true;
    if (b(12) || ay < -0.4) now.up = true;
    if (b(13) || ay > 0.4) now.down = true;
    for (const k in PAD_BTN) if (PAD_BTN[k].some(b)) now[k] = true;
  }
  for (const k of ['left', 'right', 'up', 'down', 'atk', 'jump', 'spc', 'start']) {
    if (now[k] && !padHeld[k]) press(k);
    else if (!now[k] && padHeld[k]) release(k);
    padHeld[k] = !!now[k];
  }
}

// ---------------------------------------------------------------- background
const AREAS = [
  { name: 'OUTSIDE THE NICK', x0: 0 }, { name: 'FRONT DESK', x0: 560 },
  { name: 'CID OFFICE', x0: 1300 }, { name: 'CUSTODY SUITE', x0: 2080 }
];
const bg = document.createElement('canvas'); bg.width = STAGE_W; bg.height = H;
function buildBG() {
  const b = bg.getContext('2d');
  const R = (x, y, w, h, c) => { b.fillStyle = c; b.fillRect(x, y, w, h); };
  const sr = (() => { let s = 67; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

  // ---- exterior 0..560
  for (let y = 0; y < FLOOR_Y; y++) { const k = y / FLOOR_Y; R(0, y, 560, 1, `rgb(${11 + k * 30|0},${14 + k * 20|0},${44 + k * 40|0})`); }
  for (let i = 0; i < 60; i++) R(sr() * 560 | 0, sr() * 60 | 0, 1, 1, sr() > 0.7 ? '#ffffff' : '#8c93c9');
  R(470, 8, 10, 10, '#e9e4c6'); R(468, 10, 2, 6, '#e9e4c6'); R(480, 10, 2, 6, '#e9e4c6'); R(472, 6, 6, 2, '#e9e4c6');
  for (let x = 0; x < 560; x += 22) { const h = 30 + sr() * 40 | 0; R(x, FLOOR_Y - h - 50, 22, h + 50, '#151a3a'); }
  R(56, 14, 508, 6, '#a7a092'); R(60, 20, 500, 120, '#713b2d');
  for (let y = 20; y < 140; y += 5) { R(60, y, 500, 1, '#5a2c21'); for (let x = 60 + ((y / 5) % 2) * 5; x < 560; x += 10) R(x, y, 1, 5, '#5a2c21'); }
  R(60, 92, 500, 4, '#a7a092');
  R(230, 24, 236, 14, '#1b2a73'); R(230, 24, 236, 1, '#4e63c9'); tiny(b, 'PRECINCT 6-7 POLICE STATION', 348 - tinyW('PRECINCT 6-7 POLICE STATION', 2) / 2 | 0, 26, '#ffffff', 2);
  const win = (x, y, w, h, lit) => {
    R(x - 2, y - 2, w + 4, h + 4, '#c9c2b2'); R(x, y, w, h, lit ? '#f2cf6e' : '#2c3350');
    R(x + (w >> 1), y, 1, h, '#7e6a3c'); R(x, y + (h >> 1), w, 1, '#7e6a3c');
    if (lit) R(x + 2, y + 2, 4, h - 4, '#fbe7a6');
  };
  [80, 130, 180].forEach((x, i) => win(x, 44, 28, 36, i !== 1));
  [470, 520].forEach((x, i) => win(x, 44, 28, 36, i === 0));
  [80, 130, 180, 470, 520].forEach(x => { R(x, 104, 28, 26, '#22283f'); for (let i = 0; i < 28; i += 5) R(x + i, 104, 1, 26, '#6d7387'); });
  // entrance + lamp
  R(318, 52, 92, 88, '#a7a092'); R(326, 66, 76, 74, '#26303d');
  R(330, 70, 33, 70, '#4f7385'); R(365, 70, 33, 70, '#4f7385'); R(334, 74, 3, 30, '#8fb6c7'); R(369, 74, 3, 30, '#8fb6c7');
  R(358, 100, 3, 10, '#c8c8c8'); R(367, 100, 3, 10, '#c8c8c8');
  b.fillStyle = 'rgba(70,120,255,0.22)'; b.beginPath(); b.arc(364, 52, 34, 0, Math.PI * 2); b.fill();
  R(340, 44, 48, 16, '#2b55f0'); R(340, 44, 48, 2, '#7da0ff'); R(340, 58, 48, 2, '#1b2f8c'); tiny(b, 'POLICE', 364 - tinyW('POLICE', 2) / 2 | 0, 47, '#ffffff', 2);
  R(310, 132, 108, 4, '#8e887b'); R(304, 136, 120, 4, '#7b766b');
  // police car: estate in Battenburg livery, parked side-on facing right
  {
    const x0 = 112, gy = 140;
    const span = (y, l, r, c) => R(x0 + l, y, r - l, 1, c);
    const disc = (cx, cy, r, c, top) => { for (let dy = -r; dy <= (top ? 0 : r); dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); R(x0 + cx - w, cy + dy, w * 2, 1, c); } };
    b.fillStyle = 'rgba(60,110,255,0.12)'; b.beginPath(); b.ellipse(x0 + 65, 95, 28, 9, 0, 0, Math.PI * 2); b.fill();
    R(x0 + 48, 97, 34, 2, '#1a1f3a'); R(x0 + 50, 93, 30, 4, '#2a5bff'); R(x0 + 50, 93, 30, 1, '#7da0ff');
    R(x0 + 52, 94, 6, 2, '#cfdcff'); R(x0 + 72, 94, 6, 2, '#cfdcff'); R(x0 + 63, 93, 4, 4, '#1a1f3a');
    span(98, 34, 94, '#f4f4f4'); span(99, 31, 97, '#f4f4f4');
    for (let y = 100; y < 112; y++) {
      const l = Math.round(31 - (y - 100) * 0.75), r = Math.round(97 + (y - 100) * 1.25);
      span(y, l - 2, r + 2, '#f4f4f4'); span(y, l, r, '#26324c');
      const k = y - 100; R(x0 + 40 + k, y, 3, 1, '#465b82'); R(x0 + 74 + k, y, 3, 1, '#465b82');
    }
    R(x0 + 60, 100, 3, 12, '#f4f4f4'); R(x0 + 61, 100, 1, 12, '#c9ced5');
    const body = [[112, 16, 112], [113, 10, 118], [114, 6, 123], [115, 4, 127]];
    for (const [y, l, r] of body) span(y, l, r, y === 112 ? '#ffffff' : '#f4f4f4');
    for (let y = 116; y < 132; y++) span(y, 4, 130, '#f4f4f4');
    span(132, 6, 128, '#cfd3d8'); span(133, 8, 126, '#b9bec5');
    for (let i = 0; i * 8 < 126; i++) {
      const x = 4 + i * 8, w = Math.min(8, 130 - x);
      R(x0 + x, 120, w, 4, i % 2 ? '#1f3fbf' : '#e3e600');
      R(x0 + x, 124, w, 4, i % 2 ? '#e3e600' : '#1f3fbf');
    }
    tiny(b, 'POLICE', x0 + 26, 114, '#1f3fbf');
    R(x0 + 60, 112, 1, 20, '#a9afb7'); R(x0 + 88, 112, 1, 20, '#a9afb7');
    R(x0 + 66, 116, 5, 1, '#8a9098'); R(x0 + 94, 116, 5, 1, '#8a9098');
    R(x0 + 104, 109, 5, 3, '#f4f4f4'); R(x0 + 104, 111, 5, 1, '#8a9098');
    R(x0 + 125, 115, 5, 3, '#fff3b0'); R(x0 + 4, 114, 3, 5, '#d63a3a'); R(x0 + 4, 114, 3, 1, '#ff8080');
    R(x0 + 120, 129, 11, 3, '#3a3f48'); R(x0 + 3, 129, 9, 3, '#3a3f48');
    [30, 106].forEach(cx => { disc(cx, 132, 10, '#141418', true); disc(cx, 132, 8, '#0c0c0e'); disc(cx, 132, 4, '#a9afb7'); R(x0 + cx - 1, 131, 2, 2, '#4a4f58'); });
    R(x0 + 8, gy - 1, 118, 1, 'rgba(0,0,0,0.25)');
  }
  // lamp post + bin
  R(26, 28, 3, 112, '#232633'); R(22, 24, 14, 5, '#232633'); b.fillStyle = 'rgba(255,214,120,0.18)'; b.beginPath(); b.arc(29, 32, 20, 0, Math.PI * 2); b.fill(); R(24, 29, 10, 3, '#ffe29a');
  R(270, 110, 14, 26, '#1d3b2a'); R(268, 108, 18, 4, '#244a35'); tiny(b, 'BIN', 272, 118, '#9fc8a8');
  // pavement
  R(0, FLOOR_Y, 560, 76, '#6c7079');
  for (let y = FLOOR_Y; y < 206; y += 16) R(0, y, 560, 1, '#585c65');
  for (let y = FLOOR_Y, r = 0; y < 206; y += 16, r++) for (let x = (r % 2) * 12; x < 560; x += 24) R(x, y, 1, 16, '#585c65');
  R(0, 206, 560, 2, '#a3a6ad'); R(0, 208, 560, 8, '#2b2d34'); R(0, 210, 560, 1, '#e6c400'); R(0, 213, 560, 1, '#e6c400');

  // ---- reception 560..1300
  R(560, 0, 740, 140, '#cdc4a4'); R(560, 0, 740, 12, '#3b3934');
  for (let x = 590; x < 1300; x += 96) { b.fillStyle = 'rgba(255,250,215,0.10)'; b.fillRect(x - 10, 15, 60, 40); R(x, 12, 40, 3, '#fffbe2'); }
  R(560, 100, 740, 40, '#2c4a8c'); R(560, 98, 740, 3, '#e9e3cd'); R(560, 137, 740, 3, '#1b2b55');
  R(556, 0, 8, 140, '#a7a092');
  // wanted poster
  R(586, 30, 48, 58, '#efe6cd'); tiny(b, 'WANTED', 599, 34, '#b3261e');
  R(605, 46, 8, 8, '#2a2a2a'); R(603, 54, 12, 16, '#2a2a2a'); R(596, 60, 9, 3, '#2a2a2a'); R(613, 57, 9, 3, '#2a2a2a'); R(604, 70, 4, 8, '#2a2a2a'); R(610, 70, 4, 8, '#2a2a2a');
  tiny(b, '6', 595, 51, '#b3261e'); tiny(b, '7', 621, 47, '#b3261e');
  tiny(b, '£67 REWARD', 590, 81, '#2a2a2a');
  R(646, 40, 40, 30, '#1f3a8a'); tiny(b, 'LOCK IT', 652, 46, '#ffffff'); tiny(b, 'OR', 662, 53, '#e3e600'); tiny(b, 'LOSE IT', 652, 60, '#ffffff');
  // front desk
  R(700, 36, 216, 54, 'rgba(160,205,225,0.30)'); for (let x = 700; x <= 916; x += 54) R(x, 36, 2, 54, '#8a9aa3'); R(700, 36, 218, 2, '#8a9aa3');
  [727, 781, 835, 889].forEach(x => { R(x - 3, 66, 6, 6, 'rgba(60,80,90,0.5)'); });
  R(760, 18, 100, 13, '#1b2a73'); R(785, 12, 1, 6, '#555'); R(835, 12, 1, 6, '#555'); tiny(b, 'ENQUIRIES', 810 - tinyW('ENQUIRIES') / 2 | 0, 22, '#ffffff');
  R(696, 88, 226, 5, '#8c6747'); R(700, 93, 218, 47, '#6c4b33'); for (let x = 712; x < 918; x += 26) R(x, 96, 1, 41, '#5b3e2a');
  R(735, 82, 12, 6, '#e8e8e8'); R(737, 80, 8, 2, '#c33'); // bell + forms
  R(860, 84, 18, 4, '#f4f4f4'); R(862, 82, 18, 2, '#dcdcdc');
  // clock at 6:07
  b.fillStyle = '#222'; b.beginPath(); b.arc(980, 44, 11, 0, Math.PI * 2); b.fill();
  b.fillStyle = '#f7f4ea'; b.beginPath(); b.arc(980, 44, 9, 0, Math.PI * 2); b.fill();
  for (let i = 0; i < 12; i++) R(980 + Math.sin(i / 12 * Math.PI * 2) * 7 | 0, 44 - Math.cos(i / 12 * Math.PI * 2) * 7 | 0, 1, 1, '#333');
  const hand = (ang, len, c) => { for (let r = 0; r < len; r += 0.5) R(Math.round(980 + Math.sin(ang) * r), Math.round(44 - Math.cos(ang) * r), 1, 1, c); };
  hand((6 + 7 / 60) / 12 * Math.PI * 2, 5, '#111'); hand(7 / 60 * Math.PI * 2, 8, '#111');
  // chairs
  for (let x = 1010; x < 1150; x += 22) { R(x, 116, 18, 5, '#d8692b'); R(x + 1, 102, 16, 14, '#e07a3b'); R(x + 2, 121, 2, 16, '#a8aab0'); R(x + 14, 121, 2, 16, '#a8aab0'); }
  R(1006, 121, 148, 2, '#a8aab0');
  // notice board
  R(1166, 34, 76, 46, '#7a5634'); R(1169, 37, 70, 40, '#b88a55'); tiny(b, 'NOTICES', 1180, 40, '#3b2a18');
  [[1173, 48, '#fff6a0'], [1192, 50, '#ffffff'], [1212, 47, '#bfe3ff'], [1180, 62, '#ffd0d0'], [1205, 63, '#ffffff'], [1224, 58, '#d8ffd0']].forEach(([x, y, c]) => { R(x, y, 14, 11, c); R(x + 6, y, 2, 2, '#d22'); R(x + 2, y + 4, 9, 1, '#999'); R(x + 2, y + 7, 7, 1, '#999'); });
  R(1258, 96, 16, 40, '#e6e8ec'); R(1260, 76, 12, 20, '#8fc3ff'); R(1262, 104, 4, 3, '#2a6bd1');
  // floor lino
  for (let y = FLOOR_Y; y < H; y += 12) for (let x = 560, i = 0; x < 1300; x += 12, i++) R(x, y, 12, 12, ((x / 12 + y / 12) | 0) % 2 ? '#8c93a0' : '#7a8190');
  R(560, FLOOR_Y, 740, 2, '#5f6573');

  // ---- CID 1300..2080
  R(1300, 0, 780, 140, '#93a6a8'); R(1300, 98, 780, 42, '#6a7d83'); R(1300, 96, 780, 3, '#c9d3cf'); R(1300, 137, 780, 3, '#3e4b51');
  R(1300, 0, 780, 12, '#d6d3c8'); for (let x = 1300; x < 2080; x += 24) R(x, 0, 1, 12, '#b7b3a6');
  for (let x = 1330; x < 2080; x += 110) { b.fillStyle = 'rgba(255,255,230,0.10)'; b.fillRect(x - 10, 12, 60, 40); R(x, 11, 40, 3, '#fffde8'); }
  R(1296, 0, 8, 140, '#7d8a8a');
  const blinds = x => { R(x - 3, 26, 86, 56, '#dfe3dc'); R(x, 29, 80, 50, '#17203f'); for (let y = 29; y < 79; y += 3) R(x, y, 80, 2, '#c2c8bd'); R(x + 39, 29, 2, 50, '#dfe3dc'); };
  blinds(1330); blinds(1470);
  // desk with CRT
  R(1386, 108, 72, 4, '#7c6249'); R(1390, 112, 4, 26, '#5d4836'); R(1450, 112, 4, 26, '#5d4836');
  R(1396, 88, 26, 20, '#d9d2bd'); R(1399, 91, 20, 13, '#204a3a'); tiny(b, 'C:', 1401, 93, '#7dff9e'); R(1405, 106, 8, 2, '#bdb6a1'); R(1428, 102, 18, 6, '#d9d2bd');
  R(1436, 98, 6, 6, '#ffffff'); R(1442, 100, 2, 3, '#ffffff'); // mug
  // incident board
  R(1586, 30, 124, 64, '#c0c4c8'); R(1589, 33, 118, 58, '#fbfbf8'); tiny(b, 'OP SIX SEVEN', 1648 - tinyW('OP SIX SEVEN') / 2 | 0, 36, '#1b2a73');
  const pins = [[1600, 48], [1632, 60], [1668, 46], [1690, 66], [1614, 74], [1652, 78]];
  b.strokeStyle = '#d21f1f'; b.lineWidth = 1; b.beginPath();
  [[0, 1], [1, 2], [1, 4], [2, 3], [3, 5], [4, 5], [0, 4]].forEach(([i, j]) => { b.moveTo(pins[i][0] + 5.5, pins[i][1] + 1.5); b.lineTo(pins[j][0] + 5.5, pins[j][1] + 1.5); });
  b.stroke();
  pins.forEach(([x, y], i) => { R(x, y, 11, 12, '#e8e8e8'); R(x + 3, y + 2, 5, 5, ['#c89a72', '#7a4e33', '#e3b48e', '#a8744f', '#f1c29a', '#5a3b28'][i]); R(x + 2, y + 7, 7, 4, '#333'); R(x + 5, y, 2, 2, '#d21f1f'); });
  // days since sign
  R(1742, 34, 72, 44, '#1d4d34'); R(1745, 37, 66, 38, '#246141'); tiny(b, 'DAYS SINCE', 1778 - tinyW('DAYS SINCE') / 2 | 0, 41, '#ffffff'); tiny(b, 'LAST 6-7', 1778 - tinyW('LAST 6-7') / 2 | 0, 48, '#ffffff');
  R(1767, 56, 22, 16, '#111'); tiny(b, '0', 1773, 58, '#ff4a3a', 3);
  // tea station
  R(1846, 108, 86, 4, '#c9c4b5'); R(1848, 112, 82, 26, '#e3dfd2'); R(1888, 112, 1, 26, '#b4af9f');
  R(1856, 94, 12, 14, '#d0d4d8'); R(1858, 92, 8, 2, '#222'); R(1868, 98, 3, 6, '#d0d4d8');
  R(1878, 98, 14, 10, '#3f6e2b'); tiny(b, 'TEA', 1879, 101, '#ffffff');
  [1898, 1906, 1914].forEach((x, i) => { R(x, 101, 6, 7, ['#ffffff', '#c22', '#1f3fbf'][i]); R(x + 6, 103, 1, 3, ['#ffffff', '#c22', '#1f3fbf'][i]); });
  R(1850, 74, 76, 14, '#ffffff'); tiny(b, 'WASH YOUR MUG', 1888 - tinyW('WASH YOUR MUG') / 2 | 0, 79, '#c22');
  // filing cabinets
  [1966, 1990, 2014].forEach(x => { R(x, 94, 22, 44, '#8b929b'); for (let y = 97; y < 136; y += 11) { R(x + 2, y, 18, 9, '#9da4ad'); R(x + 8, y + 3, 6, 2, '#555c66'); } });
  // carpet
  for (let y = FLOOR_Y; y < H; y += 16) for (let x = 1300; x < 2080; x += 16) R(x, y, 16, 16, ((x / 16 + y / 16) | 0) % 2 ? '#3d475d' : '#384157');
  for (let i = 0; i < 500; i++) R(1300 + sr() * 780 | 0, FLOOR_Y + sr() * 76 | 0, 1, 1, '#4a5570');
  R(1300, FLOOR_Y, 780, 2, '#2a3242');

  // ---- custody 2080..2880
  R(2080, 0, 800, 140, '#dfe3e3');
  for (let y = 12; y < 98; y += 8) R(2080, y, 800, 1, '#c2c8c9');
  for (let x = 2080; x < 2880; x += 8) R(x, 12, 1, 86, '#c2c8c9');
  R(2080, 0, 800, 12, '#2b2f36');
  for (let x = 2110; x < 2880; x += 120) { R(x, 11, 30, 4, '#fffef0'); for (let i = 0; i < 30; i += 5) R(x + i, 11, 1, 4, '#777'); }
  for (let x = 2080; x < 2880; x += 8) { R(x, 96, 8, 6, '#e8c600'); for (let i = 0; i < 6; i++) R(x + ((i + (x / 8 | 0) * 4) % 8), 96 + i, 3, 1, '#151515'); }
  R(2080, 102, 800, 38, '#6d7883'); R(2080, 137, 800, 3, '#3a424b');
  R(2076, 0, 8, 140, '#5c6670');
  // custody desk
  R(2112, 30, 140, 13, '#1b2a73'); tiny(b, 'CUSTODY', 2182 - tinyW('CUSTODY', 2) / 2 | 0, 32, '#ffffff', 2);
  R(2110, 82, 144, 5, '#9aa3ab'); R(2114, 87, 136, 53, '#7d8790'); for (let x = 2130; x < 2250; x += 30) R(x, 90, 1, 47, '#6a737c');
  R(2136, 70, 22, 12, '#2a2f38'); R(2138, 72, 18, 8, '#3d77c9');
  R(2196, 50, 50, 24, '#ffffff'); tiny(b, 'ALL', 2215, 53, '#c22'); tiny(b, 'DETAINEES', 2204, 59, '#222'); tiny(b, 'SEARCHED', 2206, 65, '#222');
  // cells
  [2310, 2430, 2550, 2670, 2790].forEach((x, i) => {
    R(x - 4, 40, 52, 100, '#2a3d50'); R(x, 46, 44, 94, '#36597a');
    for (let y = 50; y < 136; y += 12) { R(x + 3, y, 2, 2, '#5f84a6'); R(x + 39, y, 2, 2, '#5f84a6'); }
    R(x + 12, 70, 20, 10, '#1d2c3b'); R(x + 13, 71, 18, 1, '#5f84a6'); R(x + 34, 92, 6, 14, '#bfc6cc');
    R(x + 12, 30, 20, 9, '#111'); tiny(b, 'C' + (i + 1), x + 22 - tinyW('C' + (i + 1)) / 2 | 0, 32, '#ffffff');
  });
  // suspect poster between C3 and C4
  R(2603, 29, 58, 64, '#9a9480'); R(2604, 30, 56, 62, '#efe6cd');
  R(2610, 29, 2, 2, '#d21f1f'); R(2652, 29, 2, 2, '#d21f1f');
  tiny(b, 'SUSPECT ID', 2632 - tinyW('SUSPECT ID') / 2 | 0, 33, '#b3261e');
  R(2618, 40, 28, 27, '#cfd2d4'); for (let y = 43; y < 67; y += 5) R(2618, y, 3, 1, '#8c9196');
  R(2621, 46, 5, 21, '#e6ad62'); R(2638, 46, 5, 21, '#c48a45');
  R(2625, 44, 14, 23, '#c4513a'); R(2627, 42, 10, 2, '#c4513a'); R(2626, 46, 2, 18, '#e57a5c');
  R(2628, 48, 9, 10, '#7d3324'); R(2629, 49, 7, 8, '#f0c19a');
  R(2630, 51, 1, 2, '#151515'); R(2634, 51, 1, 2, '#151515'); R(2631, 55, 3, 1, '#5a2a1a');
  [[2629, 60], [2632, 62], [2635, 60], [2632, 64]].forEach(([x, y]) => R(x, y, 2, 1, '#ffd23a'));
  tiny(b, 'DESCRIBED AS', 2632 - tinyW('DESCRIBED AS') / 2 | 0, 71, '#2a2a2a');
  tiny(b, 'AROUND', 2608, 79, '#2a2a2a'); tiny(b, '6\'7"', 2636, 79, '#b3261e');
  R(2860, 0, 20, 140, '#1c2026');
  // floor
  R(2080, FLOOR_Y, 800, 76, '#7d8285');
  for (let i = 0; i < 700; i++) R(2080 + sr() * 800 | 0, FLOOR_Y + sr() * 76 | 0, 2, 1, sr() > 0.5 ? '#868b8e' : '#73787b');
  R(2080, FLOOR_Y, 800, 2, '#5a5f63'); R(2100, 150, 170, 2, '#e8c600'); tiny(b, 'WAIT BEHIND THE LINE', 2110, 155, '#e8c600');
}

// ---------------------------------------------------------------- characters
const SKINS = ['#f1c29a', '#d9a37a', '#a8744f', '#7a4e33', '#e8b48e'];
function pal(o) {
  const p = Object.assign({ eye: '#151515', shoe: '#eeeeee', hair: '#2a1c12' }, o);
  p.bodyD = p.bodyD || shade(p.body, 0.72); p.sleeve = p.sleeve || p.body; p.sleeveD = p.sleeveD || shade(p.sleeve, 0.72);
  p.legD = p.legD || shade(p.leg, 0.72); p.shoeD = p.shoeD || shade(p.shoe, 0.75); p.skinD = p.skinD || shade(p.skin, 0.82);
  p.hood = p.hood || shade(p.body, 0.88);
  return p;
}
const PLAYER_PAL = pal({ body: '#d4ef00', bodyD: '#9fb500', sleeve: '#c9e300', sleeveD: '#8ea200', stripe: '#d9dee6', leg: '#1d2030', shoe: '#101014', skin: '#f1c29a', hat: '#141a33', badge: '#d0d7df' });
const WHITE = new Proxy({}, { get: () => '#ffffff' });
// the two playable officers: Sutton hits harder, Shearer is quicker
const OFFICERS = [
  { S: 1.25, hp: 100, head: 'helmet', kind: 'player', tw: 11, name: 'PC SUTTON', spd: 1, atkSpd: 1, dmg: 1.15, power: 5, speed: 3, pal: PLAYER_PAL },
  { S: 1.2, hp: 100, head: 'bowler', kind: 'player', tw: 10, name: 'PC SHEARER', spd: 1.14, atkSpd: 1.15, dmg: 0.95, power: 3, speed: 5,
    pal: pal({ body: '#d4ef00', bodyD: '#9fb500', sleeve: '#c9e300', sleeveD: '#8ea200', stripe: '#d9dee6', leg: '#1d2030', shoe: '#101014', skin: '#e9b58f', hair: '#6b3a1e', hat: '#141a33', badge: '#d0d7df' }) }
];
const TYPES = {
  hoodie: { S: 1.2, hp: 26, speed: 52, dmg: 7, reach: 27, windup: 0.38, score: 200, head: 'hood', tw: 11,
    names: ['JAYDEN', 'TYLER', 'KAI', 'BRANDON', 'RYAN', 'LIAM', 'TOMMY', 'CALLUM'],
    pal: () => pal({ body: pick(['#5d626e', '#30405a', '#6d2a3c', '#2e5040', '#4a3a63', '#26262c']), leg: pick(['#2a2d36', '#3a3f4b', '#1d2230', '#4b5263']), skin: pick(SKINS) }) },
  tracky: { S: 1.15, hp: 22, speed: 64, dmg: 8, reach: 31, windup: 0.3, score: 250, head: 'cap', kick: true, stripes: true, tw: 10,
    names: ['DECLAN', 'CONNOR', 'MASON', 'ROBBIE', 'KIERAN', 'SHANE'],
    pal: () => { const c = pick(['#6b2fa3', '#1f7f8c', '#b0262f', '#24408f', '#1d1d22', '#2f7a3a']); return pal({ body: c, leg: c, skin: pick(SKINS), cap: pick(['#111', '#f2f2f2', '#c22', '#1f3fbf']) }); } },
  big: { S: 1.45, hp: 64, speed: 30, dmg: 13, reach: 31, windup: 0.55, score: 500, head: 'bald', heavy: true, armor: 2, tw: 14,
    names: ['BIG DAZ', 'TANK', 'MASSIVE STEVE', 'CHUNK'],
    pal: () => { const s = pick(SKINS); return pal({ body: '#ebe7da', sleeve: s, leg: pick(['#3b4f78', '#2f3a52']), skin: s, shoe: '#2a2a2a' }); } },
  boss: { S: 1.65, hp: 300, speed: 42, dmg: 15, reach: 36, windup: 0.45, score: 5000, head: 'hotdog', heavy: true, armor: 3, tw: 13, boss: true,
    names: ['SILLY SAUSAGE'],
    pal: () => pal({ body: '#c4513a', sleeve: '#c4513a', leg: '#2b2f3d', shoe: '#e8e8e8', skin: '#f0c19a', bun: '#e6ad62', bunD: '#c48a45', sheen: '#e57a5c', mustard: '#ffd23a' }) }
};

function makeT(sx, sy, face, Sc, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return (lx, ly) => [sx + (lx * c - ly * s) * face * Sc, sy - (lx * s + ly * c) * Sc];
}
function stampLine(T, ax, ay, bx2, by2, w, col, Sc) {
  const [x0, y0] = T(ax, ay), [x1, y1] = T(bx2, by2);
  const ww = Math.max(1, Math.round(w * Sc));
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  ctx.fillStyle = col;
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    ctx.fillRect(Math.round(x - ww / 2), Math.round(y - ww / 2), ww, ww);
  }
}
function stampBox(T, cx, cy, w, h, col, Sc, rot) {
  const [x, y] = T(cx, cy);
  let ww = w * Sc, hh = h * Sc;
  if (Math.abs(Math.sin(rot)) > 0.7) [ww, hh] = [hh, ww];
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x - ww / 2), Math.round(y - hh / 2), Math.max(1, Math.round(ww)), Math.max(1, Math.round(hh)));
}

function poseFor(a) {
  const s = a.state, d = a.def;
  const guard = { lb: [-8, 6], lf: [10, -6], ab: [25, 80], af: [45, 85], lean: 4, bob: 0 };
  const walking = a.moving && (s === 'walk' || s === 'approach' || s === 'enter' || s === 'idle');
  if (walking) {
    const ph = a.walkPh, sn = Math.sin(ph);
    return { lb: [-sn * 26, -4 - 16 * Math.max(0, Math.cos(ph))], lf: [sn * 26, -4 - 16 * Math.max(0, -Math.cos(ph))], ab: [25 + sn * 14, 80], af: [45 - sn * 14, 85], lean: 6, bob: Math.abs(Math.cos(ph)) * 0.8 };
  }
  switch (s) {
    case 'idle': case 'walk': case 'approach': case 'enter': return { ...guard, bob: Math.sin(a.t * 4) * 0.6 };
    case 'attack': {
      const k = a.st / a.atkDur;
      if (a.atk === 'jab') return k > 0.2 && k < 0.75 ? { ...guard, af: [90, -4], lean: 10, lf: [18, -6] } : { ...guard, af: [60, 60], lean: 6 };
      if (a.atk === 'cross') return k > 0.2 && k < 0.75 ? { ...guard, ab: [92, -4], af: [30, 95], lean: 14, lf: [16, -6] } : { ...guard, ab: [50, 70], lean: 8 };
      return k < 0.25 ? { ...guard, af: [15, 70], lean: 12, bob: -2, lb: [-16, 24], lf: [20, -30] } : { ...guard, af: [168, -6], ab: [10, 60], lean: -6, bob: 1.5, lf: [14, -4] };
    }
    case 'jump': return a.kicked ? { lb: [-15, -95], lf: [95, -4], ab: [-55, 30], af: [-15, 60], lean: -18, bob: 2 } : { lb: [-25, -75], lf: [40, -85], ab: [-25, 60], af: [70, 40], lean: 0, bob: 2 };
    case 'special': return { lb: [-14, 0], lf: [14, 0], ab: [95, 0], af: [95, 0], lean: 0, baton: true };
    case 'hurt': return { lb: [-12, 4], lf: [8, -4], ab: [-40, 30], af: [-20, 40], lean: -20 };
    case 'down': case 'getup': case 'dead': return { lb: [-6, 0], lf: [8, -10], ab: [160, 10], af: [175, 0], lean: 0 };
    case 'windup':
      if (d.heavy) return { ...guard, ab: [170, 0], af: [175, 0], lean: -8 };
      if (d.kick) return { ...guard, lf: [30, -70], lean: -6 };
      return { ...guard, af: [-40, 60], lean: -10 };
    case 'strike':
      if (d.heavy) return { ...guard, ab: [80, 0], af: [85, 0], lean: 24, lf: [22, -8] };
      if (d.kick) return { ...guard, lf: [88, 0], lb: [-14, 0], lean: -14, ab: [-30, 40] };
      return { ...guard, af: [90, -4], lean: 14, lf: [18, -6] };
    case 'recover': return { ...guard, af: [65, 30], lean: 6 };
    case 'taunt': {
      const w = a.st * 13, v = Math.sin(w) * 26;
      return { lb: [-10, 4], lf: [10, -4], ab: [8, 82 + v], af: [8, 82 - v], lean: 2, bob: Math.abs(Math.sin(w)) * 0.8, palms: true };
    }
    case 'chargewind': return { ...guard, lean: -14, ab: [-60, 40], af: [-50, 40], lb: [-20, 10], lf: [20, -30], bob: -1 };
    case 'charge': { const sn = Math.sin(a.t * 22); return { lb: [-sn * 35, -30], lf: [sn * 35, -30], ab: [-50, 30], af: [-40, 30], lean: 28, bob: 1 }; }
    case 'win': return { ...guard, af: [175, -10], ab: [20, 70], lean: -2 };
  }
  return guard;
}

function drawActor(a, camX) {
  if (a.state === 'dead' && Math.floor(a.st * 14) % 2) return;
  if (a.inv > 0 && a.kind === 'player' && a.state !== 'special' && Math.floor(a.inv * 16) % 2) return;
  const Sc = a.S, rot = a.rot || 0, face = a.face;
  const sx = Math.round(a.x - camX), sy = Math.round(FLOOR_Y + a.z - a.y - Math.sin(rot) * 6 * Sc);
  const T = makeT(sx, sy, face, Sc, rot);
  const P = a.flash > 0 ? WHITE : a.pal, d = a.def;
  const p = poseFor(a);
  const hx = 0, hy = 20 + (p.bob || 0), L = rad(p.lean || 0), tl = 15, tw = d.tw || 11;
  const nx = hx + Math.sin(L) * tl, ny = hy + Math.cos(L) * tl;
  const shx = hx + Math.sin(L) * (tl - 2), shy = hy + Math.cos(L) * (tl - 2);
  const limb = (bx, by, a1, a2, l1, l2) => { const k = [bx + Math.sin(rad(a1)) * l1, by - Math.cos(rad(a1)) * l1]; return [k, [k[0] + Math.sin(rad(a1 + a2)) * l2, k[1] - Math.cos(rad(a1 + a2)) * l2]]; };
  const ln = (q, r, w, c) => stampLine(T, q[0], q[1], r[0], r[1], w, c, Sc);
  const bx = (x, y, w, h, c) => stampBox(T, x, y, w, h, c, Sc, rot);
  const ax = t => [hx + Math.sin(L) * tl * t, hy + Math.cos(L) * tl * t];
  const arm = (base, ang, cS, cH, front) => {
    const [k, h] = limb(base[0], base[1], ang[0], ang[1], 8, 8);
    ln(base, k, 4, cS); ln(k, h, 4, cS);
    if (d.stripes && !a.flash) { ln(base, k, 1, '#f4f4f4'); ln(k, h, 1, '#f4f4f4'); }
    if (a.kind === 'player' && !a.flash) ln([k[0] + (h[0] - k[0]) * 0.45, k[1] + (h[1] - k[1]) * 0.45], [k[0] + (h[0] - k[0]) * 0.65, k[1] + (h[1] - k[1]) * 0.65], 4, P.stripe);
    if (p.palms) bx(h[0] + 1, h[1] + 0.5, 4, 2, cH); else bx(h[0], h[1], 3.4, 3.4, cH);
    if (front && p.baton) { const dx = h[0] - k[0], dy = h[1] - k[1], m = Math.hypot(dx, dy) || 1; ln(h, [h[0] + dx / m * 12, h[1] + dy / m * 12], 2, a.flash ? '#fff' : '#111'); }
    return h;
  };
  const leg = (ang, cL, cS) => {
    const [k, f] = limb(hx, hy, ang[0], ang[1], 10, 10);
    ln([hx, hy], k, 5, cL); ln(k, f, 5, cL);
    if (d.stripes && !a.flash) { ln([hx, hy], k, 1, '#f4f4f4'); ln(k, f, 1, '#f4f4f4'); }
    bx(f[0] + 1.5, f[1] + 0.5, 6.5, 3, cS);
  };
  arm([shx - 1, shy], p.ab, P.sleeveD, P.skinD, false);
  leg(p.lb, P.legD, P.shoeD);
  leg(p.lf, P.leg, P.shoe);
  const hotdog = d.head === 'hotdog';
  if (hotdog) {
    // the costume: one big sausage in a bun, face peeking out of a hole
    const bot = [hx, hy - 4], top = [nx + Math.sin(L) * 12, ny + 14];
    const at = t => [bot[0] + (top[0] - bot[0]) * t, bot[1] + (top[1] - bot[1]) * t];
    const b0 = at(0.02), b1 = at(0.95), f1 = at(0.5);
    ln([b0[0] - 6.5, b0[1]], [b1[0] - 6.5, b1[1]], 6, P.bunD);
    ln(bot, top, 13, P.body);
    bx(top[0], top[1] + 7.5, 9, 2, P.body); bx(top[0], top[1] + 9, 5, 1.5, P.body);
    if (!a.flash) {
      ln([bot[0] - 3, bot[1] + 2], [top[0] - 3, top[1] - 2], 2, P.sheen);
      for (let i = 0; i < 7; i++) { const q = at(0.06 + i * 0.075); bx(q[0] + (i % 2 ? 2.5 : -0.5), q[1], 3, 2, P.mustard); }
    }
    ln([b0[0] + 6.5, b0[1]], [f1[0] + 6.5, f1[1]], 6, P.bun);
  } else ln([hx, hy], [nx, ny], tw, P.body);
  // torso details
  if (!a.flash) {
    if (a.kind === 'player') {
      [0.2, 0.55].forEach(t => { const q = ax(t); ln([q[0] - 5, q[1]], [q[0] + 5, q[1]], 2, P.stripe); });
      const q = ax(0.85); bx(q[0] + 3.5, q[1] - 1, 2.5, 3.5, '#111'); bx(q[0] - 1, q[1] + 1, 4, 2, '#1b2a73');
    } else if (d.head === 'hood') {
      const q = ax(0.1); bx(q[0] + 2, q[1] + 1, 7, 3, P.bodyD); const r = ax(0.9); bx(r[0] + 3, r[1] - 2, 1, 4, '#ddd');
    } else if (d.stripes) {
      const q0 = ax(-0.3), q1 = ax(1.2); ln([q0[0] + 4, q0[1]], [q1[0] + 4, q1[1]], 1, '#f4f4f4');
    } else if (d.head === 'bald') {
      const q = ax(1); bx(q[0] - 4, q[1] - 2, 2, 5, P.skin); bx(q[0] + 4, q[1] - 2, 2, 5, P.skin);
    }
  }
  // head
  const hdx = nx + Math.sin(L) * 4.5, hdy = ny + 5 + (p.head || 0);
  if (d.head === 'hood') bx(hdx - 1.5, hdy + 0.5, 10, 11, P.hood);
  if (hotdog) { bx(hdx + 1.5, hdy, 7, 8, a.flash ? '#fff' : shade(P.body, 0.6)); bx(hdx + 1.5, hdy, 6, 7, P.skin); }
  else bx(hdx, hdy, 8, 9, P.skin);
  if (d.head === 'hood') { bx(hdx - 3, hdy + 0.5, 3, 10, P.hood); bx(hdx, hdy + 5, 8, 2, P.hood); }
  if (!a.flash) bx(hdx + (hotdog ? 3.5 : 2.5), hdy + 1, 1, 1.2, P.eye);
  if (d.head === 'helmet') {
    bx(hdx, hdy + 4.5, 11, 2, P.hat); bx(hdx - 0.5, hdy + 7.5, 9, 5, P.hat); bx(hdx - 0.5, hdy + 10.5, 6, 2, P.hat);
    bx(hdx - 0.5, hdy + 12, 2, 2, P.badge); bx(hdx + 3, hdy + 7, 2, 3, P.badge);
  } else if (d.head === 'bowler') {
    bx(hdx - 4, hdy - 0.5, 2.5, 6, P.hair); bx(hdx - 5.5, hdy + 0.5, 3.5, 3.5, P.hair);
    bx(hdx, hdy + 4.5, 11, 1.6, P.hat); bx(hdx - 0.5, hdy + 8.6, 8, 3, P.hat); bx(hdx - 0.5, hdy + 10.5, 6, 1.5, P.hat);
    bx(hdx - 0.5, hdy + 6.3, 8, 2, a.flash ? '#fff' : '#f2f2f2');
    if (!a.flash) for (let i = 0; i < 4; i++) bx(hdx - 4 + i * 2 + 0.5, hdy + 6.3 + (i % 2 ? 0.5 : -0.5), 1, 1, '#111');
    bx(hdx + 2.5, hdy + 9, 1.6, 2, P.badge);
  } else if (d.head === 'cap') {
    bx(hdx - 3.5, hdy + 1, 2, 5, P.hair); bx(hdx - 0.5, hdy + 3.5, 9, 3, P.cap); bx(hdx + 5, hdy + 2.5, 4, 1.2, P.cap);
  } else if (d.head === 'bald') {
    bx(hdx - 2, hdy + 1, 1.5, 2, P.skinD); if (!a.flash) bx(hdx + 1.5, hdy - 3, 4, 1.5, P.skinD);
  }
  if (a.state === 'taunt' && !a.flash) bx(hdx + (hotdog ? 3.5 : 2.5), hdy - 2.5, 2.5, 1, '#5a2a1a');
  arm([shx + 1, shy], p.af, P.sleeve, P.skin, true);
}

function drawShadow(x, z, w, camX) {
  const sx = Math.round(x - camX), sy = Math.round(FLOOR_Y + z);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(sx - w / 2 + 2, sy - 2, w - 4, 4); ctx.fillRect(sx - w / 2, sy - 1, w, 2);
}

// ---------------------------------------------------------------- game state
const G = { char: 0, sel: 0, mode: 'title', t: 0, round: 1, score: 0, hi: 0, lives: 3, shake: 0, freeze: 0, tauntCd: 2, taunter: null, cont: 0, msg: null, msgT: 0, area: -1, areaT: 0, goT: 0, clearT: 0, enemyBar: null, enemyBarT: 0, time: 0 };
try { G.hi = +localStorage.getItem('p67-hi') || 0; G.sel = G.char = +localStorage.getItem('p67-char') === 1 ? 1 : 0; } catch (e) {}
let player, enemies = [], pickups = [], props = [], parts = [], pops = [], fx = [], spawnQ = [], camX = 0, waveIdx = 0, wave = null;
let nextId = 1;

const WAVES = [
  { at: 0, groups: [['hoodie', 'hoodie']] },
  { at: 250, groups: [['hoodie', 'tracky', 'hoodie']] },
  { at: 640, groups: [['tracky', 'hoodie'], ['hoodie', 'tracky', 'hoodie']] },
  { at: 1000, groups: [['big', 'hoodie'], ['hoodie', 'tracky']] },
  { at: 1380, groups: [['tracky', 'tracky', 'hoodie'], ['big', 'hoodie']] },
  { at: 1720, groups: [['hoodie', 'tracky', 'hoodie'], ['big', 'tracky']] },
  { at: 2120, groups: [['tracky', 'hoodie', 'tracky'], ['big', 'hoodie', 'hoodie']] },
  { at: STAGE_W - W, groups: [['boss', 'hoodie']], boss: true }
];
const PROPS = [
  { x: 300, z: 6, type: 'bin', drop: 'tea' }, { x: 760, z: 52, type: 'box', drop: 'vape' }, { x: 1180, z: 8, type: 'bin', drop: 'tea' },
  { x: 1480, z: 4, type: 'cabinet', drop: 'barm' }, { x: 1700, z: 50, type: 'box', drop: 'phone' }, { x: 2000, z: 8, type: 'bin', drop: 'tea' },
  { x: 2380, z: 10, type: 'box', drop: 'barm' }, { x: 2600, z: 50, type: 'cabinet', drop: 'tea' }, { x: 2740, z: 6, type: 'box', drop: 'tea' }
];
const PICK = { tea: { hp: 30, label: 'BREW!' }, barm: { hp: 60, label: 'CHIP BARM!' }, vape: { score: 500, label: 'CONFISCATED!' }, phone: { score: 1000, label: 'EVIDENCE!' } };

function makeActor(kind, x, z) {
  const def = kind === 'player' ? OFFICERS[G.char] : TYPES[kind];
  const diff = 1 + (G.round - 1) * 0.3;
  const hp = kind === 'player' ? def.hp : Math.round(def.hp * diff);
  return { id: nextId++, kind, def, x, z, y: 0, vx: 0, vy: 0, face: 1, S: def.S, hp, maxHp: hp, state: 'idle', st: 0, t: Math.random() * 10,
    walkPh: 0, flash: 0, rot: 0, inv: 0, moving: false, atkCd: rnd(0.4, 1.2), armorHits: 0, tauntCd: rnd(3, 6),
    pal: kind === 'player' ? def.pal : def.pal(), name: kind === 'player' ? def.name : pick(def.names) };
}

function resetStage() {
  player = makeActor('player', camX + 60, 32); player.x = 50; player.face = 1;
  enemies = []; pickups = []; parts = []; pops = []; fx = []; spawnQ = [];
  props = PROPS.map(p => ({ ...p, hp: 2, flash: 0 }));
  camX = 0; waveIdx = 0; wave = null; G.taunter = null; G.tauntCd = 1.5; G.area = -1; G.time = 0; G.enemyBar = null;
}
function startGame(round) {
  G.round = round; if (round === 1) { G.score = 0; G.lives = 3; }
  resetStage(); G.mode = 'play';
  G.msg = round === 1 ? 'ROUND 1  DAY SHIFT' : 'ROUND ' + round + '  NIGHT SHIFT'; G.msgT = 2.6;
  S.siren(2.5); startMusic(132 + (round - 1) * 6);
}

// ---------------------------------------------------------------- effects
function shake(t) { G.shake = Math.max(G.shake, t); }
function popup(x, sy, s, col = '#fff', size = 8, life = 0.9) { pops.push({ x, y: sy, s, col, size, life, max: life }); }
function sparks(x, sy, n, cols) { for (let i = 0; i < n; i++) parts.push({ x, y: sy, vx: rnd(-90, 90), vy: rnd(-120, 30), g: 260, life: rnd(0.15, 0.35), col: pick(cols), sz: 1 }); }
function hitFx(x, sy, big) { fx.push({ x, y: sy, t: 0, big }); }
function addScore(n) { G.score += n; if (G.score > G.hi) G.hi = G.score; }

// ---------------------------------------------------------------- combat
function vulnerable(a) { return a.state !== 'down' && a.state !== 'getup' && a.state !== 'dead' && a.inv <= 0; }
function knockdown(a, dir, dead) {
  a.state = 'down'; a.st = 0; a.vx = dir * (a.def.boss ? 70 : 115); a.vy = 210; a.y = Math.max(a.y, 1); a.face = -dir; a.bounced = false; a.landed = false; a.dead = dead;
  shake(0.12);
}
function downPhys(a, dt) {
  if (!a.landed) {
    a.x += a.vx * dt; a.y += a.vy * dt; a.vy -= GRAV * dt; a.rot = Math.min(Math.PI / 2, a.rot + dt * 8);
    if (a.y <= 0) {
      a.y = 0;
      if (!a.bounced) { a.bounced = true; a.vy = 90; a.vx *= 0.4; a.y = 0.1; S.thud(); shake(0.12); sparks(a.x, FLOOR_Y + a.z, 5, ['#999', '#bbb']); }
      else { a.landed = true; a.vy = 0; a.vx = 0; a.st = 0; a.rot = Math.PI / 2; }
    }
  }
}
function damageEnemy(e, dmg, kd, src) {
  if (e.state === 'taunt') {
    dmg *= 2; stop67(); if (G.taunter === e) { G.taunter = null; G.tauntCd = rnd(1.6, 3); }
    addScore(500); popup(e.x, FLOOR_Y + e.z - 70 * e.S / 1.2, 'BUSTED! +500', '#d4ef00', 8, 1.2); S.bonus();
  }
  e.hp -= dmg; e.flash = 0.08; G.freeze = kd ? 0.07 : 0.045; addScore(dmg * 10);
  G.enemyBar = e; G.enemyBarT = 3;
  const hy = FLOOR_Y + e.z - e.y - 34 * e.S;
  hitFx(e.x - src.face * 4, hy, kd); sparks(e.x, hy, 6, ['#fff', '#ffe066', '#ffb020']); S.hit(kd);
  if (e.hp <= 0) { e.hp = 0; knockdown(e, src.face || 1, true); addScore(e.def.score); popup(e.x, hy - 10, '+' + e.def.score, '#fff'); return; }
  if (kd && !(e.def.boss && Math.random() < 0.5)) { knockdown(e, src.face || 1, false); return; }
  if (e.def.armor && e.state !== 'hurt' && ++e.armorHits <= e.def.armor) return;
  e.armorHits = 0; e.state = 'hurt'; e.st = 0; e.x += (src.face || 1) * 4;
}
function tryHit(att, reach, dmg, kd, set, omni) {
  let any = false;
  for (const e of enemies) {
    if (set.has(e) || !vulnerable(e)) continue;
    const dx = omni ? Math.abs(e.x - att.x) : (e.x - att.x) * att.face;
    if (dx > -6 && dx < reach + 4 * e.S && Math.abs(e.z - att.z) < 11 && Math.abs(e.y - att.y) < 40) { set.add(e); damageEnemy(e, dmg, kd, att); any = true; }
  }
  for (const pr of props) {
    if (set.has(pr)) continue;
    const dx = omni ? Math.abs(pr.x - att.x) : (pr.x - att.x) * att.face;
    if (dx > -6 && dx < reach + 6 && Math.abs(pr.z - att.z) < 11) {
      set.add(pr); pr.hp--; pr.flash = 0.1; S.hit(false); shake(0.05); G.freeze = 0.03;
      if (pr.hp <= 0) breakProp(pr);
      any = true;
    }
  }
  return any;
}
function breakProp(pr) {
  props.splice(props.indexOf(pr), 1); S.breakIt(); addScore(50);
  const col = { bin: ['#2f6b3a', '#1d3b2a', '#555'], box: ['#b98a4e', '#8a6235', '#e0c080'], cabinet: ['#8b929b', '#5c636c', '#c0c6cc'] }[pr.type];
  for (let i = 0; i < 14; i++) parts.push({ x: pr.x, y: FLOOR_Y + pr.z - 12, vx: rnd(-100, 100), vy: rnd(-180, -40), g: 520, life: rnd(0.4, 0.8), col: pick(col), sz: 2 });
  pickups.push({ x: pr.x, z: pr.z, type: pr.drop, t: 0 });
}
function damagePlayer(dmg, kd, dir) {
  const p = player;
  if (p.state === 'special' || !vulnerable(p)) return;
  p.hp -= dmg; p.flash = 0.08; S.hurt(); shake(0.1); G.freeze = 0.05;
  hitFx(p.x + dir * 2, FLOOR_Y + p.z - p.y - 40, kd);
  if (p.hp <= 0) { p.hp = 0; knockdown(p, dir, true); }
  else if (kd) knockdown(p, dir, false);
  else { p.state = 'hurt'; p.st = 0; p.x += dir * 5; }
}

// ---------------------------------------------------------------- player
function startAttack(p) {
  const chain = p.lastAtkT < 0.45 && p.lastConnected && p.comboStep > 0;
  const step = chain ? p.comboStep % 3 : 0;
  if (keys.left) p.face = -1; else if (keys.right) p.face = 1;
  p.atk = ['jab', 'cross', 'upper'][step]; p.atkDur = [0.2, 0.22, 0.36][step] / p.def.atkSpd; p.comboStep = step + 1;
  p.state = 'attack'; p.st = 0; p.hitSet = new Set(); p.connected = false; p.queued = false; S.swing();
}
function updatePlayer(p, dt) {
  p.t += dt; p.st += dt; if (p.inv > 0) p.inv -= dt; if (p.flash > 0) p.flash -= dt;
  p.lastAtkT = (p.lastAtkT || 0) + dt;
  const mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), mz = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  p.moving = false;
  switch (p.state) {
    case 'idle': case 'walk':
      if (buf('spc') && p.hp > 10) { p.state = 'special'; p.st = 0; p.hp -= 8; p.hitSet = new Set(); S.spin(); break; }
      if (buf('jump')) { p.state = 'jump'; p.vy = 330; p.jvx = mx * 95; p.kicked = false; p.st = 0; p.hitSet = new Set(); S.jump(); break; }
      if (buf('atk')) { startAttack(p); break; }
      if (mx || mz) {
        const n = mx && mz ? 0.8 : 1;
        p.x += mx * 92 * p.def.spd * n * dt; p.z += mz * 52 * p.def.spd * n * dt; if (mx) p.face = mx;
        p.moving = true; p.walkPh += dt * 10; p.state = 'walk';
      } else p.state = 'idle';
      break;
    case 'attack': {
      const k = p.st / p.atkDur;
      if (k > 0.22 && k < 0.7) {
        const dmg = Math.round({ jab: 6, cross: 7, upper: 12 }[p.atk] * p.def.dmg);
        if (tryHit(p, 30, dmg, p.atk === 'upper', p.hitSet, false)) p.connected = true;
      }
      if (k > 0.35 && buf('atk')) p.queued = true;
      if (k >= 1) {
        p.lastConnected = p.connected; p.lastAtkT = 0;
        if (p.queued) startAttack(p); else p.state = 'idle';
      }
      break;
    }
    case 'jump':
      p.x += p.jvx * dt; p.y += p.vy * dt; p.vy -= GRAV * dt;
      if (!p.kicked && buf('atk')) { p.kicked = true; S.swing(); }
      if (p.kicked) tryHit(p, 32, Math.round(12 * p.def.dmg), true, p.hitSet, false);
      if (p.y <= 0) { p.y = 0; p.state = 'idle'; p.st = 0; }
      break;
    case 'special':
      p.inv = 0.05;
      if (Math.floor(p.st / 0.07) !== Math.floor((p.st - dt) / 0.07)) p.face = -p.face;
      if (p.st < 0.38) tryHit(p, 42, Math.round(14 * p.def.dmg), true, p.hitSet, true);
      if (p.st >= 0.5) { p.state = 'idle'; p.inv = 0.25; }
      break;
    case 'hurt': if (p.st >= 0.3) p.state = 'idle'; break;
    case 'down':
      downPhys(p, dt);
      if (p.landed && p.st > (p.dead ? 1.3 : 0.7)) {
        if (p.dead) { loseLife(); break; }
        p.state = 'getup'; p.st = 0;
      }
      break;
    case 'getup':
      p.rot = Math.max(0, Math.PI / 2 * (1 - p.st / 0.35));
      if (p.st >= 0.35) { p.state = 'idle'; p.rot = 0; p.inv = 1.2; }
      break;
    case 'win': break;
  }
  p.z = clamp(p.z, 0, DEPTH);
  p.x = clamp(p.x, camX + 14, camX + W - 14);
  // pickups
  if (p.y < 4 && (p.state === 'idle' || p.state === 'walk')) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const it = pickups[i];
      if (Math.abs(it.x - p.x) < 14 && Math.abs(it.z - p.z) < 9) {
        const d = PICK[it.type];
        if (d.hp) p.hp = Math.min(p.maxHp, p.hp + d.hp);
        if (d.score) addScore(d.score);
        popup(it.x, FLOOR_Y + it.z - 24, d.label, '#d4ef00'); S.pick(); pickups.splice(i, 1);
      }
    }
  }
}
function loseLife() {
  G.lives--;
  if (G.lives <= 0) { G.mode = 'gameover'; G.cont = 9.99; stopMusic(); stop67(); S.over(); return; }
  respawn();
}
function respawn() {
  const p = player; p.hp = p.maxHp; p.state = 'idle'; p.rot = 0; p.y = 0; p.dead = false; p.inv = 2.5; p.landed = false;
  for (const e of enemies) if (vulnerable(e) && Math.abs(e.x - p.x) < 90) knockdown(e, e.x >= p.x ? 1 : -1, false);
  popup(p.x, FLOOR_Y + p.z - 80, 'BACK ON DUTY!', '#d4ef00', 8, 1.4);
}

// ---------------------------------------------------------------- enemies
const TAUNT_DUR = 1.72 / VOICE_RATE;
function spawnEnemy(kind, side) {
  const e = makeActor(kind, side < 0 ? camX - 26 : camX + W + 26, rnd(6, DEPTH - 6));
  e.face = -side; e.state = 'enter'; enemies.push(e);
  if (kind === 'boss') { e.z = 32; e.tauntCd = 0.6; G.msg = 'WARNING!  SILLY SAUSAGE'; G.msgT = 2.6; e.sayT = 2.4; startMusic(150 + (G.round - 1) * 6); }
  return e;
}
function startTaunt(e) {
  e.state = 'taunt'; e.st = 0; e.said6 = e.said7 = false; G.taunter = e; play67();
}
function updateEnemy(e, dt) {
  e.t += dt; e.st += dt; if (e.flash > 0) e.flash -= dt; if (e.atkCd > 0) e.atkCd -= dt; if (e.inv > 0) e.inv -= dt; e.tauntCd -= dt;
  const p = player, d = e.def, dx = p.x - e.x, dz = p.z - e.z, adx = Math.abs(dx);
  const diff = 1 + (G.round - 1) * 0.12;
  const onScreen = e.x > camX + 8 && e.x < camX + W - 8;
  e.moving = false;
  const walkTo = (tx, tz, spd) => {
    const mx = tx - e.x, mz = tz - e.z;
    const ax = Math.abs(mx) > 3 ? Math.sign(mx) * Math.min(spd * dt, Math.abs(mx)) : 0;
    const az = Math.abs(mz) > 2 ? Math.sign(mz) * Math.min(spd * 0.6 * dt, Math.abs(mz)) : 0;
    e.x += ax; e.z += az; if (ax || az) { e.moving = true; e.walkPh += dt * (spd / 5); }
  };
  switch (e.state) {
    case 'enter':
      walkTo(e.x + e.face * 40, e.z, d.speed * diff);
      if (onScreen) e.state = 'approach';
      break;
    case 'approach': {
      e.face = dx >= 0 ? 1 : -1;
      if (e.sayT > 0 && (e.sayT -= dt) <= 0) popup(e.x, FLOOR_Y + e.z - 100, "WE'RE ALL TRYING TO FIND", '#ffd23a', 8, 2), popup(e.x, FLOOR_Y + e.z - 88, 'THE SIX WHO SEVEN THIS!', '#ffd23a', 8, 2);
      const side = dx >= 0 ? -1 : 1, pv = vulnerable(p) && p.state !== 'down';
      if (d.boss) {
        if (e.tauntCd <= 0 && !G.taunter) { startTaunt(e); e.tauntCd = rnd(7, 10); break; }
        if (adx > 110 && e.atkCd <= 0 && Math.random() < dt * 1.5) { e.state = 'chargewind'; e.st = 0; break; }
      }
      if (pv && e.engaged) walkTo(p.x + side * (d.reach - 6), p.z, d.speed * diff);
      else walkTo(clamp(p.x + side * (78 + (e.id % 3) * 20), camX + 16, camX + W - 16), clamp(p.z + (e.id % 2 ? -20 : 20) + Math.sin(e.t * 0.8 + e.id) * 10, 2, DEPTH - 2), d.speed * 0.7 * diff);
      if (pv && e.engaged && adx < d.reach && adx > 9 && Math.abs(dz) < 7 && e.atkCd <= 0) { e.state = 'windup'; e.st = 0; break; }
      if (!d.boss && !G.taunter && G.tauntCd <= 0 && onScreen && (!e.engaged || adx > 55 || !pv) && Math.random() < dt * 1.4) startTaunt(e);
      break;
    }
    case 'windup': if (e.st >= d.windup / diff) { e.state = 'strike'; e.st = 0; e.hitDone = false; S.swing(); } break;
    case 'strike':
      if (!e.hitDone) {
        const fdx = (p.x - e.x) * e.face;
        if (fdx > 0 && fdx < d.reach + 7 && Math.abs(p.z - e.z) < 9 && p.y < 26) { e.hitDone = true; damagePlayer(Math.round(d.dmg * (1 + (G.round - 1) * 0.15)), !!d.heavy, e.face); }
      }
      if (d.heavy && e.st < 0.1) e.x += e.face * 40 * dt;
      if (e.st >= 0.16) { e.state = 'recover'; e.st = 0; }
      break;
    case 'recover': if (e.st >= 0.45) { e.state = 'approach'; e.atkCd = rnd(0.7, 1.7) / diff; } break;
    case 'taunt':
      e.face = dx >= 0 ? 1 : -1;
      if (!e.said6 && e.st >= 0.04) { e.said6 = true; popup(e.x - e.face * 6 * e.S, FLOOR_Y + e.z - 44 * e.S, '6', '#ff5fb0', 16, 0.9); }
      if (!e.said7 && e.st >= 0.7 / VOICE_RATE) { e.said7 = true; popup(e.x + e.face * 10 * e.S, FLOOR_Y + e.z - 44 * e.S, '7', '#5fe3ff', 16, 0.9); }
      if (e.st >= TAUNT_DUR) {
        e.state = 'approach'; if (G.taunter === e) { G.taunter = null; G.tauntCd = rnd(1.8, 3.6); }
        if (d.boss && enemies.filter(o => o.state !== 'dead').length < 4) { spawnQ.push({ kind: 'hoodie', side: -1, delay: 0.1 }, { kind: pick(['hoodie', 'tracky']), side: 1, delay: 0.5 }); popup(e.x, FLOOR_Y + e.z - 100, 'FIND THE SIX WHO SEVEN THIS!', '#ffd23a', 8, 1.6); }
      }
      break;
    case 'chargewind': e.face = dx >= 0 ? 1 : -1; e.flash = Math.floor(e.st * 20) % 2 ? 0.02 : 0; if (e.st >= 0.6) { e.state = 'charge'; e.st = 0; e.hitDone = false; e.z += clamp(dz, -10, 10); } break;
    case 'charge':
      e.x += e.face * 230 * dt; e.moving = false;
      if (!e.hitDone && Math.abs(p.x - e.x) < 22 && Math.abs(p.z - e.z) < 12 && p.y < 26) { e.hitDone = true; damagePlayer(18, true, e.face); }
      if (e.st >= 1.1 || e.x < camX + 20 || e.x > camX + W - 20) { e.x = clamp(e.x, camX + 20, camX + W - 20); e.state = 'recover'; e.st = 0; e.atkCd = 1.2; shake(0.1); }
      break;
    case 'hurt': if (e.st >= 0.32) e.state = 'approach'; break;
    case 'down':
      downPhys(e, dt);
      if (e.landed && e.st > (e.dead ? 0.6 : 0.9)) { if (e.dead) { e.state = 'dead'; e.st = 0; } else { e.state = 'getup'; e.st = 0; } }
      break;
    case 'getup':
      e.rot = Math.max(0, Math.PI / 2 * (1 - e.st / 0.4));
      if (e.st >= 0.4) { e.state = 'approach'; e.rot = 0; e.inv = 0.25; e.atkCd = Math.max(e.atkCd, 0.5); }
      break;
  }
  if (e.state !== 'enter') e.x = clamp(e.x, camX - 40, camX + W + 40);
  e.x = clamp(e.x, 10, STAGE_W - 10);
  e.z = clamp(e.z, 0, DEPTH);
}

// ---------------------------------------------------------------- stage flow
function updateStage(dt) {
  const cap = waveIdx < WAVES.length ? WAVES[waveIdx].at : STAGE_W - W;
  const target = clamp(player.x - W * 0.42, 0, STAGE_W - W);
  const t = Math.min(target, cap);
  if (t > camX) camX = Math.min(t, camX + 170 * dt);
  if (!wave && waveIdx < WAVES.length && camX >= cap - 0.5) {
    wave = { def: WAVES[waveIdx], g: 0 }; G.goT = 0; queueGroup(0);
  }
  if (wave) {
    const alive = enemies.filter(e => e.state !== 'dead' && !(e.dead && e.state === 'down')).length + spawnQ.length;
    if (wave.g < wave.def.groups.length - 1 && alive <= 1) { wave.g++; queueGroup(wave.g); }
    else if (wave.g === wave.def.groups.length - 1 && alive === 0 && enemies.length === 0) {
      if (wave.def.boss) { G.mode = 'clear'; G.clearT = 0; stopMusic(); stop67(); S.jingle(); player.state = 'win'; player.st = 0; const bonus = player.hp * 50 + Math.max(0, Math.round(600 - G.time) * 10); G.bonus = bonus; addScore(bonus); saveHi(); }
      else G.goT = 3.5;
      wave = null; waveIdx++;
    }
  }
  for (let i = spawnQ.length - 1; i >= 0; i--) { const q = spawnQ[i]; q.delay -= dt; if (q.delay <= 0) { spawnEnemy(q.kind, q.side); spawnQ.splice(i, 1); } }
  // areas
  let ai = 0; for (let i = 0; i < AREAS.length; i++) if (player.x >= AREAS[i].x0 + 20) ai = i;
  if (ai > G.area) { G.area = ai; if (ai > 0) G.areaT = 2.4; }
}
function queueGroup(g) {
  const list = wave.def.groups[g];
  list.forEach((kind, i) => spawnQ.push({ kind, side: kind === 'boss' || camX <= 0 ? 1 : (i + g) % 2 ? -1 : 1, delay: 0.5 + i * 0.55 }));
}
function saveHi() { try { localStorage.setItem('p67-hi', String(G.hi)); } catch (e) {} }

function updatePlay(dt) {
  G.time += dt;
  if (G.tauntCd > 0) G.tauntCd -= dt;
  if (G.taunter && (G.taunter.state !== 'taunt' || !enemies.includes(G.taunter))) G.taunter = null;
  updatePlayer(player, dt);
  // the two nearest standing goons get to fight; the rest circle
  const live = enemies.filter(e => e.state !== 'dead' && e.state !== 'down');
  live.sort((a, b) => Math.abs(a.x - player.x) + Math.abs(a.z - player.z) * 2 - (Math.abs(b.x - player.x) + Math.abs(b.z - player.z) * 2));
  const maxEng = G.round > 1 ? 3 : 2;
  live.forEach((e, i) => { e.engaged = i < maxEng || e.def.boss; });
  for (const e of enemies) updateEnemy(e, dt);
  // separation
  for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
    const a = enemies[i], b = enemies[j];
    if (a.state === 'down' || b.state === 'down' || a.state === 'dead' || b.state === 'dead') continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    if (Math.abs(dx) < 14 && Math.abs(dz) < 6) { const s = (dx >= 0 ? 1 : -1) * (14 - Math.abs(dx)) * 0.5 * Math.min(1, dt * 10); a.x -= s; b.x += s; }
  }
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].state === 'dead' && enemies[i].st > 0.9) { if (G.enemyBar === enemies[i]) G.enemyBar = null; if (G.taunter === enemies[i]) G.taunter = null; enemies.splice(i, 1); }
  for (const pr of props) if (pr.flash > 0) pr.flash -= dt;
  for (const it of pickups) it.t += dt;
  updateStage(dt);
  if (G.goT > 0) G.goT -= dt;
  if (G.areaT > 0) G.areaT -= dt;
  if (G.enemyBarT > 0) G.enemyBarT -= dt;
}
function updateFx(dt) {
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt; if (q.life <= 0) parts.splice(i, 1); }
  for (let i = pops.length - 1; i >= 0; i--) { const q = pops[i]; q.life -= dt; q.y -= 22 * dt; if (q.life <= 0) pops.splice(i, 1); }
  for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t > 0.12) fx.splice(i, 1); }
  if (G.shake > 0) G.shake -= dt;
  if (G.msgT > 0) G.msgT -= dt;
}

// ---------------------------------------------------------------- rendering
function drawProp(pr) {
  const sx = Math.round(pr.x - camX), sy = Math.round(FLOOR_Y + pr.z);
  const f = pr.flash > 0, c = (k) => f ? '#fff' : k;
  const R = (x, y, w, h, col) => { ctx.fillStyle = c(col); ctx.fillRect(sx + x, sy + y, w, h); };
  if (pr.type === 'bin') { R(-8, -26, 16, 24, '#2f6b3a'); R(-9, -28, 18, 4, '#3c8249'); R(-6, -22, 1, 18, '#24532d'); R(-2, -22, 1, 18, '#24532d'); R(3, -22, 1, 18, '#24532d'); R(-8, -3, 4, 3, '#111'); R(4, -3, 4, 3, '#111'); R(-5, -18, 10, 5, '#e6e6e6'); }
  else if (pr.type === 'box') { R(-10, -16, 20, 15, '#b98a4e'); R(-10, -16, 20, 3, '#cfa064'); R(-2, -16, 4, 15, '#ddc38c'); R(-8, -10, 5, 4, '#fff'); R(-7, -9, 3, 1, '#c22'); }
  else { R(-8, -32, 16, 31, '#8b929b'); for (let y = -30; y < -2; y += 10) { R(-6, y, 12, 8, '#9da4ad'); R(-2, y + 3, 4, 2, '#555c66'); } }
}
function drawPickup(it) {
  const sx = Math.round(it.x - camX), sy = Math.round(FLOOR_Y + it.z - 2 - Math.abs(Math.sin(it.t * 4)) * 2);
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(sx + x, sy + y, w, h); };
  if (it.type === 'tea') {
    R(-4, -8, 8, 8, '#f6f6f6'); R(4, -6, 2, 1, '#f6f6f6'); R(5, -6, 1, 4, '#f6f6f6'); R(4, -3, 2, 1, '#f6f6f6'); R(-3, -8, 6, 2, '#8a5a2b'); R(-4, -4, 8, 1, '#1f3fbf');
    const k = Math.floor(it.t * 6) % 3; R(-2 + k % 2, -11 - k, 1, 2, '#ddd'); R(1 - k % 2, -13 + k, 1, 2, '#ddd');
  } else if (it.type === 'barm') {
    R(-5, -9, 10, 1, '#e0ab62'); R(-6, -8, 12, 3, '#d49a52'); R(-3, -8, 2, 1, '#f0d3a0');
    R(-6, -5, 12, 1, '#f2d16b'); R(-9, -6, 4, 1, '#f2d16b'); R(5, -5, 4, 1, '#e9c55a'); R(-8, -4, 3, 1, '#e9c55a'); R(6, -7, 3, 1, '#f2d16b');
    R(-6, -4, 12, 3, '#c98f4a'); R(-5, -1, 10, 1, '#b07a3c');
  }
  else if (it.type === 'vape') { R(-5, -3, 10, 3, '#7a7f8c'); R(5, -3, 2, 3, '#3fd0ff'); R(-5, -3, 10, 1, '#a7acb8'); }
  else { R(-3, -10, 7, 10, '#111'); R(-2, -9, 5, 7, '#3a8cff'); R(0, -1, 1, 1, '#555'); }
}
function drawStar(f) {
  const s = f.big ? 9 : 6, x = Math.round(f.x - camX), y = Math.round(f.y), k = f.t < 0.06 ? 1 : 0.6;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - s * k, y - 1, s * 2 * k, 2); ctx.fillRect(x - 1, y - s * k, 2, s * 2 * k);
  ctx.fillStyle = '#ffe066';
  for (let i = 1; i < s * 0.7 * k; i++) { ctx.fillRect(x + i, y + i, 1, 1); ctx.fillRect(x - i, y - i, 1, 1); ctx.fillRect(x + i, y - i, 1, 1); ctx.fillRect(x - i, y + i, 1, 1); }
}
function drawWorld(cx) {
  const ox = G.shake > 0 ? Math.round(rnd(-2, 2)) : 0, oy = G.shake > 0 ? Math.round(rnd(-1, 1)) : 0;
  ctx.save(); ctx.translate(ox, oy);
  ctx.drawImage(bg, Math.round(cx), 0, W, H, 0, 0, W, H);
  const list = [];
  for (const pr of props) if (pr.x > cx - 30 && pr.x < cx + W + 30) list.push({ z: pr.z, d: () => drawProp(pr), sh: [pr.x, pr.z, 20] });
  for (const it of pickups) list.push({ z: it.z - 0.5, d: () => drawPickup(it), sh: [it.x, it.z, 12] });
  for (const e of enemies) list.push({ z: e.z, d: () => drawActor(e, cx), sh: [e.x, e.z, 22 * e.S] });
  if (player) list.push({ z: player.z + 0.01, d: () => drawActor(player, cx), sh: [player.x, player.z, 22 * player.S] });
  for (const o of list) drawShadow(o.sh[0], o.sh[1], o.sh[2], cx);
  list.sort((a, b) => a.z - b.z);
  for (const o of list) o.d();
  for (const q of parts) { ctx.fillStyle = q.col; ctx.fillRect(Math.round(q.x - cx), Math.round(q.y), q.sz, q.sz); }
  for (const f of fx) drawStar(f);
  for (const q of pops) {
    if (q.life < 0.2 && Math.floor(q.life * 30) % 2) continue;
    const hw = q.s.length * q.size / 2 + 3;
    text(q.s, clamp(q.x - cx, hw, W - hw), q.y, q.col, q.size, 'center', q.size > 8 ? '#2a1a4a' : null);
  }
  ctx.restore();
}
function bar(x, y, w, h, v, col) {
  ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a1520'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * clamp(v, 0, 1)), h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, Math.round(w * clamp(v, 0, 1)), 1);
}
function drawHUD() {
  text(player.name, 6, 5, '#d4ef00');
  bar(6, 15, 96, 6, player.hp / player.maxHp, player.hp < 30 && Math.floor(G.t * 6) % 2 ? '#ff4a3a' : '#d4ef00');
  // lives as helmets
  for (let i = 0; i < G.lives - 1 && i < 5; i++) { const x = 108 + i * 9; ctx.fillStyle = '#000'; ctx.fillRect(x - 1, 12, 9, 10); ctx.fillStyle = '#141a33'; ctx.fillRect(x, 16, 7, 5); ctx.fillRect(x + 1, 13, 5, 3); ctx.fillStyle = '#d0d7df'; ctx.fillRect(x + 3, 17, 2, 2); }
  text('1P ' + String(G.score).padStart(7, '0'), W - 6, 5, '#ffffff', 8, 'right');
  text('HI ' + String(G.hi).padStart(7, '0'), W - 6, 15, '#8fa0ff', 8, 'right');
  const e = G.enemyBar;
  if (e && G.enemyBarT > 0 && enemies.includes(e)) {
    text(e.name, 6, 26, e.def.boss ? '#ff8a5c' : '#ffffff');
    bar(6, 36, e.def.boss ? 150 : 96, 4, e.hp / e.maxHp, '#ff7a3a');
  }
  if (G.goT > 0 && Math.floor(G.goT * 3) % 2 === 0) {
    text('GO', W - 52, 80, '#d4ef00', 16);
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(W - 14, 88); ctx.lineTo(W - 24, 78); ctx.lineTo(W - 24, 98); ctx.fill();
    ctx.fillStyle = '#d4ef00'; ctx.beginPath(); ctx.moveTo(W - 16, 88); ctx.lineTo(W - 23, 81); ctx.lineTo(W - 23, 95); ctx.fill();
  }
  if (G.areaT > 0) {
    const nm = AREAS[G.area].name, w = nm.length * 8 + 24;
    ctx.fillStyle = 'rgba(8,11,25,0.8)'; ctx.fillRect(W / 2 - w / 2, 50, w, 18);
    ctx.fillStyle = '#d4ef00'; ctx.fillRect(W / 2 - w / 2, 50, w, 1); ctx.fillRect(W / 2 - w / 2, 67, w, 1);
    text(nm, W / 2, 55, '#ffffff', 8, 'center');
  }
  if (G.msgT > 0) {
    ctx.fillStyle = 'rgba(8,11,25,0.75)'; ctx.fillRect(0, 84, W, 26);
    for (let i = 0; i < W; i += 8) { ctx.fillStyle = (i / 8) % 2 ? '#1f3fbf' : '#e3e600'; ctx.fillRect(i, 84, 8, 2); ctx.fillRect(i, 108, 8, 2); }
    if (G.msg.startsWith('WARNING') ? Math.floor(G.t * 5) % 2 === 0 : true) text(G.msg, W / 2, 92, G.msg.startsWith('WARNING') ? '#ff5a3a' : '#ffffff', 8, 'center');
  }
}

// title scene actors
const titleCast = [], selectCast = [];
function buildTitleCast() {
  const mk = (k, x, z, face, off) => { const a = makeActor(k, x, z); a.face = face; a.state = 'taunt'; a.st = off; titleCast.push(a); };
  mk('hoodie', 214, 26, 1, 0); mk('tracky', 252, 46, 1, 0.5); mk('big', 300, 20, 1, 1.1);
  mk('hoodie', 480, 24, -1, 0.3); mk('tracky', 520, 44, -1, 0.9);
  const keep = G.char;
  OFFICERS.forEach((o, i) => { G.char = i; const p = makeActor('player', 350 + i * 40, 40 - i * 6); p.face = 1; p.state = 'idle'; titleCast.push(p); });
  G.char = keep;
  OFFICERS.forEach((o, i) => { G.char = i; const p = makeActor('player', W / 2 + (i ? 70 : -70), 6); p.S *= 1.5; p.face = i ? -1 : 1; selectCast.push(p); });
  G.char = keep;
}
function drawTitle() {
  const cx = 180;
  ctx.drawImage(bg, cx, 0, W, H, 0, 0, W, H);
  const cast = [...titleCast].sort((a, b) => a.z - b.z);
  for (const a of cast) drawShadow(a.x, a.z, 22 * a.S, cx);
  for (const a of cast) { a.t += 1 / 60; if (a.state === 'taunt') { a.st += 1 / 60; if (a.st > TAUNT_DUR) a.st = 0; } a.face = a.kind === 'player' ? (Math.floor(G.t / 1.5) % 2 ? 1 : -1) : a.face; drawActor(a, cx); }
  ctx.fillStyle = 'rgba(6,9,28,0.72)'; ctx.fillRect(0, 0, W, 106);
  for (let i = 0; i < W; i += 8) { ctx.fillStyle = (i / 8) % 2 ? '#1f3fbf' : '#e3e600'; ctx.fillRect(i, 106, 8, 3); }
  text('ASSAULT ON', W / 2, 14, '#ffffff', 8, 'center');
  text('PRECINCT', W / 2, 30, '#d4ef00', 24, 'center', '#1b2a73');
  const bob = Math.sin(G.t * 6) * 2;
  text('6', W / 2 - 34, 62 + bob, '#ff5fb0', 32, 'center', '#2a1a4a');
  text('-', W / 2, 62, '#ffffff', 32, 'center', '#2a1a4a');
  text('7', W / 2 + 34, 62 - bob, '#5fe3ff', 32, 'center', '#2a1a4a');
  if (Math.floor(G.t * 2.5) % 2 === 0) text('PRESS START', W / 2, 186, '#ffffff', 8, 'center');
  text('ENTER, OR TAP THE SCREEN', W / 2, 198, '#8fa0ff', 8, 'center');
  text('HI ' + String(G.hi).padStart(7, '0'), W - 6, 6, '#8fa0ff', 8, 'right');
}
// opening briefing, typed out word by word; names and numbers picked out in colour
const STORY = (() => {
  const paras = [
    '6th of July, 2067.',
    '6-7 is out of control, and Chief Constable Dalglish has ordered a crackdown to deal with it.',
    'An estimated 6 to 7 million people are unemployed as a result of their 6-7 obsession.',
    "He sent in two of his best officers, grizzled 67-year-old veteran PC Sutton and fresh-faced rookie PC Shearer, who's only 6 or 7 months into the job.",
    'Together, they must defend the precinct.'
  ];
  const words = [], COLS = 44;
  let line = 0, idx = 0;
  paras.forEach((p, pi) => {
    let col = 0;
    for (const w of p.split(' ')) {
      if (col && col + w.length > COLS) { line++; col = 0; }
      let c = '#ffffff';
      if (pi === 0) c = '#d4ef00';
      else if (/^(PC|Sutton|Shearer|Chief|Constable|Dalglish)/.test(w)) c = '#d4ef00';
      else if (/6|7/.test(w)) c = '#ff5fb0';
      words.push({ w, col, line, c, at: idx });
      idx += w.length + 1; col += w.length + 1;
    }
    line += 2;
  });
  return { words, total: idx, lines: line - 1 };
})();
function drawStory() {
  ctx.drawImage(bg, 260, 0, W, H, 0, 0, W, H);
  ctx.fillStyle = 'rgba(4,6,20,0.88)'; ctx.fillRect(0, 0, W, H);
  if (Math.floor(G.t * 2) % 2) { ctx.fillStyle = 'rgba(47,91,255,0.10)'; ctx.fillRect(0, 0, W, H); }
  for (let i = 0; i < W; i += 8) { ctx.fillStyle = (i / 8) % 2 ? '#1f3fbf' : '#e3e600'; ctx.fillRect(i, 0, 8, 3); ctx.fillRect(i, H - 3, 8, 3); }
  const n = Math.min(STORY.total, Math.floor(G.storyT * 42)), top = Math.round((H - 22 - STORY.lines * 11) / 2);
  for (const wd of STORY.words) {
    if (wd.at >= n) break;
    text(wd.w.slice(0, n - wd.at), 16 + wd.col * 8, top + wd.line * 11, wd.c);
  }
  if (n >= STORY.total) { if (Math.floor(G.t * 2.5) % 2 === 0) text('PRESS START', W / 2, H - 18, '#8fa0ff', 8, 'center'); }
  else text('START TO SKIP', W - 8, H - 14, '#4a5590', 8, 'right');
}
function drawSelect() {
  ctx.drawImage(bg, 600, 0, W, H, 0, 0, W, H);
  ctx.fillStyle = 'rgba(6,9,28,0.78)'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 8) { ctx.fillStyle = (i / 8) % 2 ? '#1f3fbf' : '#e3e600'; ctx.fillRect(i, 30, 8, 3); }
  text('CHOOSE YOUR OFFICER', W / 2, 12, '#ffffff', 8, 'center');
  selectCast.forEach((a, i) => {
    const on = G.sel === i, cx = a.x;
    if (on) {
      const k = Math.floor(G.t * 4) % 2 ? '#d4ef00' : '#ffffff';
      ctx.fillStyle = k; ctx.fillRect(cx - 52, 40, 104, 2); ctx.fillRect(cx - 52, 196, 104, 2); ctx.fillRect(cx - 52, 40, 2, 158); ctx.fillRect(cx - 2 + 52, 40, 2, 158);
    }
    a.t += 1 / 60; a.state = on && G.selT > 0 && Math.floor(G.t * 1.2) % 3 === 0 ? 'win' : 'idle';
    drawShadow(a.x, a.z, 22 * a.S, 0); drawActor(a, 0);
    if (!on) { ctx.fillStyle = 'rgba(6,9,28,0.45)'; ctx.fillRect(cx - 50, 42, 100, 154); }
    const o = OFFICERS[i];
    text(o.name, cx, 158, on ? '#d4ef00' : '#8188ab', 8, 'center');
    [['POWER', o.power], ['SPEED', o.speed]].forEach(([lb, v], j) => {
      text(lb, cx - 44, 172 + j * 11, '#ffffff');
      for (let n = 0; n < 5; n++) { ctx.fillStyle = '#000'; ctx.fillRect(cx + 1 + n * 8, 171 + j * 11, 7, 8); ctx.fillStyle = n < v ? (on ? '#d4ef00' : '#6b7300') : '#2a3060'; ctx.fillRect(cx + 2 + n * 8, 172 + j * 11, 5, 6); }
    });
  });
  text('LEFT / RIGHT TO CHOOSE, START TO GO ON DUTY', W / 2, 204, '#8fa0ff', 8, 'center');
}
function render() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (G.mode === 'title') { drawTitle(); return; }
  if (G.mode === 'select') { drawSelect(); return; }
  if (G.mode === 'story') { drawStory(); return; }
  drawWorld(camX);
  drawHUD();
  if (G.mode === 'pause') {
    ctx.fillStyle = 'rgba(6,9,28,0.6)'; ctx.fillRect(0, 0, W, H);
    text('PAUSED', W / 2, 92, '#d4ef00', 16, 'center', '#1b2a73'); text('PRESS START TO RESUME', W / 2, 118, '#ffffff', 8, 'center');
  } else if (G.mode === 'gameover') {
    ctx.fillStyle = 'rgba(6,9,28,0.72)'; ctx.fillRect(0, 0, W, H);
    text('GAME OVER', W / 2, 62, '#ff5a3a', 24, 'center', '#2a1a4a');
    text('CONTINUE?', W / 2, 108, '#ffffff', 8, 'center');
    text(String(Math.max(0, Math.ceil(G.cont) - 1)), W / 2, 124, '#d4ef00', 24, 'center', '#1b2a73');
    text('PRESS START', W / 2, 166, '#8fa0ff', 8, 'center');
  } else if (G.mode === 'clear') {
    const k = Math.min(1, G.clearT / 0.6);
    ctx.fillStyle = `rgba(6,9,28,${0.65 * k})`; ctx.fillRect(0, 0, W, H);
    if (G.clearT > 0.4) {
      text('STATION SECURED!', W / 2, 46, '#d4ef00', 16, 'center', '#1b2a73');
      text('ROUND ' + G.round + ' CLEAR', W / 2, 74, '#ffffff', 8, 'center');
      text('DUTY BONUS  ' + G.bonus, W / 2, 98, '#ffffff', 8, 'center');
      text('SCORE  ' + G.score, W / 2, 112, '#5fe3ff', 8, 'center');
      text('NO MORE 6-7 ON MY WATCH.', W / 2, 136, '#ff5fb0', 8, 'center');
      if (G.clearT > 2 && Math.floor(G.t * 2.5) % 2 === 0) text('PRESS START FOR THE NIGHT SHIFT', W / 2, 170, '#ffffff', 8, 'center');
    }
  }
}

// ---------------------------------------------------------------- main loop
function update(dt) {
  clock += dt; G.t += dt;
  if (buf('mute')) setMuted(!A.muted);
  switch (G.mode) {
    case 'title': if (buf('start') || buf('atk')) { G.mode = 'story'; G.storyT = 0; G.storyN = 0; S.pick(); } break;
    case 'story': {
      G.storyT += dt;
      const n = Math.min(STORY.total, Math.floor(G.storyT * 42));
      if (n > G.storyN) { if (n % 3 === 0 && A.ctx) tone('square', 1300, 1300, 0.02, 0.04); G.storyN = n; }
      if (buf('start') || buf('atk')) {
        if (n < STORY.total) G.storyT = 999;
        else { G.mode = 'select'; G.selT = 0; S.pick(); }
      }
      break;
    }
    case 'select':
      G.selT += dt;
      if (buf('left') && G.sel !== 0) { G.sel = 0; S.swing(); }
      if (buf('right') && G.sel !== 1) { G.sel = 1; S.swing(); }
      if (G.selT > 0.2 && (buf('start') || buf('atk'))) { G.char = G.sel; try { localStorage.setItem('p67-char', String(G.char)); } catch (e) {} startGame(1); }
      break;
    case 'play':
      if (buf('start')) { G.mode = 'pause'; stop67(); break; }
      if (G.freeze > 0) { G.freeze -= dt; break; }
      updatePlay(dt); updateFx(dt); break;
    case 'pause': if (buf('start')) G.mode = 'play'; break;
    case 'gameover':
      G.cont -= dt * 0.9;
      if (buf('start')) { G.lives = 3; G.score = 0; respawn(); G.mode = 'play'; startMusic(132 + (G.round - 1) * 6); break; }
      if (G.cont <= 1) { saveHi(); G.mode = 'title'; }
      break;
    case 'clear':
      G.clearT += dt; player.t += dt; updateFx(dt);
      if (G.clearT > 2 && buf('start')) startGame(G.round + 1);
      break;
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'play') { G.mode = 'pause'; stop67(); } });

function fit() {
  const scr = document.getElementById('screen');
  const availW = Math.min(document.querySelector('.wrap').clientWidth, 1200) - 20;
  const touch = matchMedia('(hover:none) and (pointer:coarse)').matches;
  const availH = window.innerHeight - (touch ? 230 : 120);
  let s = Math.min(availW / W, Math.max(availH, H) / H);
  if (s >= 2) s = Math.floor(s);
  s = Math.max(0.5, s);
  cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px';
  scr.style.width = 'auto';
}
window.addEventListener('resize', fit);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  pollPads(); update(dt); render(); musicTick();
  requestAnimationFrame(frame);
}
function start(data) {
  if (data && data.hi > G.hi) G.hi = data.hi;
  buildBG(); buildTitleCast(); fit();
  const go = () => requestAnimationFrame(t => { last = t; frame(t); });
  if (document.fonts && document.fonts.load) Promise.race([document.fonts.load('8px "Press Start 2P"'), new Promise(r => setTimeout(r, 1500))]).then(go, go);
  else go();
}
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
})();
