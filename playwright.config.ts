import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/e2e',
  fullyParallel: true, // 启用完全并行
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 3, // 本地使用 3 个 worker 并行
  reporter: 'html',
  timeout: 30000, // 减少单个测试超时时间到 30 秒
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    actionTimeout: 10000, // 减少操作超时
    navigationTimeout: 10000, // 减少导航超时
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 只启动前端服务器
  // 后端服务器需要手动启动：node server.mjs
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
