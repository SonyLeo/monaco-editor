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
  priority?: number; // 🆕 优先级 (1=最高)
}

// 🆕 多建议响应
export interface PredictionResponse {
  predictions: Prediction[];
  totalCount: number;
  hasMore: boolean; // 是否还有更多建议未返回
}

export interface DiffRange {
  start: number;
  end: number;
}

export interface DiffInfo {
  type: "INSERT" | "DELETE" | "REPLACE" | "WHITESPACE_ONLY" | "NONE";
  lines: number[];
  changes: Array<{ type: 1 | -1 | 0; text: string }>;
  summary?: string;
  range?: {
    start: number;
    end: number;
  };
}

export interface WindowInfo {
  startLine: number;
  totalLines: number;
}

export interface EditRecord {
  timestamp: number;
  lineNumber: number;
  column: number;
  type: 'insert' | 'delete' | 'replace';
  oldText: string;
  newText: string;
  rangeLength: number;
  // 🆕 语义化信息
  context?: {
    lineContent: string; // 完整行内容
    tokenType?: 'identifier' | 'string' | 'comment' | 'keyword' | 'other'; // 编辑的是什么类型的 token
    semanticType?: 'functionName' | 'variableName' | 'parameter' | 'functionCall' | 'other'; // 语义类型
  };
}

export interface NESPayload {
  codeWindow: string;
  windowInfo: WindowInfo;
  diffSummary: string;
  requestId: number;
  editHistory?: EditRecord[];
  userFeedback?: Array<{  // 🆕 用户反馈
    targetLine: number;
    action: 'accepted' | 'skipped' | 'rejected';
    suggestionText: string;
    timestamp: number;
  }>;
  // 🆕 传递增强的 Diff 信息到后端
  changeType?: string;
  functionName?: string;
  oldSignature?: string;
  newSignature?: string;
}

export type NESState = "IDLE" | "DEBOUNCING" | "PREDICTING" | "SUGGESTING";
