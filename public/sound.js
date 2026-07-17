// sound.js — lightweight procedural sound engine using the Web Audio API.
//
// The bundled doom.wasm binary (wasm-doom / wasm-fizzbuzz port) has no audio
// output at all — no sound imports, no music, nothing compiled in. There's
// no way to unlock "real" DOOM SFX from that binary. Instead this module
// synthesizes retro-appropriate sound effects on the fly (oscillators +
// noise, no external audio files, no licensing concerns) and ties them to
// things we CAN observe from JS: key presses (fire, move) and periodic
// ambient hum. It's not sample-accurate to actual DOOM gameplay events
// (the wasm never tells JS "player fired" or "player got hit"), but it
// gives real, audible feedback instead of total silence.

let ctx = null;
let masterGain = null;
let ambientNodes = null;
let footstepTimer = null;
let lastFireTime = 0;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(duration) {
  const c = getCtx();
  const buffer = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function playGunshot() {
  const c = getCtx();
  const now = c.currentTime;

  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(0.15);
  const noiseFilter = c.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 1800;
  noiseFilter.Q.value = 0.7;
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.9, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.13);
  noise.connect(noiseFilter).connect(noiseGain).connect(masterGain);
  noise.start(now);
  noise.stop(now + 0.15);

  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
  const oscGain = c.createGain();
  oscGain.gain.setValueAtTime(0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
  osc.connect(oscGain).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.12);
}

function playFootstep() {
  const c = getCtx();
  const now = c.currentTime;

  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(0.08);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
  noise.connect(filter).connect(gain).connect(masterGain);
  noise.start(now);
  noise.stop(now + 0.08);
}

function playUse() {
  const c = getCtx();
  const now = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.linearRampToValueAtTime(220, now + 0.1);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
  osc.connect(gain).connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.12);
}

function startAmbient() {
  if (ambientNodes) return;
  const c = getCtx();

  const hum = c.createOscillator();
  hum.type = 'sine';
  hum.frequency.value = 55;
  const humGain = c.createGain();
  humGain.gain.value = 0.04;
  hum.connect(humGain).connect(masterGain);
  hum.start();

  const rumbleInterval = setInterval(() => {
    if (Math.random() > 0.7) {
      const now = c.currentTime;
      const noise = c.createBufferSource();
      noise.buffer = noiseBuffer(1.2);
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 120;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.4);
      gain.gain.linearRampToValueAtTime(0, now + 1.2);
      noise.connect(filter).connect(gain).connect(masterGain);
      noise.start(now);
      noise.stop(now + 1.2);
    }
  }, 4000);

  ambientNodes = { hum, humGain, rumbleInterval };
}

function stopAmbient() {
  if (!ambientNodes) return;
  ambientNodes.hum.stop();
  clearInterval(ambientNodes.rumbleInterval);
  ambientNodes = null;
}

function handleKeyForSound(keyLabel) {
  const k = keyLabel.toLowerCase();
  const now = performance.now();

  if (k === 'control') {
    if (now - lastFireTime > 140) {
      playGunshot();
      lastFireTime = now;
    }
  } else if (k === ' ' || k === 'space' || k === 'spacebar') {
    playUse();
  } else if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    if (!footstepTimer) {
      playFootstep();
      footstepTimer = setTimeout(() => { footstepTimer = null; }, 280);
    }
  }
}

export const Sound = {
  init: getCtx,
  startAmbient,
  stopAmbient,
  handleKeyForSound,
  playGunshot,
  playFootstep,
  playUse
};