/**
 * 语义分析器（基于 Monaco TypeScript Language Service）
 * 使用最新的 Monaco Editor API 进行语义分析
 * 
 * 参考：https://microsoft.github.io/monaco-editor/typedoc/
 */

import * as monaco from 'monaco-editor';

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'variable' | 'parameter' | 'property' | 'class' | 'interface' | 'unknown';
  range: monaco.Range;
  references?: monaco.Position[];
}

export interface TokenInfo {
  type: string;
  offset: number;
  length: number;
  text: string;
}

export class SemanticAnalyzer {
  private worker: any | null = null;
  private workerPromise: Promise<any> | null = null;

  constructor(private model: monaco.editor.ITextModel) {
    this.initWorker();
  }

  /**
   * 初始化 TypeScript Worker
   */
  private async initWorker(): Promise<void> {
    try {
      const getWorker = await (monaco.languages as any).typescript.getTypeScriptWorker();
      this.worker = await getWorker(this.model.uri);
      console.log('[SemanticAnalyzer] ✅ TypeScript Worker initialized');
    } catch (error) {
      console.error('[SemanticAnalyzer] Failed to initialize worker:', error);
    }
  }

  /**
   * 获取 Worker（懒加载）
   */
  private async getWorker(): Promise<any> {
    if (this.worker) {
      return this.worker;
    }

    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        const getWorker = await (monaco.languages as any).typescript.getTypeScriptWorker();
        this.worker = await getWorker(this.model.uri);
        return this.worker;
      })();
    }

    return this.workerPromise;
  }

  /**
   * 获取指定位置的符号信息
   */
  async getSymbolAtPosition(position: monaco.Position): Promise<SymbolInfo | null> {
    try {
      const worker = await this.getWorker();
      const offset = this.model.getOffsetAt(position);
      const fileName = this.model.uri.toString();

      // 使用 getQuickInfoAtPosition 获取符号信息
      const quickInfo = await worker.getQuickInfoAtPosition(fileName, offset);

      if (!quickInfo) return null;

      const startPos = this.model.getPositionAt(quickInfo.textSpan.start);
      const endPos = this.model.getPositionAt(
        quickInfo.textSpan.start + quickInfo.textSpan.length
      );

      const name = this.model.getValueInRange(
        new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column
        )
      );

      return {
        name,
        kind: this.inferSymbolKind(quickInfo.kind),
        range: new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column
        ),
      };
    } catch (error) {
      console.warn('[SemanticAnalyzer] Failed to get symbol info:', error);
      return null;
    }
  }

  /**
   * 查找符号的所有引用
   */
  async findReferences(position: monaco.Position): Promise<monaco.Position[]> {
    try {
      const worker = await this.getWorker();
      const offset = this.model.getOffsetAt(position);
      const fileName = this.model.uri.toString();

      // 使用 getReferencesAtPosition 查找引用
      const references = await worker.getReferencesAtPosition(fileName, offset);

      if (!references) return [];

      // 只返回当前文件的引用
      return references
        .filter((ref: any) => ref.fileName === fileName)
        .map((ref: any) => this.model.getPositionAt(ref.textSpan.start));
    } catch (error) {
      console.warn('[SemanticAnalyzer] Failed to find references:', error);
      return [];
    }
  }

  /**
   * 查找重命名位置
   */
  async findRenameLocations(position: monaco.Position): Promise<monaco.Position[]> {
    try {
      const worker = await this.getWorker();
      const offset = this.model.getOffsetAt(position);
      const fileName = this.model.uri.toString();

      // 使用 findRenameLocations 查找重命名位置
      const locations = await worker.findRenameLocations(
        fileName,
        offset,
        false, // findInStrings
        false, // findInComments
        false  // providePrefixAndSuffixTextForRename
      );

      if (!locations) return [];

      return locations
        .filter((loc: any) => loc.fileName === fileName)
        .map((loc: any) => this.model.getPositionAt(loc.textSpan.start));
    } catch (error) {
      console.warn('[SemanticAnalyzer] Failed to find rename locations:', error);
      return [];
    }
  }

  /**
   * 获取定义位置
   */
  async getDefinitionAtPosition(position: monaco.Position): Promise<monaco.Position | null> {
    try {
      const worker = await this.getWorker();
      const offset = this.model.getOffsetAt(position);
      const fileName = this.model.uri.toString();

      const definitions = await worker.getDefinitionAtPosition(fileName, offset);

      if (!definitions || definitions.length === 0) return null;

      const firstDef = definitions[0];
      if (!firstDef || firstDef.fileName !== fileName) return null;

      return this.model.getPositionAt(firstDef.textSpan.start);
    } catch (error) {
      console.warn('[SemanticAnalyzer] Failed to get definition:', error);
      return null;
    }
  }

  /**
   * 检查位置是否在函数定义中
   */
  isInFunctionDefinition(position: monaco.Position): boolean {
    const line = this.model.getLineContent(position.lineNumber);
    
    // 检查函数声明模式
    if (/^\s*function\s+\w+\s*\(/.test(line)) {
      return true;
    }
    
    // 检查箭头函数
    if (/^\s*(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/.test(line)) {
      return true;
    }
    
    // 检查方法定义
    if (/^\s*(?:async\s+)?\w+\s*\([^)]*\)\s*[:{]/.test(line)) {
      return true;
    }
    
    return false;
  }

  /**
   * 检查位置是否在函数调用中
   */
  isInFunctionCall(position: monaco.Position): boolean {
    const line = this.model.getLineContent(position.lineNumber);
    const beforeCursor = line.substring(0, position.column - 1);
    
    return /\w+\s*\([^)]*$/.test(beforeCursor);
  }

  /**
   * 获取函数的参数数量
   */
  async getFunctionParameterCount(position: monaco.Position): Promise<number> {
    try {
      const worker = await this.getWorker();
      const offset = this.model.getOffsetAt(position);
      const fileName = this.model.uri.toString();

      const signatureHelp = await worker.getSignatureHelpItems(fileName, offset, {});

      if (!signatureHelp || signatureHelp.items.length === 0) {
        return 0;
      }

      return signatureHelp.items[0]?.parameters?.length || 0;
    } catch (error) {
      console.warn('[SemanticAnalyzer] Failed to get parameter count:', error);
      return 0;
    }
  }

  /**
   * 获取行的 Token 信息（使用 Monaco 的 tokenization）
   */
  getLineTokens(lineNumber: number): TokenInfo[] {
    const lineContent = this.model.getLineContent(lineNumber);
    const tokens: TokenInfo[] = [];

    try {
      // 使用 Monaco 的 tokenization API
      const lineTokens = (this.model as any).tokenization?.getLineTokens(lineNumber);
      
      if (!lineTokens) return tokens;
      
      for (let i = 0; i < lineTokens.getCount(); i++) {
        const startOffset = lineTokens.getStartOffset(i);
        const endOffset = lineTokens.getEndOffset(i);
        const tokenType = lineTokens.getStandardTokenType(i);
        
        tokens.push({
          type: this.getTokenTypeName(tokenType),
          offset: startOffset,
          length: endOffset - startOffset,
          text: lineContent.substring(startOffset, endOffset),
        });
      }
    } catch (error) {
      console.warn('[SemanticAnalyzer] Failed to tokenize line:', error);
    }

    return tokens;
  }

  /**
   * 检查位置的上下文类型
   */
  getContextType(position: monaco.Position): 'function-definition' | 'function-call' | 'object-literal' | 'array-literal' | 'string' | 'comment' | 'unknown' {
    const line = this.model.getLineContent(position.lineNumber);
    const beforeCursor = line.substring(0, position.column - 1);

    // 检查注释
    if (beforeCursor.includes('//') || beforeCursor.includes('/*')) {
      return 'comment';
    }

    // 检查字符串
    const singleQuotes = (beforeCursor.match(/'/g) || []).length;
    const doubleQuotes = (beforeCursor.match(/"/g) || []).length;
    const backticks = (beforeCursor.match(/`/g) || []).length;
    
    if (singleQuotes % 2 === 1 || doubleQuotes % 2 === 1 || backticks % 2 === 1) {
      return 'string';
    }

    // 检查函数定义
    if (this.isInFunctionDefinition(position)) {
      return 'function-definition';
    }

    // 检查函数调用
    if (this.isInFunctionCall(position)) {
      return 'function-call';
    }

    // 检查对象字面量
    const openBraces = (beforeCursor.match(/{/g) || []).length;
    const closeBraces = (beforeCursor.match(/}/g) || []).length;
    if (openBraces > closeBraces && /[=:]\s*{[^}]*$/.test(beforeCursor)) {
      return 'object-literal';
    }

    // 检查数组字面量
    const openBrackets = (beforeCursor.match(/\[/g) || []).length;
    const closeBrackets = (beforeCursor.match(/]/g) || []).length;
    if (openBrackets > closeBrackets) {
      return 'array-literal';
    }

    return 'unknown';
  }

  /**
   * 检查是否是类型注解变化
   */
  isTypeAnnotationChange(position: monaco.Position, oldText: string, newText: string): boolean {
    const line = this.model.getLineContent(position.lineNumber);
    
    // 检查是否包含类型注解模式
    const hasTypeAnnotation = /:\s*(string|number|boolean|any|void|object|Array|Promise|[A-Z]\w*)/.test(line);
    
    if (!hasTypeAnnotation) return false;

    // 检查变化是否涉及类型关键字
    const typeKeywords = ['string', 'number', 'boolean', 'any', 'void', 'object', 'Array', 'Promise'];
    const oldHasType = typeKeywords.some(kw => oldText.includes(kw));
    const newHasType = typeKeywords.some(kw => newText.includes(kw));

    return oldHasType || newHasType;
  }

  /**
   * 获取函数定义的完整信息
   */
  async getFunctionInfo(position: monaco.Position): Promise<{
    name: string;
    parameters: string[];
    returnType?: string;
    range: monaco.Range;
  } | null> {
    try {
      const worker = await this.getWorker();
      const offset = this.model.getOffsetAt(position);
      const fileName = this.model.uri.toString();

      const quickInfo = await worker.getQuickInfoAtPosition(fileName, offset);

      if (!quickInfo) return null;

      // 解析函数签名
      const displayParts = quickInfo.displayParts || [];
      const signature = displayParts.map((p: any) => p.text).join('');
      
      // 提取函数名
      const nameMatch = signature.match(/function\s+(\w+)|(\w+)\s*\(/);
      const name = nameMatch?.[1] || nameMatch?.[2] || '';

      // 提取参数
      const paramsMatch = signature.match(/\(([^)]*)\)/);
      const parameters = paramsMatch?.[1]
        ? paramsMatch[1].split(',').map((p: string) => p.trim()).filter(Boolean)
        : [];

      const startPos = this.model.getPositionAt(quickInfo.textSpan.start);
      const endPos = this.model.getPositionAt(
        quickInfo.textSpan.start + quickInfo.textSpan.length
      );

      return {
        name,
        parameters,
        range: new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column
        ),
      };
    } catch (error) {
      console.warn('[SemanticAnalyzer] Failed to get function info:', error);
      return null;
    }
  }

  /**
   * 获取语义诊断信息
   */
  async getSemanticDiagnostics(): Promise<monaco.editor.IMarkerData[]> {
    try {
      const worker = await this.getWorker();
      const fileName = this.model.uri.toString();

      const diagnostics = await worker.getSemanticDiagnostics(fileName);

      return diagnostics.map((diag: any) => ({
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: this.model.getPositionAt(diag.start || 0).lineNumber,
        startColumn: this.model.getPositionAt(diag.start || 0).column,
        endLineNumber: this.model.getPositionAt((diag.start || 0) + (diag.length || 0)).lineNumber,
        endColumn: this.model.getPositionAt((diag.start || 0) + (diag.length || 0)).column,
        message: diag.messageText?.toString() || 'Unknown error',
      }));
    } catch (error) {
      console.warn('[SemanticAnalyzer] Failed to get diagnostics:', error);
      return [];
    }
  }

  /**
   * 推断符号类型
   */
  private inferSymbolKind(kind: string): SymbolInfo['kind'] {
    const kindLower = kind.toLowerCase();
    
    if (kindLower.includes('function') || kindLower.includes('method')) {
      return 'function';
    }
    if (kindLower.includes('variable') || kindLower.includes('const') || kindLower.includes('let')) {
      return 'variable';
    }
    if (kindLower.includes('parameter')) {
      return 'parameter';
    }
    if (kindLower.includes('property')) {
      return 'property';
    }
    if (kindLower.includes('class')) {
      return 'class';
    }
    if (kindLower.includes('interface')) {
      return 'interface';
    }
    
    return 'unknown';
  }

  /**
   * 获取 Token 类型名称
   */
  private getTokenTypeName(tokenType: number): string {
    // Monaco StandardTokenType enum
    const types = ['Other', 'Comment', 'String', 'RegEx'];
    return types[tokenType] || 'Other';
  }
}
