/**
 * 服务器 API 端点配置
 */
export const API_ENDPOINTS = {
  COMPLETION: '/code-completion',
  HEALTH: '/health',
};

/**
 * DeepSeek API 配置
 */
export const DEEPSEEK_CONFIG = {
  API_URL: 'https://api.deepseek.com/v1/chat/completions',
  MODEL: 'deepseek-coder',
  DEFAULT_TEMPERATURE: 0.05,
  FREQUENCY_PENALTY: 0.3,
  PRESENCE_PENALTY: 0.2,
  
  // FIM (Fill-In-the-Middle) 优化配置
  FIM: {
    MAX_PREFIX_LINES: 100,
    MAX_SUFFIX_LINES: 50,
  },
};

/**
 * Qwen Coder API 配置（阿里云百炼）
 */
export const QWEN_CONFIG = {
  API_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/completions',
  MODEL: 'qwen2.5-coder-32b-instruct',
  DEFAULT_TEMPERATURE: 0.05,
  TOP_P: 0.95,
  PRESENCE_PENALTY: 0.2,
  
  // FIM (Fill-In-the-Middle) 优化配置
  FIM: {
    MAX_PREFIX_LINES: 100,
    MAX_SUFFIX_LINES: 50,
  },
};

/**
 * Provider 元信息配置
 */
export const PROVIDER_INFO = {
  deepseek: {
    name: 'deepseek-coder',
    model: 'deepseek-coder',
  },
  qwen: {
    name: 'qwen-coder',
    model: 'qwen2.5-coder-32b-instruct',
  },
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
  
  BASE_STOPS: [
    '\n\n\n',
    '<|fim_prefix|>',
    '<|fim_suffix|>',
    '<|fim_middle|>',
  ],
  
  CONTEXT_STOPS: {
    EXPRESSION: [';', '\n}', '\n)'],
    STATEMENT: ['\nfunction ', '\nclass ', '\nconst ', '\nexport ', '\nimport '],
    OBJECT: ['\n}'],
  },
  
  META_INFO_PATTERN: /^(\/\/ File:.*\n)?(\/\/ Language:.*\n)?(\/\/ Current .*\n)*(\/\/ IMPORTANT:.*\n)*(\/\/ Technologies:.*\n)?(\/\/ NOTE:.*\n)*\n*/,
};

/**
 * 停止符配置（JS/TS）
 */
export const STOP_SEQUENCES = [
  // 通用停止符
  '\n\n\n',           // 连续三个换行
  '```',              // Markdown 代码块
  
  // JS/TS 停止符
  '\nfunction ',      // 新函数定义
  '\nclass ',         // 新类定义
  '\nconst ',         // 新常量
  '\nlet ',           // 新变量
  '\nvar ',           // var 变量
  '\nexport ',        // 导出语句
  '\nimport ',        // 导入语句
  '\ninterface ',     // TS 接口
  '\ntype ',          // TS 类型
  '\nenum ',          // TS 枚举
  '\n//',             // 新注释
  '\n/*',             // 块注释
];

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