use noise::{Fbm, MultiFractal, NoiseFn, Perlin};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WorldMap {
    width: usize,
    height: usize,
    sea_level: f32,
    heights: Vec<f32>,
    pixels: Vec<u8>,
}

#[wasm_bindgen]
impl WorldMap {
    #[wasm_bindgen(constructor)]
    pub fn new(width: usize, height: usize, seed: u32) -> WorldMap {
        let mut map = WorldMap {
            width,
            height,
            sea_level: 0.45,
            heights: vec![0.0; width * height],
            pixels: vec![0; width * height * 4],
        };
        map.generate(seed);
        map
    }

    pub fn generate(&mut self, seed: u32) {
        let fbm = Fbm::<Perlin>::new(seed).set_octaves(5).set_frequency(0.005);
        let (cx, cy) = (self.width as f64 / 2.0, self.height as f64 / 2.0);
        let max_dist = cx.min(cy);

        for y in 0..self.height {
            for x in 0..self.width {
                let nx = (fbm.get([x as f64, y as f64]) + 1.0) * 0.5;
                let dist = (x as f64 - cx).hypot(y as f64 - cy) / max_dist;
                let falloff = (1.0 - dist * dist).clamp(0.0, 1.0);
                self.heights[y * self.width + x] = (nx * falloff) as f32;
            }
        }
        self.recolor_all();
    }

    pub fn set_sea_level(&mut self, level: f32) {
        self.sea_level = level;
        self.recolor_all();
    }

    pub fn sculpt(&mut self, cx: i32, cy: i32, radius: i32, delta: f32) {
        let r2 = radius * radius;
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                let d2 = dx * dx + dy * dy;
                if d2 <= r2 {
                    let (x, y) = (cx + dx, cy + dy);
                    if x >= 0 && x < self.width as i32 && y >= 0 && y < self.height as i32 {
                        let idx = (y as usize) * self.width + (x as usize);
                        let falloff = 1.0 - (d2 as f32 / r2 as f32);
                        self.heights[idx] = (self.heights[idx] + delta * falloff).clamp(0.0, 1.0);
                        self.color_cell(idx);
                    }
                }
            }
        }
    }

    pub fn pixels_ptr(&self) -> *const u8 {
        self.pixels.as_ptr()
    }

    fn recolor_all(&mut self) {
        for i in 0..self.heights.len() {
            self.color_cell(i);
        }
    }

    fn color_cell(&mut self, idx: usize) {
        let (h, s) = (self.heights[idx], self.sea_level);
        let (r, g, b) = if h < s * 0.75 {
            (24, 58, 112)
        } else if h < s {
            (48, 104, 168)
        } else if h < s + 0.04 {
            (218, 198, 142)
        } else if h < s + 0.22 {
            (78, 138, 66)
        } else if h < s + 0.36 {
            (45, 95, 46)
        } else if h < s + 0.46 {
            (120, 115, 108)
        } else {
            (242, 245, 248)
        };

        let p = idx * 4;
        self.pixels[p..p + 4].copy_from_slice(&[r, g, b, 255]);
    }
}
