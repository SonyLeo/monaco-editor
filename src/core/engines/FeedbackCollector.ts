/**
 * 用户反馈收集器
 * 负责记录用户对建议的反馈（接受、跳过、拒绝）
 */

import type { Prediction } from '../../types/nes';

export interface FeedbackRecord {
  prediction: Prediction;
  action: 'accepted' | 'skipped' | 'rejected';
  timestamp: number;
}

export class FeedbackCollector {
  private feedbackHistory: FeedbackRecord[] = [];
  private readonly MAX_FEEDBACK_HISTORY = 20;

  /**
   * 记录用户反馈
   */
  recordFeedback(
    prediction: Prediction,
    action: 'accepted' | 'skipped' | 'rejected'
  ): void {
    this.feedbackHistory.push({
      prediction,
      action,
      timestamp: Date.now()
    });

    // 保留最近 N 条反馈
    if (this.feedbackHistory.length > this.MAX_FEEDBACK_HISTORY) {
      this.feedbackHistory = this.feedbackHistory.slice(-this.MAX_FEEDBACK_HISTORY);
    }

    console.log(`[FeedbackCollector] User ${action} suggestion at line ${prediction.targetLine}`);
  }

  /**
   * 获取最近的反馈
   */
  getRecentFeedback(count: number = 5): Array<{
    targetLine: number;
    action: 'accepted' | 'skipped' | 'rejected';
    suggestionText: string;
    timestamp: number;
  }> {
    return this.feedbackHistory.slice(-count).map(fb => ({
      targetLine: fb.prediction.targetLine,
      action: fb.action,
      suggestionText: fb.prediction.suggestionText,
      timestamp: fb.timestamp
    }));
  }

  /**
   * 清空反馈历史
   */
  clear(): void {
    this.feedbackHistory = [];
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    accepted: number;
    skipped: number;
    rejected: number;
    acceptanceRate: number;
  } {
    const total = this.feedbackHistory.length;
    const accepted = this.feedbackHistory.filter(f => f.action === 'accepted').length;
    const skipped = this.feedbackHistory.filter(f => f.action === 'skipped').length;
    const rejected = this.feedbackHistory.filter(f => f.action === 'rejected').length;

    return {
      total,
      accepted,
      skipped,
      rejected,
      acceptanceRate: total > 0 ? accepted / total : 0
    };
  }
}
