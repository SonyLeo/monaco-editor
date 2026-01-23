/**
 * 服务器 API 端点配置
 */
export const API_ENDPOINTS = {
  COMPLETION: '/code-completion',
  HEALTH: '/health',
};

/**
 * DeepSeek FIM API 配置（Beta）
 */
export const DEEPSEEK_FIM_CONFIG = {
  API_URL: 'https://api.deepseek.com/beta/completions',
  MODEL: 'deepseek-chat',
  DEFAULT_TEMPERATURE: 0,
  MAX_TOKENS: 48,  
  FREQUENCY_PENALTY: 0,
  PRESENCE_PENALTY: 0,
};

/**
 * DeepSeek Chat API 配置
 */
export const DEEPSEEK_CHAT_CONFIG = {
  API_URL: 'https://api.deepseek.com/v1/chat/completions',
  MODEL: 'deepseek-chat',
  DEFAULT_TEMPERATURE: 0.1,
  MAX_TOKENS: 1024,  
  FREQUENCY_PENALTY: 0.3,
  PRESENCE_PENALTY: 0.2,
  RESPONSE_FORMAT: { type: 'json_object' },
};

/**
 * Qwen FIM API 配置（Completions API）
 */
export const QWEN_FIM_CONFIG = {
  API_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/completions',
  MODEL: 'qwen2.5-coder-32b-instruct',
  DEFAULT_TEMPERATURE: 0,
  MAX_TOKENS: 48, 
  TOP_P: 0.95,
  PRESENCE_PENALTY: 0,
};

/**
 * Qwen Chat API 配置
 */
export const QWEN_CHAT_CONFIG = {
  API_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  MODEL: 'qwen3-coder-flash',
  DEFAULT_TEMPERATURE: 0.1,
  MAX_TOKENS: 1024, 
  TOP_P: 0.95,
  PRESENCE_PENALTY: 0.2,
  RESPONSE_FORMAT: { type: 'json_object' },
};

/**
 * Provider 常量
 */
export const PROVIDERS = {
  DEEPSEEK: 'deepseek',
  QWEN: 'qwen',
};

/**
 * 日志配置
 */
export const LOG_CONFIG = {
  MAX_PREVIEW_LENGTH: 200,
  MAX_CONTEXT_PREVIEW: 100,
};

/**
 * 通用模型配置
 */
export const MODEL_COMMON_CONFIG = {
  // Token 限制（通用）
  TOKEN_LIMITS: {
    EXPRESSION: 64,
    STATEMENT: 256,
    FUNCTION: 200,
    CLASS: 256,
    DEFAULT: 128,
  },
  
  // 清理规则
  CLEANUP_PATTERNS: {
    MARKDOWN_CODE_BLOCK: /^```[\w]*\n?|```$/g,
    TRAILING_SEMICOLON: /;\s*$/,
    LEADING_EMPTY_LINES: /^\n+/,
    TRAILING_EMPTY_LINES: /\n+$/,
  },
};

/**
 * API 响应路径配置
 */
export const API_RESPONSE_PATHS = {
  CHAT: 'choices.0.message.content',
  COMPLETION: 'choices.0.text',
  USAGE: 'usage.total_tokens',
};

/**
 * FIM (Fill-In-the-Middle) 配置
 */
export const FIM_CONFIG = {
  MARKERS: {
    PREFIX: '<|fim_prefix|>',
    SUFFIX: '<|fim_suffix|>',
    MIDDLE: '<|fim_middle|>',
    CURSOR: '[CURSOR]',
  },
  
  META_INFO_PATTERN: /^(\/\/ File:.*\n)?(\/\/ Language:.*\n)?(\/\/ Current .*\n)*(\/\/ IMPORTANT:.*\n)*(\/\/ Technologies:.*\n)?(\/\/ NOTE:.*\n)*\n*/,
};

/**
 * FIM 停止符配置（限制 16 个以内）
 * 用于 Qwen FIM Completions API
 */
export const FIM_STOP_SEQUENCES = [
  // 语句边界
  ' {',               // 函数体开始（空格+大括号）
  '\n{',              // 函数体开始（换行+大括号）
  ';',                // 语句结束
  '\n\n',             // 双换行（段落边界）
  
  // 代码块边界
  '\n}',              // 函数/对象结束
  
  // 新定义（防止生成新的代码块）
  '\nfunction ',      // 新函数
  '\nclass ',         // 新类
  '\nconst ',         // 新常量
  '\nlet ',           // 新变量
  '\nexport ',        // 导出
  '\nimport ',        // 导入
  
  // 注释
  '\n//',             // 单行注释
  
  // Markdown（防止生成文档）
  '```',              // 代码块
];  // 总计: 14 个停止符

/**
 * Chat API 停止符配置（限制 16 个以内）
 * 用于 DeepSeek/Qwen Chat API（NES 预测不需要停止符）
 */
export const CHAT_STOP_SEQUENCES = [];  // Chat API 用于 JSON 响应，不需要停止符

/**
 * 代码上下文分析配置
 */
export const CONTEXT_CONFIG = {
  MAX_LINES_TO_SCAN: 20,  // 向上扫描的最大行数
};


/**
 * 代码模式匹配（JS/TS）
 */
export const CODE_PATTERNS = {
  // 匹配函数定义：function name() / const name = () => / name() {
  FUNCTION: /function\s+(\w+)|const\s+(\w+)\s*=.*=>|(\w+)\s*\([^)]*\)\s*{/,
  // 匹配类定义
  CLASS: /class\s+(\w+)/,
  // 匹配接口定义（TS）
  INTERFACE: /interface\s+(\w+)/,
  // 匹配类型定义（TS）
  TYPE: /type\s+(\w+)/,
};

/**
 * Fast Track 配置映射（FIM API）
 */
export const FAST_TRACK_CONFIG = {
  [PROVIDERS.DEEPSEEK]: DEEPSEEK_FIM_CONFIG,
  [PROVIDERS.QWEN]: QWEN_FIM_CONFIG,
};

/**
 * Slow Track 配置映射（Chat API）
 */
export const SLOW_TRACK_CONFIG = {
  [PROVIDERS.DEEPSEEK]: DEEPSEEK_CHAT_CONFIG,
  [PROVIDERS.QWEN]: QWEN_CHAT_CONFIG,
};
