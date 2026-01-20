/**
 * Next Edit Prediction 类型定义
 */
import type * as monaco from 'monaco-editor';

/**
 * 编辑动作类型
 */
export type EditAction = 'insert' | 'replace' | 'delete';

/**
 * 编辑模式类型
 */
export type EditPatternType = 
  | 'add_field'       // 添加字段
  | 'add_parameter'   // 添加参数
  | 'rename'          // 重命名
  | 'refactor'        // 重构
  | 'fix'             // 修复
  | 'unknown';        // 未知

/**
 * 编辑模式分析结果
 */
export interface EditPattern {
  /** 模式类型 */
  type: EditPatternType;
  /** 置信度 (0-1) */
  confidence: number;
  /** 上下文描述 */
  context: string;
  /** 相关符号 */
  relatedSymbols: string[];
}

/**
 * Next Edit 预测结果
 */
export interface NextEditPrediction {
  /** 预测的行号 */
  line: number;
  /** 预测的列号 */
  column: number;
  /** 编辑动作 */
  action: EditAction;
  /** 要替换的旧文本 (action=replace 时) */
  oldText?: string;
  /** 建议的新文本 */
  newText: string;
  /** 预测原因 */
  reason: string;
  /** 置信度 (0-1) */
  confidence: number;
}

/**
 * Next Edit API 请求
 */
export interface NextEditRequest {
  /** 编辑历史 */
  editHistory: any[];
  /** 当前代码 */
  currentCode: string;
  /** 编程语言 */
  language: string;
}

/**
 * Next Edit API 响应
 */
export interface NextEditResponse {
  /** 是否成功 */
  success: boolean;
  /** 预测结果 */
  prediction: NextEditPrediction | null;
  /** 检测到的模式 */
  pattern: EditPattern;
  /** 错误信息 */
  error?: string;
}

/**
 * Next Edit 建议状态
 */
export interface NextEditSuggestion {
  /** 预测结果 */
  prediction: NextEditPrediction;
  /** Monaco Range */
  range: monaco.Range;
  /** 是否已显示 */
  visible: boolean;
  /** 是否在建议位置 */
  atSuggestion: boolean;
}
