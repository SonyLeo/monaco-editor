/**
 * ViewZoneManager
 * 支持多种 ViewZone 渲染模式
 * 
 * 模式：
 * - 整行预览（REPLACE_LINE, INSERT）
 * - 行内箭头 + 预览单词（REPLACE_WORD）
 */

import * as monaco from 'monaco-editor';
import ArrowTurnDownRightIcon from '../../svgs/arrow-turn-down-right.svg?raw';

export interface ViewZoneConfig {
  afterLineNumber: number;
  heightInLines: number;
  className: string;
  content: string;
  leadingSpaces?: number;  // 用于对齐（REPLACE_WORD 模式）
  showArrow?: boolean;     // 是否显示箭头（REPLACE_WORD 模式）
}

export class ViewZoneManager {
  private currentViewZoneId: string | null = null;

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {}

  /**
   * 显示 ViewZone
   */
  public show(config: ViewZoneConfig): void {
    this.clear();

    this.editor.changeViewZones((changeAccessor) => {
      const domNode = document.createElement('div');
      domNode.className = config.className;

      if (config.showArrow && config.leadingSpaces !== undefined) {
        // REPLACE_WORD 模式：显示箭头 + 预览单词
        const spacingSpan = document.createElement('span');
        spacingSpan.textContent = ' '.repeat(config.leadingSpaces);

        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'nes-demo-arrow';
        arrowSpan.innerHTML = ArrowTurnDownRightIcon;

        const previewSpan = document.createElement('span');
        previewSpan.className = 'nes-demo-preview-word-with-bg';
        previewSpan.textContent = config.content;

        domNode.appendChild(spacingSpan);
        domNode.appendChild(arrowSpan);
        domNode.appendChild(previewSpan);
      } else {
        // 整行预览模式
        domNode.textContent = config.content;
      }

      this.currentViewZoneId = changeAccessor.addZone({
        afterLineNumber: config.afterLineNumber,
        heightInLines: config.heightInLines,
        domNode: domNode
      });
    });
  }

  /**
   * 清除 ViewZone
   */
  public clear(): void {
    if (this.currentViewZoneId) {
      this.editor.changeViewZones((changeAccessor) => {
        if (this.currentViewZoneId) {
          changeAccessor.removeZone(this.currentViewZoneId);
          this.currentViewZoneId = null;
        }
      });
    }
  }

  /**
   * 检查是否有 ViewZone
   */
  public hasViewZone(): boolean {
    return this.currentViewZoneId !== null;
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.clear();
  }
}
