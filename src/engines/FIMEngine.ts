/**
 * FIM Engine - 实时代码补全引擎
 */

import * as monaco from 'monaco-editor';
import { PredictionService } from '../services/PredictionService';
import { logger } from '../utils/logger';
import { analytics } from '../utils/Analytics';

export class FIMEngine {
  private disposable: monaco.IDisposable | null = null;
  private predictionService: PredictionService;
  private fimLocked = false;
  
  private ghostTextVisible = false;
  private lastGhostTextTimestamp = 0;
  private lastGhostTextContent = '';
  private ghostTextDecisionCallbacks: Array<() => void> = [];
  
  private lastEditTime = 0;

  constructor(endpoint: string) {
    this.predictionService = new PredictionService(endpoint);
  }

  register(): void {

    this.disposable = monaco.languages.registerInlineCompletionsProvider('typescript', {
      provideInlineCompletions: async (model, position, _context, token) => {
        try {
          // 检查是否被锁定
          if (this.fimLocked) {
            return { items: [] };
          }

          const fullText = model.getValue();
          const offset = model.getOffsetAt(position);

          const prefix = fullText.substring(0, offset);
          const suffix = fullText.substring(offset);
          
          // 收集触发上下文
          const lineContent = model.getLineContent(position.lineNumber);
          const lineLength = lineContent.length;
          const isAtLineEnd = position.column === model.getLineMaxColumn(position.lineNumber);
          const timeSinceLastEdit = Date.now() - this.lastEditTime;
          
          // 记录触发事件
          analytics.logEvent({
            engine: 'fim',
            action: 'trigger',
            context: {
              lineLength,
              isAtLineEnd,
              timeSinceLastEdit,
              debounceMs: 300,
            },
          });
          
          this.lastEditTime = Date.now();

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
            analytics.logEvent({
              engine: 'fim',
              action: 'reject',
              context: { lineLength, isAtLineEnd },
            });
            return { items: [] };
          }

          // 检查后缀重复
          if (this.checkSuffixDuplication(completion, suffix)) {
            this.ghostTextVisible = false;
            this.lastGhostTextContent = '';
            analytics.logEvent({
              engine: 'fim',
              action: 'reject',
              context: { lineLength, isAtLineEnd },
            });
            return { items: [] };
          }

          // ✅ 更新 Ghost Text 状态
          this.ghostTextVisible = true;
          this.lastGhostTextTimestamp = Date.now();
          this.lastGhostTextContent = completion;

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
          logger.error('[FIMEngine] Error:', error);
          return { items: [] };
        }
      },

      disposeInlineCompletions: () => {
        // No resources to dispose per completion
      },
    });

  }

  /**
   * 锁定 FIM（当 NES 活跃时）
   */
  lock(): void {
    this.fimLocked = true;
    // Ghost Text 由 Monaco 自然管理，不需要手动清除
  }

  /**
   * 解锁 FIM
   */
  unlock(): void {
    this.fimLocked = false;
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

      let resolved = false;
      let timeoutId: any = null;

      // 清理函数
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        const index = this.ghostTextDecisionCallbacks.indexOf(callback);
        if (index > -1) {
          this.ghostTextDecisionCallbacks.splice(index, 1);
        }
      };

      // 创建回调函数
      const callback = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(true);
        }
      };

      // 注册回调
      this.ghostTextDecisionCallbacks.push(callback);

      // 设置超时
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(false); // 超时
        }
      }, timeoutMs);
    });
  }

  /**
   *  标记 Ghost Text 已消失（由外部调用）
   */
  markGhostTextGone(): void {
    if (this.ghostTextVisible) {
      this.ghostTextVisible = false;
      this.lastGhostTextContent = '';
      
      // 记录接受事件
      analytics.logEvent({
        engine: 'fim',
        action: 'accept',
        context: {},
      });
      
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
  }
}
