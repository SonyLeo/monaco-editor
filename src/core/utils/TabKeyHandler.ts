/**
 * Tab 键处理器
 * 实现完整的优先级决策树
 */

import * as monaco from 'monaco-editor';
import type { NESController } from '../engines/NESController';

export class TabKeyHandler {
  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    private nesController?: NESController
  ) {}

  /**
   * 处理 Tab 键按下
   * 返回 true 表示已处理，false 表示使用默认行为
   */
  public handleTab(): boolean {
    // 优先级 1: Monaco Suggest Widget（代码建议框）
    if (this.hasSuggestWidget()) {
      this.editor.trigger('keyboard', 'acceptSelectedSuggestion', {});
      return true;
    }

    // 优先级 2: Inline Completion (FIM)
    const position = this.editor.getPosition();
    const oldPosition = position ? { ...position } : null;
    
    this.editor.trigger('keyboard', 'editor.action.inlineSuggest.commit', {});
    
    // 检查光标是否移动了（说明有 inline completion 被接受）
    const newPosition = this.editor.getPosition();
    if (oldPosition && newPosition && 
        (oldPosition.lineNumber !== newPosition.lineNumber || 
         oldPosition.column !== newPosition.column)) {
      return true;
    }

    // 优先级 3: NES 建议
    if (this.nesController?.hasActiveSuggestion()) {
      this.nesController.applySuggestion();
      return true;
    }

    // 优先级 4: 默认缩进
    return false;
  }

  /**
   * 检查是否有 Suggest Widget
   */
  private hasSuggestWidget(): boolean {
    try {
      const suggestController = (this.editor as any).getContribution('editor.contrib.suggestController');
      return suggestController?.widget?.value?.suggestWidgetVisible?.get() === true;
    } catch {
      return false;
    }
  }
}
