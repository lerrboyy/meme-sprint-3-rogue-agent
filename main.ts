// Meme Sprint 3: AI Agent Goes Rogue — entry program.
//
// The meme image ships in this repository as meme.png (a fresh, original
// image made for this entry). This program's job is to deliver that image as
// the graded artifact: it reads the asset, checks it against the bounty gate
// (a whole PNG, at most 1024 by 1024 pixels, at most 1 MiB), then writes it
// to <output>/entry.png. "Whole" is checked for real: the program walks the
// PNG chunk structure, verifies every chunk's CRC, requires IHDR first and
// IEND last with nothing after it, so a truncated or hand-edited file with
// a plausible header is rejected here instead of failing at the grader.
// After writing, it reads the output back and confirms it matches the asset
// byte for byte. It never touches the network and reads nothing outside this
// repository.

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

// CRC-32 (IEEE 802.3) lookup table, built once at startup.
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(data: Buffer, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Walk the PNG chunk structure and confirm the asset is a whole file, not
// just a file with a plausible header: every chunk must carry a valid CRC,
// the first chunk must be IHDR, and the file must end exactly with IEND.
// A truncated download or a hand-edited file with a valid header but a
// broken body is caught here instead of being shipped to the grader, whose
// sealed scorer only accepts a whole PNG.
function validatePng(bytes: Buffer): { width: number; height: number } {
  let offset = 8;
  let first = true;
  let width = 0;
  let height = 0;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      fail(`meme.png is truncated inside the ${type} chunk`);
    }
    const storedCrc = bytes.readUInt32BE(dataEnd);
    const actualCrc = crc32(bytes, offset + 4, dataEnd);
    if (storedCrc !== actualCrc) {
      fail(`meme.png has a bad CRC in the ${type} chunk`);
    }
    if (first) {
      if (type !== "IHDR" || length !== 13) {
        fail("meme.png does not start with an IHDR chunk");
      }
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      first = false;
    }
    offset = dataEnd + 4;
    if (type === "IEND") {
      if (offset !== bytes.length) {
        fail("meme.png has trailing data after the IEND chunk");
      }
      return { width, height };
    }
  }
  fail("meme.png has no IEND chunk");
}

// Read the asset and confirm it is a whole PNG of the size the gate allows.
const bytes = readFileSync(assetPath);
if (bytes.length > MAX_BYTES) {
  fail(`meme.png is ${bytes.length} bytes, over the 1 MiB gate`);
}
if (bytes.length < 33 || !PNG_MAGIC.every((b, i) => bytes[i] === b)) {
  fail("meme.png is not a PNG file");
}
const { width, height } = validatePng(bytes);
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

// Read the file back and confirm the write actually landed byte for byte,
// so a failed or partial write is reported here instead of silently
// handing the grader a corrupt artifact.
const written = readFileSync(outputPath);
if (!written.equals(bytes)) {
  fail(`${outputPath} did not verify after writing`);
}
console.log(`wrote ${outputPath} (${width}x${height}, ${bytes.length} bytes)`);
console.log(`verified ${outputPath} matches meme.png byte for byte`);
