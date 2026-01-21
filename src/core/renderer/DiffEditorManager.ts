/**
 * DiffEditorManager
 * 负责管理嵌入式 DiffEditor 的创建、更新和布局
 */

import * as monaco from 'monaco-editor';

export class DiffEditorManager {
  private diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
  private diffModels: {
    original: monaco.editor.ITextModel | null;
    modified: monaco.editor.ITextModel | null;
  } = { original: null, modified: null };

  constructor(private mainEditor: monaco.editor.IStandaloneCodeEditor) {}

  /**
   * 初始化嵌入式 DiffEditor
   */
  init(
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
      fontSize: this.mainEditor.getOption(monaco.editor.EditorOption.fontSize),
      lineHeight: this.mainEditor.getOption(monaco.editor.EditorOption.lineHeight),
      fontFamily: this.mainEditor.getOption(monaco.editor.EditorOption.fontFamily)
    });

    // 3. 设置 Model
    this.diffEditor.setModel({
      original: this.diffModels.original,
      modified: this.diffModels.modified
    });

    // 4. 强制多次 Layout 以确保渲染正确
    // 这是一个常见的 hack，因为 DiffEditor 需要一点时间来挂载和计算
    this.scheduleLayout(container);
  }

  /**
   * 更新 Diff 内容
   */
  updateDiff(original: string, modified: string, languageId: string): void {
    if (!this.diffEditor) return;

    // 清理旧 models
    this.diffModels.original?.dispose();
    this.diffModels.modified?.dispose();

    // 创建新 models
    this.diffModels.original = monaco.editor.createModel(original, languageId);
    this.diffModels.modified = monaco.editor.createModel(modified, languageId);

    // 更新 DiffEditor
    this.diffEditor.setModel({
      original: this.diffModels.original,
      modified: this.diffModels.modified
    });
  }

  /**
   * 手动触发布局
   */
  layout(width?: number, height?: number): void {
    if (this.diffEditor) {
      if (width !== undefined && height !== undefined) {
        this.diffEditor.layout({ width, height });
      } else {
        this.diffEditor.layout();
      }
    }
  }

  /**
   * 调度布局（延迟执行多次）
   */
  private scheduleLayout(container: HTMLElement): void {
    const doLayout = () => {
      if (this.diffEditor) {
        this.diffEditor.layout({
          width: container.clientWidth,
          height: container.clientHeight
        });
      }
    };

    setTimeout(doLayout, 0);
    setTimeout(doLayout, 50); // 再次检查，防止首次计算为 0
  }

  /**
   * 获取 DiffEditor 实例
   */
  getEditor(): monaco.editor.IStandaloneDiffEditor | null {
    return this.diffEditor;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.diffEditor !== null;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 销毁 DiffEditor
    if (this.diffEditor) {
      this.diffEditor.dispose();
      this.diffEditor = null;
    }

    // 销毁临时 Models
    this.diffModels.original?.dispose();
    this.diffModels.modified?.dispose();
    this.diffModels.original = null;
    this.diffModels.modified = null;
  }
}
