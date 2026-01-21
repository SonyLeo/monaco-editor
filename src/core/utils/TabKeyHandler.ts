/**
 * Tab 键处理器
 * 实现完整的优先级决策树
 */

import * as monaco from 'monaco-editor';
import { SuggestionArbiter } from '../arbiter/SuggestionArbiter';

export class TabKeyHandler {
  private arbiter: SuggestionArbiter;

  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor
  ) {
    this.arbiter = SuggestionArbiter.getInstance();
  }

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

    // 优先级 3 & 4: NES 建议（通过 Arbiter 决策）
    const currentSuggestion = this.arbiter.getCurrentSuggestion();
    if (currentSuggestion && currentSuggestion.type === 'NES') {
      this.arbiter.handleTabKey();
      return true;
    }

    // 优先级 5: 默认缩进
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

  /**
   * 检查是否有 Inline Completion
   * @deprecated 暂未使用，保留以备将来使用
   */
  /*
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private hasInlineCompletion(): boolean {
    try {
      // 方法 1：检查 inlineSuggest contribution
      const inlineSuggestController = (this.editor as any).getContribution('editor.contrib.inlineSuggest');
      
      if (inlineSuggestController) {
        // 尝试多种方式检测
        const hasCompletion = 
          inlineSuggestController.model?.state?.inlineCompletion !== undefined ||
          inlineSuggestController.model?.selectedSuggestionInfo !== undefined ||
          inlineSuggestController.model?.ghostText !== undefined;
        
        if (hasCompletion) {
          return true;
        }
      }

      // 方法 2：检查是否有 ghost text decorations
      const model = this.editor.getModel();
      if (model) {
        const decorations = model.getAllDecorations();
        const hasGhostText = decorations.some(d => 
          d.options.className?.includes('ghost') || 
          d.options.inlineClassName?.includes('ghost')
        );
        
        if (hasGhostText) {
          return true;
        }
      }

      return false;
    } catch (e) {
      return false;
    }
  }
  */
}
