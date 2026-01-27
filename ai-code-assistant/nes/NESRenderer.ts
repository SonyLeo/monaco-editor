/**
 * NES Renderer - 渲染层
 * 负责显示 Glyph 箭头、Diff 预览、HintBar
 */

import * as monaco from 'monaco-editor';
import type { Prediction } from '../types/index';

export class NESRenderer {
  private viewZoneId: string | null = null;
  private decorationIds: string[] = [];
  private diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
  private hintBarElement: HTMLElement | null = null;

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {}

  /**
   * 显示建议（Glyph + HintBar + Diff 预览）
   */
  showSuggestion(prediction: Prediction): void {
    console.log('[NESRenderer] Showing suggestion at line', prediction.targetLine);

    // 1. 显示 Diff 预览（自动展开）
    this.showPreview(prediction);

    // 2. 显示 HintBar
    this.showHintBar(prediction.targetLine, prediction.explanation);
  }

  /**
   * 显示 Diff 预览
   */
  showPreview(prediction: Prediction): void {
    console.log('[NESRenderer] Showing preview at line', prediction.targetLine);

    // 1. 高亮目标行 + 显示 Glyph
    this.highlightLineWithGlyph(prediction.targetLine);

    // 2. 创建 ViewZone（内嵌 Diff Editor）
    this.createViewZone(prediction);
  }

  /**
   * 显示 Glyph 箭头（公开方法）
   */
  showGlyph(lineNumber: number): void {
    const decorations = this.editor.deltaDecorations(this.decorationIds, [
      {
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          glyphMarginClassName: 'nes-glyph-arrow',
          glyphMarginHoverMessage: { value: 'NES Suggestion - Press Ctrl+Enter to accept' },
          isWholeLine: false,
        },
      },
    ]);

    this.decorationIds = decorations;
  }

  /**
   * 显示 HintBar（公开方法）
   */
  showHintBar(lineNumber: number, explanation: string): void {
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

    // 内容
    this.hintBarElement.innerHTML = `
      <div style="margin-bottom: 8px; font-weight: 500;">💡 Suggestion</div>
      <div style="margin-bottom: 12px; color: #b0bec5;">${explanation}</div>
      <div style="display: flex; gap: 8px; font-size: 12px;">
        <span style="color: #81c784;">Ctrl+Enter</span> Accept
        <span style="color: #ffb74d;">Alt+N</span> Skip
        <span style="color: #4fc3f7;">Esc</span> Close
      </div>
    `;

    document.body.appendChild(this.hintBarElement);
    console.log('[NESRenderer] HintBar shown');
  }

  /**
   * 清除所有渲染
   */
  clear(): void {
    // 清除 Glyph 和高亮
    if (this.decorationIds.length > 0) {
      this.editor.deltaDecorations(this.decorationIds, []);
      this.decorationIds = [];
    }

    // 清除 ViewZone
    if (this.viewZoneId) {
      this.editor.changeViewZones((accessor) => {
        accessor.removeZone(this.viewZoneId!);
      });
      this.viewZoneId = null;
    }

    // 清除 Diff Editor
    if (this.diffEditor) {
      this.diffEditor.dispose();
      this.diffEditor = null;
    }

    // 清除 HintBar
    if (this.hintBarElement) {
      this.hintBarElement.remove();
      this.hintBarElement = null;
    }

    console.log('[NESRenderer] Cleared all renderings');
  }

  /**
   * 高亮目标行（带 Glyph）
   */
  private highlightLineWithGlyph(lineNumber: number): void {
    const decorations = this.editor.deltaDecorations(this.decorationIds, [
      {
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          className: 'nes-highlight-line',
          glyphMarginClassName: 'nes-glyph-arrow',
          glyphMarginHoverMessage: { value: 'NES Suggestion' },
        },
      },
    ]);

    this.decorationIds = decorations;
  }

  /**
   * 创建 ViewZone（Diff 预览）
   */
  private createViewZone(prediction: Prediction): void {
    // 清除旧的 ViewZone 和 Diff Editor
    if (this.viewZoneId) {
      this.editor.changeViewZones((accessor) => {
        accessor.removeZone(this.viewZoneId!);
      });
      this.viewZoneId = null;
    }

    if (this.diffEditor) {
      this.diffEditor.dispose();
      this.diffEditor = null;
    }

    const domNode = document.createElement('div');
    domNode.className = 'nes-diff-container';
    domNode.style.cssText = `
      height: 60px;
      border: 1px solid #3e3e3e;
      border-left: 3px solid #667eea;
      margin-top: 2px;
      background: #1e1e1e;
      overflow: hidden;
      padding: 4px 8px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    `;

    // 创建简单的文本对比显示
    const originalContent = prediction.originalLineContent || '';
    const modifiedContent = prediction.suggestionText;

    domNode.innerHTML = `
      <div style="font-family: 'Consolas', 'Courier New', monospace; font-size: 12px;">
        <div style="color: #f48771; margin-bottom: 4px; opacity: 0.8;">
          <span style="color: #666;">-</span> ${this.escapeHtml(originalContent)}
        </div>
        <div style="color: #89d185;">
          <span style="color: #666;">+</span> ${this.escapeHtml(modifiedContent)}
        </div>
      </div>
    `;

    // 插入 ViewZone
    this.editor.changeViewZones((accessor) => {
      this.viewZoneId = accessor.addZone({
        afterLineNumber: prediction.targetLine,
        heightInPx: 60,
        domNode,
        marginDomNode: undefined,
      });
    });

    console.log('[NESRenderer] ViewZone created at line', prediction.targetLine);
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 销毁渲染器
   */
  dispose(): void {
    this.clear();
    if (this.diffEditor) {
      this.diffEditor.dispose();
    }
  }
}
