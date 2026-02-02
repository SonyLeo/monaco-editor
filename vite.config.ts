import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5175,
    open: '/src/examples/vue-demo/index.html',
  },
  optimizeDeps: {
    include: ['monaco-editor'],
    exclude: ['web-tree-sitter'], // 排除 tree-sitter，避免预打包
  },
  assetsInclude: ['**/*.wasm'],
});