/**
 * Edit History Manager - 编辑历史管理（增强版）
 */

import type * as monaco from 'monaco-editor';
import type { EditRecord } from '../types/index';

export class EditHistoryManager {
  private editHistory: EditRecord[] = [];
  private readonly MAX_HISTORY_SIZE = 10;
  private lastSnapshot: string;

  constructor(initialSnapshot: string) {
    this.lastSnapshot = initialSnapshot;
  }

  recordEdit(
    change: monaco.editor.IModelContentChange,
    model: monaco.editor.ITextModel,
    source: 'user' | 'nes' = 'user'
  ): void {
    const editType = this.detectEditType(change);
    
    // 提取被替换的旧文本（从快照中获取 - 必须在更新快照之前）
    let oldText = '';
    if (change.rangeLength > 0) {
      oldText = this.getOldTextFromSnapshot(change);
    }

    const edit: EditRecord = {
      timestamp: Date.now(),
      lineNumber: change.range.startLineNumber,
      column: change.range.startColumn,
      type: editType,
      oldText,
      newText: change.text,
      rangeLength: change.rangeLength,
      source, // 记录编辑来源
      context: {
        lineContent: '', // 临时占位
      },
    };

    // 更新快照（必须在提取 oldText 之后，获取新 lineContent 之前）
    this.lastSnapshot = model.getValue();
    
    // 获取更新后的行内容
    if (edit.context) {
      edit.context.lineContent = model.getLineContent(change.range.startLineNumber);
    }

    this.editHistory.push(edit);

    if (this.editHistory.length > this.MAX_HISTORY_SIZE) {
      this.editHistory = this.editHistory.slice(-this.MAX_HISTORY_SIZE);
    }

    console.log('[EditHistoryManager] Recorded edit:', edit);
  }

  /**
   * 从快照中提取被替换的旧文本
   */
  private getOldTextFromSnapshot(change: monaco.editor.IModelContentChange): string {
    try {
      const lines = this.lastSnapshot.split('\n');
      const startLine = change.range.startLineNumber - 1;
      const endLine = change.range.endLineNumber - 1;
      const startCol = change.range.startColumn - 1;
      const endCol = change.range.endColumn - 1;

      if (startLine === endLine) {
        // 单行变更
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
    } catch (error) {
      console.error('[EditHistoryManager] Failed to extract old text:', error);
      return '';
    }
  }

  getRecentEdits(count: number = 5): EditRecord[] {
    return this.editHistory.slice(-count);
  }

  getLastSnapshot(): string {
    return this.lastSnapshot;
  }

  clear(): void {
    this.editHistory = [];
  }

  private detectEditType(
    change: monaco.editor.IModelContentChange
  ): 'insert' | 'delete' | 'replace' {
    const hasOldContent = change.rangeLength > 0;
    const hasNewContent = change.text.length > 0;

    if (hasOldContent && hasNewContent) return 'replace';
    if (hasNewContent) return 'insert';
    return 'delete';
  }
}
