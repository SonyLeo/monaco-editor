/**
 * Fast Engine: 简化版代码补全提供器
 * 后缀去重过滤 + Dispatcher 集成
 */

import * as monaco from 'monaco-editor';
import type { EditDispatcher } from '../dispatcher/EditDispatcher';

export class FastCompletionProvider {
  private disposable: monaco.IDisposable | null = null;

  constructor(private dispatcher?: EditDispatcher) {}

  /**
   * 注册 Inline Completion Provider
   */
  public register(): void {
    this.disposable = monaco.languages.registerInlineCompletionsProvider('typescript', {
      provideInlineCompletions: async (model, position, _, token) => {
        try {
          // ✅ P0: 检查 Dispatcher 状态
          if (this.dispatcher) {
            // 检查 NES 是否活跃
            if (this.dispatcher.getNESState() !== 'SLEEPING') {
              console.log('[FastCompletion] 🚫 NES is active, suppressing FIM');
              return { items: [] };
            }

            // 检查 FIM 是否被锁定
            if (this.dispatcher.isFIMLocked()) {
              console.log('[FastCompletion] 🔒 FIM is locked, suppressing');
              return { items: [] };
            }
          }

          const fullText = model.getValue();
          const offset = model.getOffsetAt(position);

          // 单文件场景：直接切割 Prefix/Suffix
          const prefix = fullText.substring(0, offset);
          const suffix = fullText.substring(offset);

          // 创建 AbortController 适配器
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
            signal: abortController.signal
          });

          if (!response.ok) {
            console.error('[FastCompletion] API error:', response.status);
            return { items: [] };
          }

          const { completion } = await response.json();

          if (!completion || completion.trim() === '') {
            return { items: [] };
          }

          // 后缀去重检查
          if (this.checkSuffixDuplication(completion, suffix)) {
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
          // AbortError 是正常的取消操作
          if (error.name === 'AbortError') {
            return { items: [] };
          }
          console.error('[FastCompletion] Error:', error);
          return { items: [] };
        }
      },
      
      disposeInlineCompletions: () => {
        // No resources to dispose per completion
      }
    });

    console.log('✅ [FastCompletion] Provider registered');
  }

  /**
   * 检查后缀重复
   * 如果光标后的文本以补全内容开头，则认为是重复
   */
  private checkSuffixDuplication(completion: string, suffix: string): boolean {
    if (!suffix || !completion) {
      return false;
    }

    // 标准化：移除空白字符
    const normalizedCompletion = this.normalize(completion);
    const normalizedSuffix = this.normalize(suffix);

    // 检查后缀是否以补全内容开头
    return normalizedSuffix.startsWith(normalizedCompletion);
  }

  /**
   * 标准化文本：移除空白字符
   */
  private normalize(text: string): string {
    return text.replace(/\s+/g, '');
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.disposable?.dispose();
    console.log('[FastCompletion] Provider disposed');
  }
}
