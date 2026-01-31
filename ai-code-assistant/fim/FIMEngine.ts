/**
 * FIM Engine - 实时代码补全引擎
 */

import * as monaco from 'monaco-editor';
import { PredictionService } from '../shared/PredictionService';

export class FIMEngine {
  private disposable: monaco.IDisposable | null = null;
  private predictionService: PredictionService;
  private fimLocked = false;
  
  private ghostTextVisible = false;
  private lastGhostTextTimestamp = 0;
  private lastGhostTextContent = '';
  private ghostTextDecisionCallbacks: Array<() => void> = [];

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
            this.ghostTextVisible = false;
            this.lastGhostTextContent = '';
            return { items: [] };
          }

          // 检查后缀重复
          if (this.checkSuffixDuplication(completion, suffix)) {
            this.ghostTextVisible = false;
            this.lastGhostTextContent = '';
            return { items: [] };
          }

          // ✅ 更新 Ghost Text 状态
          this.ghostTextVisible = true;
          this.lastGhostTextTimestamp = Date.now();
          this.lastGhostTextContent = completion;
          console.log('[FIMEngine] Ghost Text visible:', completion.substring(0, 50));

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
    this.clearGhostText();
    console.log('[FIMEngine] Locked and cleared Ghost Text');
  }

  /**
   * 解锁 FIM
   */
  unlock(): void {
    this.fimLocked = false;
    console.log('[FIMEngine] Unlocked');
  }

  /**
   * 清除 Ghost Text（强制）
   */
  private clearGhostText(): void {
    try {
      // 方法 1: 触发 Escape 键事件（最可靠）
      this.editor.trigger('keyboard', 'cancelSelection', {});
      
      // 方法 2: 插入空字符再删除，强制刷新
      const position = this.editor.getPosition();
      if (position) {
        const model = this.editor.getModel();
        if (model) {
          // 插入空格
          model.pushEditOperations(
            [],
            [{
              range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
              text: ' '
            }],
            () => null
          );
          
          // 立即删除空格
          setTimeout(() => {
            const newPos = this.editor.getPosition();
            if (newPos && model) {
              model.pushEditOperations(
                [],
                [{
                  range: new monaco.Range(newPos.lineNumber, newPos.column - 1, newPos.lineNumber, newPos.column),
                  text: ''
                }],
                () => null
              );
            }
          }, 0);
        }
      }

      console.log('[FIMEngine] Ghost Text cleared');
    } catch (error) {
      console.error('[FIMEngine] Failed to clear Ghost Text:', error);
    }
  }

  /**
   *  检查是否有 Ghost Text 显示
   */
  hasGhostText(): boolean {
    return this.ghostTextVisible;
  }

  /**
   *  获取 Ghost Text 显示时长（毫秒）
   */
  getGhostTextAge(): number {
    if (!this.ghostTextVisible) return 0;
    return Date.now() - this.lastGhostTextTimestamp;
  }

  /**
   *  获取当前 Ghost Text 内容
   */
  getGhostTextContent(): string {
    return this.lastGhostTextContent;
  }

  /**
   *  等待用户对 Ghost Text 做出决策
   * @param timeoutMs 超时时间（毫秒）
   * @returns Promise<boolean> true 表示用户做出决策，false 表示超时
   */
  waitForDecision(timeoutMs: number): Promise<boolean> {
    // 如果当前没有 Ghost Text，立即返回
    if (!this.ghostTextVisible) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      let resolved = false;

      // 创建回调函数
      const callback = () => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      };

      // 注册回调
      this.ghostTextDecisionCallbacks.push(callback);

      // 设置超时
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // 移除回调
          const index = this.ghostTextDecisionCallbacks.indexOf(callback);
          if (index > -1) {
            this.ghostTextDecisionCallbacks.splice(index, 1);
          }
          resolve(false); // 超时
        }
      }, timeoutMs);

      // 清理函数
      const cleanup = () => {
        clearTimeout(timeoutId);
        const index = this.ghostTextDecisionCallbacks.indexOf(callback);
        if (index > -1) {
          this.ghostTextDecisionCallbacks.splice(index, 1);
        }
      };
    });
  }

  /**
   *  标记 Ghost Text 已消失（由外部调用）
   */
  markGhostTextGone(): void {
    if (this.ghostTextVisible) {
      console.log('[FIMEngine] Ghost Text gone (user decision made)');
      this.ghostTextVisible = false;
      this.lastGhostTextContent = '';
      
      // 触发所有等待回调
      const callbacks = [...this.ghostTextDecisionCallbacks];
      this.ghostTextDecisionCallbacks = [];
      callbacks.forEach(cb => cb());
    }
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
