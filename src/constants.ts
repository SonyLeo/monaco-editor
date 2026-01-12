/**
 * 前端配置常量
 * 集中管理所有魔法值和硬编码配置
 */

// ==================== API 配置 ====================
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const API_ENDPOINTS = {
  HEALTH: `${API_BASE_URL}/health`,
  COMPLETION: `${API_BASE_URL}/code-completion`,
} as const;

export const API_CONFIG = {
  HEALTH_CHECK_INTERVAL: 10000, // 健康检查间隔（毫秒）
} as const;

// ==================== 编辑器配置 ====================
export const EDITOR_CONFIG = {
  THEME: 'vs-dark',
  FONT_SIZE: 14,
  TAB_SIZE: 2,
  MINIMAP_ENABLED: true,
  DEFAULT_LANGUAGE: 'javascript' as const,
  AUTOMATIC_LAYOUT: true,
  
  // 快速建议配置
  QUICK_SUGGESTIONS: {
    other: true,
    comments: false,
    strings: false,
  },
  
  // 其他配置
  WORD_BASED_SUGGESTIONS: 'off' as const,
  SUGGEST_ON_TRIGGER_CHARACTERS: true,
} as const;

// ==================== 补全触发配置 ====================
export const COMPLETION_TRIGGER_CONFIG = {
  TRIGGER_MODE: 'onTyping' as const,  // 实时触发模式
  MAX_CONTEXT_LINES: 50,              // 最大上下文行数
  ENABLE_CACHING: true,               // 启用缓存
  ALLOW_FOLLOW_UP: true,              // 允许连续补全
  MIN_CODE_LENGTH: 5,                 // 最小代码长度（降低阈值）
} as const;
