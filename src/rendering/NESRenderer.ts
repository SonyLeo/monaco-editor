/**
 * NES Renderer - 渲染层（重构版）
 * 负责协调各子管理器，根据 changeType 自动渲染对应的 UI
 * 
 * 支持的场景：
 * - REPLACE_LINE: 整行替换
 * - REPLACE_WORD: 单词替换
 * - INSERT: 插入新行
 * - DELETE: 删除行
 * - INLINE_INSERT: 行内插入
 */

import * as monaco from 'monaco-editor';
import type { Prediction, ChangeType } from '@/types';
import { DecorationManager } from './DecorationManager';
import { ViewZoneManager } from './ViewZoneManager';
import { CoordinateFixer } from '@/utils/CoordinateFixer';
import { logger } from '@/utils/logger';

export class NESRenderer {
  private currentPrediction: Prediction | null = null;
  private hintBarElement: HTMLElement | null = null;
  
  // 管理器
  private decorationManager: DecorationManager;
  private viewZoneManager: ViewZoneManager;
  private coordinateFixer: CoordinateFixer;
  private treeSitterInitialized = false;

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
    this.decorationManager = new DecorationManager(editor);
    this.viewZoneManager = new ViewZoneManager(editor);
    this.coordinateFixer = new CoordinateFixer();
    
    // 异步初始化 Tree-sitter（Layer 2）
    this.initTreeSitter();
  }

  /**
   * 初始化 Tree-sitter（异步）
   */
  private async initTreeSitter(): Promise<void> {
    try {
      await this.coordinateFixer.initTreeSitter();
      this.treeSitterInitialized = true;
    } catch (error) {
      logger.warn('[NESRenderer] Tree-sitter init failed, Layer 2 disabled:', error);
    }
  }

  /**
   * 渲染建议（状态1：建议出现）
   * 根据 changeType 自动渲染对应的装饰器
   */
  public renderSuggestion(prediction: Prediction): void {
    const model = this.editor.getModel();
    if (!model) return;
    
    // 获取当前行内容
    const lineContent = model.getLineContent(prediction.targetLine);
    
    // 设置完整代码（用于 Tree-sitter Layer 2）
    if (this.treeSitterInitialized) {
      this.coordinateFixer.setFullCode(model.getValue());
    }
    
    // 使用 CoordinateFixer 修复坐标（3 层降级策略）
    const fixedPrediction = this.coordinateFixer.fix(prediction, lineContent);
    this.currentPrediction = fixedPrediction;
    
    const changeType = (fixedPrediction.changeType || 'REPLACE_LINE') as ChangeType;
    

    
    this.decorationManager.renderState1(
      changeType,
      fixedPrediction.targetLine,
      fixedPrediction.explanation,
      fixedPrediction.wordReplaceInfo
    );
  }

  /**
   * 显示预览（状态2：显示预览）
   * 根据 changeType 自动渲染对应的预览
   */
  public showPreview(prediction?: Prediction): void {
    const pred = prediction || this.currentPrediction;
    if (!pred) return;
    
    const changeType = (pred.changeType || 'REPLACE_LINE') as ChangeType;
    
    
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
   * 显示 HintBar
   */
  public showHintBar(_lineNumber: number, explanation: string, previewShown: boolean = false, progress?: string): void {
    // 移除旧的 HintBar
    if (this.hintBarElement) {
      this.hintBarElement.remove();
    }

    // 创建 HintBar 元素
    this.hintBarElement = document.createElement('div');
    this.hintBarElement.className = 'nes-hint-bar';
    this.hintBarElement.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #252526;
      border: 1px solid #667eea;
      border-radius: 4px;
      padding: 12px 16px;
      color: #d4d4d4;
      font-size: 13px;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      max-width: 300px;
    `;

    // 根据预览状态显示不同的提示
    const tabHint = previewShown 
      ? '<span style="color: #81c784;">Tab</span> Accept' 
      : '<span style="color: #9cdcfe;">Tab</span> Preview';

    // 进度显示
    const progressHint = progress ? `<span style="color: #888; font-size: 11px;">${progress}</span>` : '';

    // 内容
    this.hintBarElement.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 500;">💡 Suggestion</span>
        ${progressHint}
      </div>
      <div style="margin-bottom: 12px; color: #b0bec5;">${explanation}</div>
      <div style="display: flex; gap: 8px; font-size: 12px; flex-wrap: wrap;">
        ${tabHint}
        <span style="color: #ffb74d;">Alt+N</span> Skip
        <span style="color: #4fc3f7;">Esc</span> Close
      </div>
    `;

    document.body.appendChild(this.hintBarElement);
  }

  /**
   * 隐藏 HintBar
   */
  public hideHintBar(): void {
    if (this.hintBarElement) {
      this.hintBarElement.remove();
      this.hintBarElement = null;
    }
  }

  /**
   * 应用建议（根据 changeType 执行不同的应用逻辑）
   */
  public applySuggestion(prediction?: Prediction): void {
    const pred = prediction || this.currentPrediction;
    if (!pred) return;
    
    const changeType = (pred.changeType || 'REPLACE_LINE') as ChangeType;
    
    
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
   * 清除所有装饰
   */
  public clear(): void {
    this.decorationManager.clear();
    this.viewZoneManager.clear();
    this.hideHintBar();
    this.currentPrediction = null;
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.clear();
    this.decorationManager.dispose();
    this.viewZoneManager.dispose();
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
