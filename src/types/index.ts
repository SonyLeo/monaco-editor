/**
 * 核心类型定义 - 汇总导出
 */

// 从各个模块重新导出类型
export * from './prediction';
export * from './api';
export * from './config';
export * from './edit';
export * from './analysis';

// 功能开关（从 config/features 导出，避免重复定义）
export type { FeatureFlags } from '@/config/features';

/**
 * 位置信息
 */
export interface Position {
  lineNumber: number;
  column: number;
}

/**
 * 触发上下文
 */
export interface TriggerContext {
  lineContent: string;
  lineLength: number;
  isAtLineEnd: boolean;
  isInComment: boolean;
  isInString: boolean;
  afterPunctuation: boolean;
  afterWhitespace: boolean;
  timeSinceLastEdit: number;
  timeSinceRejection: number;
}
