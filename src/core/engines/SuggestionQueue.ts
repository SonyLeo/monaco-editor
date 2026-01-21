/**
 * 建议队列管理器
 * 负责管理多个建议的存储、遍历和状态跟踪
 */

import type { Prediction } from '../../types/nes';

export class SuggestionQueue {
  private queue: Prediction[] = [];
  private currentIndex = 0;

  /**
   * 添加建议到队列（会清空现有队列）
   */
  add(predictions: Prediction[]): void {
    this.queue = [...predictions];
    this.currentIndex = 0;
    console.log(`[SuggestionQueue] Added ${predictions.length} suggestion(s)`);
  }

  /**
   * 获取当前建议
   */
  current(): Prediction | null {
    if (this.currentIndex >= this.queue.length) {
      return null;
    }
    return this.queue[this.currentIndex] || null;
  }

  /**
   * 移动到下一个建议
   * @returns 下一个建议，如果没有则返回 null
   */
  next(): Prediction | null {
    this.currentIndex++;
    return this.current();
  }

  /**
   * 跳过当前建议，移动到下一个
   * @returns 被跳过的建议
   */
  skip(): Prediction | null {
    const skipped = this.current();
    this.currentIndex++;
    return skipped;
  }

  /**
   * 清空队列
   */
  clear(): void {
    const remaining = this.queue.length - this.currentIndex;
    if (remaining > 0) {
      console.log(`[SuggestionQueue] Clearing ${remaining} remaining suggestion(s)`);
    }
    this.queue = [];
    this.currentIndex = 0;
  }

  /**
   * 获取剩余建议数量
   */
  get remaining(): number {
    return Math.max(0, this.queue.length - this.currentIndex);
  }

  /**
   * 获取总建议数
   */
  get total(): number {
    return this.queue.length;
  }

  /**
   * 获取当前索引
   */
  get index(): number {
    return this.currentIndex;
  }

  /**
   * 队列是否为空
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * 是否还有更多建议
   */
  get hasMore(): boolean {
    return this.currentIndex < this.queue.length;
  }

  /**
   * 获取进度信息
   */
  getProgress(): { current: number; total: number; remaining: number } {
    return {
      current: this.currentIndex + 1,
      total: this.total,
      remaining: this.remaining
    };
  }

  /**
   * 检查指定行号是否在队列中
   */
  containsLine(lineNumber: number): boolean {
    return this.queue.some(p => p.targetLine === lineNumber);
  }

  /**
   * 获取所有队列中的行号
   */
  getAllLines(): number[] {
    return this.queue.map(p => p.targetLine);
  }
}
