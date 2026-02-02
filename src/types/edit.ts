/**
 * 编辑记录类型定义
 * 职责：用户编辑、编辑历史相关接口
 */

import type { ASTNodeInfo, SymbolInfo, SyntaxContext } from './analysis';

/**
 * 编辑记录
 */
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
    lineContent?: string;
    tokenType?: 'identifier' | 'string' | 'comment' | 'keyword' | 'other';
    semanticType?: 'functionName' | 'variableName' | 'parameter' | 'functionCall' | 'other';
    
    // Tree-sitter AST 节点信息
    astNode?: ASTNodeInfo;
    
    // 符号信息
    symbolInfo?: SymbolInfo;
    
    // 语法上下文
    syntaxContext?: SyntaxContext;
  };
}
