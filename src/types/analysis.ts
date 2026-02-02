/**
 * 代码分析类型定义
 * 职责：Tree-sitter 分析相关的接口（AST、符号、语法上下文）
 */

import type { Point } from 'web-tree-sitter';

/**
 * AST 节点信息
 */
export interface ASTNodeInfo {
  type: string;           // 节点类型
  text: string;           // 节点文本
  startPosition: Point;   // 起始位置
  endPosition: Point;     // 结束位置
  parent?: {
    type: string;
    text: string;
  };
  children?: Array<{
    type: string;
    text: string;
    startPosition: Point;
    endPosition: Point;
  }>;
}

/**
 * 符号信息
 */
export interface SymbolInfo {
  name: string;
  kind: 'function' | 'variable' | 'class' | 'parameter' | 'property' | 'method' | 'interface' | 'type';
  scope: 'local' | 'global' | 'module' | 'class';
  isExported?: boolean;
  isAsync?: boolean;
  returnType?: string;
}

/**
 * 语法上下文
 */
export interface SyntaxContext {
  inFunctionDeclaration: boolean;
  inClassDeclaration: boolean;
  inObjectLiteral: boolean;
  inArrayLiteral: boolean;
  inConditional: boolean;
  inLoop: boolean;
  parentExpression?: string;
  nearestFunction?: string;
  nearestClass?: string;
}
