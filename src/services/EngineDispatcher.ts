/**
 * EngineDispatcher - FIM/NES 协调器
 * 职责：
 * 1. 协调 FIM 和 NES 的互斥关系
 * 2. 管理 NES 唤醒的防抖和保护期
 * 3. 处理编辑来源标记（user/fim/nes）
 */

import type { FIMEngine } from '@/engines/FIMEngine';
import type { NESEngine } from '@/engines/NESEngine';
import type { EditHistoryManager } from '@/services/EditHistoryManager';
import { logger } from '@/utils/logger';

export class EngineDispatcher {
  private nesActive = false;
  private debounceTimer: number | null = null;
  private nesEditProtectionUntil = 0; // NES 编辑保护期（时间戳）
  private nextEditIsNES = false;
  private nextEditIsFIM = false;

  constructor(
    private fimEngine: FIMEngine | null,
    private nesEngine: NESEngine | null,
    private editHistory: EditHistoryManager,
    private debounceMs: number = 3000
  ) {
    // 设置 NES 编辑回调
    if (this.nesEngine) {
      this.nesEngine.setOnEditApplied(() => {
        this.nextEditIsNES = true;
        // 设置 2 秒保护期，期间不触发新的 NES 检测
        this.nesEditProtectionUntil = Date.now() + 2000;
      });
    }
  }

  /**
   * 检查 FIM 是否被锁定
   */
  isFIMLocked(): boolean {
    return this.nesActive;
  }

  /**
   * 获取 NES 状态
   */
  isNESActive(): boolean {
    return this.nesActive;
  }

  /**
   * 标记下一次编辑来自 FIM
   */
  markNextEditAsFIM(): void {
    this.nextEditIsFIM = true;
  }

  /**
   * 获取当前编辑来源
   */
  getEditSource(): 'user' | 'fim' | 'nes' {
    if (this.nextEditIsFIM) return 'fim';
    if (this.nextEditIsNES) return 'nes';
    return 'user';
  }

  /**
   * 重置编辑来源标记
   */
  resetEditSource(): void {
    if (this.nextEditIsFIM) {
      this.nextEditIsFIM = false;
    }
    if (this.nextEditIsNES) {
      this.nextEditIsNES = false;
    }
  }

  /**
   * 检查是否应该跳过 NES 检测
   */
  shouldSkipNESDetection(): boolean {
    // NES 编辑不触发新的检测
    if (this.nextEditIsNES) {
      return true;
    }

    // NES 未启用
    if (!this.nesEngine) {
      return true;
    }

    // 检查保护期
    if (Date.now() < this.nesEditProtectionUntil) {
      return true;
    }

    // 如果 NES 已经激活，不触发新的检测
    if (this.nesEngine.isActive()) {
      return true;
    }

    return false;
  }

  /**
   * 触发 NES 检测（带防抖）
   */
  async triggerNESDetection(): Promise<void> {
    if (this.shouldSkipNESDetection()) {
      return;
    }

    // 清除之前的防抖定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // 防抖处理
    this.debounceTimer = window.setTimeout(async () => {
      // 等待 FIM 决策
      if (this.fimEngine && this.fimEngine.hasGhostText()) {
        await this.fimEngine.waitForDecision(5000);
      }

      const recentEdits = this.editHistory.getRecentEdits(10);
      
      // 再次检查 NES 是否激活（防抖期间可能已激活）
      if (this.nesEngine!.isActive()) {
        return;
      }

      // 唤醒 NES
      await this.nesEngine!.wakeUp(recentEdits);

      // 更新状态并锁定/解锁 FIM
      this.updateNESState();
    }, this.debounceMs);
  }

  /**
   * 更新 NES 状态并同步 FIM 锁定
   */
  private updateNESState(): void {
    const wasActive = this.nesActive;
    this.nesActive = this.nesEngine?.isActive() ?? false;

    if (wasActive !== this.nesActive) {
      logger.debug('[EngineDispatcher] NES active:', this.nesActive);
    }

    // 同步 FIM 锁定状态
    if (this.fimEngine) {
      if (this.nesActive) {
        this.fimEngine.lock();
      } else {
        this.fimEngine.unlock();
      }
    }
  }

  /**
   * 关闭 NES 并解锁 FIM
   */
  closeNES(): void {
    if (this.nesEngine && this.nesEngine.isActive()) {
      this.nesEngine.closeCompletely();
      this.nesActive = false;
      
      if (this.fimEngine) {
        this.fimEngine.unlock();
      }
      
      logger.debug('[EngineDispatcher] NES closed, FIM unlocked');
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

