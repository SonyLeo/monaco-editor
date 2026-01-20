/**
 * NES (Next Edit Suggestions) Type Definitions
 */

export interface Prediction {
  targetLine: number;
  suggestionText: string;
  originalLineContent?: string; // For validation
  explanation: string;
  requestId?: number;
  confidence?: number; // 🆕 模型置信度 (0-1)
}

export interface DiffRange {
  start: number;
  end: number;
}

export interface DiffInfo {
  range: DiffRange;
  summary: string;
  // 🆕 增强的 Diff 分析
  changeType?: 'addParameter' | 'renameFunction' | 'changeType' | 'unknown';
  functionName?: string;
  oldSignature?: string;
  newSignature?: string;
}

export interface WindowInfo {
  startLine: number;
  totalLines: number;
}

export interface NESPayload {
  codeWindow: string;
  windowInfo: WindowInfo;
  diffSummary: string;
  requestId: number;
  // 🆕 传递增强的 Diff 信息到后端
  changeType?: string;
  functionName?: string;
  oldSignature?: string;
  newSignature?: string;
}

export type NESState = 'IDLE' | 'DEBOUNCING' | 'PREDICTING' | 'SUGGESTING';
