/**
 * NES Renderer: UI 渲染层（重构版）
 * 负责协调各子管理器，绘制箭头装饰器和 Diff 预览面板
 */

import * as monaco from 'monaco-editor';
import type { Prediction } from '../../types/nes';
import { HintBarWidget } from './HintBarWidget';
import { GlyphContextMenu } from './GlyphContextMenu';
import { DiffEditorManager } from './DiffEditorManager';
import { DecorationManager } from './DecorationManager';
import { ViewZoneManager } from './ViewZoneManager';
import { injectNESStyles } from './styles/nes-styles';

export class NESRenderer {
  private currentSuggestion: { 
    targetLine: number; 
    suggestionText: string; 
    explanation: string; 
    originalLineContent?: string 
  } | null = null;
  
  private hintBarWidget: HintBarWidget | null = null;
  private contextMenu: GlyphContextMenu;
  
  // 子管理器
  private diffManager: DiffEditorManager;
  private decorationManager: DecorationManager;
  private viewZoneManager: ViewZoneManager;

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
    // 初始化子管理器
    this.diffManager = new DiffEditorManager(editor);
    this.decorationManager = new DecorationManager(editor);
    this.viewZoneManager = new ViewZoneManager(editor, this.diffManager);
    
    this.contextMenu = new GlyphContextMenu(editor);
    injectNESStyles();
  }

  /**
   * 只渲染 Glyph Icon（不渲染 ViewZone）+ HintBar
   */
  public renderGlyphIcon(
    line: number, 
    suggestion: string, 
    explanation: string, 
    originalLineContent?: string
  ): void {
    // 保存建议信息，以便后续展开预览
    this.currentSuggestion = {
      targetLine: line,
      suggestionText: suggestion,
      explanation,
      originalLineContent
    };

    // 渲染 Glyph 图标
    this.decorationManager.renderGlyphIcon(line, explanation);
  }

  /**
   * 隐藏 ViewZone（保留 Glyph Icon）
   */
  public hideViewZone(): void {
    this.viewZoneManager.hide();
  }

  /**
   * 显示行号旁的紫色箭头指示器（已废弃，使用 renderGlyphIcon）
   */
  public showIndicator(line: number, suggestion: string, explanation: string): void {
    this.currentSuggestion = {
      targetLine: line,
      suggestionText: suggestion,
      explanation
    };

    this.decorationManager.showIndicator(line, explanation);
  }

  /**
   * 显示预览（使用原生 DiffEditor 嵌入 ViewZone）
   */
  public showPreview(): void {
    if (!this.currentSuggestion || this.viewZoneManager.hasViewZone()) {
      return;
    }

    const { targetLine, suggestionText, originalLineContent } = this.currentSuggestion;
    
    // 获取当前编辑器语言，确保语法高亮一致
    const model = this.editor.getModel();
    const languageId = model ? model.getLanguageId() : 'javascript';
    
    // 准备 Diff 内容
    const originalText = originalLineContent || model?.getLineContent(targetLine) || '';
    const modifiedText = suggestionText;

    // 显示 ViewZone 并初始化 DiffEditor
    this.viewZoneManager.showPreview(targetLine, originalText, modifiedText, languageId);
  }

  /**
   * 跳转到建议位置
   */
  public jumpToSuggestion(): void {
    if (!this.currentSuggestion) return;

    const model = this.editor.getModel();
    if (!model) return;

    const targetLine = this.currentSuggestion.targetLine;
    const endColumn = model.getLineMaxColumn(targetLine);

    this.editor.setPosition({ lineNumber: targetLine, column: endColumn });
    this.editor.revealLineInCenter(targetLine);
  }

  /**
   * 应用建议（替换代码）
   */
  public applySuggestion(): void {
    if (!this.currentSuggestion) return;

    const model = this.editor.getModel();
    if (!model) return;

    const { targetLine, suggestionText, originalLineContent } = this.currentSuggestion;
    const originalText = originalLineContent || model.getLineContent(targetLine);

    // 应用编辑
    const edit: monaco.editor.IIdentifiedSingleEditOperation = {
      range: new monaco.Range(targetLine, 1, targetLine, model.getLineMaxColumn(targetLine)),
      text: suggestionText,
      forceMoveMarkers: true
    };

    this.editor.executeEdits('nes-apply-suggestion', [edit]);

    // 计算光标位置
    const newCursorColumn = this.calculateCursorPositionAfterEdit(originalText, suggestionText);
    this.editor.setPosition({ 
      lineNumber: targetLine, 
      column: newCursorColumn 
    });
    this.editor.revealLineInCenter(targetLine);

    // 清理 UI
    this.clear();
  }

  /**
   * 计算编辑后的光标位置
   */
  private calculateCursorPositionAfterEdit(original: string, modified: string): number {
    const len = Math.min(original.length, modified.length);
    
    // 从前往后找到第一个不同的字符
    let firstDiffIndex = 0;
    for (let i = 0; i < len; i++) {
      if (original[i] !== modified[i]) {
        firstDiffIndex = i;
        break;
      }
    }

    // 从后往前找到第一个不同的字符
    let lastDiffIndex = modified.length;
    let origReverse = 0, modReverse = 0;
    while (origReverse < original.length && modReverse < modified.length) {
      const origIdx = original.length - 1 - origReverse;
      const modIdx = modified.length - 1 - modReverse;
      
      if (origIdx <= firstDiffIndex || modIdx <= firstDiffIndex) break;
      
      if (original[origIdx] === modified[modIdx]) {
        lastDiffIndex = modIdx;
        origReverse++;
        modReverse++;
      } else {
        break;
      }
    }

    // 光标放在变化内容之后
    return lastDiffIndex + 1;
  }

  /**
   * 显示 HintBar
   */
  public showHintBar(
    line: number, 
    column: number, 
    mode: 'navigate' | 'accept', 
    direction: 'up' | 'down' | 'current' = 'current'
  ): void {
    // 先移除旧的 HintBar
    this.hideHintBar();
    
    // 创建新的 HintBar widget
    this.hintBarWidget = new HintBarWidget(this.editor, line, column, mode, direction);
    this.editor.addContentWidget(this.hintBarWidget);
  }

  /**
   * 隐藏 HintBar
   */
  public hideHintBar(): void {
    if (this.hintBarWidget) {
      this.editor.removeContentWidget(this.hintBarWidget);
      this.hintBarWidget.dispose();
      this.hintBarWidget = null;
    }
  }

  /**
   * 清除所有 UI 标记
   */
  public clear(): void {
    this.decorationManager.clear();
    this.viewZoneManager.clear();
    this.hideHintBar();
    this.currentSuggestion = null;
  }

  /**
   * 检查是否显示 ViewZone
   */
  public hasViewZone(): boolean {
    return this.viewZoneManager.hasViewZone();
  }

  /**
   * 获取当前建议
   */
  public getCurrentSuggestion(): Prediction | null {
    if (!this.currentSuggestion) return null;

    return {
      targetLine: this.currentSuggestion.targetLine,
      originalLineContent: this.currentSuggestion.originalLineContent || '',
      suggestionText: this.currentSuggestion.suggestionText,
      explanation: this.currentSuggestion.explanation,
      confidence: 0.9,
      priority: 1
    };
  }

  /**
   * 显示右键菜单
   */
  public showContextMenu(
    x: number, 
    y: number, 
    callbacks: {
      onNavigate?: () => void;
      onAccept?: () => void;
      onDismiss?: () => void;
    }
  ): void {
    const actions: any[] = [];

    if (callbacks.onNavigate) {
      actions.push({
        id: 'navigate',
        label: 'Navigate to Suggestion',
        icon: '', // 图标在 GlyphContextMenu 内处理
        callback: callbacks.onNavigate
      });
    }

    if (callbacks.onAccept) {
      actions.push({
        id: 'accept',
        label: 'Accept Prediction', 
        icon: '',
        callback: callbacks.onAccept
      });
    }

    actions.push({
      id: 'dismiss',
      label: 'Dismiss',
      icon: '',
      callback: () => {
        if (callbacks.onDismiss) {
          callbacks.onDismiss();
        }
        this.contextMenu.hide();
      }
    });

    this.contextMenu.show(x, y, actions);
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.clear();
    this.diffManager.dispose();
    this.decorationManager.dispose();
    this.viewZoneManager.dispose();
    this.contextMenu.dispose();
    
    if (this.hintBarWidget) {
      this.hintBarWidget.dispose();
      this.hintBarWidget = null;
    }
  }
}
