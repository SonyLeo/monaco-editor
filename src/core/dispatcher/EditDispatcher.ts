/**
 * EditDispatcher
 * 智能分发器：决定编辑事件应该由 FIM 还是 NES 处理
 * 
 * 核心职责：
 * 1. 症状检测：识别需要 NES 介入的场景
 * 2. 智能分发：将编辑事件路由到 FIM 或 NES
 * 3. FIM 锁定：NES 工作时锁定 FIM
 * 4. 状态管理：管理 NES 的生命周期
 */

import * as monaco from 'monaco-editor';
import type { EditRecord } from '../../types/nes';
import type { DispatchResult, DispatcherState, Symptom, NESState } from '../../types/dispatcher';
import { SymptomDetector } from './SymptomDetector';

export class EditDispatcher {
  private state: DispatcherState = {
    nesState: 'SLEEPING',
    fimLocked: false,
    lockUntil: 0,
    lastSymptom: null
  };

  private symptomDetector: SymptomDetector;
  private nesLocked = false;
  private nesLockUntil = 0;

  constructor() {
    this.symptomDetector = new SymptomDetector();
  }

  /**
   * 设置 Monaco Model（用于语义分析）
   */
  setModel(model: monaco.editor.ITextModel): void {
    this.symptomDetector.setModel(model);
    console.log('[EditDispatcher] ✅ Semantic analyzer enabled');
  }

  /**
   * 分发编辑事件
   * @param editHistory 最近的编辑历史
   * @returns 分发结果
   */
  async dispatch(editHistory: EditRecord[]): Promise<DispatchResult> {
    // 规则 1：如果 NES 正在工作，不分发给 FIM
    if (this.state.nesState !== 'SLEEPING') {
      return {
        target: 'NES',
        reason: `NES is ${this.state.nesState.toLowerCase()}`
      };
    }

    // 规则 2：如果 NES 在冷却期，不分发给 NES
    if (this.isNESLocked()) {
      return {
        target: 'FIM',
        reason: 'NES is cooling down'
      };
    }

    // 规则 3：如果 FIM 被锁定，不分发给 FIM
    if (this.isFIMLocked()) {
      return {
        target: 'NES',
        reason: 'FIM is locked'
      };
    }

    // 规则 4：检测症状（使用语义分析）
    const symptom = await this.symptomDetector.detect(editHistory);

    if (symptom) {
      // 发现症状，唤醒 NES
      this.state.lastSymptom = symptom;
      this.state.nesState = 'DIAGNOSING';
      
      console.log(`[Dispatcher] 🩺 Symptom detected: ${symptom.type} (confidence: ${symptom.confidence})`);
      
      return {
        target: 'NES',
        reason: `Symptom detected: ${symptom.description}`,
        symptom
      };
    }

    // 规则 5：默认分发给 FIM
    return {
      target: 'FIM',
      reason: 'Normal editing'
    };
  }

  /**
   * 锁定 FIM
   * @param durationMs 锁定时长（毫秒）
   */
  lockFIM(durationMs: number): void {
    this.state.fimLocked = true;
    this.state.lockUntil = Date.now() + durationMs;

    console.log(`[Dispatcher] 🔒 FIM locked for ${durationMs}ms`);

    setTimeout(() => {
      this.unlockFIM();
    }, durationMs);
  }

  /**
   * 解锁 FIM
   */
  private unlockFIM(): void {
    if (Date.now() >= this.state.lockUntil) {
      this.state.fimLocked = false;
      console.log('[Dispatcher] 🔓 FIM unlocked');
    }
  }

  /**
   * 检查 FIM 是否被锁定
   */
  isFIMLocked(): boolean {
    if (this.state.fimLocked && Date.now() >= this.state.lockUntil) {
      this.unlockFIM();
    }
    return this.state.fimLocked;
  }

  /**
   * 锁定 NES（冷却期）
   * @param durationMs 冷却时长（毫秒）
   */
  lockNES(durationMs: number): void {
    this.nesLocked = true;
    this.nesLockUntil = Date.now() + durationMs;

    console.log(`[Dispatcher] ❄️ NES cooling down for ${durationMs}ms`);

    setTimeout(() => {
      this.unlockNES();
    }, durationMs);
  }

  /**
   * 解锁 NES
   */
  private unlockNES(): void {
    if (Date.now() >= this.nesLockUntil) {
      this.nesLocked = false;
      console.log('[Dispatcher] 🔥 NES cooled down');
    }
  }

  /**
   * 检查 NES 是否在冷却期
   */
  isNESLocked(): boolean {
    if (this.nesLocked && Date.now() >= this.nesLockUntil) {
      this.unlockNES();
    }
    return this.nesLocked;
  }

  /**
   * 更新 NES 状态
   */
  setNESState(state: NESState): void {
    const oldState = this.state.nesState;
    this.state.nesState = state;
    
    if (oldState !== state) {
      console.log(`[Dispatcher] NES state: ${oldState} → ${state}`);
    }

    // 如果 NES 回到休眠，清除症状
    if (state === 'SLEEPING') {
      this.state.lastSymptom = null;
    }
  }

  /**
   * NES 完成工作（回到休眠）
   */
  onNESComplete(): void {
    this.setNESState('SLEEPING');
    console.log('[Dispatcher] 😴 NES completed, going to sleep');
  }

  /**
   * 获取当前 NES 状态
   */
  getNESState(): NESState {
    return this.state.nesState;
  }

  /**
   * 获取最后检测到的症状
   */
  getLastSymptom(): Symptom | null {
    return this.state.lastSymptom;
  }

  /**
   * 检查是否应该处理 Tab 键
   * @returns true 表示有建议可以接受
   */
  shouldHandleTab(): boolean {
    // 如果 NES 正在提供建议，Tab 键应该由 NES 处理
    return this.state.nesState === 'SUGGESTING';
  }

  /**
   * 重置 Dispatcher（用于测试）
   */
  reset(): void {
    this.state = {
      nesState: 'SLEEPING',
      fimLocked: false,
      lockUntil: 0,
      lastSymptom: null
    };
    this.nesLocked = false;
    this.nesLockUntil = 0;
  }
}
