// Importing style.css tells Vite to process Tailwind CSS and inject it into the page
import "./style.css";

// `init` loads and boots the compiled `.wasm` binary.
// `WorldMap` is the TypeScript class auto-generated from `contour/src/lib.rs`.
import init, { WorldMap } from "./pkg/contour.js";

async function start() {
  // 1. Asynchronously fetch and initialize the Rust WebAssembly module.
  //    The returned `wasm` object gives us direct access to `wasm.memory.buffer`.
  const wasm = await init();

  let currentSeed = Math.floor(Math.random() * 100_000);

  // 2. Grab references to our HTML elements using their `id` attributes.
  //    The `!` tells TypeScript: "I guarantee this element exists in index.html."
  const canvas = document.querySelector<HTMLCanvasElement>("#map-canvas")!;
  const ctx = canvas.getContext("2d")!;

  const mapSizeSelect = document.querySelector<HTMLSelectElement>("#map-size-select")!;
  let mapSize = parseInt(mapSizeSelect.value, 10);

  // Offscreen buffer holding the exact 1:1 Rust pixel grid (`mapSize x mapSize`)
  const mapCanvas = document.createElement("canvas");
  const mapCtx = mapCanvas.getContext("2d")!;
  mapCanvas.width = mapSize;
  mapCanvas.height = mapSize;

  // 3. Instantiate our Rust struct inside Wasm memory with a random starting seed.
  let world = new WorldMap(mapSize, mapSize, currentSeed);

  // Sidebar expand / collapse elements
  const panel = document.querySelector<HTMLElement>("#settings-panel")!;
  const panelTitle = document.querySelector<HTMLElement>("#panel-title")!;
  const panelBody = document.querySelector<HTMLElement>("#panel-body")!;
  const panelFooter = document.querySelector<HTMLElement>("#panel-footer")!;
  const toggleBtn = document.querySelector<HTMLButtonElement>("#toggle-panel-btn")!;
  const toggleIcon = document.querySelector<SVGElement>("#toggle-icon")!;

  // Controls
  const regenBtn = document.querySelector<HTMLButtonElement>("#regen-btn")!;
  const seaSlider = document.querySelector<HTMLInputElement>("#sea-slider")!;
  const seaValue = document.querySelector<HTMLElement>("#sea-value")!;

  // Stub sliders + value labels
  const freqSlider = document.querySelector<HTMLInputElement>("#freq-slider")!;
  const freqValue = document.querySelector<HTMLElement>("#freq-value")!;
  const octavesSlider = document.querySelector<HTMLInputElement>("#octaves-slider")!;
  const octavesValue = document.querySelector<HTMLElement>("#octaves-value")!;
  const falloffSlider = document.querySelector<HTMLInputElement>("#falloff-slider")!;
  const falloffValue = document.querySelector<HTMLElement>("#falloff-value")!;

  // Sculpt brush sliders (ready to use immediately on the TS side)
  const radiusSlider = document.querySelector<HTMLInputElement>("#radius-slider")!;
  const radiusValue = document.querySelector<HTMLElement>("#radius-value")!;
  const strengthSlider = document.querySelector<HTMLInputElement>("#strength-slider")!;
  const strengthValue = document.querySelector<HTMLElement>("#strength-value")!;

  let brushRadius = parseInt(radiusSlider.value, 10);
  let brushStrength = parseFloat(strengthSlider.value);

  // Viewport transform state: scales the map so its longer edge fits inside the full-screen canvas,
  // while `userZoom` lets the user zoom in/out with the mouse wheel
  let viewW = window.innerWidth;
  let viewH = window.innerHeight;
  let fitZoom = 1;
  let userZoom = 1;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;

  const MIN_USER_ZOOM = 0.5;
  const MAX_USER_ZOOM = 16;

  function computeFitTransform() {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = viewW;
    canvas.height = viewH;

    // Fit the map's longer edge inside the viewport so the entire map is visible at `userZoom = 1`
    fitZoom = Math.min(viewW, viewH) / mapSize;
    zoom = fitZoom * userZoom;
    const drawSize = mapSize * zoom;
    offsetX = (viewW - drawSize) / 2;
    offsetY = (viewH - drawSize) / 2;
  }

  function paintViewport() {
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.imageSmoothingEnabled = zoom < 1;
    ctx.drawImage(mapCanvas, offsetX, offsetY, mapSize * zoom, mapSize * zoom);
  }

  /**
   * Reads the RGBA pixel buffer directly out of Rust's WebAssembly RAM,
   * writes it to `mapCanvas`, and renders it at the current zoom/offset.
   */
  function render() {
    // Create a zero-copy "window" into Wasm memory starting at `world.pixels_ptr()`.
    // We recreate this view on every render in case Rust ever resized its memory.
    const pixels = new Uint8ClampedArray(
      wasm.memory.buffer,
      world.pixels_ptr(),
      mapSize * mapSize * 4, // 4 bytes per pixel (R, G, B, A)
    );

    // Paint the raw RGBA bytes onto the offscreen map canvas at top-left (0, 0)
    mapCtx.putImageData(new ImageData(pixels, mapSize, mapSize), 0, 0);
    paintViewport();
  }

  // Recompute fit zoom when browser window size changes without regenerating the map
  window.addEventListener("resize", () => {
    computeFitTransform();
    paintViewport();
  });

  // --- Mouse Scroll Zoom (anchored to cursor position) ---
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const vx = e.clientX - rect.left;
      const vy = e.clientY - rect.top;

      // Map coordinate currently under the mouse cursor before zooming
      const mapX = (vx - offsetX) / zoom;
      const mapY = (vy - offsetY) / zoom;

      // Smoothly scale zoom factor based on wheel direction
      const zoomFactor = Math.exp(-e.deltaY * 0.0012);
      userZoom = Math.min(MAX_USER_ZOOM, Math.max(MIN_USER_ZOOM, userZoom * zoomFactor));
      zoom = fitZoom * userZoom;

      // Keep `(mapX, mapY)` anchored at `(vx, vy)` on screen
      offsetX = vx - mapX * zoom;
      offsetY = vy - mapY * zoom;

      paintViewport();
    },
    { passive: false },
  );

  // --- Expand / Collapse Sidebar ---
  let isCollapsed = true;
  toggleBtn.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    panel.classList.toggle("w-72", !isCollapsed);
    panel.classList.toggle("w-11", isCollapsed);
    panelTitle.classList.toggle("hidden", isCollapsed);
    panelBody.classList.toggle("hidden", isCollapsed);
    panelBody.classList.toggle("flex", !isCollapsed);
    panelFooter.classList.toggle("hidden", isCollapsed);
    toggleIcon.classList.toggle("rotate-180", isCollapsed);
  });

  // --- Wire up UI Controls to Rust ---

  // Changing Map Size updates the simulation grid and fits the new size to the screen
  mapSizeSelect.addEventListener("change", () => {
    mapSize = parseInt(mapSizeSelect.value, 10);
    mapCanvas.width = mapSize;
    mapCanvas.height = mapSize;

    // world.free();
    world.resize(mapSize, mapSize, currentSeed);
    world.set_sea_level(parseFloat(seaSlider.value));

    userZoom = 1;
    computeFitTransform();
    render();
  });

  // Clicking "New World" asks Rust to generate a fresh heightmap, then redraws
  regenBtn.addEventListener("click", () => {
    currentSeed = Math.floor(Math.random() * 100_000);
    world.generate(currentSeed);
    render();
  });

  // Dragging the slider updates Rust's sea_level in real time (`input` fires continuously)
  seaSlider.addEventListener("input", () => {
    world.set_sea_level(parseFloat(seaSlider.value));
    const sea = parseFloat(seaSlider.value);
    seaValue.textContent = sea.toFixed(2);
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

    // Convert viewport pointer coordinates into map-grid (x, y) coordinates
    const rect = canvas.getBoundingClientRect();
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    const x = Math.floor((vx - offsetX) / zoom);
    const y = Math.floor((vy - offsetY) / zoom);

    if (x < 0 || x >= mapSize || y < 0 || y >= mapSize) return;

    // Hold Shift to carve ocean (-0.03), otherwise raise land (+0.03)
    const delta = e.shiftKey ? -brushStrength : brushStrength;

    // Tell Rust to modify the heightmap and recolor affected pixels
    world.sculpt(x, y, brushRadius, delta);
    render();
  });

  // Draw the initial generated continent fitted to the viewport as soon as the page loads
  computeFitTransform();
  render();
}

start();
