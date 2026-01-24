/**
 * 建议仲裁器
 * 负责协调 FIM、NES 和 WordFix 三种建议的优先级和冲突解决
 */

import type * as monaco from 'monaco-editor';
import type { Suggestion, FimSuggestion, NesSuggestion, WordFix, ArbiterState } from '../../types/arbiter';
import type { NESController } from '../engines/NESController';

export class SuggestionArbiter {
  private static instance: SuggestionArbiter | null = null;
  private state: ArbiterState = {
    currentSuggestion: null,
    fimLocked: false,
    lockUntil: 0
  };

  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private nesController: NESController | null = null;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): SuggestionArbiter {
    if (!SuggestionArbiter.instance) {
      SuggestionArbiter.instance = new SuggestionArbiter();
    }
    return SuggestionArbiter.instance;
  }

  /**
   * 设置编辑器实例
   */
  setEditor(editor: monaco.editor.IStandaloneCodeEditor): void {
    this.editor = editor;
  }

  /**
   * 设置 NESController 实例
   */
  setNESController(controller: NESController): void {
    this.nesController = controller;
  }

  /**
   * 提交 FIM 建议
   */
  submitFimSuggestion(suggestion: Omit<FimSuggestion, 'type' | 'priority'>): boolean {
    if (this.isFimLocked()) {
      return false;
    }

    const fimSuggestion: FimSuggestion = {
      type: 'FIM',
      priority: 1,
      ...suggestion
    };

    return this.acceptSuggestion(fimSuggestion);
  }

  /**
   * 提交 NES 建议
   */
  submitNesSuggestion(suggestion: Omit<NesSuggestion, 'type' | 'priority'>): boolean {
    const nesSuggestion: NesSuggestion = {
      type: 'NES',
      priority: 2, // NES 优先级高于 FIM (1)
      ...suggestion
    };

    return this.acceptSuggestion(nesSuggestion);
  }

  /**
   * 提交 WordFix 建议
   */
  submitWordFix(suggestion: Omit<WordFix, 'type' | 'priority'>): boolean {
    const wordFix: WordFix = {
      type: 'WORD_FIX',
      priority: 3,
      ...suggestion
    };

    return this.acceptSuggestion(wordFix);
  }

  /**
   * 接受建议（根据优先级）
   */
  private acceptSuggestion(suggestion: Suggestion): boolean {
    // 如果没有当前建议，直接接受
    if (!this.state.currentSuggestion) {
      this.state.currentSuggestion = suggestion;
      return true;
    }

    // 比较优先级（优先级相同或更高时替换）
    if (suggestion.priority >= this.state.currentSuggestion.priority) {
      this.state.currentSuggestion = suggestion;
      return true;
    }

    return false;
  }

  /**
   * 处理 Tab 键
   */
  handleTabKey(): boolean {
    if (!this.state.currentSuggestion) {
      return false;
    }

    const suggestion = this.state.currentSuggestion;

    // 根据类型应用建议
    switch (suggestion.type) {
      case 'WORD_FIX':
        this.applyWordFix(suggestion);
        this.clearSuggestion();
        break;
      case 'FIM':
        this.applyFim(suggestion);
        this.clearSuggestion();
        break;
      case 'NES':
        // NES 特殊处理：展开预览时不清除，应用时才清除
        const hadPreview = this.nesController?.hasActivePreview() || false;
        this.applyNes(suggestion);
        if (hadPreview) {
          this.clearSuggestion();
        }
        break;
    }

    return true;
  }

  /**
   * 应用 WordFix
   */
  private applyWordFix(wordFix: WordFix): void {
    if (!this.editor) return;

    this.editor.executeEdits('arbiter', [{
      range: wordFix.range,
      text: wordFix.newWord
    }]);

    // WordFix 后锁定 FIM 500ms
    this.lockFim(500);
  }

  /**
   * 应用 FIM
   */
  private applyFim(fim: FimSuggestion): void {
    if (!this.editor) return;

    const range = fim.range || {
      startLineNumber: fim.position.lineNumber,
      startColumn: fim.position.column,
      endLineNumber: fim.position.lineNumber,
      endColumn: fim.position.column
    };

    this.editor.executeEdits('arbiter', [{
      range,
      text: fim.text
    }]);
  }

  /**
   * 应用 NES
   */
  private applyNes(_nes: NesSuggestion): void {
    if (!this.nesController) {
      console.warn('[Arbiter] NESController not set, cannot apply NES');
      return;
    }

    // 检查是否已经有预览
    if (this.nesController.hasActivePreview()) {
      // 有预览 → 应用建议（会触发冷却锁）
      this.nesController.acceptSuggestion();
    } else {
      // 没有预览 → 展开预览
      this.nesController.applySuggestion();
      // 不清除建议，保持 Arbiter 状态，以便下次 Tab 可以应用
      return;
    }
  }

  /**
   * 锁定 FIM
   */
  lockFim(durationMs: number): void {
    this.state.fimLocked = true;
    this.state.lockUntil = Date.now() + durationMs;

    setTimeout(() => {
      this.unlockFim();
    }, durationMs);
  }

  /**
   * 解锁 FIM
   */
  private unlockFim(): void {
    if (Date.now() >= this.state.lockUntil) {
      this.state.fimLocked = false;
    }
  }

  /**
   * 检查 FIM 是否被锁定
   */
  isFimLocked(): boolean {
    if (this.state.fimLocked && Date.now() >= this.state.lockUntil) {
      this.unlockFim();
    }
    return this.state.fimLocked;
  }

  /**
   * V2.0: 检查 NES 是否处于活跃状态
   * 用于 FIM 门禁检查
   */
  isNesActive(): boolean {
    return this.state.currentSuggestion?.type === 'NES';
  }

  /**
   * 清除当前建议
   */
  clearSuggestion(): void {
    this.state.currentSuggestion = null;
  }

  /**
   * 获取当前建议
   */
  getCurrentSuggestion(): Suggestion | null {
    return this.state.currentSuggestion;
  }

  /**
   * 重置仲裁器（用于测试）
   */
  reset(): void {
    this.state = {
      currentSuggestion: null,
      fimLocked: false,
      lockUntil: 0
    };
  }
}
