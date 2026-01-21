/**
 * 仲裁器类型定义
 */

import type * as monaco from 'monaco-editor';

/**
 * 建议类型
 */
export type SuggestionType = 'FIM' | 'NES' | 'WORD_FIX';

/**
 * 建议优先级（数字越大优先级越高）
 * - FIM: 1 (最低)
 * - NES: 2 (中等)
 * - WordFix: 3 (最高)
 */
export type SuggestionPriority = 1 | 2 | 3;

/**
 * FIM 建议（快速补全）
 * 优先级: 1 (最低)
 */
export interface FimSuggestion {
  type: 'FIM';
  priority: 1;
  text: string;
  position: { lineNumber: number; column: number };
  range?: monaco.IRange;
}

/**
 * NES 建议（预测性编辑）
 * 优先级: 2 (中等)
 */
export interface NesSuggestion {
  type: 'NES';
  priority: 2;
  targetLine: number;
  suggestion: string;
  originalText?: string;
  changeType: 'FIX' | 'REFACTOR';
}

/**
 * 单词修复建议
 * 优先级: 3 (最高)
 */
export interface WordFix {
  type: 'WORD_FIX';
  priority: 3;
  targetLine: number;
  range: monaco.IRange;
  oldWord: string;
  newWord: string;
}

/**
 * 统一建议类型
 */
export type Suggestion = FimSuggestion | NesSuggestion | WordFix;

/**
 * 仲裁器状态
 */
export interface ArbiterState {
  currentSuggestion: Suggestion | null;
  fimLocked: boolean;
  lockUntil: number;
}
