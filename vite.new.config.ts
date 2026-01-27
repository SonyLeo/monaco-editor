import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    open: '/examples/basic-test.html',
  },
  resolve: {
    alias: {
      'ai-code-assistant': '/ai-code-assistant',
    },
  },
});
