/**
 * AI Code Assistant - 配置文件
 */

export const DEFAULT_CONFIG = {
  fim: {
    enabled: true,
    debounceMs: 300,
    maxTokens: 64,
    temperature: 0.2,
  },
  nes: {
    enabled: true,
    debounceMs: 3000, // NES 触发防抖时间（毫秒）
    windowSize: 30,
  },
  language: 'typescript',
  enableSemanticAnalysis: true,
};

// 其他时间配置（不可由用户配置）
export const TIME_CONFIG = {
  LOCK_DURATION_MS: 500, // FIM 锁定持续时间
  LAYOUT_DELAY_MS: 50,   // 布局延迟
};

export const WINDOW_CONFIG = {
  WINDOW_SIZE: 30,
  MAX_PREDICTIONS: 5,
  MAX_EDIT_HISTORY: 10,
};

export const UI_COLORS = {
  PRIMARY: '#667eea',
  SECONDARY: '#4a9eff',
  SUCCESS: 'rgba(0, 255, 0, 0.1)',
  DELETE: 'rgba(255, 0, 0, 0.1)',
};
