/**
 * AI Code Assistant - 类型定义
 */

export interface FIMConfig {
  enabled?: boolean;
  endpoint: string;
  debounceMs?: number;
  maxTokens?: number;
  temperature?: number;
}

export interface NESConfig {
  enabled?: boolean;
  endpoint: string;
  debounceMs?: number;
  symptoms?: SymptomType[];
  windowSize?: number;
}

export interface AICodeAssistantConfig {
  fim?: FIMConfig;
  nes?: NESConfig;
  language?: string;
  enableSemanticAnalysis?: boolean;
}

export interface AICodeAssistant {
  dispose: () => void;
  onSymptomDetected?: (callback: (symptom: Symptom) => void) => void;
  onPrediction?: (callback: (predictions: Prediction[]) => void) => void;
}

export type SymptomType =
  | 'RENAME_FUNCTION'
  | 'RENAME_VARIABLE'
  | 'ADD_PARAMETER'
  | 'REMOVE_PARAMETER'
  | 'CHANGE_TYPE'
  | 'LOGIC_ERROR'
  | 'WORD_FIX';

export interface Symptom {
  type: SymptomType;
  confidence: number;
  description: string;
  affectedLine?: number;
  context?: Record<string, any>;
}

// 变更类型定义
export type ChangeType = 
  | 'REPLACE_LINE'      // 整行替换
  | 'REPLACE_WORD'      // 单词/部分替换
  | 'INSERT'            // 插入新行
  | 'DELETE'            // 删除行
  | 'INLINE_INSERT';    // 行内插入

// 单词替换的详细信息
export interface WordReplaceInfo {
  word: string;           // 错误的单词
  replacement: string;    // 正确的单词
  startColumn: number;    // 单词在行中的起始列
  endColumn: number;      // 单词在行中的结束列
}

// 行内插入的详细信息
export interface InlineInsertInfo {
  content: string;        // 要插入的内容
  insertColumn: number;   // 插入位置的列号
}

export interface Prediction {
  targetLine: number;
  suggestionText: string;
  originalLineContent?: string;
  explanation: string;
  confidence?: number;
  priority?: number;
  changeType?: ChangeType;
  requestId?: number;
  wordReplaceInfo?: WordReplaceInfo;    // 单词替换信息（仅 REPLACE_WORD 时使用）
  inlineInsertInfo?: InlineInsertInfo;  // 行内插入信息（仅 INLINE_INSERT 时使用）
}

export interface EditRecord {
  timestamp: number;
  lineNumber: number;
  column: number;
  type: 'insert' | 'delete' | 'replace';
  oldText: string;
  newText: string;
  rangeLength: number;
  source?: 'user' | 'nes'; // 编辑来源
  context?: {
    lineContent: string;
    tokenType?: 'identifier' | 'string' | 'comment' | 'keyword' | 'other';
    semanticType?: 'functionName' | 'variableName' | 'parameter' | 'functionCall' | 'other';
  };
}

export interface NESPayload {
  codeWindow: string;
  windowInfo: {
    startLine: number;
    totalLines: number;
  };
  diffSummary: string;
  editHistory: EditRecord[];
  requestId: number;
}

export interface NESResponse {
  symptom?: Symptom;
  predictions: Prediction[];
  totalCount: number;
  hasMore: boolean;
  requestId: number;
}
