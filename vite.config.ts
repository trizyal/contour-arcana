import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // "./" ensures relative asset paths so the static dist/ folder works
  // on ANY static host, including GitHub Pages project subpaths
  base: "./",
  plugins: [tailwindcss()],
});
