import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5175,
    open: '/src/examples/vue-demo/index.html',
  },
  optimizeDeps: {
    include: ['monaco-editor'],
  },
});