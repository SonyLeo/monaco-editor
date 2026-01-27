/**
 * NES 建议管理器
 * 负责建议的显示、接受、跳过和拒绝
 */

import type { Prediction } from '../../types/nes';
import { NESRenderer } from '../renderer/NESRenderer';
import { SuggestionQueue } from './SuggestionQueue';
import { FeedbackCollector } from './FeedbackCollector';
import { ToastNotification } from '../utils/ToastNotification';
import { NES_CONFIG } from '../config';
import type { EditDispatcher } from '../dispatcher/EditDispatcher';

export class NESSuggestionManager {
  private userOnSuggestionLine = false;
  private applyingSuggestionLine: number | null = null;

  constructor(
    private renderer: NESRenderer,
    private suggestionQueue: SuggestionQueue,
    private feedbackCollector: FeedbackCollector,
    private toast: ToastNotification,
    private dispatcher: EditDispatcher | null,
    private onComplete: () => void
  ) {}

  /**
   * 显示当前建议
   */
  showCurrent(): void {
    if (!this.suggestionQueue.hasMore) {
      console.log('[NESSuggestionManager] All suggestions processed');
      this.clear();
      return;
    }

    const prediction = this.suggestionQueue.current();
    if (!prediction) {
      console.warn('[NESSuggestionManager] Invalid prediction');
      return;
    }

    // 设置标记，防止跳转触发的编辑事件被误判
    this.applyingSuggestionLine = prediction.targetLine;

    // 使用新的 renderSuggestion API（自动根据 changeType 渲染）
    this.renderer.renderSuggestion(prediction);

    // 显示 HintBar
    this.updateHintBar(prediction);

    // Toast 通知
    const progress = this.suggestionQueue.getProgress();
    const message =
      progress.remaining > 0
        ? `Suggestion ${progress.current}/${progress.total} (${progress.remaining} more)`
        : `Last suggestion ${progress.current}/${progress.total}`;

    this.toast.show(message, 'success', 2000);

    console.log(
      `[NESSuggestionManager] 📌 Showing suggestion ${progress.current}/${progress.total} at line ${prediction.targetLine}`,
    );

    // 清除标记
    setTimeout(() => {
      this.applyingSuggestionLine = null;
    }, 100);
  }

  /**
   * 接受当前建议
   */
  accept(): boolean {
    console.log('[NESSuggestionManager] ✅ Accepting suggestion');

    const acceptedPrediction = this.suggestionQueue.current();
    if (!acceptedPrediction) {
      console.warn('[NESSuggestionManager] No prediction to accept');
      return false;
    }

    // 设置标记，表示正在应用建议
    this.applyingSuggestionLine = acceptedPrediction.targetLine;

    // 应用建议
    this.renderer.applySuggestion(acceptedPrediction);
    this.dispatcher?.lockFIM(NES_CONFIG.TIME.LOCK_DURATION_MS);

    // 记录用户反馈
    this.feedbackCollector.recordFeedback(acceptedPrediction, 'accepted');

    // 清除标记
    setTimeout(() => {
      this.applyingSuggestionLine = null;
    }, 100);

    // 移动到下一个建议
    const nextPrediction = this.suggestionQueue.next();
    if (nextPrediction) {
      console.log(
        `[NESSuggestionManager] 📍 Moving to next suggestion (${this.suggestionQueue.index + 1}/${this.suggestionQueue.total})`,
      );

      setTimeout(() => {
        this.showCurrent();
      }, NES_CONFIG.TIME.SUGGESTION_APPLY_DELAY_MS);

      return true;
    } else {
      console.log('[NESSuggestionManager] 🎉 All suggestions completed');
      this.toast.show('All suggestions applied!', 'success', 2000);
      this.onComplete();
      return false;
    }
  }

  /**
   * 跳过当前建议
   */
  skip(): boolean {
    const skippedPrediction = this.suggestionQueue.skip();
    if (skippedPrediction) {
      this.feedbackCollector.recordFeedback(skippedPrediction, 'skipped');
      console.log(
        `[NESSuggestionManager] ⏭️ Skipped suggestion at line ${skippedPrediction.targetLine}`,
      );
    }

    if (this.suggestionQueue.hasMore) {
      console.log('[NESSuggestionManager] Skipping to next suggestion...');
      this.showCurrent();
      return true;
    } else {
      console.log('[NESSuggestionManager] No more suggestions');
      this.onComplete();
      return false;
    }
  }

  /**
   * 拒绝所有剩余建议
   */
  rejectAll(): void {
    // 记录当前建议为拒绝
    const currentPrediction = this.suggestionQueue.current();
    if (currentPrediction) {
      this.feedbackCollector.recordFeedback(currentPrediction, 'rejected');
    }

    console.log('[NESSuggestionManager] ❌ All remaining suggestions rejected');
    this.onComplete();
  }

  /**
   * 更新 HintBar 显示
   */
  updateHintBar(_prediction: Prediction): void {
    // 这里可以添加 HintBar 更新逻辑
    // 当前由 NESRenderer 处理
  }

  /**
   * 检查是否有激活的建议
   */
  hasActive(): boolean {
    return this.suggestionQueue.hasMore;
  }

  /**
   * 获取当前建议
   */
  getCurrent(): Prediction | null {
    return this.suggestionQueue.current();
  }

  /**
   * 获取应用中的建议行号
   */
  getApplyingLine(): number | null {
    return this.applyingSuggestionLine;
  }

  /**
   * 检查用户是否在建议行
   */
  isUserOnSuggestionLine(): boolean {
    return this.userOnSuggestionLine;
  }

  /**
   * 设置用户是否在建议行
   */
  setUserOnSuggestionLine(value: boolean): void {
    this.userOnSuggestionLine = value;
  }

  /**
   * 清空建议
   */
  clear(): void {
    this.suggestionQueue.clear();
    this.userOnSuggestionLine = false;
    this.renderer.clear();
  }

  /**
   * 添加建议到队列
   */
  addPredictions(predictions: Prediction[]): void {
    this.suggestionQueue.add(predictions);
  }
}
