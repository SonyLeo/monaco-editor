/**
 * Diff 引擎类型定义
 */

/**
 * Diff 信息
 */
export interface DiffInfo {
  /** 变更类型 */
  type: 'INSERT' | 'DELETE' | 'REPLACE' | 'WHITESPACE_ONLY' | 'NONE';
  /** 变更的行号范围 */
  lines: number[];
  /** 变更的文本内容 */
  changes: DiffChange[];
  /** 人类可读的变更摘要（用于 AI 分析） */
  summary?: string;
  /** 原始 diff 字符串（可选） */
  rawDiff?: string;
}

/**
 * 单个变更
 */
export interface DiffChange {
  /** 变更类型：1=新增, -1=删除, 0=不变 */
  type: 1 | -1 | 0;
  /** 变更的文本 */
  text: string;
  /** 变更所在行号（可选） */
  lineNumber?: number;
}

/**
 * Diff 范围
 */
export interface DiffRange {
  /** 起始行 */
  startLine: number;
  /** 结束行 */
  endLine: number;
  /** 起始列 */
  startColumn: number;
  /** 结束列 */
  endColumn: number;
}

/**
 * 变更分析结果
 */
export interface ChangeAnalysis {
  /** 是否为纯空白变更 */
  isWhitespaceOnly: boolean;
  /** 是否为函数重命名 */
  isFunctionRename: boolean;
  /** 是否为变量重命名 */
  isVariableRename: boolean;
  /** 是否为参数变更 */
  isParameterChange: boolean;
  /** 变更的标识符（如果有） */
  changedIdentifiers: string[];
}
