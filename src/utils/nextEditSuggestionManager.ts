/**
 * Next Edit Suggestion UI 管理器
 * 负责显示 gutter 箭头、ghost text、Tab 键导航等
 */
import * as monaco from 'monaco-editor';
import type {
  NextEditPrediction,
  NextEditRequest,
  NextEditResponse,
  NextEditSuggestion,
} from '../types/nextEditPrediction';
import type { EditRecord } from '../types/editHistory';

export class NextEditSuggestionManager {
  private currentSuggestion: NextEditSuggestion | null = null;
  private decorations: string[] = [];
  private glyphDecorations: string[] = [];
  private isEnabled: boolean = true;
  private apiEndpoint: string = 'http://localhost:3000/next-edit-prediction';

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {}

  /**
   * 请求 Next Edit 预测
   */
  async requestPrediction(editHistory: EditRecord[], language: string = 'typescript') {
    if (!this.isEnabled || editHistory.length === 0) {
      return;
    }

    const model = this.editor.getModel();
    if (!model) return;

    try {
      const request: NextEditRequest = {
        editHistory: editHistory.slice(-10), // 最近 10 次编辑
        currentCode: model.getValue(),
        language,
      };

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const result: NextEditResponse = await response.json();

      if (result.success && result.prediction && result.prediction.confidence > 0.6) {
        this.showSuggestion(result.prediction);
      } else {
        this.clearSuggestion();
      }
    } catch (error) {
      console.error('❌ Next Edit 预测请求失败:', error);
      this.clearSuggestion();
    }
  }

  /**
   * 显示建议
   */
  private showSuggestion(prediction: NextEditPrediction) {
    const model = this.editor.getModel();
    if (!model) return;

    // 计算 Range
    const range = this.calculateRange(prediction);
    if (!range) return;

    this.currentSuggestion = {
      prediction,
      range,
      visible: true,
      atSuggestion: false,
    };

    // 显示 gutter 箭头
    this.showGutterArrow(prediction.line);
  }

  /**
   * 显示 gutter 箭头
   */
  private showGutterArrow(line: number) {
    this.glyphDecorations = this.editor.deltaDecorations(this.glyphDecorations, [
      {
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'next-edit-glyph-arrow',
          glyphMarginHoverMessage: {
            value: '💡 **Next Edit Suggestion**\n\nPress `Alt+Enter` to navigate and preview\nPress `Alt+Enter` again to accept\nPress `Esc` to dismiss',
          },
        },
      },
    ]);
  }

  /**
   * 显示 ghost text
   */
  private showGhostText() {
    if (!this.currentSuggestion) return;

    const { prediction, range } = this.currentSuggestion;
    const model = this.editor.getModel();
    if (!model) return;

    const decorationOptions: monaco.editor.IModelDeltaDecoration[] = [];

    if (prediction.action === 'insert') {
      // Insert: 显示 ghost text
      decorationOptions.push({
        range,
        options: {
          after: {
            content: prediction.newText,
            inlineClassName: 'next-edit-ghost-text',
          },
          showIfCollapsed: true,
        },
      });
    } else if (prediction.action === 'replace') {
      // Replace: 高亮要替换的内容 + 显示新内容
      decorationOptions.push({
        range,
        options: {
          className: 'next-edit-highlight-replace',
          after: {
            content: ` → ${prediction.newText}`,
            inlineClassName: 'next-edit-ghost-text',
          },
        },
      });
    } else if (prediction.action === 'delete') {
      // Delete: 高亮要删除的内容
      decorationOptions.push({
        range,
        options: {
          className: 'next-edit-highlight-delete',
          after: {
            content: ' [删除]',
            inlineClassName: 'next-edit-ghost-text-delete',
          },
        },
      });
    }

    this.decorations = this.editor.deltaDecorations(this.decorations, decorationOptions);
  }

  /**
   * 计算编辑范围
   */
  private calculateRange(prediction: NextEditPrediction): monaco.Range | null {
    const model = this.editor.getModel();
    if (!model) return null;

    const line = prediction.line;
    const column = prediction.column || 1;

    if (prediction.action === 'insert') {
      // Insert: 光标位置
      return new monaco.Range(line, column, line, column);
    } else if (prediction.action === 'replace') {
      // Replace: 需要找到要替换的文本范围
      if (prediction.oldText) {
        // 如果提供了 oldText，使用它计算范围
        const endColumn = column + prediction.oldText.length;
        return new monaco.Range(line, column, line, endColumn);
      } else {
        // 如果没有 oldText，尝试智能查找当前行的内容
        const lineContent = model.getLineContent(line);
        const trimmedContent = lineContent.trim();
        if (trimmedContent) {
          // 选中整行非空内容
          const startCol = lineContent.indexOf(trimmedContent) + 1;
          const endCol = startCol + trimmedContent.length;
          return new monaco.Range(line, startCol, line, endCol);
        }
        // 兜底：选中整行
        return new monaco.Range(line, 1, line, lineContent.length + 1);
      }
    } else if (prediction.action === 'delete') {
      // Delete: 需要找到要删除的文本范围
      if (prediction.oldText) {
        const endColumn = column + prediction.oldText.length;
        return new monaco.Range(line, column, line, endColumn);
      } else {
        // 如果没有 oldText，选中整行
        const lineContent = model.getLineContent(line);
        return new monaco.Range(line, 1, line, lineContent.length + 1);
      }
    }

    return new monaco.Range(line, column, line, column);
  }

  /**
   * 处理 Alt+Enter 键（导航或接受建议）
   */
  public handleNavigateOrAccept(): boolean {
    if (!this.currentSuggestion) return false;

    // 第一次按：导航并显示预览
    if (!this.currentSuggestion.atSuggestion) {
      this.navigateToSuggestion();
      return true;
    }

    // 第二次按：接受建议
    if (this.currentSuggestion.atSuggestion) {
      this.acceptSuggestion();
      return true;
    }

    return false;
  }

  /**
   * 导航到建议位置
   */
  private navigateToSuggestion() {
    if (!this.currentSuggestion) return;

    const { prediction, range } = this.currentSuggestion;

    // 移动光标到范围的开始位置
    this.editor.setPosition({
      lineNumber: range.startLineNumber,
      column: range.startColumn,
    });

    // 如果是 replace 或 delete，选中要操作的内容
    if (prediction.action === 'replace' || prediction.action === 'delete') {
      this.editor.setSelection(range);
    }

    // 聚焦到该行
    this.editor.revealLineInCenter(prediction.line);

    // 显示 ghost text 和高亮
    this.showGhostText();

    // 标记为已导航
    this.currentSuggestion.atSuggestion = true;
  }

  /**
   * 接受建议
   */
  private acceptSuggestion() {
    if (!this.currentSuggestion) return;

    const { prediction, range } = this.currentSuggestion;

    // 根据操作类型执行不同的编辑
    if (prediction.action === 'delete') {
      this.editor.executeEdits('next-edit-suggestion', [
        {
          range,
          text: '',
        },
      ]);
    } else if (prediction.action === 'replace') {
      this.editor.executeEdits('next-edit-suggestion', [
        {
          range,
          text: prediction.newText,
        },
      ]);
    } else {
      this.editor.executeEdits('next-edit-suggestion', [
        {
          range,
          text: prediction.newText,
        },
      ]);
    }

    // 清除建议
    this.clearSuggestion();
  }

  /**
   * 检查是否在建议位置
   */
  private isAtSuggestionLocation(position: monaco.Position): boolean {
    if (!this.currentSuggestion) return false;

    const { prediction } = this.currentSuggestion;
    return position.lineNumber === prediction.line;
  }

  /**
   * 清除建议
   */
  public clearSuggestion() {
    this.currentSuggestion = null;
    this.decorations = this.editor.deltaDecorations(this.decorations, []);
    this.glyphDecorations = this.editor.deltaDecorations(this.glyphDecorations, []);
  }

  /**
   * 检查是否有建议
   */
  public hasSuggestion(): boolean {
    return this.currentSuggestion !== null;
  }

  /**
   * 启用/禁用
   */
  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.clearSuggestion();
    }
  }

  /**
   * 设置 API 端点
   */
  public setEndpoint(endpoint: string) {
    this.apiEndpoint = endpoint;
  }

  /**
   * 销毁
   */
  public dispose() {
    this.clearSuggestion();
  }
}
