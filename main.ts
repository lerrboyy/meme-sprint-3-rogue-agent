// Meme Sprint 3: AI Agent Goes Rogue — entry program.
//
// The meme image ships in this repository as meme.png (a fresh, original
// image made for this entry). This program's job is to deliver that image as
// the graded artifact: it reads the asset, checks it against the bounty gate
// (a whole PNG, at most 1024 by 1024 pixels, at most 1 MiB), then writes it
// to <output>/entry.png. It never touches the network and reads nothing
// outside this repository.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 1_048_576;
const MAX_SIDE = 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const here = dirname(fileURLToPath(import.meta.url));
const assetPath = join(here, "meme.png");

// The grader mounts its output directory at /output. A path passed on the
// command line (or OUTPUT_DIR) lets the same program be run locally.
const outputDir = resolve(process.argv[2] ?? process.env.OUTPUT_DIR ?? "/output");
const outputPath = join(outputDir, "entry.png");

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

// Read the asset and confirm it is a whole PNG of the size the gate allows.
const bytes = readFileSync(assetPath);
if (bytes.length > MAX_BYTES) {
  fail(`meme.png is ${bytes.length} bytes, over the 1 MiB gate`);
}
if (bytes.length < 33 || !PNG_MAGIC.every((b, i) => bytes[i] === b)) {
  fail("meme.png is not a PNG file");
}
const width = bytes.readUInt32BE(16);
const height = bytes.readUInt32BE(20);
if (width === 0 || height === 0 || width > MAX_SIDE || height > MAX_SIDE) {
  fail(`meme.png is ${width}x${height}, over the 1024x1024 gate`);
}

// Make sure the output directory exists, then clear only what is inside it.
// The directory itself is never removed: on the grader it is a mount point.
mkdirSync(outputDir, { recursive: true });
for (const entry of readdirSync(outputDir)) {
  rmSync(join(outputDir, entry), { recursive: true, force: true });
}

writeFileSync(outputPath, bytes);
console.log(`wrote ${outputPath} (${width}x${height}, ${bytes.length} bytes)`);
