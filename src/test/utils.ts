/**
 * 测试工具函数
 */

/**
 * 创建延迟 Promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 创建 mock Monaco Editor
 */
export function createMockEditor() {
  return {
    getValue: () => '',
    getModel: () => ({
      getLineCount: () => 100,
      getLineContent: (line: number) => `line ${line}`,
      getOffsetAt: () => 0
    }),
    onDidChangeModelContent: () => ({ dispose: () => {} }),
    createDecorationsCollection: () => ({
      set: () => {},
      clear: () => {}
    }),
    changeViewZones: () => {},
    setPosition: () => {},
    revealLineInCenter: () => {},
    executeEdits: () => {},
    getPosition: () => ({ lineNumber: 1, column: 1 }),
    getOption: () => 14,
    addCommand: () => {},
    trigger: () => {}
  };
}

/**
 * 创建 mock AbortController
 */
export function createMockAbortController() {
  return {
    signal: {},
    abort: () => {}
  };
}
