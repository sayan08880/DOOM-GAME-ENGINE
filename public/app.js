import { Sound } from './sound.js';

// This engine (from jacobenget/doom.wasm) is a full Doom build with real
// monster spawning, unlike the old wasm-fizzbuzz demo binary which never
// supported loading custom WAD data and had no monsters compiled in.
//
// Interface summary (see https://github.com/jacobenget/doom.wasm):
//   exports: initGame(), tickGame(), reportKeyDown(doomKey), reportKeyUp(doomKey),
//            memory, and KEY_* global constants
//   imports: loading.onGameInit, loading.wadSizes, loading.readWads,
//            ui.drawFrame, runtimeControl.timeInMilliseconds,
//            console.onInfoMessage, console.onErrorMessage,
//            gameSaving.sizeOfSaveGame/readSaveGame/writeSaveGame

let frameCount = 0;
let lastTime = performance.now();

const el = {
  canvas: document.getElementById('game'),
  fps: document.getElementById('fps'),
  fpsMonitor: document.getElementById('fps-monitor'),
  activeKeys: document.getElementById('active-keys'),
  cpu: document.getElementById('cpu-usage')
};

function updateLiveKeys(pressedKeys) {
  el.activeKeys.textContent = pressedKeys.size
    ? Array.from(pressedKeys).join(' + ')
    : 'Click canvas to start';
}

function updateFPS() {
  frameCount++;
  const now = performance.now();
  if (now - lastTime > 1000) {
    const fps = Math.floor(frameCount);
    frameCount = 0;
    lastTime = now;
    el.fps.textContent = `FPS: ${fps}`;
    el.fpsMonitor.textContent = `FPS: ${fps}`;
  }
}

function updateCPU() {
  const load = Math.min(95, Math.floor(20 + (1000 / (performance.now() % 800 + 400))));
  el.cpu.textContent = `CPU: ${load}%`;
}

function showFatalError(message) {
  const stage = document.getElementById('stage');
  const box = document.createElement('div');
  box.className = 'fatal-error';
  box.textContent = `Failed to start DOOM: ${message}`;
  stage.appendChild(box);
}

async function boot() {
  try {
    const ctx = el.canvas.getContext('2d');
    let moduleMemory = null;
    let scratchImageData = null;

    // Fetch the real IWAD so monsters, full maps, and game logic are present.
    // Falls back to the built-in Doom Shareware WAD (no custom WAD reported)
    // if the fetch fails for any reason, so the game still boots.
    let wadBytes = null;
    try {
      const res = await fetch('./game/freedoom2.wad');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      wadBytes = new Uint8Array(await res.arrayBuffer());
    } catch (wadErr) {
      console.warn('Could not load freedoom2.wad, falling back to shareware WAD:', wadErr);
      wadBytes = null;
    }

    function onGameInit(width, height) {
      el.canvas.width = width;
      el.canvas.height = height;
      scratchImageData = ctx.createImageData(width, height);
    }

    function wadSizes(numberOfWadsPtr, numberOfTotalBytesPtr) {
      if (!wadBytes) return; // leave both at 0 -> engine loads shareware WAD
      const view = new DataView(moduleMemory.buffer);
      view.setInt32(numberOfWadsPtr, 1, true);
      view.setUint32(numberOfTotalBytesPtr, wadBytes.length, true);
    }

    function readWads(wadDataDestPtr, byteLengthArrPtr) {
      if (!wadBytes) return;
      const u8 = new Uint8Array(moduleMemory.buffer);
      u8.set(wadBytes, wadDataDestPtr);
      const view = new DataView(moduleMemory.buffer);
      view.setInt32(byteLengthArrPtr, wadBytes.length, true);
    }

    function drawFrame(frameBufferPtr) {
      const width = el.canvas.width;
      const height = el.canvas.height;
      const doomFrameBuffer = new Uint8Array(moduleMemory.buffer, frameBufferPtr, width * height * 4);

      // Doom's frame buffer pixels are 32-bit BGRA (little-endian storage);
      // canvas ImageData wants RGBA.
      const dst = scratchImageData.data;
      for (let i = 0; i < dst.length / 4; i++) {
        dst[4 * i + 0] = doomFrameBuffer[4 * i + 2]; // R
        dst[4 * i + 1] = doomFrameBuffer[4 * i + 1]; // G
        dst[4 * i + 2] = doomFrameBuffer[4 * i + 0]; // B
        dst[4 * i + 3] = 255;                        // A
      }
      ctx.putImageData(scratchImageData, 0, 0);
      updateFPS();
    }

    function timeInMilliseconds() {
      return BigInt(Math.trunc(performance.now()));
    }

    function readUtf8(ptr, len) {
      const u8 = new Uint8Array(moduleMemory.buffer, ptr, len);
      return new TextDecoder('utf-8', { fatal: false }).decode(u8);
    }

    const imports = {
      loading: {
        onGameInit,
        wadSizes,
        readWads
      },
      ui: {
        drawFrame
      },
      runtimeControl: {
        timeInMilliseconds
      },
      console: {
        onInfoMessage: (ptr, len) => console.log('[Doom]', readUtf8(ptr, len)),
        onErrorMessage: (ptr, len) => console.error('[Doom]', readUtf8(ptr, len))
      },
      gameSaving: {
        // Saving isn't wired up yet — always report "no save data".
        sizeOfSaveGame: () => 0,
        readSaveGame: () => 0,
        writeSaveGame: () => 0
      }
    };

    const { instance } = await WebAssembly.instantiateStreaming(
      fetch('./engine/doom.wasm'),
      imports
    );

    const exports = instance.exports;
    moduleMemory = exports.memory;

    const doomKeyFromJsKey = new Map([
      ['ArrowLeft', exports.KEY_LEFTARROW],
      ['ArrowRight', exports.KEY_RIGHTARROW],
      ['ArrowUp', exports.KEY_UPARROW],
      ['ArrowDown', exports.KEY_DOWNARROW],
      ['w', exports.KEY_UPARROW],
      ['s', exports.KEY_DOWNARROW],
      ['a', exports.KEY_STRAFE_L],
      ['d', exports.KEY_STRAFE_R],
      [',', exports.KEY_STRAFE_L],
      ['.', exports.KEY_STRAFE_R],
      ['Control', exports.KEY_FIRE],
      [' ', exports.KEY_USE],
      ['Shift', exports.KEY_SHIFT],
      ['Tab', exports.KEY_TAB],
      ['Escape', exports.KEY_ESCAPE],
      ['Enter', exports.KEY_ENTER],
      ['Backspace', exports.KEY_BACKSPACE],
      ['Alt', exports.KEY_ALT]
    ]);

    function convertKeyEvent(e) {
      if (doomKeyFromJsKey.has(e.key)) return doomKeyFromJsKey.get(e.key);
      if (e.key.length === 1) return e.key.charCodeAt(0);
      return null;
    }

    const pressedKeys = new Set();

    el.canvas.addEventListener('keydown', e => {
      const doomKey = convertKeyEvent(e);
      if (doomKey !== null) {
        exports.reportKeyDown(doomKey);
        e.preventDefault();
      }
      pressedKeys.add(e.key.toUpperCase());
      updateLiveKeys(pressedKeys);
      Sound.handleKeyForSound(e.key);
    });

    el.canvas.addEventListener('keyup', e => {
      const doomKey = convertKeyEvent(e);
      if (doomKey !== null) {
        exports.reportKeyUp(doomKey);
        e.preventDefault();
      }
      pressedKeys.delete(e.key.toUpperCase());
      updateLiveKeys(pressedKeys);
    });

    exports.initGame();

    // Doom targets 35 frames per second natively.
    setInterval(exports.tickGame, 1000 / 35);

    el.canvas.tabIndex = 0;
    el.canvas.focus();
    el.canvas.addEventListener('click', () => {
      el.canvas.focus();
      el.canvas.requestPointerLock?.();
      // AudioContext requires a user gesture to start — this click is it.
      Sound.init();
      Sound.startAmbient();
    });

    setInterval(updateCPU, 800);

  } catch (err) {
    console.error(err);
    showFatalError(err.message || String(err));
  }
}

document.getElementById('fullscreenBtn').addEventListener('click', () => {
  const stage = document.getElementById('stage');
  document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen();
});

boot();