# DOOM Web Engine

A working browser-based DOOM build using the `wasm-doom` engine
(id Software's DOOM compiled to WebAssembly).

## Status: what's real here

- The engine (`public/engine/doom.wasm`, `public/engine/wasm-doom.js`) is
  a genuine, verified WebAssembly build of DOOM — copied from the
  `wasm-doom` npm package and served locally (no external CDN dependency).
- `public/game/freedoom2.wad` (your uploaded Freedoom WAD) is present in
  the project, but **is not currently wired into the engine**. The
  `wasm-doom` package's public API does not expose a way to load a custom
  WAD at runtime — its `doom.wasm` was compiled with a specific WAD baked
  in. Loading Freedoom instead would require recompiling the engine from
  C source with Freedoom linked in (e.g. via the `Dwasm` or
  `doom.wasm` (jacobenget) projects), which is a separate, bigger task.
- Everything else (server, HTML/CSS/JS, folder layout) is real and has
  been tested end-to-end: server starts, every asset returns HTTP 200,
  and the `.wasm` file serves with the correct `application/wasm`
  content type.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000

## Controls

Arrow keys / WASD to move, Ctrl to fire, Space to use, Shift to run.

## If you want your own WAD (Freedoom) actually playable

That needs a source port that supports custom WADs, compiled to WASM
yourself (e.g. `GMH-Code/Dwasm` with PrBoom+, or `jacobenget/doom.wasm`
which explicitly supports custom WAD data). That's a real build step
(Emscripten toolchain, ~30min+ setup) rather than something pulled from
a CDN — happy to do that next if you want the real Freedoom experience
instead of the bundled WAD.
