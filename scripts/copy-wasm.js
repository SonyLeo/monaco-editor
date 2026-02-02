/**
 * Copy Tree-sitter WASM files to public directory
 * Run after npm install to ensure language files are available
 */

import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Files to copy: [source, destination]
const files = [
  // Main tree-sitter WASM (optional, Vite can serve from node_modules in dev)
  [
    'node_modules/web-tree-sitter/web-tree-sitter.wasm',
    'public/tree-sitter.wasm'
  ],
  // Language files (required)
  [
    'node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm',
    'public/tree-sitter/tree-sitter-javascript.wasm'
  ],
  [
    'node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm',
    'public/tree-sitter/tree-sitter-typescript.wasm'
  ],
];

console.log('📦 Copying Tree-sitter WASM files...\n');

let successCount = 0;
let skipCount = 0;

for (const [src, dest] of files) {
  const srcPath = join(projectRoot, src);
  const destPath = join(projectRoot, dest);

  // Create destination directory if it doesn't exist
  const destDir = dirname(destPath);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
    console.log(`📁 Created directory: ${destDir}`);
  }

  // Check if source exists
  if (!existsSync(srcPath)) {
    console.log(`⚠️  Source not found: ${src}`);
    skipCount++;
    continue;
  }

  // Copy file
  try {
    copyFileSync(srcPath, destPath);
    console.log(`✅ Copied: ${src} → ${dest}`);
    successCount++;
  } catch (error) {
    console.error(`❌ Failed to copy ${src}:`, error.message);
  }
}

console.log(`\n✨ Done! ${successCount} files copied, ${skipCount} skipped.`);
