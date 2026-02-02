/**
 * DecorationManager
 * 根据 changeType 渲染不同场景的装饰器
 * 
 * 支持的场景：
 * - REPLACE_LINE: 整行替换（整行红色背景）
 * - REPLACE_WORD: 单词替换（只高亮单词）
 * - INSERT: 插入新行（整行蓝色背景）
 * - DELETE: 删除行（整行红色背景）
 * - INLINE_INSERT: 行内插入（行内绿色片段）
 */

import * as monaco from 'monaco-editor';
import type { ChangeType, WordReplaceInfo, InlineInsertInfo } from '@/types';

export class DecorationManager {
  private glyphDecorations: string[] = [];
  private highlightDecorations: string[] = [];
  private ghostTextDecorations: string[] = [];

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {}

  /**
   * 渲染 Glyph Icon（所有场景通用）
   */
  public renderGlyphIcon(line: number, explanation: string): void {
    this.glyphDecorations = this.editor.deltaDecorations(this.glyphDecorations, [{
      range: new monaco.Range(line, 1, line, 1),
      options: {
        glyphMarginClassName: 'nes-glyph-arrow-enhanced',
        glyphMarginHoverMessage: {
          value: `💡 NES Suggestion\n\n${explanation}\n\nCtrl+Enter to accept • Alt+N to skip • Esc to close`
        },
        overviewRuler: {
          color: '#667eea',
          position: monaco.editor.OverviewRulerLane.Right
        }
      }
    }]);
  }

  /**
   * 根据 changeType 渲染状态1（建议出现）
   */
  public renderState1(
    changeType: ChangeType,
    targetLine: number,
    explanation: string,
    wordReplaceInfo?: WordReplaceInfo
  ): void {
    const model = this.editor.getModel();
    if (!model) return;

    // 1. 渲染 Glyph Icon
    this.renderGlyphIcon(targetLine, explanation);

    // 2. 根据 changeType 渲染高亮
    switch (changeType) {
      case 'REPLACE_LINE':
        // 整行红色背景
        this.highlightDecorations = this.editor.deltaDecorations(this.highlightDecorations, [{
          range: new monaco.Range(targetLine, 1, targetLine, model.getLineMaxColumn(targetLine)),
          options: {
            className: 'nes-highlight-replace-line',
            isWholeLine: true
          }
        }]);
        break;

      case 'REPLACE_WORD':
        // 只高亮单词
        if (wordReplaceInfo) {
          this.highlightDecorations = this.editor.deltaDecorations(this.highlightDecorations, [{
            range: new monaco.Range(
              targetLine,
              wordReplaceInfo.startColumn,
              targetLine,
              wordReplaceInfo.endColumn
            ),
            options: {
              inlineClassName: 'nes-highlight-word'
            }
          }]);
        }
        break;

      case 'INSERT':
        // 整行蓝色背景
        this.highlightDecorations = this.editor.deltaDecorations(this.highlightDecorations, [{
          range: new monaco.Range(targetLine, 1, targetLine, model.getLineMaxColumn(targetLine)),
          options: {
            className: 'nes-highlight-insert',
            isWholeLine: true
          }
        }]);
        break;

      case 'DELETE':
        // 整行红色背景（稍深）
        this.highlightDecorations = this.editor.deltaDecorations(this.highlightDecorations, [{
          range: new monaco.Range(targetLine, 1, targetLine, model.getLineMaxColumn(targetLine)),
          options: {
            className: 'nes-highlight-delete',
            isWholeLine: true
          }
        }]);
        break;

      case 'INLINE_INSERT':
        // 不需要高亮，直接显示绿色片段（在 renderState2 中处理）
        break;
    }

    // 跳转到目标行
    this.editor.revealLineInCenter(targetLine);
  }

  /**
   * 根据 changeType 渲染状态2（显示预览）
   * 返回 ViewZone 的配置（如果需要）
   */
  public renderState2(
    changeType: ChangeType,
    targetLine: number,
    suggestionText: string,
    wordReplaceInfo?: WordReplaceInfo,
    inlineInsertInfo?: InlineInsertInfo
  ): { useViewZone: boolean; viewZoneConfig?: any } {
    const model = this.editor.getModel();
    if (!model) return { useViewZone: false };

    switch (changeType) {
      case 'REPLACE_LINE':
      case 'INSERT':
        // 使用 ViewZone 显示整行预览
        return {
          useViewZone: true,
          viewZoneConfig: {
            afterLineNumber: targetLine,
            heightInLines: 1,
            className: changeType === 'REPLACE_LINE' 
              ? 'nes-preview-zone' 
              : 'nes-preview-zone-insert',
            content: suggestionText
          }
        };

      case 'REPLACE_WORD':
        // 使用 ViewZone 显示行内箭头 + 预览单词
        if (wordReplaceInfo) {
          return {
            useViewZone: true,
            viewZoneConfig: {
              afterLineNumber: targetLine,
              heightInLines: 1,
              className: 'nes-preview-zone-word',
              content: wordReplaceInfo.replacement,
              leadingSpaces: wordReplaceInfo.startColumn - 1,
              showArrow: true
            }
          };
        }
        return { useViewZone: false };

      case 'DELETE':
        // 无预览
        return { useViewZone: false };

      case 'INLINE_INSERT':
        // 使用 before 装饰器显示行内绿色片段
        if (inlineInsertInfo) {
          this.ghostTextDecorations = this.editor.deltaDecorations(this.ghostTextDecorations, [{
            range: new monaco.Range(
              targetLine,
              inlineInsertInfo.insertColumn,
              targetLine,
              inlineInsertInfo.insertColumn
            ),
            options: {
              before: {
                content: inlineInsertInfo.content,
                inlineClassName: 'nes-inline-insert-preview',
                inlineClassNameAffectsLetterSpacing: true
              },
              showIfCollapsed: true
            }
          }]);
        }
        return { useViewZone: false };

      default:
        return { useViewZone: false };
    }
  }

  /**
   * 清除所有装饰
   */
  public clear(): void {
    if (this.glyphDecorations.length > 0) {
      this.editor.deltaDecorations(this.glyphDecorations, []);
      this.glyphDecorations = [];
    }

    if (this.highlightDecorations.length > 0) {
      this.editor.deltaDecorations(this.highlightDecorations, []);
      this.highlightDecorations = [];
    }

    if (this.ghostTextDecorations.length > 0) {
      this.editor.deltaDecorations(this.ghostTextDecorations, []);
      this.ghostTextDecorations = [];
    }
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.clear();
  }
}
