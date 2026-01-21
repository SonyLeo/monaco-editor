/**
 * 编辑历史管理器
 * 负责记录、合并和管理用户的编辑历史
 */

import type * as monaco from 'monaco-editor';
import type { EditRecord } from '../../types/nes';

export class EditHistoryManager {
  private editHistory: EditRecord[] = [];
  private pendingEdit: EditRecord | null = null;
  private editMergeTimer: number | null = null;
  private readonly MAX_HISTORY_SIZE = 10; // 保留最近 10 次编辑
  private lastSnapshot = '';

  constructor(initialSnapshot: string) {
    this.lastSnapshot = initialSnapshot;
  }

  
  /**
   * 记录编辑（带自动合并逻辑）
   */
  recordEdit(
    change: monaco.editor.IModelContentChange,
    model: monaco.editor.ITextModel
  ): void {
    const editType = this.detectEditType(change);
    const oldText = this.getOldText(change, this.lastSnapshot);
    const newText = change.text;
    const lineContent = model.getLineContent(change.range.startLineNumber);

    // 分析语义上下文
    const context = this.analyzeEditContext(change, lineContent, oldText, newText);

    const currentEdit: EditRecord = {
      timestamp: Date.now(),
      lineNumber: change.range.startLineNumber,
      column: change.range.startColumn,
      type: editType,
      oldText,
      newText,
      rangeLength: change.rangeLength,
      context
    };

    // 合并逻辑：如果是连续的小编辑（如逐字符输入），合并为一个编辑
    if (this.shouldMergeEdit(currentEdit)) {
      this.mergePendingEdit(currentEdit);
    } else {
      // 提交之前的待合并编辑
      this.flushPendingEdit();
      // 开始新的待合并编辑
      this.pendingEdit = currentEdit;

      // 设置合并计时器（500ms 内的连续编辑会被合并）
      if (this.editMergeTimer) {
        clearTimeout(this.editMergeTimer);
      }
      this.editMergeTimer = window.setTimeout(() => {
        this.flushPendingEdit();
      }, 500);
    }
  }

  /**
   * 更新快照
   */
  updateSnapshot(snapshot: string): void {
    this.lastSnapshot = snapshot;
  }

  /**
   * 获取最近的编辑历史
   */
  getRecentEdits(count: number = 5): EditRecord[] {
    // 确保提交待合并的编辑
    this.flushPendingEdit();
    return this.editHistory.slice(-count);
  }

  /**
   * 清空历史
   */
  clear(): void {
    this.editHistory = [];
    this.pendingEdit = null;
    if (this.editMergeTimer) {
      clearTimeout(this.editMergeTimer);
      this.editMergeTimer = null;
    }
  }

  /**
   * 判断是否应该合并编辑
   */
  private shouldMergeEdit(currentEdit: EditRecord): boolean {
    if (!this.pendingEdit) return false;

    const timeDiff = currentEdit.timestamp - this.pendingEdit.timestamp;
    const isSameLine = currentEdit.lineNumber === this.pendingEdit.lineNumber;
    const isConsecutive = Math.abs(currentEdit.column - (this.pendingEdit.column + this.pendingEdit.newText.length)) <= 1;
    const isSameType = currentEdit.type === this.pendingEdit.type;
    const isSmallEdit = currentEdit.newText.length <= 3 && this.pendingEdit.newText.length <= 10;

    // 合并条件：同一行、连续位置、相同类型、小编辑、时间间隔 < 500ms
    return isSameLine && isConsecutive && isSameType && isSmallEdit && timeDiff < 500;
  }

  /**
   * 合并待处理的编辑
   */
  private mergePendingEdit(currentEdit: EditRecord): void {
    if (!this.pendingEdit) return;

    // 合并文本
    if (currentEdit.type === 'insert') {
      this.pendingEdit.newText += currentEdit.newText;
    } else if (currentEdit.type === 'delete') {
      this.pendingEdit.oldText += currentEdit.oldText;
    } else {
      this.pendingEdit.newText += currentEdit.newText;
      this.pendingEdit.oldText += currentEdit.oldText;
    }

    // 更新时间戳和上下文
    this.pendingEdit.timestamp = currentEdit.timestamp;
    this.pendingEdit.context = currentEdit.context;
  }

  /**
   * 提交待处理的编辑到历史
   */
  private flushPendingEdit(): void {
    if (!this.pendingEdit) return;

    this.editHistory.push(this.pendingEdit);
    this.pendingEdit = null;

    // 保留最近 N 次编辑
    if (this.editHistory.length > this.MAX_HISTORY_SIZE) {
      this.editHistory = this.editHistory.slice(-this.MAX_HISTORY_SIZE);
    }
  }

  /**
   * 分析编辑的语义上下文
   */
  private analyzeEditContext(
    change: monaco.editor.IModelContentChange,
    lineContent: string,
    _oldText: string,
    newText: string
  ): EditRecord['context'] {
    const column = change.range.startColumn - 1;

    // 检测是否在字符串中
    const beforeCursor = lineContent.substring(0, column);
    const inString = (beforeCursor.match(/"/g) || []).length % 2 === 1 ||
                     (beforeCursor.match(/'/g) || []).length % 2 === 1;

    // 检测是否在注释中
    const inComment = beforeCursor.includes('//') || beforeCursor.includes('/*');

    // 检测语义类型
    let semanticType: 'functionName' | 'variableName' | 'parameter' | 'functionCall' | 'other' = 'other';

    // 函数定义：function xxx( 或 const xxx = (
    if (/function\s+\w*$/.test(beforeCursor) || /const\s+\w+\s*=\s*\(?$/.test(beforeCursor)) {
      semanticType = 'functionName';
    }
    // 函数调用：xxx(
    else if (/\w+\s*\($/.test(lineContent.substring(0, column + newText.length))) {
      semanticType = 'functionCall';
    }
    // 变量声明：const/let/var xxx
    else if (/(const|let|var)\s+\w*$/.test(beforeCursor)) {
      semanticType = 'variableName';
    }
    // 参数：在括号内
    else if (beforeCursor.includes('(') && !beforeCursor.includes(')')) {
      semanticType = 'parameter';
    }

    return {
      lineContent,
      tokenType: inString ? 'string' : inComment ? 'comment' : 'identifier',
      semanticType
    };
  }

  /**
   * 检测编辑类型
   */
  private detectEditType(change: monaco.editor.IModelContentChange): 'insert' | 'delete' | 'replace' {
    const hasOldContent = change.rangeLength > 0;
    const hasNewContent = change.text.length > 0;

    if (hasOldContent && hasNewContent) return 'replace';
    if (hasNewContent) return 'insert';
    return 'delete';
  }

  /**
   * 获取被替换的旧文本
   */
  private getOldText(change: monaco.editor.IModelContentChange, snapshot: string): string {
    if (change.rangeLength === 0) return '';

    const lines = snapshot.split('\n');
    const startLine = change.range.startLineNumber - 1;
    const endLine = change.range.endLineNumber - 1;
    const startCol = change.range.startColumn - 1;
    const endCol = change.range.endColumn - 1;

    if (startLine === endLine) {
      return lines[startLine]?.substring(startCol, endCol) || '';
    }

    // 多行变更
    const result: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      if (i === startLine) {
        result.push(lines[i]?.substring(startCol) || '');
      } else if (i === endLine) {
        result.push(lines[i]?.substring(0, endCol) || '');
      } else {
        result.push(lines[i] || '');
      }
    }
    return result.join('\n');
  }

  /**
   * 销毁资源
   */
  dispose(): void {
    if (this.editMergeTimer) {
      clearTimeout(this.editMergeTimer);
      this.editMergeTimer = null;
    }
    this.clear();
  }
}
