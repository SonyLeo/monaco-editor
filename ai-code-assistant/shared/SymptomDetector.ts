/**
 * Symptom Detector - 症状检测器（数据准备器）
 * 只负责准备数据，真正的检测由后端 API 完成
 */

import type { EditRecord, NESPayload } from '../types/index';
import type * as monaco from 'monaco-editor';

export class SymptomDetector {
  private model: monaco.editor.ITextModel | null = null;

  setModel(model: monaco.editor.ITextModel): void {
    this.model = model;
  }

  /**
   * 准备 NES API 的 payload
   * 不做症状检测，只收集数据
   */
  preparePayload(
    editHistory: EditRecord[],
    affectedLine?: number
  ): NESPayload | null {
    if (!this.model || editHistory.length === 0) {
      return null;
    }

    // 只使用用户编辑，过滤掉 NES 自动应用的编辑
    const userEdits = editHistory.filter(e => e.source !== 'nes');
    
    if (userEdits.length === 0) {
      console.log('[SymptomDetector] No user edits, skipping payload');
      return null;
    }

    const latestEdit = userEdits[userEdits.length - 1];
    const targetLine = affectedLine || latestEdit.lineNumber;

    // 获取代码窗口（目标行前后各 15 行）
    const codeWindow = this.getCodeWindow(targetLine, 15);
    const totalLines = this.model.getLineCount();

    // 生成 diff 摘要（基于用户编辑）
    const diffSummary = this.generateDiffSummary(userEdits);

    return {
      codeWindow,
      windowInfo: {
        startLine: Math.max(1, targetLine - 15),
        totalLines,
      },
      diffSummary,
      editHistory: userEdits.slice(-5), // 只发送最近 5 条用户编辑
      requestId: Date.now(),
    };
  }

  /**
   * 获取代码窗口
   */
  private getCodeWindow(centerLine: number, radius: number): string {
    if (!this.model) return '';

    const totalLines = this.model.getLineCount();
    const startLine = Math.max(1, centerLine - radius);
    const endLine = Math.min(totalLines, centerLine + radius);

    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      lines.push(this.model.getLineContent(i));
    }

    return lines.join('\n');
  }

  /**
   * 生成 diff 摘要（增强版 - 分析编辑模式）
   */
  private generateDiffSummary(editHistory: EditRecord[]): string {
    if (editHistory.length === 0) return 'No recent edits';

    const latestEdit = editHistory[editHistory.length - 1];
    const line = latestEdit.context?.lineContent || '';

    // 分析编辑模式
    const pattern = this.analyzeEditPattern(editHistory);
    if (pattern) {
      return pattern;
    }

    // 回退到简单描述
    if (latestEdit.type === 'insert') {
      return `Inserted "${latestEdit.newText}" at line ${latestEdit.lineNumber}`;
    } else if (latestEdit.type === 'delete') {
      return `Deleted "${latestEdit.oldText}" at line ${latestEdit.lineNumber}`;
    } else if (latestEdit.type === 'replace') {
      return `Replaced "${latestEdit.oldText}" with "${latestEdit.newText}" at line ${latestEdit.lineNumber}`;
    }

    return `Modified line ${latestEdit.lineNumber}: ${line}`;
  }

  /**
   * 分析编辑模式
   */
  private analyzeEditPattern(editHistory: EditRecord[]): string | null {
    if (editHistory.length < 2) return null;

    const latestEdit = editHistory[editHistory.length - 1];
    const line = latestEdit.context?.lineContent || '';

    // 检测函数参数添加
    if (this.isFunctionLine(line)) {
      // 检查是否在括号内编辑
      const hasParentheses = line.includes('(') && line.includes(')');
      if (hasParentheses) {
        // 提取括号内的内容
        const match = line.match(/\(([^)]*)\)/);
        if (match) {
          const params = match[1].trim();
          
          // 检查最近的编辑是否都在同一行
          const sameLine = editHistory.every(e => e.lineNumber === latestEdit.lineNumber);
          
          if (sameLine && params.length > 0) {
            // 检查是否有逗号（多个参数）
            const paramCount = params.split(',').length;
            
            // 检查编辑历史中是否有插入逗号
            const hasCommaInsert = editHistory.some(e => 
              e.type === 'insert' && e.newText.includes(',')
            );
            
            if (hasCommaInsert) {
              return `Added parameter to function (now has ${paramCount} parameters)`;
            }
            
            // 检查是否是首次添加参数
            const hasEmptyParens = editHistory.some(e => 
              e.context?.lineContent?.includes('()')
            );
            
            if (hasEmptyParens && params.length > 0) {
              return `Added first parameter '${params}' to function`;
            }
            
            // 连续字符插入可能是在输入参数名
            const allInserts = editHistory.every(e => e.type === 'insert');
            if (allInserts && params.length > 0) {
              return `Typing parameter name '${params}' in function signature`;
            }
          }
        }
      }
    }

    // 检测函数重命名
    if (this.isFunctionLine(line)) {
      const hasLargeReplace = editHistory.some(e => 
        e.type === 'replace' && e.rangeLength >= 3
      );
      
      if (hasLargeReplace) {
        const funcName = this.extractFunctionName(line);
        return `Renamed function to '${funcName}'`;
      }
      
      // 连续编辑可能是在重命名
      const sameLine = editHistory.every(e => e.lineNumber === latestEdit.lineNumber);
      const hasDelete = editHistory.some(e => e.rangeLength > 3);
      
      if (sameLine && hasDelete) {
        const funcName = this.extractFunctionName(line);
        return `Renaming function to '${funcName}' (in progress)`;
      }
    }

    // 检测变量重命名
    if (this.isVariableLine(line)) {
      const hasLargeReplace = editHistory.some(e => 
        e.type === 'replace' && e.rangeLength >= 3
      );
      
      if (hasLargeReplace) {
        const varName = this.extractVariableName(line);
        return `Renamed variable to '${varName}'`;
      }
    }

    return null;
  }

  /**
   * 检查是否是函数定义行
   */
  private isFunctionLine(line: string): boolean {
    return /function\s+\w+/.test(line) || 
           /const\s+\w+\s*=\s*\(/.test(line) ||
           /\w+\s*\([^)]*\)\s*{/.test(line);
  }

  /**
   * 检查是否是变量声明行
   */
  private isVariableLine(line: string): boolean {
    return /(?:const|let|var)\s+\w+/.test(line);
  }

  /**
   * 提取函数名
   */
  private extractFunctionName(line: string): string {
    const match = line.match(/function\s+(\w+)/) || 
                  line.match(/const\s+(\w+)\s*=/) ||
                  line.match(/(\w+)\s*\(/);
    return match?.[1] || 'unknown';
  }

  /**
   * 提取变量名
   */
  private extractVariableName(line: string): string {
    const match = line.match(/(?:const|let|var)\s+(\w+)/);
    return match?.[1] || 'unknown';
  }
}
