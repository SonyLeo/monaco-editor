/**
 * Diff 计算引擎
 * 负责计算代码变更并识别变更类型
 */

import diff from 'fast-diff';
import type { DiffInfo, DiffChange, ChangeAnalysis } from '../../types/diff';

export class DiffEngine {
  /**
   * 计算两段代码的 Diff
   */
  calculateDiff(oldCode: string, newCode: string): DiffInfo | null {
    // 空字符串处理
    if (!oldCode && !newCode) {
      return null;
    }

    // 计算 diff
    const diffs = diff(oldCode, newCode);
    
    // 转换为 DiffChange 格式
    const changes: DiffChange[] = diffs.map(([type, text]: [number, string]) => ({
      type: type as 1 | -1 | 0,
      text
    }));

    // 分析变更类型
    const analysis = this.analyzeChanges(oldCode, newCode, changes);
    
    // 如果只是空白变更，返回 null
    if (analysis.isWhitespaceOnly) {
      return null;
    }

    // 计算变更的行号
    const lines = this.getChangedLines(oldCode, newCode, changes);

    // 确定变更类型
    const type = this.detectChangeType(oldCode, newCode, analysis);

    // 生成人类可读的 summary
    const summary = this.generateSummary(oldCode, newCode, analysis, type, lines);

    return {
      type,
      lines,
      changes,
      summary,
      rawDiff: JSON.stringify(diffs)
    };
  }

  /**
   * 生成人类可读的变更摘要（增强版：更详细的语义描述）
   */
  private generateSummary(
    oldCode: string,
    newCode: string,
    analysis: ChangeAnalysis,
    type: DiffInfo['type'],
    lines: number[]
  ): string {
    // 函数重命名
    if (analysis.isFunctionRename) {
      const oldMatch = oldCode.match(/function\s+(\w+)/);
      const newMatch = newCode.match(/function\s+(\w+)/);
      if (oldMatch && newMatch && oldMatch[1] !== newMatch[1]) {
        return `Renamed function '${oldMatch[1]}' to '${newMatch[1]}'`;
      }
    }

    // 变量重命名
    if (analysis.isVariableRename) {
      const oldMatch = oldCode.match(/(const|let|var)\s+(\w+)/);
      const newMatch = newCode.match(/(const|let|var)\s+(\w+)/);
      if (oldMatch && newMatch && oldMatch[2] !== newMatch[2]) {
        return `Renamed variable '${oldMatch[2]}' to '${newMatch[2]}'`;
      }
    }

    // 参数变更
    if (analysis.isParameterChange) {
      const oldParams = oldCode.match(/\(([^)]*)\)/)?.[1] || '';
      const newParams = newCode.match(/\(([^)]*)\)/)?.[1] || '';
      if (oldParams !== newParams) {
        const funcName = newCode.match(/function\s+(\w+)/)?.[1] || 
                        newCode.match(/(\w+)\s*\(/)?.[1] || 'function';
        return `Changed parameters of '${funcName}': (${oldParams}) → (${newParams})`;
      }
    }

    // 🆕 检测标识符变更（更通用的重命名检测）
    if (analysis.changedIdentifiers.length > 0) {
      const oldIdentifiers = this.extractIdentifiers(oldCode);
      const newIdentifiers = this.extractIdentifiers(newCode);
      
      // 找出被替换的标识符
      const removed = oldIdentifiers.filter(id => !newIdentifiers.includes(id));
      const added = newIdentifiers.filter(id => !oldIdentifiers.includes(id));
      
      if (removed.length === 1 && added.length === 1) {
        return `Renamed '${removed[0]}' to '${added[0]}'`;
      }
    }

    // 通用变更 - 显示具体的行变化
    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');
    
    if (lines.length > 0 && lines[0] !== undefined && lines[0] <= oldLines.length) {
      const lineNum = lines[0];
      const oldLine = oldLines[lineNum - 1]?.trim() || '';
      const newLine = newLines[lineNum - 1]?.trim() || '';
      
      if (oldLine && newLine && oldLine !== newLine) {
        // 截断过长的行
        const maxLen = 60;
        const truncate = (s: string) => s.length > maxLen ? s.substring(0, maxLen) + '...' : s;
        return `Line ${lineNum}: "${truncate(oldLine)}" → "${truncate(newLine)}"`;
      }
    }

    // 默认摘要（更详细）
    if (type === 'INSERT') {
      return `Inserted ${newCode.length} characters at line ${lines[0] || '?'}`;
    }
    if (type === 'DELETE') {
      return `Deleted ${oldCode.length} characters from line ${lines[0] || '?'}`;
    }
    
    return `Modified ${lines.length} line(s) - ${analysis.changedIdentifiers.length} identifier(s) changed`;
  }

  /**
   * 提取代码中的标识符
   */
  private extractIdentifiers(code: string): string[] {
    const identifierRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;
    const matches = code.match(identifierRegex) || [];
    // 过滤掉关键字
    const keywords = new Set(['function', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'class', 'interface', 'type', 'import', 'export', 'from', 'as', 'new', 'this', 'super', 'extends', 'implements']);
    return [...new Set(matches.filter(id => !keywords.has(id)))];
  }

  /**
   * 检测变更类型
   */
  private detectChangeType(
    oldCode: string,
    newCode: string,
    analysis: ChangeAnalysis
  ): DiffInfo['type'] {
    if (!oldCode) return 'INSERT';
    if (!newCode) return 'DELETE';
    if (analysis.isWhitespaceOnly) return 'WHITESPACE_ONLY';
    
    // 如果有标识符变更（重命名、参数变更等），说明是替换操作
    if (analysis.changedIdentifiers.length > 0) {
      return 'REPLACE';
    }
    
    // 检查是否有实质性变更
    const hasInsert = newCode.length > oldCode.length;
    const hasDelete = newCode.length < oldCode.length;
    
    if (hasInsert && hasDelete) return 'REPLACE';
    if (hasInsert) return 'INSERT';
    if (hasDelete) return 'DELETE';
    
    return 'REPLACE';
  }

  /**
   * 分析变更内容
   */
  private analyzeChanges(
    oldCode: string,
    _newCode: string,
    changes: DiffChange[]
  ): ChangeAnalysis {
    // 检查是否只有空白变更
    // 只要有任何非空白字符的变更，就不是纯空白变更
    const hasNonWhitespaceChange = changes.some(
      c => c.type !== 0 && /\S/.test(c.text)
    );
    const isWhitespaceOnly = !hasNonWhitespaceChange;

    // 提取变更的标识符
    const changedIdentifiers: string[] = [];
    const identifierRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;
    
    changes.forEach(change => {
      if (change.type !== 0) {
        const matches = change.text.match(identifierRegex);
        if (matches) {
          changedIdentifiers.push(...matches);
        }
      }
    });

    // 检测函数重命名
    const isFunctionRename = /function\s+\w+/.test(oldCode) && 
                            /function\s+\w+/.test(_newCode) &&
                            changedIdentifiers.length > 0;

    // 检测变量重命名
    const isVariableRename = /(const|let|var)\s+\w+/.test(oldCode) &&
                            /(const|let|var)\s+\w+/.test(_newCode) &&
                            changedIdentifiers.length > 0;

    // 检测参数变更
    const isParameterChange = /\([^)]*\)/.test(oldCode) &&
                             /\([^)]*\)/.test(_newCode);

    return {
      isWhitespaceOnly,
      isFunctionRename,
      isVariableRename,
      isParameterChange,
      changedIdentifiers: [...new Set(changedIdentifiers)]
    };
  }

  /**
   * 获取变更的行号
   */
  private getChangedLines(
    oldCode: string,
    _newCode: string,
    changes: DiffChange[]
  ): number[] {
    const lines = new Set<number>();
    let position = 0;

    changes.forEach(change => {
      if (change.type !== 0) {
        // 计算当前变更所在的行号
        const textBeforeChange = oldCode.substring(0, position);
        const currentLine = (textBeforeChange.match(/\n/g) || []).length + 1;
        lines.add(currentLine);
      }
      
      if (change.type !== 1) {
        position += change.text.length;
      }
    });

    return Array.from(lines).sort((a, b) => a - b);
  }
}
