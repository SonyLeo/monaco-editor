/**
 * CodeParser
 * 通用的代码解析工具
 * 提供常用的代码模式识别和提取功能
 */

export class CodeParser {
  /**
   * 提取函数名
   * 支持多种函数定义格式
   */
  static extractFunctionName(line: string): string | undefined {
    // 格式 1: function foo() {}
    const functionMatch = line.match(/function\s+(\w+)/);
    if (functionMatch) return functionMatch[1];

    // 格式 2: const foo = () => {}
    const constMatch = line.match(/const\s+(\w+)\s*=/);
    if (constMatch) return constMatch[1];

    // 格式 3: foo() {} 或 foo: () => {}
    const nameMatch = line.match(/(\w+)\s*[:(]/);
    if (nameMatch) return nameMatch[1];

    return undefined;
  }

  /**
   * 提取类型注解
   * 支持 TypeScript 类型
   */
  static extractType(text: string): string | null {
    const match = text.match(/:\s*(string|number|boolean|any|void|object|Array|Promise|null|undefined)/);
    return match?.[1] || null;
  }

  /**
   * 检查是否是函数定义行
   */
  static isFunctionDefinition(line: string): boolean {
    return /function\s+\w+\s*\(/.test(line) || 
           /\w+\s*\([^)]*\)\s*[:{]/.test(line) ||
           /\w+\s*:\s*\([^)]*\)\s*=>/.test(line) ||
           /const\s+\w+\s*=\s*\([^)]*\)\s*=>/.test(line);
  }

  /**
   * 检查是否包含类型注解
   */
  static hasTypeAnnotation(line: string): boolean {
    return /:\s*(string|number|boolean|any|void|object|Array|Promise)/.test(line);
  }

  /**
   * 提取变量名
   */
  static extractVariableName(line: string): string | undefined {
    // 格式 1: const foo = ...
    const constMatch = line.match(/(?:const|let|var)\s+(\w+)/);
    if (constMatch) return constMatch[1];

    // 格式 2: foo = ...
    const assignMatch = line.match(/(\w+)\s*=/);
    if (assignMatch) return assignMatch[1];

    return undefined;
  }

  /**
   * 检查是否是三元运算符
   */
  static isTernaryOperator(line: string): boolean {
    return /\?\s*[^:]+\s*:/.test(line);
  }

  /**
   * 提取三元运算符的各部分
   */
  static parseTernaryOperator(line: string): {
    condition: string;
    trueValue: string;
    falseValue: string;
  } | null {
    const match = line.match(/(.+?)\s*\?\s*(.+?)\s*:\s*(.+)/);
    if (!match) return null;

    return {
      condition: match[1]?.trim() || '',
      trueValue: match[2]?.trim() || '',
      falseValue: match[3]?.trim() || ''
    };
  }

  /**
   * 检查是否包含括号（函数调用或定义）
   */
  static hasParentheses(line: string): boolean {
    return /\([^)]*\)/.test(line);
  }

  /**
   * 提取括号内的内容
   */
  static extractParenthesesContent(line: string): string | null {
    const match = line.match(/\(([^)]*)\)/);
    return match?.[1] || null;
  }

  /**
   * 检查是否是关键字拼写错误
   */
  static hasKeywordTypo(line: string): { wrong: string; correct: string } | null {
    const typos = [
      { wrong: 'funct ion', correct: 'function' },
      { wrong: 'retur n', correct: 'return' },
      { wrong: 'cons t', correct: 'const' },
      { wrong: 'le t', correct: 'let' },
      { wrong: 'va r', correct: 'var' },
      { wrong: 'clas s', correct: 'class' },
      { wrong: 'impor t', correct: 'import' },
      { wrong: 'expor t', correct: 'export' },
    ];

    for (const typo of typos) {
      if (line.includes(typo.wrong)) {
        return typo;
      }
    }

    return null;
  }

  /**
   * 计算参数数量
   */
  static countParameters(paramsString: string): number {
    if (!paramsString.trim()) return 0;
    return paramsString.split(',').length;
  }

  /**
   * 检查是否是导入语句
   */
  static isImportStatement(line: string): boolean {
    return /^import\s+/.test(line.trim());
  }

  /**
   * 检查是否是导出语句
   */
  static isExportStatement(line: string): boolean {
    return /^export\s+/.test(line.trim());
  }
}
