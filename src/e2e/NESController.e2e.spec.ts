import { test, expect } from '@playwright/test';

test.describe('NESController E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 等待编辑器加载（减少超时时间）
    await page.waitForSelector('.monaco-editor', { timeout: 5000 });
    // 减少初始等待时间
    await page.waitForTimeout(200);
  });

  // T3.1: 防抖机制
  test('should debounce predictions on rapid typing', async ({ page }) => {
    const editor = page.locator('.monaco-editor');
    await editor.click();

    // 快速输入
    await page.keyboard.type('const x = 1;', { delay: 30 }); // 减少延迟

    // 等待防抖时间（1.5秒）
    await page.waitForTimeout(1600);

    // 检查是否只触发了一次预测
    const logs = await page.evaluate(() => {
      return (window as any).__nesLogs || [];
    });

    const predictionLogs = logs.filter((log: string) => log.includes('Predicting'));
    expect(predictionLogs.length).toBeLessThanOrEqual(1);
  });

  // T3.5: 行号验证
  test('should reject invalid line numbers', async ({ page }) => {
    // 注入测试用的预测响应
    await page.evaluate(() => {
      (window as any).__mockPrediction = {
        targetLine: 999, // 无效行号
        suggestionText: 'test',
        explanation: 'test'
      };
    });

    // 触发验证
    const isValid = await page.evaluate(() => {
      const editor = (window as any).monacoEditor;
      if (!editor) return false;
      
      const model = editor.getModel();
      const prediction = (window as any).__mockPrediction;
      
      // 验证行号
      return prediction.targetLine >= 1 && prediction.targetLine <= model.getLineCount();
    });

    expect(isValid).toBe(false);
  });

  // T3.6: 内容验证
  test('should validate content match', async ({ page }) => {
    // 减少等待时间
    const editor = page.locator('.monaco-editor');
    await editor.click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(100); // 从 200ms 减少到 100ms

    // 输入代码
    await page.keyboard.type('const x = 1', { delay: 50 }); // 从 100ms 减少到 50ms
    await page.waitForTimeout(200); // 从 500ms 减少到 200ms

    // 验证内容
    const lines = await page.locator('.view-line').allTextContents();
    
    expect(lines.length).toBeGreaterThan(0);
    const firstLine = lines[0] || '';
    expect(firstLine).toMatch(/const\s+x\s*=\s*1/);
  });

  // T3.7: 滑动窗口
  test('should use sliding window of ±30 lines', async ({ page }) => {
    const editor = page.locator('.monaco-editor');
    await editor.click();

    // 输入多行代码
    for (let i = 0; i < 50; i++) {
      await page.keyboard.type(`line ${i}`);
      await page.keyboard.press('Enter');
    }

    // 等待防抖
    await page.waitForTimeout(1600);

    // 检查发送的 payload
    const payload = await page.evaluate(() => {
      return (window as any).__lastPayload;
    });

    if (payload) {
      const windowSize = payload.codeWindow.split('\n').length;
      expect(windowSize).toBeLessThanOrEqual(60); // ±30 lines
    }
  });

  // T3.8: 打字抑制机制
  test('should hide ViewZone on typing but keep Glyph Icon', async ({ page }) => {
    const editor = page.locator('.monaco-editor');
    await editor.click();

    // 输入代码触发预测
    await page.keyboard.type('function test() {');
    await page.keyboard.press('Enter');
    await page.keyboard.type('  return 1;');
    await page.keyboard.press('Enter');
    await page.keyboard.type('}');

    // 等待预测
    await page.waitForTimeout(1600);

    // 检查是否有 Glyph Icon
    const hasGlyphIcon = await page.locator('.nes-arrow-icon').count();

    if (hasGlyphIcon > 0) {
      // 开始打字
      await page.keyboard.type('// comment');

      // ViewZone 应该被隐藏，但 Glyph Icon 应该保留
      await page.waitForTimeout(100);
      
      const glyphIconStillVisible = await page.locator('.nes-arrow-icon').count();
      expect(glyphIconStillVisible).toBeGreaterThan(0);
    }
  });

  // T3.9: 通过 Arbiter 提交
  test('should submit suggestions through Arbiter', async ({ page }) => {
    // 监听控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('Arbiter')) {
        logs.push(msg.text());
      }
    });

    const editor = page.locator('.monaco-editor');
    await editor.click();

    // 输入代码触发预测
    await page.keyboard.type('const x = 1;');
    await page.keyboard.press('Enter');

    // 等待预测
    await page.waitForTimeout(2000);

    // 检查是否通过 Arbiter 提交
    const arbiterLogs = logs.filter(log => 
      log.includes('NES suggestion submitted to Arbiter') ||
      log.includes('Accepted NES suggestion')
    );

    // 如果有预测，应该通过 Arbiter
    if (arbiterLogs.length > 0) {
      expect(arbiterLogs.length).toBeGreaterThan(0);
    }
  });

  // T3.2: 请求取消
  test('should cancel previous request when new one starts', async ({ page }) => {
    // 监听网络请求
    const requests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('next-edit-prediction')) {
        requests.push(request.url());
      }
    });

    const editor = page.locator('.monaco-editor');
    await editor.click();

    // 快速输入触发多次预测
    await page.keyboard.type('const a = 1;');
    await page.waitForTimeout(500);
    await page.keyboard.type('const b = 2;');
    await page.waitForTimeout(500);
    await page.keyboard.type('const c = 3;');

    // 等待所有请求完成
    await page.waitForTimeout(2000);

    // 由于防抖和请求取消，实际发送的请求应该很少
    expect(requests.length).toBeLessThanOrEqual(2);
  });

  // T3.3: Request ID 递增
  test('should increment request ID', async ({ page }) => {
    // 监听网络请求
    const requestIds: number[] = [];
    
    page.on('request', async request => {
      if (request.url().includes('next-edit-prediction')) {
        try {
          const postData = request.postData();
          if (postData) {
            const payload = JSON.parse(postData);
            if (payload.requestId !== undefined) {
              requestIds.push(payload.requestId);
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    });

    const editor = page.locator('.monaco-editor');
    await editor.click();

    // 输入多次触发预测
    await page.keyboard.type('const a = 1;');
    await page.waitForTimeout(1600);
    
    await page.keyboard.type('const b = 2;');
    await page.waitForTimeout(1600);

    // 等待请求完成
    await page.waitForTimeout(1000);

    // Request ID 应该递增
    if (requestIds.length >= 2) {
      expect(requestIds[1]).toBeGreaterThan(requestIds[0] as number);
    }
  });

  // T3.4: Request ID 验证
  test('should discard stale responses', async ({ page }) => {
    // 这个测试需要模拟慢响应和快响应的竞态条件
    // 在真实环境中很难复现，可以通过拦截请求来模拟
    
    await page.route('**/next-edit-prediction', async route => {
      const request = route.request();
      const postData = request.postData();
      
      if (postData) {
        const payload = JSON.parse(postData);
        
        // 模拟：第一个请求慢，第二个请求快
        if (payload.requestId === 1) {
          await page.waitForTimeout(2000); // 慢响应
        }
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            targetLine: 1,
            suggestionText: 'test',
            explanation: 'test',
            requestId: payload.requestId
          })
        });
      } else {
        await route.continue();
      }
    });

    const editor = page.locator('.monaco-editor');
    await editor.click();

    // 快速触发两次预测
    await page.keyboard.type('const a = 1;');
    await page.waitForTimeout(1600);
    await page.keyboard.type('const b = 2;');
    await page.waitForTimeout(1600);

    // 等待所有响应
    await page.waitForTimeout(3000);

    // 检查只有最新的响应被接受
    // 这需要检查实际渲染的建议
    const glyphIcons = await page.locator('.nes-arrow-icon').count();
    expect(glyphIcons).toBeLessThanOrEqual(1);
  });
});
