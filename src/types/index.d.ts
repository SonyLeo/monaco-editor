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
  
  // ✅ 新增：上下文信息（用于精确位置查找）
  context?: {
    before: string;  // 目标前面的文本（3-10 字符）
    target: string;  // 要修改的文本
    after: string;   // 目标后面的文本（3-10 字符）
  };
  
  // ✅ 新增：AST 查询信息（用于 Tree-sitter 精确匹配）
  query?: {
    nodeType: string;     // AST 节点类型: "identifier", "string", "number", etc.
    value: string;        // 节点的精确文本值
    parentType?: string;  // 父节点类型（可选）
    index?: number;       // 如果有多个匹配，取第几个（0-based，默认 0）
  };
}

export interface EditRecord {
  timestamp: number;
  lineNumber: number;
  column: number;
  type: 'insert' | 'delete' | 'replace';
  oldText: string;
  newText: string;
  rangeLength: number;
  source?: 'user' | 'nes' | 'fim';
  context?: {
    lineContent: string;
    tokenType?: 'identifier' | 'string' | 'comment' | 'keyword' | 'other';
    semanticType?: 'functionName' | 'variableName' | 'parameter' | 'functionCall' | 'other';
    
    // ✅ Tree-sitter AST 节点信息（方案 B）
    astNode?: {
      type: string;
      text: string;
      startPosition: { row: number; column: number };
      endPosition: { row: number; column: number };
      parent?: {
        type: string;
        text: string;
      };
    };
    
    // ✅ 符号信息（方案 B）
    symbolInfo?: {
      name: string;
      kind: 'function' | 'variable' | 'class' | 'parameter' | 'property' | 'method' | 'interface' | 'type';
      scope: 'local' | 'global' | 'module' | 'class';
      isExported?: boolean;
      isAsync?: boolean;
    };
    
    // ✅ 语法上下文（方案 B）
    syntaxContext?: {
      inFunctionDeclaration: boolean;
      inClassDeclaration: boolean;
      inObjectLiteral: boolean;
      inArrayLiteral: boolean;
      inConditional: boolean;
      inLoop: boolean;
      parentExpression?: string;
      nearestFunction?: string;
      nearestClass?: string;
    };
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
