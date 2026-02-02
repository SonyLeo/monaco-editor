/**
 * 预测相关类型定义
 * 职责：AI 预测、建议、变更等相关接口
 */

/**
 * 变更类型
 */
export type ChangeType = 
  | 'REPLACE_LINE'      // 整行替换
  | 'REPLACE_WORD'      // 单词/部分替换
  | 'INSERT'            // 插入新行
  | 'DELETE'            // 删除行
  | 'INLINE_INSERT';    // 行内插入

/**
 * 单词替换的详细信息
 */
export interface WordReplaceInfo {
  word: string;           // 错误的单词
  replacement: string;    // 正确的单词
  startColumn: number;    // 单词在行中的起始列
  endColumn: number;      // 单词在行中的结束列
}

/**
 * 行内插入的详细信息
 */
export interface InlineInsertInfo {
  content: string;        // 要插入的内容
  insertColumn: number;   // 插入位置的列号
}

/**
 * AI 预测结果
 */
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
  
  // 上下文信息（用于精确位置查找）
  context?: {
    before: string;  // 目标前面的文本（3-10 字符）
    target: string;  // 要修改的文本
    after: string;   // 目标后面的文本（3-10 字符）
  };
  
  // AST 查询信息（用于 Tree-sitter 精确匹配）
  query?: {
    nodeType: string;     // AST 节点类型: "identifier", "string", "number", etc.
    value: string;        // 节点的精确文本值
    parentType?: string;  // 父节点类型（可选）
    index?: number;       // 如果有多个匹配，取第几个（0-based，默认 0）
  };
}
