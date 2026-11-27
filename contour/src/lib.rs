// Tells Rust to include our sibling file `contour/src/biomes.rs`
mod biomes;

use noise::{Fbm, MultiFractal, NoiseFn, Perlin};
use wasm_bindgen::prelude::*;

/// `#[wasm_bindgen]` exposes this Rust struct to JavaScript/TypeScript as a class.
/// JS can hold a reference to `WorldMap`, but the actual data (`heights`, `pixels`)
/// stays inside WebAssembly's fast linear memory.
#[wasm_bindgen]
pub struct WorldMap {
    width: usize,
    height: usize,
    sea_level: f32,

    /// Flat 1D array of elevation values (0.0 = deepest ocean, 1.0 = highest peak).
    /// Why 1D instead of 2D (`Vec<Vec<f32>>`)?
    /// A flat `Vec` stores all numbers side-by-side in RAM, which is much faster
    /// for the CPU to loop over. To find pixel (x, y), we use: `index = y * width + x`.
    heights: Vec<f32>,

    /// Flat 1D array of raw RGBA color bytes ready for HTML5 `<canvas>`.
    /// Every single pixel takes 4 bytes: [Red, Green, Blue, Alpha].
    /// Total length is always `width * height * 4`.
    pixels: Vec<u8>,
}

/// Every `pub fn` inside this `#[wasm_bindgen]` impl block becomes a callable
/// method on the TypeScript `WorldMap` class (with auto-generated `.d.ts` types).
#[wasm_bindgen]
impl WorldMap {
    /// `#[wasm_bindgen(constructor)]` lets TypeScript call `new WorldMap(w, h, seed)`
    /// instead of `WorldMap.new(w, h, seed)`.
    #[wasm_bindgen(constructor)]
    pub fn new(width: usize, height: usize, seed: u32) -> WorldMap {
        let mut map = WorldMap {
            width,
            height,
            sea_level: 0.45,

            // Pre-allocate the full vectors once so we don't re-allocate during edits
            heights: vec![0.0; width * height],
            pixels: vec![0; width * height * 4],
        };
        map.generate(seed);
        map
    }

    /// Resizes the map grid and regenerates terrain with `seed`, reallocating
    /// `heights` and `pixels` inside WebAssembly memory.
    pub fn resize(&mut self, width: usize, height: usize, seed: u32) {
        self.width = width;
        self.height = height;
        self.heights = vec![0.0; width * height];
        self.pixels = vec![0; width * height * 4];
        self.generate(seed);
    }

    /// Fills `self.heights` with procedural island terrain using a numeric `seed`.
    /// Passing the same seed will always generate the exact same world.
    pub fn generate(&mut self, seed: u32) {
        // Fbm = "Fractal Brownian Motion". It layers 5 octaves of Perlin noise:
        // low octaves create big continents; high octaves add jagged coastline detail.
        let fbm = Fbm::<Perlin>::new(seed).set_octaves(5).set_frequency(0.005); // Smaller frequency = zoomed in / bigger continents

        // Center point of the map, used to calculate distance from the middle
        let (cx, cy) = (self.width as f64 / 2.0, self.height as f64 / 2.0);
        let max_dist = cx.min(cy);

        for y in 0..self.height {
            for x in 0..self.width {
                // `fbm.get` returns a value roughly between -1.0 and 1.0.
                // Adding 1.0 and multiplying by 0.5 normalizes it to 0.0..1.0.
                let nx = (fbm.get([x as f64, y as f64]) + 1.0) * 0.5;

                // Island mask: measure how far (x, y) is from the center (0.0 = center, 1.0 = edge).
                // `hypot` computes sqrt(dx^2 + dy^2).
                let dist = (x as f64 - cx).hypot(y as f64 - cy) / max_dist;

                // `falloff` is 1.0 in the center and drops smoothly to 0.0 at the edges,
                // forcing the borders of the map to sink into ocean.
                let falloff = (1.0 - dist * dist).clamp(0.0, 1.0);

                // Store the final elevation in our 1D array
                self.heights[y * self.width + x] = (nx * falloff) as f32;
            }
        }

        // Convert the new heightmap numbers into visible RGBA pixels
        self.recolor_all();
    }

    /// Updates sea level and re-colors the map WITHOUT regenerating the Perlin noise.
    pub fn set_sea_level(&mut self, level: f32) {
        self.sea_level = level;
        self.recolor_all();
    }

    /// Circular terrain brush: raises (positive `delta`) or lowers (negative `delta`)
    /// land within `radius` pixels of `(cx, cy)`.
    pub fn sculpt(&mut self, cx: i32, cy: i32, radius: i32, delta: f32) {
        let r2 = radius * radius;

        // Loop over a bounding square around the cursor
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                // Squared distance check avoids slow `sqrt()` calls
                let d2 = dx * dx + dy * dy;
                if d2 <= r2 {
                    let (x, y) = (cx + dx, cy + dy);

                    // Bounds check: make sure we don't write outside the map edges
                    if x >= 0 && x < self.width as i32 && y >= 0 && y < self.height as i32 {
                        let idx = (y as usize) * self.width + (x as usize);

                        // Soft brush falloff: strongest at cursor center (1.0), fades to 0.0 at brush edge
                        let falloff = 1.0 - (d2 as f32 / r2 as f32);

                        // Apply height change and clamp to valid 0.0..1.0 range
                        self.heights[idx] = (self.heights[idx] + delta * falloff).clamp(0.0, 1.0);

                        // Only recolor the pixels we actually touched (super fast!)
                        self.color_cell(idx);
                    }
                }
            }
        }
    }

    /// Returns the raw memory address (byte offset) of `self.pixels` inside Wasm RAM.
    /// TypeScript uses this pointer to read the pixels directly without copying them.
    pub fn pixels_ptr(&self) -> *const u8 {
        self.pixels.as_ptr()
    }

    // --- Private helper methods (no `pub`, so they stay internal to Rust) ---

    /// Loops through every cell on the map and updates its RGBA color.
    fn recolor_all(&mut self) {
        for i in 0..self.heights.len() {
            self.color_cell(i);
        }
    }

    /// Looks up the biome color for a single cell `idx` and writes 4 bytes (R, G, B, A)
    /// into `self.pixels`.
    fn color_cell(&mut self, idx: usize) {
        let (r, g, b) = biomes::elevation_to_rgb(self.heights[idx], self.sea_level);

        // Each cell takes 4 bytes in `self.pixels` (Red, Green, Blue, Alpha=255 opaque)
        let p = idx * 4;
        self.pixels[p..p + 4].copy_from_slice(&[r, g, b, 255]);
    }
}
