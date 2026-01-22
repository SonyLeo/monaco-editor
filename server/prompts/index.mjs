/**
 * Prompts 统一导出入口
 */

// FIM 代码补全
export { FIM_SYSTEM_PROMPT, FIM_FAST_PROMPT } from './fim/systemPrompt.mjs';
export {
  createCodeInstruction,
  createUserPrompt,
  BLOCK_COMMENT_INSTRUCTION,
  LINE_COMMENT_INSTRUCTION,
} from './fim/instructions.mjs';

// NES 编辑预测
export { NES_SYSTEM_PROMPT } from './nes/systemPrompt.mjs';
export { buildNESUserPrompt } from './nes/builder.mjs';
