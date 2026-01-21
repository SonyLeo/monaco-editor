/**
 * NES Renderer: UI 渲染层
 * 负责绘制箭头装饰器和 Diff 预览面板
 */

import * as monaco from 'monaco-editor';
import type { Prediction } from '../../types/nes';
import { HintBarWidget } from './HintBarWidget';
import { GlyphContextMenu } from './GlyphContextMenu';
import { SvgLoader } from '../utils/svgLoader';

export class NESRenderer {
  private decorations: monaco.editor.IEditorDecorationsCollection;
  private currentSuggestion: { targetLine: number; suggestionText: string; explanation: string; originalLineContent?: string } | null = null;
  private viewZoneIds: string[] = [];
  private hintBarWidget: HintBarWidget | null = null;
  private contextMenu: GlyphContextMenu;
  
  // 🆕 原生 DiffEditor 相关属性
  private diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
  private diffModels: { 
    original: monaco.editor.ITextModel | null; 
    modified: monaco.editor.ITextModel | null; 
  } = { original: null, modified: null };

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
    this.decorations = editor.createDecorationsCollection();
    this.contextMenu = new GlyphContextMenu(editor);
    this.injectEnhancedStyles();
  }

  /**
   * 只渲染 Glyph Icon（不渲染 ViewZone）+ HintBar
   */
  public renderGlyphIcon(line: number, suggestion: string, explanation: string, originalLineContent?: string): void {
    // 保存建议信息，以便后续展开预览
    this.currentSuggestion = {
      targetLine: line,
      suggestionText: suggestion,
      explanation,
      originalLineContent
    };

    // 增强的 Glyph 装饰器
    this.decorations.set([{
      range: new monaco.Range(line, 1, line, 1),
      options: {
        glyphMarginClassName: 'nes-arrow-icon-enhanced',
        glyphMarginHoverMessage: {
          value: `💡 **NES Suggestion**\n\n${explanation}\n\n*Click to preview • Tab to accept • Alt+N to skip*`
        },
        overviewRuler: {
          color: '#667eea',
          position: monaco.editor.OverviewRulerLane.Right
        }
      }
    }]);

    // 注意：不在这里显示 HintBar，由 NESController 控制
  }

  /**
   * 隐藏 ViewZone（保留 Glyph Icon）
   */
  public hideViewZone(): void {
    this.clearViewZone();
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

    this.decorations.set([{
      range: new monaco.Range(line, 1, line, 1),
      options: {
        glyphMarginClassName: 'nes-arrow-icon',
        glyphMarginHoverMessage: {
          value: `💡 **NES Suggestion**\n\n${explanation}\n\n*Press Alt+Enter to navigate*`
        },
        overviewRuler: {
          color: '#4a9eff',
          position: monaco.editor.OverviewRulerLane.Right
        }
      }
    }]);
  }

  /**
   * 显示预览（使用原生 DiffEditor 嵌入 ViewZone）
   */
  public showPreview(): void {
    if (!this.currentSuggestion || this.viewZoneIds.length > 0) {
      return;
    }

    const { targetLine, suggestionText, originalLineContent } = this.currentSuggestion;
    
    // 获取当前编辑器语言，确保语法高亮一致
    const model = this.editor.getModel();
    const languageId = model ? model.getLanguageId() : 'javascript';
    
    // 准备 Diff 内容
    const originalText = originalLineContent || model?.getLineContent(targetLine) || '';
    const modifiedText = suggestionText;

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
          if (this.diffEditor) return;
          this.initDiffEditor(domNode, originalText, modifiedText, languageId);
        }
      };

      const id = changeAccessor.addZone(viewZone);
      this.viewZoneIds.push(id);
    });
  }

  /**
   * 初始化嵌入式 DiffEditor
   */
  private initDiffEditor(
    container: HTMLElement, 
    original: string, 
    modified: string, 
    languageId: string
  ): void {
    // 1. 创建临时的 Model
    this.diffModels.original = monaco.editor.createModel(original, languageId);
    this.diffModels.modified = monaco.editor.createModel(modified, languageId);

    // 2. 创建 DiffEditor
    this.diffEditor = monaco.editor.createDiffEditor(container, {
      enableSplitViewResizing: false,
      renderSideBySide: false,
      readOnly: true,
      originalEditable: false, 
      lineNumbers: 'off',
      minimap: { enabled: false },
      scrollbar: {
        vertical: 'hidden',
        horizontal: 'hidden',
        handleMouseWheel: false,
        alwaysConsumeMouseWheel: false
      },
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      scrollBeyondLastLine: false,
      contextmenu: false,
      folding: false,
      renderOverviewRuler: false,
      fixedOverflowWidgets: true, // 防止提示框被遮挡
      // 关键：继承外部编辑器的字体设置
      fontSize: this.editor.getOption(monaco.editor.EditorOption.fontSize),
      lineHeight: this.editor.getOption(monaco.editor.EditorOption.lineHeight),
      fontFamily: this.editor.getOption(monaco.editor.EditorOption.fontFamily)
    });

    // 3. 设置 Model
    this.diffEditor.setModel({
      original: this.diffModels.original,
      modified: this.diffModels.modified
    });

    // 4. 强制多次 Layout 以确保渲染正确
    // 这是一个常见的 hack，因为 DiffEditor 需要一点时间来挂载和计算
    const layout = () => {
      if (this.diffEditor) {
        this.diffEditor.layout({
           width: container.clientWidth,
           height: container.clientHeight 
        });
      }
    };

    setTimeout(layout, 0);
    setTimeout(layout, 50); // 再次检查，防止首次计算为 0
  }

  /**
   * 跳转到建议位置
   */
  public jumpToSuggestion(): void {
    if (!this.currentSuggestion) return;

    const { targetLine } = this.currentSuggestion;
    this.editor.setPosition({ lineNumber: targetLine, column: 1 });
    this.editor.revealLineInCenter(targetLine);
  }

  /**
   * 应用建议（替换代码）
   */
  public applySuggestion(): void {
    if (!this.currentSuggestion) return;

    const { targetLine, suggestionText, originalLineContent } = this.currentSuggestion;
    const model = this.editor.getModel();
    if (!model) return;

    const lineContent = model.getLineContent(targetLine);
    const range = new monaco.Range(
      targetLine,
      1,
      targetLine,
      lineContent.length + 1
    );

    this.editor.executeEdits('nes-apply', [{
      range,
      text: suggestionText
    }]);

    // 🆕 智能定位光标：移动到新增内容的末尾
    const newColumn = this.calculateCursorPositionAfterEdit(
      originalLineContent || lineContent,
      suggestionText
    );
    
    this.editor.setPosition({ 
      lineNumber: targetLine, 
      column: newColumn 
    });

    this.clear();
  }

  /**
   * 🆕 计算编辑后的光标位置
   * 策略：找到原始内容和新内容的最后一个公共部分，光标放在变化内容之后
   */
  private calculateCursorPositionAfterEdit(original: string, modified: string): number {
    // 去除首尾空格进行比较
    const origTrimmed = original.trim();
    const modTrimmed = modified.trim();

    // 如果完全不同，放在末尾
    if (origTrimmed.length === 0 || modTrimmed.length === 0) {
      return modified.length + 1;
    }

    // 从后往前找到第一个不同的位置
    let commonSuffixLength = 0;
    const minLength = Math.min(origTrimmed.length, modTrimmed.length);
    
    for (let i = 1; i <= minLength; i++) {
      const origChar = origTrimmed[origTrimmed.length - i];
      const modChar = modTrimmed[modTrimmed.length - i];
      
      if (origChar === modChar) {
        commonSuffixLength++;
      } else {
        break;
      }
    }

    // 光标位置 = 新内容长度 - 公共后缀长度 + 1
    // 这样光标会在新增内容之后，公共后缀之前
    const cursorPos = modTrimmed.length - commonSuffixLength;
    
    // 考虑前导空格
    const leadingSpaces = modified.length - modified.trimStart().length;
    
    return leadingSpaces + cursorPos + 1; // +1 因为 column 是 1-indexed
  }

  /**
   * 显示 HintBar（公开方法）
   */
  public showHintBar(line: number, column: number, mode: 'navigate' | 'accept', direction: 'up' | 'down' | 'current' = 'current'): void {
    this.showHintBarInternal(line, column, mode, direction);
  }

  /**
   * 显示 HintBar（内部方法）
   */
  private showHintBarInternal(line: number, column: number, mode: 'navigate' | 'accept', direction: 'up' | 'down' | 'current' = 'current'): void {
    // 移除旧的 HintBar
    if (this.hintBarWidget) {
      this.editor.removeContentWidget(this.hintBarWidget);
      this.hintBarWidget.dispose();
    }

    // 创建新的 HintBar
    this.hintBarWidget = new HintBarWidget(this.editor, line, column, mode, direction);
    this.editor.addContentWidget(this.hintBarWidget);
  }

  /**
   * 隐藏 HintBar
   */
  private hideHintBar(): void {
    if (this.hintBarWidget) {
      this.editor.removeContentWidget(this.hintBarWidget);
      this.hintBarWidget.dispose();
      this.hintBarWidget = null;
    }
  }

  /**
   * 注入增强样式
   */
  private injectEnhancedStyles(): void {
    const styleId = 'nes-renderer-enhanced-styles';
    if (document.getElementById(styleId)) return;

    // 获取 Glyph 图标 SVG 并转换为 Data URL
    const glyphIconSvg = SvgLoader.getGlyphIcon('#667eea');
    const glyphIconDataUrl = SvgLoader.toDataUrl(glyphIconSvg);

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* 增强的 Glyph 箭头图标 - 使用 SVG */
      .nes-arrow-icon-enhanced {
        background: url('${glyphIconDataUrl}') no-repeat center center;
        background-size: 20px 20px;
        cursor: pointer;
        opacity: 0.95;
        transition: all 0.15s ease;
      }

      .nes-arrow-icon-enhanced:hover {
        opacity: 1;
        filter: drop-shadow(0 0 4px #667eea) brightness(1.15);
        transform: scale(1.08);
      }

      /* 增强的 Diff 样式 */
      .nes-native-diff-container {
        border-left: 3px solid #667eea;
        margin-left: 50px;
        background: transparent;
        display: block;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
      }

      /* Diff 删除行样式 */
      .nes-native-diff-container .monaco-diff-editor .line-delete {
        background: rgba(255, 0, 0, 0.1) !important;
        border: 1px solid rgba(255, 0, 0, 0.3) !important;
      }

      /* Diff 新增行样式 */
      .nes-native-diff-container .monaco-diff-editor .line-insert {
        background: rgba(0, 255, 0, 0.1) !important;
        border: 1px solid rgba(0, 255, 0, 0.3) !important;
      }

      /* 删除的字符高亮 */
      .nes-native-diff-container .monaco-diff-editor .char-delete {
        background: rgba(255, 0, 0, 0.3) !important;
      }

      /* 新增的字符高亮 */
      .nes-native-diff-container .monaco-diff-editor .char-insert {
        background: rgba(0, 255, 0, 0.3) !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 清除所有 UI 标记
   */
  public clear(): void {
    this.decorations.clear();
    this.clearViewZone();
    this.hideHintBar();
    this.currentSuggestion = null;
  }

  /**
   * 清除 ViewZone
   */
  public clearViewZone(): void {
    if (this.viewZoneIds.length > 0) {
      this.editor.changeViewZones((changeAccessor) => {
        for (const id of this.viewZoneIds) {
          changeAccessor.removeZone(id);
        }
      });
      this.viewZoneIds = [];

      // 清理 DiffEditor
      if (this.diffEditor) {
        this.diffEditor.dispose();
        this.diffEditor = null;
      }
      // 清理 Model
      if (this.diffModels.original) {
        this.diffModels.original.dispose();
        this.diffModels.original = null;
      }
      if (this.diffModels.modified) {
        this.diffModels.modified.dispose();
        this.diffModels.modified = null;
      }
    }
  }

  /**
   * 检查是否显示 ViewZone
   */
  public hasViewZone(): boolean {
    return this.viewZoneIds.length > 0;
  }

  /**
   * 获取当前建议
   */
  public getCurrentSuggestion(): Prediction | null {
    return this.currentSuggestion;
  }

  /**
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m] || m);
  }

  /**
   * 显示右键菜单
   */
  public showContextMenu(x: number, y: number, callbacks: {
    onNavigate?: () => void;
    onAccept?: () => void;
    onDismiss?: () => void;
  }): void {
    const actions = [];

    if (callbacks.onNavigate) {
      actions.push({
        id: 'navigate' as const,
        label: 'Navigate to',
        icon: '🧭',
        callback: callbacks.onNavigate
      });
    }

    if (callbacks.onAccept) {
      actions.push({
        id: 'accept' as const,
        label: 'Accept',
        icon: '✅',
        callback: callbacks.onAccept
      });
    }

    if (callbacks.onDismiss) {
      actions.push({
        id: 'dismiss' as const,
        label: 'Dismiss',
        icon: '❌',
        callback: callbacks.onDismiss
      });
    }

    this.contextMenu.show(x, y, actions);
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.clear();
    this.hideHintBar();
    this.contextMenu.dispose();
  }
}
