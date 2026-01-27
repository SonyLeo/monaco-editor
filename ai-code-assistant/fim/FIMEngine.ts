/**
 * FIM Engine - 实时代码补全引擎
 */

import * as monaco from 'monaco-editor';
import { PredictionService } from '../shared/PredictionService';

export class FIMEngine {
  private disposable: monaco.IDisposable | null = null;
  private predictionService: PredictionService;
  private fimLocked = false;

  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    endpoint: string
  ) {
    this.predictionService = new PredictionService(endpoint);
  }

  register(): void {
    console.log('[FIMEngine] Registering inline completion provider');

    this.disposable = monaco.languages.registerInlineCompletionsProvider('typescript', {
      provideInlineCompletions: async (model, position, context, token) => {
        try {
          // 检查是否被锁定
          if (this.fimLocked) {
            console.log('[FIMEngine] FIM is locked, suppressing');
            return { items: [] };
          }

          const fullText = model.getValue();
          const offset = model.getOffsetAt(position);

          const prefix = fullText.substring(0, offset);
          const suffix = fullText.substring(offset);

          // 创建 AbortController
          const abortController = new AbortController();
          token.onCancellationRequested(() => {
            abortController.abort();
          });

          // 调用 API
          const completion = await this.predictionService.callFIM(prefix, suffix);

          if (!completion || completion.trim() === '') {
            return { items: [] };
          }

          // 检查后缀重复
          if (this.checkSuffixDuplication(completion, suffix)) {
            return { items: [] };
          }

          return {
            items: [
              {
                insertText: completion,
                range: new monaco.Range(
                  position.lineNumber,
                  position.column,
                  position.lineNumber,
                  position.column
                ),
              },
            ],
          };
        } catch (error: any) {
          if (error.name === 'AbortError') {
            return { items: [] };
          }
          console.error('[FIMEngine] Error:', error);
          return { items: [] };
        }
      },

      disposeInlineCompletions: () => {
        // No resources to dispose per completion
      },
    });

    console.log('[FIMEngine] ✅ Provider registered');
  }

  /**
   * 锁定 FIM（当 NES 活跃时）
   */
  lock(): void {
    this.fimLocked = true;
    console.log('[FIMEngine] Locked');
  }

  /**
   * 解锁 FIM
   */
  unlock(): void {
    this.fimLocked = false;
    console.log('[FIMEngine] Unlocked');
  }

  /**
   * 检查后缀重复
   */
  private checkSuffixDuplication(completion: string, suffix: string): boolean {
    if (!suffix || !completion) {
      return false;
    }

    const normalizedCompletion = completion.replace(/\s+/g, '');
    const normalizedSuffix = suffix.replace(/\s+/g, '');

    return normalizedSuffix.startsWith(normalizedCompletion);
  }

  dispose(): void {
    this.disposable?.dispose();
    console.log('[FIMEngine] Disposed');
  }
}
