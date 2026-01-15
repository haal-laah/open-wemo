/**
 * Icon Generator for System Tray
 *
 * Run with: bun packages/bridge/assets/generate-icons.ts
 *
 * Creates PNG icons for the system tray.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Creates a simple solid-color circle PNG icon.
 * Generates a proper 32x32 PNG with transparency.
 */
function createCircleIcon(r: number, g: number, b: number, size = 32): Buffer {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk (image header)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); // width
  ihdrData.writeUInt32BE(size, 4); // height
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // color type (RGBA)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk("IHDR", ihdrData);

  // IDAT chunk (image data)
  // Create raw pixel data (RGBA)
  const rawData: number[] = [];
  const center = size / 2;
  const radius = size / 2 - 2; // Leave small margin

  for (let y = 0; y < size; y++) {
    rawData.push(0); // Filter byte for each row
    for (let x = 0; x < size; x++) {
      const dx = x - center + 0.5;
      const dy = y - center + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Inside circle - solid color
        rawData.push(r, g, b, 255);
      } else if (dist <= radius + 1) {
        // Anti-aliased edge
        const alpha = Math.round((radius + 1 - dist) * 255);
        rawData.push(r, g, b, alpha);
      } else {
        // Outside - transparent
        rawData.push(0, 0, 0, 0);
      }
    }
  }

  // Compress with zlib (deflate)
  const compressed = Bun.deflateSync(Buffer.from(rawData));
  const idatChunk = createChunk("IDAT", Buffer.from(compressed));

  // IEND chunk (image end)
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Creates a PNG chunk with CRC.
 */
function createChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * CRC32 calculation for PNG.
 */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  const table = getCrcTable();

  for (let i = 0; i < data.length; i++) {
    const byte = data[i] ?? 0;
    const idx = (crc ^ byte) & 0xff;
    crc = (table[idx] ?? 0) ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

let crcTable: number[] | null = null;
function getCrcTable(): number[] {
  if (crcTable) return crcTable;

  crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    crcTable[n] = c;
  }
  return crcTable;
}

/**
 * Creates a simple ICO file from a PNG buffer.
 * ICO format: header + directory entry + PNG data
 */
function createIco(pngBuffer: Buffer, width: number, height: number): Buffer {
  // ICO header (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved (must be 0)
  header.writeUInt16LE(1, 2); // Image type (1 = ICO)
  header.writeUInt16LE(1, 4); // Number of images

  // ICO directory entry (16 bytes)
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width >= 256 ? 0 : width, 0); // Width (0 means 256)
  entry.writeUInt8(height >= 256 ? 0 : height, 1); // Height (0 means 256)
  entry.writeUInt8(0, 2); // Color palette (0 = no palette)
  entry.writeUInt8(0, 3); // Reserved
  entry.writeUInt16LE(1, 4); // Color planes
  entry.writeUInt16LE(32, 6); // Bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8); // Size of image data
  entry.writeUInt32LE(22, 12); // Offset to image data (6 + 16 = 22)

  return Buffer.concat([header, entry, pngBuffer]);
}

// Generate icons
const assetsDir = import.meta.dir;

// Green icon (running state) - a nice teal/cyan color
const iconRunningPng = createCircleIcon(0, 180, 160, 32);
const iconRunningIco = createIco(iconRunningPng, 32, 32);

// Red/orange icon (error state)
const iconErrorPng = createCircleIcon(220, 80, 60, 32);
const iconErrorIco = createIco(iconErrorPng, 32, 32);

// Write PNG files (for macOS/Linux)
writeFileSync(resolve(assetsDir, "icon.png"), iconRunningPng);
writeFileSync(resolve(assetsDir, "icon-error.png"), iconErrorPng);

// Write ICO files (for Windows)
writeFileSync(resolve(assetsDir, "icon.ico"), iconRunningIco);
writeFileSync(resolve(assetsDir, "icon-error.ico"), iconErrorIco);

console.log("Icons generated successfully:");
console.log(`  - icon.png (${iconRunningPng.length} bytes)`);
console.log(`  - icon.ico (${iconRunningIco.length} bytes)`);
console.log(`  - icon-error.png (${iconErrorPng.length} bytes)`);
console.log(`  - icon-error.ico (${iconErrorIco.length} bytes)`);
