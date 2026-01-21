/**
 * ViewZoneManager
 * 负责管理 ViewZone 的创建和清除
 */

import * as monaco from 'monaco-editor';
import { DiffEditorManager } from './DiffEditorManager';

export class ViewZoneManager {
  private viewZoneIds: string[] = [];

  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    private diffManager: DiffEditorManager
  ) {}

  /**
   * 显示 ViewZone 并初始化 DiffEditor
   */
  showPreview(
    targetLine: number,
    originalText: string,
    modifiedText: string,
    languageId: string
  ): void {
    // 如果已经有 ViewZone，直接返回
    if (this.viewZoneIds.length > 0) {
      return;
    }

    // 计算所需高度
    const originalLineCount = originalText.split('\n').length;
    const modifiedLineCount = modifiedText.split('\n').length;
    const diffLineCount = originalLineCount + modifiedLineCount;
    const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
    const heightInPx = diffLineCount * lineHeight + 10;

    this.editor.changeViewZones((changeAccessor) => {
      const domNode = document.createElement('div');
      domNode.className = 'nes-native-diff-container';
      domNode.style.height = `${heightInPx}px`;
      domNode.style.overflow = 'hidden';

      const viewZone: monaco.editor.IViewZone = {
        afterLineNumber: targetLine,
        heightInPx: heightInPx,
        domNode: domNode,
        onDomNodeTop: (_) => {
          // 初始化 DiffEditor（只初始化一次）
          if (!this.diffManager.isInitialized()) {
            this.diffManager.init(domNode, originalText, modifiedText, languageId);
          }
        }
      };

      const id = changeAccessor.addZone(viewZone);
      this.viewZoneIds.push(id);
    });
  }

  /**
   * 隐藏 ViewZone
   */
  hide(): void {
    this.clear();
  }

  /**
   * 清除 ViewZone 和相关资源
   */
  clear(): void {
    if (this.viewZoneIds.length > 0) {
      this.editor.changeViewZones((changeAccessor) => {
        for (const id of this.viewZoneIds) {
          changeAccessor.removeZone(id);
        }
      });
      this.viewZoneIds = [];

      // 清理 DiffEditor
      this.diffManager.dispose();
    }
  }

  /**
   * 检查是否有 ViewZone
   */
  hasViewZone(): boolean {
    return this.viewZoneIds.length > 0;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.clear();
  }
}
