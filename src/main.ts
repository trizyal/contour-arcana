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

  // 2. Instantiate our Rust struct inside Wasm memory with a random starting seed.
  const world = new WorldMap(
    WIDTH,
    HEIGHT,
    Math.floor(Math.random() * 100_000),
  );

  // 3. Grab references to our HTML elements using their `id` attributes.
  //    The `!` tells TypeScript: "I guarantee this element exists in index.html."
  const canvas = document.querySelector<HTMLCanvasElement>("#map-canvas")!;
  const ctx = canvas.getContext("2d")!;
  const regenBtn = document.querySelector<HTMLButtonElement>("#regen-btn")!;
  const seaSlider = document.querySelector<HTMLInputElement>("#sea-slider")!;

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
    const delta = e.shiftKey ? -0.03 : 0.03;

    // Tell Rust to modify the heightmap and recolor affected pixels
    world.sculpt(x, y, 26, delta);
    render();
  });

  // Draw the initial generated continent as soon as the page loads
  render();
}

start();