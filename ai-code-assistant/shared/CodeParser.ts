/**
 * Code Parser - 代码解析工具
 */

export class CodeParser {
  /**
   * 检查是否是函数定义
   */
  static isFunctionDefinition(line: string): boolean {
    return /^\s*(?:async\s+)?function\s+\w+\s*\(/.test(line) ||
           /^\s*(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/.test(line) ||
           /^\s*(?:async\s+)?\w+\s*\([^)]*\)\s*[:{]/.test(line);
  }

  /**
   * 提取函数名
   */
  static extractFunctionName(line: string): string | null {
    const match = line.match(/function\s+(\w+)/) ||
                  line.match(/(?:const|let|var)\s+(\w+)\s*=/) ||
                  line.match(/(\w+)\s*\(/);
    return match ? match[1] : null;
  }

  /**
   * 提取类型
   */
  static extractType(text: string): string | null {
    const match = text.match(/:\s*([\w<>[\],\s|&]+)/);
    return match ? match[1].trim() : null;
  }

  /**
   * 检查关键字拼写错误
   */
  static hasKeywordTypo(line: string): { wrong: string; correct: string } | null {
    const typos: Record<string, string> = {
      'functoin': 'function',
      'retrun': 'return',
      'consle': 'console',
      'lenght': 'length',
      'conts': 'const',
      'vra': 'var',
      'let ': 'let',
    };

    for (const [wrong, correct] of Object.entries(typos)) {
      if (line.includes(wrong)) {
        return { wrong, correct };
      }
    }

    return null;
  }

  /**
   * 提取标识符
   */
  static extractIdentifiers(code: string): string[] {
    const identifierRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;
    const matches = code.match(identifierRegex) || [];
    const keywords = new Set([
      'function', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
      'return', 'class', 'interface', 'type', 'import', 'export', 'from',
      'as', 'new', 'this', 'super', 'extends', 'implements', 'async', 'await'
    ]);
    return [...new Set(matches.filter(id => !keywords.has(id)))];
  }
}
