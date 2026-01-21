/**
 * NES 核心配置
 * 所有可调参数的中心化配置
 */

/**
 * 时间配置 (毫秒)
 */
export const TIME_CONFIG = {
  /** 防抖延迟 */
  DEBOUNCE_MS: 1500,
  
  /** FIM 锁定时长 */
  LOCK_DURATION_MS: 500,
  
  /** DiffEditor 布局延迟 */
  LAYOUT_DELAY_MS: 50,
  LAYOUT_RETRY_MS: 0,
  
  /** 建议应用延迟 */
  SUGGESTION_APPLY_DELAY_MS: 150,
  
  /** 标记清除延迟 */
  MARKER_CLEAR_DELAY_MS: 100,
};

/**
 * 窗口和预测配置
 */
export const WINDOW_CONFIG = {
  /** 代码窗口大小（前后行数） */
  WINDOW_SIZE: 30,
  
  /** 最大预测数量 */
  MAX_PREDICTIONS: 5,
  
  /** 最大编辑历史 */
  MAX_EDIT_HISTORY: 10,
  
  /** 最大反馈历史 */
  MAX_FEEDBACK_HISTORY: 20,
  
  /** 编辑合并时间窗口 */
  EDIT_MERGE_WINDOW_MS: 500,
};

/**
 * 验证配置
 */
export const VALIDATION_CONFIG = {
  /** 内容相似度阈值 (0.0-1.0) */
  SIMILARITY_THRESHOLD: 0.6,
  
  /** 最小信心度 */
  MIN_CONFIDENCE: 0.5,
};

/**
 * UI 样式配置
 */
export const UI_COLORS = {
  /** 主色调 */
  PRIMARY: '#667eea',
  
  /** 次要色调 */
  SECONDARY: '#4a9eff',
  
  /** 成功色 */
  SUCCESS: 'rgba(0, 255, 0, 0.1)',
  SUCCESS_BORDER: 'rgba(0, 255, 0, 0.3)',
  SUCCESS_CHAR: 'rgba(0, 255, 0, 0.3)',
  
  /** 删除色 */
  DELETE: 'rgba(255, 0, 0, 0.1)',
  DELETE_BORDER: 'rgba(255, 0, 0, 0.3)',
  DELETE_CHAR: 'rgba(255, 0, 0, 0.3)',
  
  /** 阴影色 */
  SHADOW: 'rgba(102, 126, 234, 0.2)',
  SHADOW_GLOW: 'rgba(102, 126, 234, 0.3)',
};

/**
 * ViewZone 配置
 */
export const VIEWZONE_CONFIG = {
  /** 每行额外高度（像素） */
  EXTRA_HEIGHT_PX: 10,
  
  /** 左边距 */
  MARGIN_LEFT_PX: 50,
  
  /** 边框宽度 */
  BORDER_WIDTH_PX: 3,
};

/**
 * Glyph 配置
 */
export const GLYPH_CONFIG = {
  /** 图标大小 */
  ICON_SIZE_PX: 20,
  
  /** 不透明度 */
  OPACITY: 0.95,
  OPACITY_HOVER: 1,
  
  /** 缩放 */
  SCALE_HOVER: 1.08,
};

/**
 * Toast 配置
 */
export const TOAST_CONFIG = {
  /** 默认显示时长 */
  DEFAULT_DURATION_MS: 2000,
  
  /** 成功消息时长 */
  SUCCESS_DURATION_MS: 2000,
  
  /** 错误消息时长 */
  ERROR_DURATION_MS: 3000,
};

/**
 * 提示文本配置
 */
export const HINT_TEXT = {
  /** Glyph hover 提示 */
  GLYPH_HOVER: (explanation: string) => 
    `💡 **NES Suggestion**\n\n${explanation}\n\n*Click to preview • Tab to accept • Alt+N to skip*`,
  
  /** 旧版 Glyph hover */
  GLYPH_HOVER_LEGACY: (explanation: string) =>
    `💡 **NES Suggestion**\n\n${explanation}\n\n*Press Alt+Enter to navigate*`,
  
  /** Toast 消息 */
  TOAST: {
    PREDICTION_FAILED: 'Prediction failed',
    ALL_APPLIED: 'All suggestions applied!',
    NO_SUGGESTION: 'No active suggestion',
  },
};

/**
 * 日志配置
 */
export const LOG_CONFIG = {
  /** 是否启用详细日志 */
  VERBOSE: false,
  
  /** 日志前缀 */
  PREFIX: {
    CONTROLLER: '[NESController]',
    RENDERER: '[NESRenderer]',
    QUEUE: '[SuggestionQueue]',
    HISTORY: '[EditHistoryManager]',
    FEEDBACK: '[FeedbackCollector]',
    SERVICE: '[PredictionService]',
  },
};

/**
 * 完整的 NES 配置对象
 */
export const NES_CONFIG = {
  TIME: TIME_CONFIG,
  WINDOW: WINDOW_CONFIG,
  VALIDATION: VALIDATION_CONFIG,
  UI_COLORS,
  VIEWZONE: VIEWZONE_CONFIG,
  GLYPH: GLYPH_CONFIG,
  TOAST: TOAST_CONFIG,
  HINT_TEXT,
  LOG: LOG_CONFIG,
} as const;
