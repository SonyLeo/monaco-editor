/**
 * 编辑历史类型定义
 */
import type * as monaco from 'monaco-editor';

/**
 * 编辑类型
 */
export type EditType = 'insert' | 'delete' | 'replace';

/**
 * 编辑记录
 */
export interface EditRecord {
  /** 时间戳 */
  timestamp: number;
  /** 编辑范围 */
  range: monaco.Range;
  /** 旧文本 */
  oldText: string;
  /** 新文本 */
  newText: string;
  /** 编辑类型 */
  type: EditType;
  /** 行号 */
  lineNumber: number;
  /** 列号 */
  column: number;
  /** 编辑长度 */
  rangeLength: number;
}

/**
 * 编辑历史配置
 */
export interface EditHistoryConfig {
  /** 最大历史记录数 */
  maxHistory?: number;
  /** 是否启用调试日志 */
  debug?: boolean;
}

/**
 * 编辑历史变化回调
 */
export type EditHistoryChangeCallback = (history: EditRecord[]) => void;
