/// Converts a terrain height (`h`, from 0.0 to 1.0) and the current `sea_level`
/// into an RGB color tuple `(red, green, blue)` where each channel is 0–255.
///
/// Keeping this in a separate file makes it easy to swap color palettes
/// (e.g., parchment style vs. satellite style) or add moisture-based biomes later.
pub fn elevation_to_rgb(h: f32, sea_level: f32) -> (u8, u8, u8) {
    if h < sea_level * 0.75 {
        (24, 58, 112) // Deep Ocean
    } else if h < sea_level {
        (48, 104, 168) // Coastal Shallows
    } else if h < sea_level + 0.04 {
        (218, 198, 142) // Sand / Beach
    } else if h < sea_level + 0.22 {
        (78, 138, 66) // Lowland Plains
    } else if h < sea_level + 0.36 {
        (45, 95, 46) // Dense Forest
    } else if h < sea_level + 0.46 {
        (120, 115, 108) // Rocky Mountains
    } else {
        (242, 245, 248) // Snow Peaks
    }
}
