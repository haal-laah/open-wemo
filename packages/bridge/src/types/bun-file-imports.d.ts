/**
 * Type declarations for Bun's file embedding import attributes.
 *
 * When using `import ... with { type: "file" }`, Bun returns a string path
 * that works both in development (filesystem path) and compiled binaries
 * (embedded path starting with $bunfs/).
 *
 * These wildcard declarations tell TypeScript that imports of these
 * file types resolve to string paths when using import attributes.
 */

// Image files
declare module "*.png" {
  const path: string;
  export default path;
}

declare module "*.ico" {
  const path: string;
  export default path;
}

declare module "*.svg" {
  const path: string;
  export default path;
}

// Style files
declare module "*.css" {
  const path: string;
  export default path;
}

// HTML files - Bun may return HTMLBundle type for HTML imports
// but with { type: "file" } it returns a string path
declare module "*.html" {
  const path: string;
  export default path;
}

// JavaScript files when imported with { type: "file" }
// Note: This only works for file imports, not module imports
declare module "*.js" {
  const path: string;
  export default path;
}
