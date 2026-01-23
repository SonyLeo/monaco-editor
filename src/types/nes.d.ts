/**
 * NES (Next Edit Suggestions) Type Definitions
 */

// 🆕 变更类型
export type ChangeType = 
  | 'REPLACE_LINE'      // 整行替换（场景1：三元表达式错误）
  | 'REPLACE_WORD'      // 单词/部分替换（场景3：关键字拼写、运算符错误）
  | 'INSERT'            // 插入新行（场景2：插入属性）
  | 'DELETE'            // 删除行（场景4：删除无用代码）
  | 'INLINE_INSERT';    // 行内插入（场景5第2个：在表达式中添加代码片段）

// 🆕 单词替换的详细信息
export interface WordReplaceInfo {
  word: string;           // 错误的单词
  replacement: string;    // 正确的单词
  startColumn: number;    // 单词在行中的起始列
  endColumn: number;      // 单词在行中的结束列
}

// 🆕 行内插入的详细信息
export interface InlineInsertInfo {
  content: string;        // 要插入的内容
  insertColumn: number;   // 插入位置的列号
}

export interface Prediction {
  targetLine: number;
  suggestionText: string;
  originalLineContent?: string; // For validation
  explanation: string;
  requestId?: number;
  confidence?: number; // 🆕 模型置信度 (0-1)
  priority?: number; // 🆕 优先级 (1=最高)
  changeType?: ChangeType; // 🆕 变更类型
  wordReplaceInfo?: WordReplaceInfo; // 🆕 单词替换信息（仅 REPLACE_WORD 时使用）
  inlineInsertInfo?: InlineInsertInfo; // 🆕 行内插入信息（仅 INLINE_INSERT 时使用）
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
