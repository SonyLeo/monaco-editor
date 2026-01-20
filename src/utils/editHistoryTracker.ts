/**
 * 编辑历史跟踪器
 * 监听 Monaco Editor 的编辑事件，维护编辑历史栈
 */
import * as monaco from 'monaco-editor';
import type {
  EditRecord,
  EditType,
  EditHistoryConfig,
  EditHistoryChangeCallback,
} from '../types/editHistory';

export class EditHistoryTracker {
  private history: EditRecord[] = [];
  private maxHistory: number;
  private debug: boolean;
  private changeCallbacks: EditHistoryChangeCallback[] = [];
  private previousContent: string = '';

  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    config: EditHistoryConfig = {}
  ) {
    this.maxHistory = config.maxHistory || 15;
    this.debug = config.debug || false;

    this.initialize();
  }

  /**
   * 初始化跟踪器
   */
  private initialize() {
    const model = this.editor.getModel();
    if (!model) {
      console.error('❌ EditHistoryTracker: No model found');
      return;
    }

    // 保存初始内容
    this.previousContent = model.getValue();

    // 监听内容变化
    model.onDidChangeContent((event) => {
      this.handleContentChange(event);
    });

    if (this.debug) {
      console.log('✅ EditHistoryTracker initialized');
    }
  }

  /**
   * 处理内容变化事件
   */
  private handleContentChange(event: monaco.editor.IModelContentChangedEvent) {
    const model = this.editor.getModel();
    if (!model) return;

    // 处理每个变更
    event.changes.forEach((change) => {
      const record = this.createEditRecord(change, model);
      this.addRecord(record);
    });

    // 更新之前的内容
    this.previousContent = model.getValue();

    // 触发回调
    this.notifyChange();
  }

  /**
   * 创建编辑记录
   */
  private createEditRecord(
    change: monaco.editor.IModelContentChange,
    model: monaco.editor.ITextModel
  ): EditRecord {
    const range = change.range;
    const hasOldContent = change.rangeLength > 0;
    const hasNewContent = change.text.length > 0;

    // 推断编辑类型
    let type: EditType;
    if (hasOldContent && hasNewContent) {
      type = 'replace';
    } else if (hasNewContent) {
      type = 'insert';
    } else {
      type = 'delete';
    }

    // 获取旧文本（从之前的内容中提取）
    const oldText = this.getOldText(range, change.rangeLength);

    const record: EditRecord = {
      timestamp: Date.now(),
      range: new monaco.Range(
        range.startLineNumber,
        range.startColumn,
        range.endLineNumber,
        range.endColumn
      ),
      oldText,
      newText: change.text,
      type,
      lineNumber: range.startLineNumber,
      column: range.startColumn,
      rangeLength: change.rangeLength,
    };

    if (this.debug) {
      console.log('📝 Edit recorded:', {
        type: record.type,
        line: record.lineNumber,
        old: this.truncate(record.oldText, 30),
        new: this.truncate(record.newText, 30),
      });
    }

    return record;
  }

  /**
   * 从之前的内容中获取旧文本
   */
  private getOldText(range: monaco.IRange, rangeLength: number): string {
    if (rangeLength === 0) return '';

    const model = this.editor.getModel();
    if (!model) return '';

    try {
      // 从之前保存的内容中提取
      const lines = this.previousContent.split('\n');
      const startLine = range.startLineNumber - 1;
      const endLine = range.endLineNumber - 1;

      if (startLine === endLine) {
        // 单行编辑
        const line = lines[startLine] || '';
        return line.substring(range.startColumn - 1, range.endColumn - 1);
      } else {
        // 多行编辑
        const result: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
          const line = lines[i] || '';
          if (i === startLine) {
            result.push(line.substring(range.startColumn - 1));
          } else if (i === endLine) {
            result.push(line.substring(0, range.endColumn - 1));
          } else {
            result.push(line);
          }
        }
        return result.join('\n');
      }
    } catch (error) {
      console.error('Error getting old text:', error);
      return '';
    }
  }

  /**
   * 添加记录到历史栈
   */
  private addRecord(record: EditRecord) {
    this.history.push(record);

    // 限制历史记录数量
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyChange() {
    this.changeCallbacks.forEach((callback) => {
      try {
        callback([...this.history]);
      } catch (error) {
        console.error('Error in edit history callback:', error);
      }
    });
  }

  /**
   * 注册历史变化回调
   */
  public onHistoryChange(callback: EditHistoryChangeCallback) {
    this.changeCallbacks.push(callback);
  }

  /**
   * 获取最近的编辑历史
   */
  public getRecentEdits(count?: number): EditRecord[] {
    if (count === undefined) {
      return [...this.history];
    }
    return this.history.slice(-count);
  }

  /**
   * 清空历史记录
   */
  public clear() {
    this.history = [];
    this.notifyChange();
  }

  /**
   * 获取历史记录数量
   */
  public getHistoryCount(): number {
    return this.history.length;
  }

  /**
   * 截断文本用于显示
   */
  private truncate(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
  }

  /**
   * 销毁跟踪器
   */
  public dispose() {
    this.history = [];
    this.changeCallbacks = [];
    if (this.debug) {
      console.log('🗑️ EditHistoryTracker disposed');
    }
  }
}
