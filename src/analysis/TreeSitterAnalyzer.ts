/**
 * Tree-sitter Analyzer - 基于 Tree-sitter 的语法分析器
 * 提供精确的 AST 节点分析和符号推断
 */

import { logger } from '../utils/logger';
import { Parser, Language, Tree, Node } from 'web-tree-sitter';
import type { ASTNodeInfo, SymbolInfo, SyntaxContext } from '../types/index';

export class TreeSitterAnalyzer {
  private parser: Parser | null = null;
  private language: Language | null = null;
  private initialized = false;
  private parseCache = new Map<string, Tree>();
  private readonly CACHE_MAX_SIZE = 10;

  /**
   * 初始化 Tree-sitter（异步）
   */
  async init(languageFile = '/tree-sitter/tree-sitter-typescript.wasm'): Promise<void> {
    if (this.initialized) return;

    try {
      // 初始化 Parser（静态方法）
      await Parser.init();
      
      // 创建 Parser 实例
      this.parser = new Parser();
      
      // 加载语言
      this.language = await Language.load(languageFile);
      
      // 设置语言
      this.parser.setLanguage(this.language);
      this.initialized = true;
    } catch (error) {
      logger.error('[TreeSitter] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 分析编辑位置的 AST 节点
   */
  analyzeEdit(code: string, lineNumber: number, column: number): ASTNodeInfo | null {
    if (!this.parser || !this.initialized) {
      logger.warn('[TreeSitter] Parser not initialized');
      return null;
    }

    try {
      // 1. 解析代码（带缓存）
      const tree = this.parseWithCache(code);
      if (!tree) return null;
      
      // 2. 找到光标位置的节点（使用官方 API）
      const node = tree.rootNode.descendantForPosition({
        row: lineNumber - 1,  // Tree-sitter 使用 0-based
        column: column - 1,
      });

      if (!node) return null;

      // 3. 提取节点信息
      return this.extractNodeInfo(node);
    } catch (error) {
      logger.error('[TreeSitter] Parse error:', error);
      return null;
    }
  }

  /**
   * 带缓存的解析
   */
  private parseWithCache(code: string): Tree | null {
    if (!this.parser) return null;

    // 使用代码哈希作为缓存键
    const codeHash = this.hashCode(code);

    if (this.parseCache.has(codeHash)) {
      return this.parseCache.get(codeHash)!;
    }

    const tree = this.parser.parse(code);
    
    // 检查 tree 是否为 null
    if (!tree) return null;
    
    // 限制缓存大小
    if (this.parseCache.size >= this.CACHE_MAX_SIZE) {
      const firstKey = this.parseCache.keys().next().value;
      if (firstKey) {
        this.parseCache.delete(firstKey);
      }
    }

    this.parseCache.set(codeHash, tree);
    return tree;
  }

  /**
   * 简单哈希函数
   */
  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  /**
   * 提取 AST 节点信息
   */
  private extractNodeInfo(node: Node): ASTNodeInfo {
    return {
      type: node.type,
      text: node.text.length > 100 ? node.text.substring(0, 100) + '...' : node.text,
      startPosition: node.startPosition,
      endPosition: node.endPosition,
      parent: node.parent ? {
        type: node.parent.type,
        text: node.parent.text.length > 50 ? node.parent.text.substring(0, 50) + '...' : node.parent.text,
      } : undefined,
      children: node.children.slice(0, 5).map((child: Node) => ({
        type: child.type,
        text: child.text.length > 30 ? child.text.substring(0, 30) + '...' : child.text,
        startPosition: child.startPosition,
        endPosition: child.endPosition,
      })),
    };
  }

  /**
   * 推断符号信息
   */
  inferSymbolInfo(node: Node): SymbolInfo | null {
    // 根据节点类型推断符号类型
    const symbolKind = this.getSymbolKind(node);
    if (!symbolKind) return null;

    const name = this.extractSymbolName(node);
    const scope = this.inferScope(node);
    const isExported = this.isExported(node);
    const isAsync = this.isAsync(node);

    return {
      name,
      kind: symbolKind,
      scope,
      isExported,
      isAsync,
    };
  }

  /**
   * 获取符号类型
   */
  private getSymbolKind(node: Node): SymbolInfo['kind'] | null {
    const typeMap: Record<string, SymbolInfo['kind']> = {
      'function_declaration': 'function',
      'arrow_function': 'function',
      'function_expression': 'function',
      'method_definition': 'method',
      'variable_declarator': 'variable',
      'lexical_declaration': 'variable',
      'class_declaration': 'class',
      'formal_parameter': 'parameter',
      'required_parameter': 'parameter',
      'property_identifier': 'property',
      'property_signature': 'property',
      'interface_declaration': 'interface',
      'type_alias_declaration': 'type',
    };

    // 检查当前节点
    if (typeMap[node.type]) {
      return typeMap[node.type]!;
    }

    // 检查父节点
    if (node.parent && typeMap[node.parent.type]) {
      return typeMap[node.parent.type]!;
    }

    return null;
  }

  /**
   * 提取符号名称
   */
  private extractSymbolName(node: Node): string {
    // 尝试找到 identifier 子节点
    const identifierNode = this.findChildByType(node, 'identifier');
    if (identifierNode) {
      return identifierNode.text;
    }

    // 如果当前节点就是 identifier
    if (node.type === 'identifier') {
      return node.text;
    }

    // 回退到节点文本
    return node.text.split(/\s+/)[0] || 'unknown';
  }

  /**
   * 推断作用域
   */
  private inferScope(node: Node): SymbolInfo['scope'] {
    let current = node.parent;

    while (current) {
      // 在类内部
      if (current.type === 'class_declaration' || current.type === 'class_body') {
        return 'class';
      }

      // 在函数内部
      if (
        current.type === 'function_declaration' ||
        current.type === 'arrow_function' ||
        current.type === 'function_expression' ||
        current.type === 'method_definition'
      ) {
        return 'local';
      }

      // 在导出语句中
      if (current.type === 'export_statement') {
        return 'module';
      }

      current = current.parent;
    }

    return 'global';
  }

  /**
   * 检查是否被导出
   */
  private isExported(node: Node): boolean {
    let current = node.parent;

    while (current) {
      if (current.type === 'export_statement') {
        return true;
      }
      current = current.parent;
    }

    return false;
  }

  /**
   * 检查是否是异步函数
   */
  private isAsync(node: Node): boolean {
    // 检查节点文本是否包含 async
    if (node.text.startsWith('async ')) {
      return true;
    }

    // 检查父节点
    if (node.parent && node.parent.text.startsWith('async ')) {
      return true;
    }

    return false;
  }

  /**
   * 构建语法上下文
   */
  buildSyntaxContext(node: Node): SyntaxContext {
    let current = node.parent;
    
    const context: SyntaxContext = {
      inFunctionDeclaration: false,
      inClassDeclaration: false,
      inObjectLiteral: false,
      inArrayLiteral: false,
      inConditional: false,
      inLoop: false,
    };

    while (current) {
      switch (current.type) {
        case 'function_declaration':
        case 'arrow_function':
        case 'function_expression':
        case 'method_definition':
          context.inFunctionDeclaration = true;
          if (!context.nearestFunction) {
            const funcName = this.extractSymbolName(current);
            context.nearestFunction = funcName;
          }
          break;

        case 'class_declaration':
          context.inClassDeclaration = true;
          if (!context.nearestClass) {
            const className = this.extractSymbolName(current);
            context.nearestClass = className;
          }
          break;

        case 'object':
        case 'object_pattern':
          context.inObjectLiteral = true;
          break;

        case 'array':
        case 'array_pattern':
          context.inArrayLiteral = true;
          break;

        case 'if_statement':
        case 'ternary_expression':
        case 'switch_statement':
          context.inConditional = true;
          break;

        case 'for_statement':
        case 'while_statement':
        case 'do_statement':
        case 'for_in_statement':
          context.inLoop = true;
          break;
      }

      current = current.parent;
    }

    return context;
  }

  /**
   * 辅助方法：查找特定类型的子节点
   */
  private findChildByType(node: Node, type: string): Node | null {
    // 使用官方 API 的 children 属性
    for (const child of node.children) {
      if (child.type === type) {
        return child;
      }
    }
    return null;
  }



  /**
   * 基于 AST 查找目标位置（Layer 2 核心方法）
   * 
   * @param code - 完整代码
   * @param lineNumber - 目标行号（1-based）
   * @param targetText - 要查找的文本
   * @param nodeType - 可选的节点类型过滤
   * @param parentType - 可选的父节点类型过滤
   * @returns 位置信息，如果找不到返回 null
   */
  findTargetPosition(
    code: string,
    lineNumber: number,
    targetText: string,
    nodeType?: string,
    parentType?: string
  ): { startColumn: number; endColumn: number } | null {
    if (!this.parser || !this.initialized) {
      logger.warn('[TreeSitter] Parser not initialized');
      return null;
    }

    try {
      const tree = this.parseWithCache(code);
      if (!tree) return null;

      // 获取目标行的所有节点
      const targetRow = lineNumber - 1; // Tree-sitter 使用 0-based
      const matchingNodes: Node[] = [];

      // 递归查找所有匹配的节点
      const findMatches = (node: Node) => {
        // 检查节点是否在目标行
        if (node.startPosition.row === targetRow || node.endPosition.row === targetRow) {
          // 检查文本是否匹配
          if (node.text === targetText) {
            // 检查节点类型（如果指定）
            if (!nodeType || node.type === nodeType) {
              // 检查父节点类型（如果指定）
              if (!parentType || (node.parent && node.parent.type === parentType)) {
                matchingNodes.push(node);
              }
            }
          }
        }

        // 递归检查子节点
        for (const child of node.children) {
          findMatches(child);
        }
      };

      findMatches(tree.rootNode);

      if (matchingNodes.length === 0) {

        return null;
      }

      // 如果有多个匹配，选择第一个（或可以根据其他条件选择）
      const targetNode = matchingNodes[0]!;



      return {
        startColumn: targetNode.startPosition.column + 1, // 转换为 1-based
        endColumn: targetNode.endPosition.column + 1
      };
    } catch (error) {
      logger.error('[TreeSitter] findTargetPosition error:', error);
      return null;
    }
  }

  /**
   * 基于 AST 查询查找位置（更精确的方法）
   * 
   * @param code - 完整代码
   * @param query - 查询条件
   * @returns 位置信息，如果找不到返回 null
   */
  findByQuery(
    code: string,
    query: {
      lineNumber: number;
      nodeType?: string;
      value?: string;
      parentType?: string;
      index?: number; // 如果有多个匹配，取第几个（0-based）
    }
  ): { startColumn: number; endColumn: number } | null {
    if (!this.parser || !this.initialized) {
      logger.warn('[TreeSitter] Parser not initialized');
      return null;
    }

    try {
      const tree = this.parseWithCache(code);
      if (!tree) return null;

      const targetRow = query.lineNumber - 1;
      const matchingNodes: Node[] = [];

      const findMatches = (node: Node) => {
        // 检查节点是否在目标行
        const nodeInTargetLine = 
          node.startPosition.row === targetRow || 
          node.endPosition.row === targetRow ||
          (node.startPosition.row <= targetRow && node.endPosition.row >= targetRow);

        if (nodeInTargetLine) {
          let matches = true;

          // 检查节点类型
          if (query.nodeType && node.type !== query.nodeType) {
            matches = false;
          }

          // 检查节点值
          if (query.value && node.text !== query.value) {
            matches = false;
          }

          // 检查父节点类型
          if (query.parentType && (!node.parent || node.parent.type !== query.parentType)) {
            matches = false;
          }

          if (matches) {
            matchingNodes.push(node);
          }
        }

        // 递归检查子节点
        for (const child of node.children) {
          findMatches(child);
        }
      };

      findMatches(tree.rootNode);

      if (matchingNodes.length === 0) {
        return null;
      }

      // 选择指定索引的节点
      const index = query.index || 0;
      if (index >= matchingNodes.length) {
        logger.warn('[TreeSitter] Index out of range', {
          index,
          matchCount: matchingNodes.length
        });
        return null;
      }

      const targetNode = matchingNodes[index]!;



      return {
        startColumn: targetNode.startPosition.column + 1,
        endColumn: targetNode.endPosition.column + 1
      };
    } catch (error) {
      logger.error('[TreeSitter] findByQuery error:', error);
      return null;
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取节点的完整路径（用于调试）
   */
  getNodePath(node: Node): string {
    const path: string[] = [];
    let current: Node | null = node;

    while (current) {
      path.unshift(current.type);
      current = current.parent;
    }

    return path.join(' > ');
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.parseCache.clear();
  }
}
