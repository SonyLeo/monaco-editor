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

export interface Prediction {
  targetLine: number;
  suggestionText: string;
  originalLineContent?: string;
  explanation: string;
  confidence?: number;
  priority?: number;
  changeType?: string;
  requestId?: number;
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
