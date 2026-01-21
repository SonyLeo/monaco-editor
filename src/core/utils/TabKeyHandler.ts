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
      console.log('[TabKey] Priority 1: Suggest Widget');
      this.editor.trigger('keyboard', 'acceptSelectedSuggestion', {});
      return true;
    }

    // 优先级 2: Inline Completion (FIM)
    if (this.hasInlineCompletion()) {
      console.log('[TabKey] Priority 2: Inline Completion (FIM)');
      this.editor.trigger('keyboard', 'editor.action.inlineSuggest.commit', {});
      return true;
    }

    // 优先级 3 & 4: NES 建议（通过 Arbiter 决策）
    const currentSuggestion = this.arbiter.getCurrentSuggestion();
    if (currentSuggestion && currentSuggestion.type === 'NES') {
      console.log('[TabKey] Priority 3/4: NES Suggestion');
      // 让 Arbiter 处理（它会调用 applyNes，进而触发冷却锁）
      this.arbiter.handleTabKey();
      return true;
    }

    // 优先级 5: 默认缩进
    console.log('[TabKey] Priority 5: Default indent');
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
   */
  private hasInlineCompletion(): boolean {
    try {
      const widget = (this.editor as any).getContribution('editor.contrib.inlineSuggest');
      return widget?.model?.state?.inlineCompletion !== undefined;
    } catch {
      return false;
    }
  }
}
