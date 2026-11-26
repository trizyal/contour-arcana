// Importing style.css tells Vite to process Tailwind CSS and inject it into the page
import "./style.css";

// `init` loads and boots the compiled `.wasm` binary.
// `WorldMap` is the TypeScript class auto-generated from `contour/src/lib.rs`.
import init, { WorldMap } from "./pkg/contour.js";

// Must match the width/height attributes on <canvas id="map-canvas"> in index.html
const WIDTH = 700;
const HEIGHT = 700;

async function start() {
  // 1. Asynchronously fetch and initialize the Rust WebAssembly module.
  //    The returned `wasm` object gives us direct access to `wasm.memory.buffer`.
  const wasm = await init();

  let currentSeed = Math.floor(Math.random() * 100_000);

  // 2. Instantiate our Rust struct inside Wasm memory with a random starting seed.
  const world = new WorldMap(WIDTH, HEIGHT, currentSeed);

  // 3. Grab references to our HTML elements using their `id` attributes.
  //    The `!` tells TypeScript: "I guarantee this element exists in index.html."
  const canvas = document.querySelector<HTMLCanvasElement>("#map-canvas")!;
  const ctx = canvas.getContext("2d")!;

  // Sidebar expand / collapse elements
  const panel = document.querySelector<HTMLElement>("#settings-panel")!;
  const panelTitle = document.querySelector<HTMLElement>("#panel-title")!;
  const panelBody = document.querySelector<HTMLElement>("#panel-body")!;
  const panelFooter = document.querySelector<HTMLElement>("#panel-footer")!;
  const toggleBtn =
    document.querySelector<HTMLButtonElement>("#toggle-panel-btn")!;
  const toggleIcon = document.querySelector<SVGElement>("#toggle-icon")!;

  // Controls
  const regenBtn = document.querySelector<HTMLButtonElement>("#regen-btn")!;
  const seaSlider = document.querySelector<HTMLInputElement>("#sea-slider")!;
  const seaValue = document.querySelector<HTMLElement>("#sea-value")!;

  // Stub sliders + value labels
  const freqSlider = document.querySelector<HTMLInputElement>("#freq-slider")!;
  const freqValue = document.querySelector<HTMLElement>("#freq-value")!;
  const octavesSlider =
    document.querySelector<HTMLInputElement>("#octaves-slider")!;
  const octavesValue = document.querySelector<HTMLElement>("#octaves-value")!;
  const falloffSlider =
    document.querySelector<HTMLInputElement>("#falloff-slider")!;
  const falloffValue = document.querySelector<HTMLElement>("#falloff-value")!;

  // Sculpt brush sliders (ready to use immediately on the TS side)
  const radiusSlider =
    document.querySelector<HTMLInputElement>("#radius-slider")!;
  const radiusValue = document.querySelector<HTMLElement>("#radius-value")!;
  const strengthSlider =
    document.querySelector<HTMLInputElement>("#strength-slider")!;
  const strengthValue = document.querySelector<HTMLElement>("#strength-value")!;

  let brushRadius = parseInt(radiusSlider.value, 10);
  let brushStrength = parseFloat(strengthSlider.value);

  /**
   * Reads the RGBA pixel buffer directly out of Rust's WebAssembly RAM
   * and blasts it onto the HTML5 <canvas> in one call.
   */
  function render() {
    // Create a zero-copy "window" into Wasm memory starting at `world.pixels_ptr()`.
    // We recreate this view on every render in case Rust ever resized its memory.
    const pixels = new Uint8ClampedArray(
      wasm.memory.buffer,
      world.pixels_ptr(),
      WIDTH * HEIGHT * 4, // 4 bytes per pixel (R, G, B, A)
    );

    // Paint the raw RGBA bytes onto the canvas at top-left (0, 0)
    ctx.putImageData(new ImageData(pixels, WIDTH, HEIGHT), 0, 0);
  }

  // --- Expand / Collapse Sidebar ---
  let isCollapsed = false;
  toggleBtn.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    panel.classList.toggle("w-72", !isCollapsed);
    panel.classList.toggle("w-12", isCollapsed);
    panelTitle.classList.toggle("hidden", isCollapsed);
    panelBody.classList.toggle("hidden", isCollapsed);
    panelFooter.classList.toggle("hidden", isCollapsed);
    toggleIcon.classList.toggle("rotate-180", isCollapsed);
  });

  // --- Wire up UI Controls to Rust ---

  // Clicking "New World" asks Rust to generate a fresh heightmap, then redraws
  regenBtn.addEventListener("click", () => {
    world.generate(Math.floor(Math.random() * 100_000));
    render();
  });

  // Dragging the slider updates Rust's sea_level in real time (`input` fires continuously)
  seaSlider.addEventListener("input", () => {
    world.set_sea_level(parseFloat(seaSlider.value));
    render();
  });

  // --- Brush Controls ---
  radiusSlider.addEventListener("input", () => {
    brushRadius = parseInt(radiusSlider.value, 10);
    radiusValue.textContent = `${brushRadius}px`;
  });

  strengthSlider.addEventListener("input", () => {
    brushStrength = parseFloat(strengthSlider.value);
    strengthValue.textContent = brushStrength.toFixed(2);
  });

  // --- Stub Sliders (hook up to Rust methods when ready) ---
  freqSlider.addEventListener("input", () => {
    const freq = parseFloat(freqSlider.value);
    freqValue.textContent = freq.toFixed(3);
    // TODO: Expose `world.set_frequency(freq)` or pass into `world.generate(...)` in Rust
  });

  octavesSlider.addEventListener("input", () => {
    const octaves = parseInt(octavesSlider.value, 10);
    octavesValue.textContent = String(octaves);
    // TODO: Expose `world.set_octaves(octaves)` in `contour/src/lib.rs`
  });

  falloffSlider.addEventListener("input", () => {
    const falloff = parseFloat(falloffSlider.value);
    falloffValue.textContent = falloff.toFixed(2);
    // TODO: Expose `world.set_falloff(falloff)` in `contour/src/lib.rs`
  });

  // --- Wire up Terrain Sculpting Brush ---

  let painting = false;

  // Start painting when mouse/pen presses down on the canvas
  canvas.addEventListener("pointerdown", () => (painting = true));

  // Stop painting even if the user releases the mouse outside the canvas
  window.addEventListener("pointerup", () => (painting = false));

  canvas.addEventListener("pointermove", (e) => {
    if (!painting) return;

    // Convert browser window mouse coordinates into canvas-local (x, y) pixels
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(e.clientX - rect.left);
    const y = Math.floor(e.clientY - rect.top);

    // Hold Shift to carve ocean (-0.03), otherwise raise land (+0.03)
    const delta = e.shiftKey ? -brushStrength : brushStrength;

    // Tell Rust to modify the heightmap and recolor affected pixels
    world.sculpt(x, y, brushRadius, delta);
    render();
  });

  // Draw the initial generated continent as soon as the page loads
  render();
}

start();
