/**
 * NES Renderer: UI 渲染层（重构版 v2）
 * 负责协调各子管理器，根据 changeType 自动渲染对应的 UI
 * 
 * 支持的场景：
 * - REPLACE_LINE: 整行替换（场景1）
 * - REPLACE_WORD: 单词替换（场景3）
 * - INSERT: 插入新行（场景2）
 * - DELETE: 删除行（场景4）
 * - INLINE_INSERT: 行内插入（场景5第2个）
 */

import * as monaco from 'monaco-editor';
import type { Prediction } from '../../types/nes';
import { HintBarWidget } from './HintBarWidget';
import { GlyphContextMenu } from './GlyphContextMenu';
import { DecorationManager } from './DecorationManager';
import { ViewZoneManager } from './ViewZoneManager';
import { injectNESStyles } from './styles/nes-styles';

export class NESRenderer {
  private currentPrediction: Prediction | null = null;
  
  private hintBarWidget: HintBarWidget | null = null;
  private contextMenu: GlyphContextMenu;
  
  // 管理器
  private decorationManager: DecorationManager;
  private viewZoneManager: ViewZoneManager;

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
    // 初始化管理器
    this.decorationManager = new DecorationManager(editor);
    this.viewZoneManager = new ViewZoneManager(editor);
    
    this.contextMenu = new GlyphContextMenu(editor);
    injectNESStyles();
  }

  // ==================== 核心 API ====================

  /**
   * 渲染建议（状态1：建议出现）
   * 根据 changeType 自动渲染对应的装饰器
   */
  public renderSuggestion(prediction: Prediction): void {
    this.currentPrediction = prediction;
    
    const changeType = prediction.changeType || 'REPLACE_LINE';
    
    this.decorationManager.renderState1(
      changeType,
      prediction.targetLine,
      prediction.explanation,
      prediction.wordReplaceInfo
    );
  }

  /**
   * 显示预览（状态2：显示预览）
   * 根据 changeType 自动渲染对应的预览
   */
  public showPreview(prediction?: Prediction): void {
    const pred = prediction || this.currentPrediction;
    if (!pred) return;
    
    const changeType = pred.changeType || 'REPLACE_LINE';
    
    const result = this.decorationManager.renderState2(
      changeType,
      pred.targetLine,
      pred.suggestionText,
      pred.wordReplaceInfo,
      pred.inlineInsertInfo
    );
    
    if (result.useViewZone && result.viewZoneConfig) {
      this.viewZoneManager.show(result.viewZoneConfig);
    }
  }

  /**
   * 隐藏 ViewZone（保留 Glyph Icon）
   */
  public hideViewZone(): void {
    this.viewZoneManager.clear();
  }

  /**
   * 应用建议（根据 changeType 执行不同的应用逻辑）
   */
  public applySuggestion(prediction?: Prediction): void {
    const pred = prediction || this.currentPrediction;
    if (!pred) return;
    
    const changeType = pred.changeType || 'REPLACE_LINE';
    
    switch (changeType) {
      case 'REPLACE_LINE':
        this.applyReplaceLine(pred);
        break;
      case 'REPLACE_WORD':
        this.applyReplaceWord(pred);
        break;
      case 'INSERT':
        this.applyInsert(pred);
        break;
      case 'DELETE':
        this.applyDelete(pred);
        break;
      case 'INLINE_INSERT':
        this.applyInlineInsert(pred);
        break;
    }
    
    // 清理 UI
    this.clear();
  }

  /**
   * 跳转到建议位置
   */
  public jumpToSuggestion(): void {
    if (!this.currentPrediction) return;

    const model = this.editor.getModel();
    if (!model) return;

    const targetLine = this.currentPrediction.targetLine;
    const endColumn = model.getLineMaxColumn(targetLine);

    this.editor.setPosition({ lineNumber: targetLine, column: endColumn });
    this.editor.revealLineInCenter(targetLine);
  }

  /**
   * 清除所有装饰
   */
  public clear(): void {
    this.decorationManager.clear();
    this.viewZoneManager.clear();
    this.hideHintBar();
    this.currentPrediction = null;
  }

  // ==================== UI 组件 ====================

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
   * 检查是否显示 ViewZone
   */
  public hasViewZone(): boolean {
    return this.viewZoneManager.hasViewZone();
  }

  /**
   * 获取当前建议
   */
  public getCurrentSuggestion(): Prediction | null {
    return this.currentPrediction;
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
    this.decorationManager.dispose();
    this.viewZoneManager.dispose();
    this.contextMenu.dispose();
    
    if (this.hintBarWidget) {
      this.hintBarWidget.dispose();
      this.hintBarWidget = null;
    }
  }

  // ==================== 应用逻辑（私有方法） ====================

  /**
   * 应用整行替换
   */
  private applyReplaceLine(prediction: Prediction): void {
    const model = this.editor.getModel();
    if (!model) return;

    const { targetLine, suggestionText } = prediction;
    const originalText = prediction.originalLineContent || model.getLineContent(targetLine);

    const edit: monaco.editor.IIdentifiedSingleEditOperation = {
      range: new monaco.Range(targetLine, 1, targetLine, model.getLineMaxColumn(targetLine)),
      text: suggestionText,
      forceMoveMarkers: true
    };

    this.editor.executeEdits('nes-replace-line', [edit]);

    // 计算光标位置
    const newCursorColumn = this.calculateCursorPositionAfterEdit(originalText, suggestionText);
    this.editor.setPosition({ 
      lineNumber: targetLine, 
      column: newCursorColumn 
    });
    this.editor.revealLineInCenter(targetLine);
  }

  /**
   * 应用单词替换
   */
  private applyReplaceWord(prediction: Prediction): void {
    const model = this.editor.getModel();
    if (!model || !prediction.wordReplaceInfo) return;

    const { targetLine, wordReplaceInfo } = prediction;

    const edit: monaco.editor.IIdentifiedSingleEditOperation = {
      range: new monaco.Range(
        targetLine,
        wordReplaceInfo.startColumn,
        targetLine,
        wordReplaceInfo.endColumn
      ),
      text: wordReplaceInfo.replacement,
      forceMoveMarkers: true
    };

    this.editor.executeEdits('nes-replace-word', [edit]);

    // 光标放在替换后的单词末尾
    this.editor.setPosition({ 
      lineNumber: targetLine, 
      column: wordReplaceInfo.startColumn + wordReplaceInfo.replacement.length
    });
    this.editor.revealLineInCenter(targetLine);
  }

  /**
   * 应用插入新行
   */
  private applyInsert(prediction: Prediction): void {
    const model = this.editor.getModel();
    if (!model) return;

    const { targetLine, suggestionText } = prediction;

    const edit: monaco.editor.IIdentifiedSingleEditOperation = {
      range: new monaco.Range(targetLine, model.getLineMaxColumn(targetLine), targetLine, model.getLineMaxColumn(targetLine)),
      text: `\n${suggestionText}`,
      forceMoveMarkers: true
    };

    this.editor.executeEdits('nes-insert', [edit]);

    // 光标移动到新插入的行末尾
    this.editor.setPosition({ 
      lineNumber: targetLine + 1, 
      column: suggestionText.length + 1
    });
    this.editor.revealLineInCenter(targetLine + 1);
  }

  /**
   * 应用删除行
   */
  private applyDelete(prediction: Prediction): void {
    const model = this.editor.getModel();
    if (!model) return;

    const { targetLine } = prediction;

    // 删除整行（包括换行符）
    const nextLine = targetLine + 1;
    const endColumn = nextLine <= model.getLineCount() ? 1 : model.getLineMaxColumn(targetLine);
    const endLine = nextLine <= model.getLineCount() ? nextLine : targetLine;

    const edit: monaco.editor.IIdentifiedSingleEditOperation = {
      range: new monaco.Range(targetLine, 1, endLine, endColumn),
      text: '',
      forceMoveMarkers: true
    };

    this.editor.executeEdits('nes-delete', [edit]);

    // 光标移动到删除行的位置
    const newLine = Math.min(targetLine, model.getLineCount());
    this.editor.setPosition({ 
      lineNumber: newLine, 
      column: 1
    });
    this.editor.revealLineInCenter(newLine);
  }

  /**
   * 应用行内插入
   */
  private applyInlineInsert(prediction: Prediction): void {
    const model = this.editor.getModel();
    if (!model || !prediction.inlineInsertInfo) return;

    const { targetLine, inlineInsertInfo } = prediction;

    const edit: monaco.editor.IIdentifiedSingleEditOperation = {
      range: new monaco.Range(
        targetLine,
        inlineInsertInfo.insertColumn,
        targetLine,
        inlineInsertInfo.insertColumn
      ),
      text: inlineInsertInfo.content,
      forceMoveMarkers: true
    };

    this.editor.executeEdits('nes-inline-insert', [edit]);

    // 光标放在插入内容之后
    this.editor.setPosition({ 
      lineNumber: targetLine, 
      column: inlineInsertInfo.insertColumn + inlineInsertInfo.content.length
    });
    this.editor.revealLineInCenter(targetLine);
  }

  // ==================== 旧 API（向后兼容） ====================

  /**
   * 只渲染 Glyph Icon（不渲染 ViewZone）+ HintBar
   * @deprecated 使用 renderSuggestion() 代替
   */
  public renderGlyphIcon(
    line: number, 
    suggestion: string, 
    explanation: string, 
    originalLineContent?: string
  ): void {
    // 转换为新的 Prediction 格式
    this.currentPrediction = {
      targetLine: line,
      suggestionText: suggestion,
      explanation,
      originalLineContent,
      changeType: 'REPLACE_LINE' // 默认为整行替换
    };

    // 使用装饰器管理器
    this.decorationManager.renderGlyphIcon(line, explanation);
  }

  // ==================== 工具方法 ====================

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
}
