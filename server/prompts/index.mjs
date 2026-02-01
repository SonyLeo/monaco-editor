/**
 * Prompts 统一导出入口
 * 
 * 模块结构:
 * - FIM (Fill-In-the-Middle): 代码补全
 * - NES (Next Edit Suggestion): 编辑预测
 */

// ============================================
// FIM - 代码补全模块
// ============================================

export { 
  FIM_SYSTEM_PROMPT, 
  FIM_FAST_PROMPT,
  FIM_TYPESCRIPT_PROMPT
} from './fim/systemPrompt.mjs';

export {
  createCodeInstruction,
  createUserPrompt,
  getContextAwareInstruction,
  BLOCK_COMMENT_INSTRUCTION,
  LINE_COMMENT_INSTRUCTION,
} from './fim/instructions.mjs';

// ============================================
// NES - 编辑预测模块
// ============================================

export { 
  NES_SYSTEM_PROMPT,
  NES_COMPACT_PROMPT
} from './nes/systemPrompt.mjs';

export { 
  buildNESUserPrompt,
  buildNESCompactPrompt
} from './nes/builder.mjs';

// 以下为内部模块，按需导出
export { 
  getPatternInstruction,
  PATTERN_TYPES,
  PATTERN_SPECIFIC_INSTRUCTIONS
} from './nes/patterns.mjs';

export {
  getFewShotExamples,
  getAvailablePatterns,
  CHANGE_TYPE_EXAMPLES,
  NES_FULL_EXAMPLE
} from './nes/examples.mjs';

export {
  formatEditHistory,
  formatUserFeedback,
  enhanceRecentChange,
  formatCodeWindow,
  formatPrediction
} from './nes/formatters.mjs';
