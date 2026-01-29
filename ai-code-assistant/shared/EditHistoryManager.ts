/**
 * Edit History Manager - 编辑历史管理（增强版 + 智能合并）
 */

import type * as monaco from 'monaco-editor';
import type { EditRecord } from '../types/index';

export class EditHistoryManager {
  private editHistory: EditRecord[] = [];
  private readonly MAX_HISTORY_SIZE = 10;
  private lastSnapshot: string;
  
  // 合并配置
  private readonly MERGE_TIME_WINDOW_MS = 1.5 * 1000; // 1500ms 内的编辑可以合并
  private readonly MERGE_DISTANCE_THRESHOLD = 2; // 位置相差不超过 2 个字符

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

    // ✅ 尝试合并编辑
    const merged = this.tryMergeEdit(edit);
    if (!merged) {
      // 无法合并，添加新记录
      this.editHistory.push(edit);
    }

    if (this.editHistory.length > this.MAX_HISTORY_SIZE) {
      this.editHistory = this.editHistory.slice(-this.MAX_HISTORY_SIZE);
    }

    console.log('[EditHistoryManager] Recorded edit:', edit, merged ? '(merged)' : '(new)');
  }

  /**
   * 尝试将新编辑合并到最后一条记录
   * @returns true 如果成功合并，false 如果无法合并
   */
  private tryMergeEdit(newEdit: EditRecord): boolean {
    if (this.editHistory.length === 0) {
      return false;
    }

    const lastEdit = this.editHistory[this.editHistory.length - 1];
    
    // 检查是否可以合并
    if (!this.canMerge(lastEdit, newEdit)) {
      return false;
    }

    // 执行合并
    this.mergeEdits(lastEdit, newEdit);
    return true;
  }

  /**
   * 判断两个编辑是否可以合并
   */
  private canMerge(lastEdit: EditRecord, newEdit: EditRecord): boolean {
    // 1. 必须是用户编辑（不合并 NES 编辑）
    if (lastEdit.source !== 'user' || newEdit.source !== 'user') {
      return false;
    }

    // 2. 时间窗口检查
    const timeDiff = newEdit.timestamp - lastEdit.timestamp;
    if (timeDiff > this.MERGE_TIME_WINDOW_MS) {
      return false;
    }

    // 3. 必须在同一行
    if (lastEdit.lineNumber !== newEdit.lineNumber) {
      return false;
    }

    // 4. 位置接近检查
    const positionDiff = Math.abs(lastEdit.column - newEdit.column);
    if (positionDiff > this.MERGE_DISTANCE_THRESHOLD) {
      return false;
    }

    // 5. 编辑类型兼容性检查
    // 可以合并的情况：
    // - insert + insert（连续输入）
    // - delete + delete（连续删除）
    // - insert + delete（输入后立即删除，如试错）
    // - delete + insert（删除后立即输入，如替换）
    const compatibleTypes = [
      ['insert', 'insert'],
      ['delete', 'delete'],
      ['insert', 'delete'],
      ['delete', 'insert'],
    ];

    const typeMatch = compatibleTypes.some(
      ([t1, t2]) => lastEdit.type === t1 && newEdit.type === t2
    );

    if (!typeMatch) {
      return false;
    }

    // 6. 单字符编辑检查（只合并微小编辑）
    const isSmallEdit = 
      (newEdit.newText.length <= 1 || newEdit.oldText.length <= 1) &&
      (lastEdit.newText.length <= 1 || lastEdit.oldText.length <= 1);

    if (!isSmallEdit) {
      return false;
    }

    return true;
  }

  /**
   * 合并两个编辑记录
   */
  private mergeEdits(lastEdit: EditRecord, newEdit: EditRecord): void {
    // 更新时间戳为最新
    lastEdit.timestamp = newEdit.timestamp;

    // 更新行内容为最新
    if (lastEdit.context && newEdit.context) {
      lastEdit.context.lineContent = newEdit.context.lineContent;
    }

    // 根据编辑类型合并内容
    if (lastEdit.type === 'insert' && newEdit.type === 'insert') {
      // 连续插入：累加新文本
      lastEdit.newText += newEdit.newText;
    } else if (lastEdit.type === 'delete' && newEdit.type === 'delete') {
      // 连续删除：累加旧文本
      lastEdit.oldText += newEdit.oldText;
      lastEdit.rangeLength += newEdit.rangeLength;
    } else if (lastEdit.type === 'insert' && newEdit.type === 'delete') {
      // 插入后删除（试错）：
      // 如果删除的是刚插入的内容，则抵消
      if (lastEdit.newText.endsWith(newEdit.oldText)) {
        lastEdit.newText = lastEdit.newText.slice(0, -newEdit.oldText.length);
        // 如果完全抵消，标记为无效编辑
        if (lastEdit.newText === '' && lastEdit.oldText === '') {
          lastEdit.type = 'delete'; // 标记为删除，后续可以过滤
        }
      } else {
        // 不完全匹配，转换为 replace
        lastEdit.type = 'replace';
        lastEdit.oldText = newEdit.oldText;
      }
    } else if (lastEdit.type === 'delete' && newEdit.type === 'insert') {
      // 删除后插入（替换）
      lastEdit.type = 'replace';
      lastEdit.newText = newEdit.newText;
    }

    console.log('[EditHistoryManager] Merged edit:', lastEdit);
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

  /**
   * 获取最近的编辑记录（过滤无效编辑）
   */
  getRecentEdits(count: number = 5): EditRecord[] {
    // 过滤掉被完全抵消的编辑
    const validEdits = this.editHistory.filter(edit => {
      return !(edit.type === 'delete' && edit.oldText === '' && edit.newText === '');
    });
    
    return validEdits.slice(-count);
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
