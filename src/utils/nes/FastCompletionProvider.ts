/**
 * Fast Engine: 简化版代码补全提供器
 * 单文件场景：直接使用 Prefix/Suffix，无需 Jaccard 上下文
 */

import * as monaco from 'monaco-editor';

export class FastCompletionProvider {
  private disposable: monaco.IDisposable | null = null;

  /**
   * 注册 Inline Completion Provider
   */
  public register(): void {
    this.disposable = monaco.languages.registerInlineCompletionsProvider('typescript', {
      provideInlineCompletions: async (model, position, _, token) => {
        try {
          const fullText = model.getValue();
          const offset = model.getOffsetAt(position);

          // 单文件场景：直接切割 Prefix/Suffix
          const prefix = fullText.substring(0, offset);
          const suffix = fullText.substring(offset);

          // 🔧 创建 AbortController 适配器
          // Monaco 的 CancellationToken 需要转换为 fetch 的 AbortSignal
          const abortController = new AbortController();
          
          // 监听 Monaco 的取消事件
          token.onCancellationRequested(() => {
            abortController.abort();
          });

          // 调用后端 API
          const response = await fetch('http://localhost:3000/api/completion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prefix,
              suffix,
              max_tokens: 64
            }),
            signal: abortController.signal // 使用标准的 AbortSignal
          });

          if (!response.ok) {
            console.error('[FastCompletion] API error:', response.status);
            return { items: [] };
          }

          const { completion } = await response.json();

          if (!completion || completion.trim() === '') {
            return { items: [] };
          }

          return {
            items: [{
              insertText: completion,
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
              )
            }]
          };

        } catch (error: any) {
          // AbortError 是正常的取消操作，不需要报错
          if (error.name === 'AbortError') {
            return { items: [] };
          }
          console.error('[FastCompletion] Error:', error);
          return { items: [] };
        }
      },
      
      // Required by Monaco interface
      disposeInlineCompletions: () => {
        // No resources to dispose per completion
      }
    });

    console.log('✅ [FastCompletion] Provider registered');
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.disposable?.dispose();
    console.log('[FastCompletion] Provider disposed');
  }
}
