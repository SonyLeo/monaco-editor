/**
 * NES Renderer: UI 渲染层
 * 负责绘制箭头装饰器和 Diff 预览面板
 */

import * as monaco from 'monaco-editor';
import type { Prediction } from '../../types/nes';

export class NESRenderer {
  private decorations: monaco.editor.IEditorDecorationsCollection;
  private currentSuggestion: { targetLine: number; suggestionText: string; explanation: string; originalLineContent?: string } | null = null;
  private viewZoneIds: string[] = [];
  
  // 🆕 原生 DiffEditor 相关属性
  private diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
  private diffModels: { 
    original: monaco.editor.ITextModel | null; 
    modified: monaco.editor.ITextModel | null; 
  } = { original: null, modified: null };

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
    this.decorations = editor.createDecorationsCollection();
  }

  /**
   * 显示行号旁的紫色箭头指示器
   */
  public showIndicator(line: number, suggestion: string, explanation: string): void {
    console.log(`[NESRenderer] 🎯 Showing indicator at line ${line}`);
    console.log(`[NESRenderer]    Suggestion: "${suggestion.substring(0, 50)}..."`);
    console.log(`[NESRenderer]    Explanation: "${explanation}"`);

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
        // 在滚动条上也显示标记（蓝色主题）
        overviewRuler: {
          color: '#4a9eff',
          position: monaco.editor.OverviewRulerLane.Right
        }
      }
    }]);

    console.log(`[NESRenderer] ✅ Indicator rendered successfully`);
    console.log(`[NESRenderer] 💡 TIP: Press Alt+Enter to jump, or click the purple arrow`);
  }

  /**
   * 显示预览（使用原生 DiffEditor 嵌入 ViewZone）
   */
  public showPreview(): void {
    if (!this.currentSuggestion || this.viewZoneIds.length > 0) return;

    const { targetLine, suggestionText, originalLineContent } = this.currentSuggestion;
    
    // 获取当前编辑器语言，确保语法高亮一致
    const model = this.editor.getModel();
    const languageId = model ? model.getLanguageId() : 'javascript';
    
    // 准备 Diff 内容
    // 如果没有 originalLineContent，则回退到获取当前行内容
    const originalText = originalLineContent || model?.getLineContent(targetLine) || '';
    const modifiedText = suggestionText;

    // 计算所需高度（原生 DiffEditor 需要显式高度）
    // Inline 模式下，高度近似为：删除行数 + 新增行数
    const originalLineCount = originalText.split('\n').length;
    const modifiedLineCount = modifiedText.split('\n').length;
    
    // 关键修正：确保高度足够容纳所有行 + padding
    // DiffEditor 自身也有一些 padding，所以我们需要多加一点
    const diffLineCount = originalLineCount + modifiedLineCount;
    // 使用 lineHeight 进行精确像素计算
    const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
    const heightInPx = diffLineCount * lineHeight + 10; // +10px padding

    this.editor.changeViewZones((changeAccessor) => {
      const domNode = document.createElement('div');
      domNode.className = 'nes-native-diff-container';
      // 必须显式设置像素高度，否则 DiffEditor 可能无法正确测量
      domNode.style.height = `${heightInPx}px`;
      domNode.style.overflow = 'hidden';
      
      // 创建 ViewZone
      const viewZone: monaco.editor.IViewZone = {
        afterLineNumber: targetLine,
        heightInPx: heightInPx, // 使用像素高度代替 heightInLines，更精确
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

    console.log(`[NESRenderer] Jumped to line ${targetLine}`);
  }

  /**
   * 应用建议（替换代码）
   */
  public applySuggestion(): void {
    if (!this.currentSuggestion) return;

    const { targetLine, suggestionText } = this.currentSuggestion;
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

    this.clear();
    console.log('[NESRenderer] Suggestion applied');
  }

  /**
   * 清除所有 UI 标记
   */
  public clear(): void {
    this.decorations.clear();
    this.clearViewZone();
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
      
      console.log('[NESRenderer] ViewZone cleared');
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
   * 清理资源
   */
  public dispose(): void {
    this.clear();
    console.log('[NESRenderer] Disposed');
  }
}
