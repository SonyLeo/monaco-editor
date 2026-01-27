/**
 * Edit Dispatcher - FIM/NES 协调器（简化版）
 * 只负责协调 FIM 锁定状态，不做症状检测
 */

export class EditDispatcher {
  private nesActive = false;

  /**
   * 检查 FIM 是否被锁定
   */
  isFIMLocked(): boolean {
    return this.nesActive;
  }

  /**
   * 设置 NES 状态
   */
  setNESActive(active: boolean): void {
    this.nesActive = active;
    console.log('[EditDispatcher] NES active:', active);
  }

  /**
   * 获取 NES 状态
   */
  isNESActive(): boolean {
    return this.nesActive;
  }
}
