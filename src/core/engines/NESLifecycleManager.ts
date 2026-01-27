/**
 * NES 生命周期管理器
 * 负责 NES 的状态转换和诊断流程
 * 
 * 生命周期：SLEEPING → DIAGNOSING → SUGGESTING → TREATING → SLEEPING
 */

import type { Symptom } from '../../types/dispatcher';
import type { Prediction, NESPayload, DiffInfo, EditRecord } from '../../types/nes';
import { PredictionService } from './PredictionService';
import { CoordinateFixer } from '../utils/CoordinateFixer';
import { NES_CONFIG } from '../config';
import * as monaco from 'monaco-editor';

export class NESLifecycleManager {
  private lifecycleState: 'SLEEPING' | 'DIAGNOSING' | 'SUGGESTING' | 'TREATING' = 'SLEEPING';

  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    private predictionService: PredictionService,
    private coordinateFixer: CoordinateFixer,
    private onStateChange: (state: string) => void
  ) {}

  /**
   * 唤醒 NES（由 Dispatcher 调用）
   */
  async wakeUp(symptom: Symptom, editHistory: EditRecord[] = []): Promise<Prediction[] | null> {
    if (this.lifecycleState !== 'SLEEPING') {
      console.warn(
        `[NESLifecycleManager] Already ${this.lifecycleState}, ignoring wake up`,
      );
      return null;
    }

    this.setState('DIAGNOSING');
    console.log(
      `[NESLifecycleManager] 🩺 Woke up for: ${symptom.type} (${symptom.description})`,
    );

    return await this.diagnose(symptom, editHistory);
  }

  /**
   * 诊断症状并返回预测
   */
  private async diagnose(symptom: Symptom, editHistory: EditRecord[] = []): Promise<Prediction[] | null> {
    const diffInfo = this.calculateDiffFromSymptom(symptom);

    // 构建 payload
    const payload = this.buildSmartPayload(this.editor.getValue(), diffInfo, editHistory);

    try {
      const apiResponse = await this.predictionService.predict(payload);

      // 检查是否有建议
      if (
        !apiResponse ||
        !apiResponse.predictions ||
        apiResponse.predictions.length === 0
      ) {
        console.log('[NESLifecycleManager] No predictions returned');
        return null;
      }

      const predictions = apiResponse.predictions;
      console.log(
        `[NESLifecycleManager] Received ${predictions.length} prediction(s)`,
      );

      // 🔧 修复坐标：使用 CoordinateFixer 工具类
      const fixedPredictions = predictions.map((pred) =>
        this.coordinateFixer.fix(pred),
      );

      return fixedPredictions;
    } catch (error: any) {
      if (error.message !== 'Request aborted') {
        console.error('[NESLifecycleManager] Prediction error:', error);
      }
      return null;
    }
  }

  /**
   * 从症状计算 DiffInfo
   */
  private calculateDiffFromSymptom(symptom: Symptom): DiffInfo {
    // 如果有受影响的行号，使用它
    if (symptom.affectedLine) {
      return {
        type: 'REPLACE',
        lines: [symptom.affectedLine],
        changes: [],
        summary: symptom.description,
        range: {
          start: symptom.affectedLine,
          end: symptom.affectedLine,
        },
      };
    }

    // 否则使用传统的 diff 计算
    return {
      type: 'REPLACE',
      lines: [1],
      changes: [],
      summary: symptom.description,
      range: { start: 1, end: 1 },
    };
  }

  /**
   * 滑动窗口：只发送变更区域 ±30 行
   */
  private buildSmartPayload(
    currentCode: string,
    diffInfo: DiffInfo,
    editHistory: EditRecord[] = []
  ): NESPayload {
    const lines = currentCode.split('\n');
    const changedLine = diffInfo.lines[0] || 1;

    const windowStart = Math.max(
      0,
      changedLine - NES_CONFIG.WINDOW.WINDOW_SIZE - 1,
    );
    const windowEnd = Math.min(
      lines.length,
      changedLine + NES_CONFIG.WINDOW.WINDOW_SIZE,
    );

    const codeWindow = lines.slice(windowStart, windowEnd).join('\n');

    return {
      codeWindow,
      windowInfo: {
        startLine: windowStart + 1,
        totalLines: lines.length,
      },
      diffSummary: diffInfo.summary || `Changed line ${changedLine}`,
      editHistory,
      userFeedback: undefined,
      requestId: 0,
    };
  }

  /**
   * 转换到建议阶段
   */
  toSuggesting(): void {
    this.setState('SUGGESTING');
  }

  /**
   * 转换到治疗阶段
   */
  toTreating(): void {
    this.setState('TREATING');
  }

  /**
   * 回到休眠
   */
  sleep(): void {
    this.setState('SLEEPING');
  }

  /**
   * 获取当前生命周期状态
   */
  getState(): 'SLEEPING' | 'DIAGNOSING' | 'SUGGESTING' | 'TREATING' {
    return this.lifecycleState;
  }

  /**
   * 更新快照
   */
  updateSnapshot(_snapshot: string): void {
    // 快照在诊断时自动更新
  }

  /**
   * 设置状态并通知
   */
  private setState(state: typeof this.lifecycleState): void {
    if (this.lifecycleState !== state) {
      this.lifecycleState = state;
      this.onStateChange(state);
      console.log(`[NESLifecycleManager] State: ${state}`);
    }
  }
}
