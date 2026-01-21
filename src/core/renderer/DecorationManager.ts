/**
 * DecorationManager
 * 负责管理 Glyph 图标和编辑器装饰
 */

import * as monaco from 'monaco-editor';

export class DecorationManager {
  private decorations: monaco.editor.IEditorDecorationsCollection;

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.decorations = editor.createDecorationsCollection();
  }

  /**
   * 渲染增强版 Glyph Icon
   */
  renderGlyphIcon(line: number, explanation: string): void {
    this.decorations.set([{
      range: new monaco.Range(line, 1, line, 1),
      options: {
        glyphMarginClassName: 'nes-arrow-icon-enhanced',
        glyphMarginHoverMessage: {
          value: `💡 **NES Suggestion**\n\n${explanation}\n\n*Click to preview • Tab to accept • Alt+N to skip*`
        },
        overviewRuler: {
          color: '#667eea',
          position: monaco.editor.OverviewRulerLane.Right
        }
      }
    }]);
  }

  /**
   * 显示简单指示器（旧版，已废弃）
   */
  showIndicator(line: number, explanation: string): void {
    this.decorations.set([{
      range: new monaco.Range(line, 1, line, 1),
      options: {
        glyphMarginClassName: 'nes-arrow-icon',
        glyphMarginHoverMessage: {
          value: `💡 **NES Suggestion**\n\n${explanation}\n\n*Press Alt+Enter to navigate*`
        },
        overviewRuler: {
          color: '#4a9eff',
          position: monaco.editor.OverviewRulerLane.Right
        }
      }
    }]);
  }

  /**
   * 清除所有装饰
   */
  clear(): void {
    this.decorations.clear();
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.decorations.clear();
  }
}
