/**
 * Tree-sitter Analyzer - 基于 Tree-sitter 的语法分析器
 * 提供精确的 AST 节点分析和符号推断
 */

// 定义 Tree-sitter 类型（因为 web-tree-sitter 的类型定义不完整）
type SyntaxNode = {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  parent: SyntaxNode | null;
  children: SyntaxNode[];
  descendantForPosition(position: { row: number; column: number }): SyntaxNode | null;
};

type Tree = {
  rootNode: SyntaxNode;
  edit(edit: any): void;
};

type Language = any;

type ParserType = {
  parse(input: string, oldTree?: Tree): Tree;
  setLanguage(language: Language): void;
};

// 全局 TreeSitter 引用（浏览器环境由 CDN 提供）
declare global {
  interface Window {
    TreeSitter: any;
  }
}

// 尝试导入（仅在 Node.js 环境）
let TreeSitterModule: any = null;
if (typeof window === 'undefined') {
  // Node.js 环境 - 动态导入
  import('web-tree-sitter').then(module => {
    TreeSitterModule = module;
  }).catch(() => {
    console.warn('[TreeSitter] Module not available in Node.js environment');
  });
}

export interface ASTNodeInfo {
  type: string;           // 节点类型
  text: string;           // 节点文本
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  parent?: {
    type: string;
    text: string;
  };
  children?: Array<{
    type: string;
    text: string;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
  }>;
}

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'variable' | 'class' | 'parameter' | 'property' | 'method' | 'interface' | 'type';
  scope: 'local' | 'global' | 'module' | 'class';
  isExported?: boolean;
  isAsync?: boolean;
  returnType?: string;
}

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

export class TreeSitterAnalyzer {
  private parser: ParserType | null = null;
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
      let TreeSitterAPI: any;

      // 检测环境
      if (typeof window !== 'undefined' && (window as any).TreeSitter) {
        // 浏览器环境 - 使用全局 TreeSitter（由 CDN 加载）
        console.log('[TreeSitter] Using global TreeSitter from CDN');
        TreeSitterAPI = (window as any).TreeSitter;
      } else if (TreeSitterModule) {
        // Node.js 环境 - 使用导入的模块
        console.log('[TreeSitter] Using imported TreeSitter module');
        TreeSitterAPI = TreeSitterModule.Parser || TreeSitterModule;
      } else {
        throw new Error('TreeSitter not available. In browser, load web-tree-sitter via CDN first.');
      }

      // 初始化 Parser
      if (typeof TreeSitterAPI.init === 'function') {
        await TreeSitterAPI.init();
      }
      
      // 创建 Parser 实例
      this.parser = new TreeSitterAPI() as ParserType;
      console.log('[TreeSitter] Parser instance created');
      
      // 加载语言
      const LanguageClass = TreeSitterAPI.Language;
      if (LanguageClass && typeof LanguageClass.load === 'function') {
        this.language = await LanguageClass.load(languageFile);
        console.log('[TreeSitter] Language loaded from:', languageFile);
      } else {
        throw new Error('Language.load not available');
      }
      
      this.parser.setLanguage(this.language);
      this.initialized = true;
      console.log('[TreeSitter] Initialized successfully');
    } catch (error) {
      console.error('[TreeSitter] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * 分析编辑位置的 AST 节点
   */
  analyzeEdit(code: string, lineNumber: number, column: number): ASTNodeInfo | null {
    if (!this.parser || !this.initialized) {
      console.warn('[TreeSitter] Parser not initialized');
      return null;
    }

    try {
      // 1. 解析代码（带缓存）
      const tree = this.parseWithCache(code);
      if (!tree) return null;
      
      // 2. 找到光标位置的节点
      const node = tree.rootNode.descendantForPosition({
        row: lineNumber - 1,  // Tree-sitter 使用 0-based
        column: column - 1,
      });

      if (!node) return null;

      // 3. 提取节点信息
      return this.extractNodeInfo(node);
    } catch (error) {
      console.error('[TreeSitter] Parse error:', error);
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
  private extractNodeInfo(node: SyntaxNode): ASTNodeInfo {
    return {
      type: node.type,
      text: node.text.length > 100 ? node.text.substring(0, 100) + '...' : node.text,
      startPosition: node.startPosition,
      endPosition: node.endPosition,
      parent: node.parent ? {
        type: node.parent.type,
        text: node.parent.text.length > 50 ? node.parent.text.substring(0, 50) + '...' : node.parent.text,
      } : undefined,
      children: node.children.slice(0, 5).map((child: SyntaxNode) => ({
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
  inferSymbolInfo(node: SyntaxNode): SymbolInfo | null {
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
  private getSymbolKind(node: SyntaxNode): SymbolInfo['kind'] | null {
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
      return typeMap[node.type];
    }

    // 检查父节点
    if (node.parent && typeMap[node.parent.type]) {
      return typeMap[node.parent.type];
    }

    return null;
  }

  /**
   * 提取符号名称
   */
  private extractSymbolName(node: SyntaxNode): string {
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
  private inferScope(node: SyntaxNode): SymbolInfo['scope'] {
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
  private isExported(node: SyntaxNode): boolean {
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
  private isAsync(node: SyntaxNode): boolean {
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
  buildSyntaxContext(node: SyntaxNode): SyntaxContext {
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
  private findChildByType(node: SyntaxNode, type: string): SyntaxNode | null {
    for (const child of node.children) {
      if (child.type === type) {
        return child;
      }
    }
    return null;
  }

  /**
   * 获取节点的完整路径（用于调试）
   */
  getNodePath(node: SyntaxNode): string {
    const path: string[] = [];
    let current: SyntaxNode | null = node;

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
