import { afterEach } from "vitest";

// 每个测试后清理
afterEach(() => {
  document.body.innerHTML = "";
});
