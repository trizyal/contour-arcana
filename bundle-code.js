import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ==========================================
// CONFIGURATION
// ==========================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = __dirname;
const OUTPUT_FILE = path.join(ROOT_DIR, "combined-source-code.txt");

// Directories to completely skip
const IGNORE_DIRS = new Set([
  "node_modules",
  "target", // Rust build output
  ".git",
  "dist",
  "build",
  ".vite",
  "public", // Static assets (images, icons, etc.)
  "assets", // General asset folders
  "icons", // Tauri default icons folder
  "gen", // Tauri generated code
  "pkg",
]);

// File extensions to include (React + Rust + Styling)
const INCLUDE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".rs",
  ".css",
  ".scss",
  ".json",
  ".html",
]);

// Specific files to ignore (configs, lock files, etc.)
const IGNORE_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "tsconfig.json",
  ".gitignore",
  "bundle-code.js", // Ignore this script itself
]);
// ==========================================

function walkDir(currentDir, fileList = []) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      // Skip if directory is in our ignore list
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }
      walkDir(fullPath, fileList);
    } else if (entry.isFile()) {
      // Skip if file is in our ignore list or extension isn't matched
      if (
        IGNORE_FILES.has(entry.name) ||
        !INCLUDE_EXTENSIONS.has(path.extname(entry.name))
      ) {
        continue;
      }
      fileList.push(fullPath);
    }
  }

  return fileList;
}

function bundleCode() {
  console.log(`Scanning Tauri codebase in: ${ROOT_DIR}...`);
  const files = walkDir(ROOT_DIR);

  let outputStream = fs.createWriteStream(OUTPUT_FILE, { encoding: "utf8" });

  // Add header
  outputStream.write(`/* ==========================================\n`);
  outputStream.write(`   TAURI CODEBASE BUNDLE\n`);
  outputStream.write(`   Generated on: ${new Date().toISOString()}\n`);
  outputStream.write(`   ========================================== */\n\n`);

  let count = 0;
  for (const file of files) {
    const relativePath = path.relative(ROOT_DIR, file);
    console.log(`Adding: ${relativePath}`);

    outputStream.write(`\n\n/* ==========================================\n`);
    outputStream.write(`   FILE: ${relativePath}\n`);
    outputStream.write(`   ========================================== */\n\n`);

    const content = fs.readFileSync(file, "utf8");
    outputStream.write(content);
    count++;
  }

  outputStream.end();
  console.log(`\nSuccessfully bundled ${count} files into: ${OUTPUT_FILE}`);
}

bundleCode();
