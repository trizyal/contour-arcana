import "./style.css";
import init, { WorldMap } from "./pkg/contour.js";

const WIDTH = 700;
const HEIGHT = 700;

async function start() {
  // Initialize Wasm; Vite automatically bundles & hashes the .wasm asset on build!
  const wasm = await init();
  const world = new WorldMap(
    WIDTH,
    HEIGHT,
    Math.floor(Math.random() * 100_000),
  );

  const canvas = document.querySelector<HTMLCanvasElement>("#map-canvas")!;
  const ctx = canvas.getContext("2d")!;
  const regenBtn = document.querySelector<HTMLButtonElement>("#regen-btn")!;
  const seaSlider = document.querySelector<HTMLInputElement>("#sea-slider")!;

  function render() {
    const pixels = new Uint8ClampedArray(
      wasm.memory.buffer,
      world.pixels_ptr(),
      WIDTH * HEIGHT * 4,
    );
    ctx.putImageData(new ImageData(pixels, WIDTH, HEIGHT), 0, 0);
  }

  regenBtn.addEventListener("click", () => {
    world.generate(Math.floor(Math.random() * 100_000));
    render();
  });

  seaSlider.addEventListener("input", () => {
    world.set_sea_level(parseFloat(seaSlider.value));
    render();
  });

  let painting = false;
  canvas.addEventListener("pointerdown", () => (painting = true));
  window.addEventListener("pointerup", () => (painting = false));
  canvas.addEventListener("pointermove", (e) => {
    if (!painting) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(e.clientX - rect.left);
    const y = Math.floor(e.clientY - rect.top);
    world.sculpt(x, y, 26, e.shiftKey ? -0.03 : 0.03);
    render();
  });

  render();
}

start();
