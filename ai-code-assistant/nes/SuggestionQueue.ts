/**
 * Suggestion Queue - 建议队列管理
 */

import type { Prediction } from '../types/index';

export class SuggestionQueue {
  private queue: Prediction[] = [];
  private currentIndex = 0;

  /**
   * 添加建议到队列
   */
  enqueue(predictions: Prediction[]): void {
    this.queue = predictions;
    this.currentIndex = 0;
    console.log('[SuggestionQueue] Enqueued', predictions.length, 'predictions');
  }

  /**
   * 获取当前建议
   */
  peek(): Prediction | null {
    if (this.currentIndex < this.queue.length) {
      return this.queue[this.currentIndex];
    }
    return null;
  }

  /**
   * 移到下一个建议
   */
  next(): Prediction | null {
    if (this.currentIndex < this.queue.length - 1) {
      this.currentIndex++;
      return this.peek();
    }
    return null;
  }

  /**
   * 移到上一个建议
   */
  previous(): Prediction | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.peek();
    }
    return null;
  }

  /**
   * 移除当前建议
   */
  dequeue(): Prediction | null {
    const current = this.peek();
    if (current) {
      this.queue.splice(this.currentIndex, 1);
      if (this.currentIndex >= this.queue.length && this.currentIndex > 0) {
        this.currentIndex--;
      }
    }
    return current;
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = [];
    this.currentIndex = 0;
  }

  /**
   * 获取队列大小
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * 获取当前位置
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * 检查是否有更多建议
   */
  hasMore(): boolean {
    return this.currentIndex < this.queue.length - 1;
  }
}
