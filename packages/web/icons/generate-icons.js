/**
 * Icon Generator Script
 *
 * Run with: bun packages/web/icons/generate-icons.js
 *
 * This generates PNG icons from the SVG source.
 * Requires: sharp (npm install sharp)
 *
 * For now, this creates placeholder data URLs that can be used.
 */

const sizes = [32, 72, 96, 128, 144, 152, 192, 384, 512];

// Simple SVG icon
const _svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1a1a2e"/>
  <g transform="translate(128, 128)">
    <circle cx="128" cy="128" r="100" fill="none" stroke="#4ade80" stroke-width="20"/>
    <line x1="128" y1="28" x2="128" y2="128" stroke="#4ade80" stroke-width="20" stroke-linecap="round"/>
  </g>
</svg>
`.trim();

console.log("SVG Icon source created.");
console.log("");
console.log("To generate PNG icons, you can:");
console.log("1. Use an online SVG to PNG converter");
console.log(
  "2. Use Inkscape: inkscape icon.svg --export-filename=icon-{size}.png --export-width={size}"
);
console.log(
  "3. Use ImageMagick: convert -background none -resize {size}x{size} icon.svg icon-{size}.png"
);
console.log("");
console.log("Required sizes:", sizes.join(", "));
