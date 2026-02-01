/**
 * 日志工具
 * 
 * 策略：
 * - debug: 默认隐藏。在控制台设置 `window.AI_DEBUG = true` 可开启。
 * - info: 仅用于关键流程节点（如初始化成功）。
 * - warn/error: 始终显示。
 */

const getDebugState = () => {
  if (typeof window !== 'undefined') {
    // 允许通过全局变量开启调试
    return (window as any).AI_DEBUG === true;
  }
  return false;
};

export const logger = {
  /**
   * 调试日志 (默认隐藏)
   */
  debug(...args: unknown[]): void {
    if (getDebugState()) {
      console.log(...args);
    }
  },

  /**
   * 关键信息日志 (始终显示)
   */
  info(...args: unknown[]): void {
    console.log(...args);
  },

  /**
   * 警告日志
   */
  warn(...args: unknown[]): void {
    console.warn(...args);
  },

  /**
   * 错误日志
   */
  error(...args: unknown[]): void {
    console.error(...args);
  },
};
