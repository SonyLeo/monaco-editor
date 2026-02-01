import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5175,
    open: '/ai-code-assistant/examples/vue-demo/index.html',
  },
  resolve: {
    alias: {
      'ai-code-assistant': '/ai-code-assistant',
    },
  },
  optimizeDeps: {
    include: ['monaco-editor'],
  },
});
