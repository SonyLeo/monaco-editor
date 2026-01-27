/**
 * NES Engine - Next Edit Suggestion 引擎
 * 负责调用后端 API 进行症状检测和编辑预测
 */

import * as monaco from 'monaco-editor';
import type { EditRecord, Prediction, NESConfig, Symptom } from '../types/index';
import { SymptomDetector } from '../shared/SymptomDetector';
import { SuggestionQueue } from './SuggestionQueue';
import { NESRenderer } from './NESRenderer';

export class NESEngine {
  private state: 'SLEEPING' | 'DIAGNOSING' | 'SUGGESTING' = 'SLEEPING';
  private symptomDetector: SymptomDetector;
  private suggestionQueue: SuggestionQueue;
  private renderer: NESRenderer;
  private abortController: AbortController | null = null;
  private onEditApplied?: (lineNumber: number) => void;

  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    private config: NESConfig
  ) {
    this.symptomDetector = new SymptomDetector();
    this.suggestionQueue = new SuggestionQueue();
    this.renderer = new NESRenderer(editor);
    
    const model = editor.getModel();
    if (model) {
      this.symptomDetector.setModel(model);
    }
  }

  /**
   * 设置编辑应用回调
   */
  setOnEditApplied(callback: (lineNumber: number) => void): void {
    this.onEditApplied = callback;
  }

  /**
   * 唤醒 NES（检测症状并获取预测）
   */
  async wakeUp(editHistory: EditRecord[]): Promise<void> {
    if (this.state !== 'SLEEPING') {
      console.log('[NESEngine] Already active, skipping');
      return;
    }

    // 准备 payload
    const payload = this.symptomDetector.preparePayload(editHistory);
    if (!payload) {
      console.log('[NESEngine] No payload to send');
      return;
    }

    this.state = 'DIAGNOSING';
    console.log('[NESEngine] Waking up, calling API...', payload);

    try {
      // 取消之前的请求
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();

      // 调用后端 API
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[NESEngine] API response:', data);

      // 处理症状信息
      if (data.symptom) {
        this.handleSymptom(data.symptom);
      }

      // 处理预测结果
      // 后端返回: { symptom?, predictions: [...], totalCount, hasMore, requestId }
      if (data.predictions && data.predictions.length > 0) {
        console.log(`[NESEngine] Received ${data.totalCount || data.predictions.length} predictions`);
        this.handlePredictions(data.predictions);
      } else {
        console.log('[NESEngine] No predictions, going back to sleep');
        this.sleep();
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[NESEngine] Request aborted');
      } else {
        console.error('[NESEngine] API call failed:', error);
      }
      this.sleep();
    }
  }

  /**
   * 处理症状
   */
  private handleSymptom(symptom: Symptom): void {
    console.log('[NESEngine] Symptom detected:', symptom);
    // 可以触发事件通知外部
  }

  /**
   * 处理预测结果
   */
  private handlePredictions(predictions: Prediction[]): void {
    console.log('[NESEngine] Received predictions:', predictions);

    // 按优先级排序
    const sorted = predictions.sort((a, b) => {
      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;
      return priorityB - priorityA;
    });

    // 加入队列（逐个添加）
    sorted.forEach(p => this.suggestionQueue.enqueue([p]));

    this.state = 'SUGGESTING';
    this.showFirstSuggestion();
  }

  /**
   * 显示第一个建议
   */
  private showFirstSuggestion(): void {
    const prediction = this.suggestionQueue.peek();
    if (prediction) {
      console.log('[NESEngine] Showing suggestion:', prediction);
      this.renderer.showSuggestion(prediction);
    }
  }

  /**
   * 接受当前建议
   */
  acceptSuggestion(): void {
    const prediction = this.suggestionQueue.dequeue();
    if (!prediction) {
      console.log('[NESEngine] No suggestion to accept');
      return;
    }

    console.log('[NESEngine] Accepting suggestion:', prediction);

    // 应用编辑
    this.applyEdit(prediction);

    // 清除渲染
    this.renderer.clear();

    // 显示下一个建议
    if (this.suggestionQueue.peek()) {
      this.showFirstSuggestion();
    } else {
      console.log('[NESEngine] All suggestions processed, going to sleep');
      this.sleep();
    }
  }

  /**
   * 跳过当前建议
   */
  skipSuggestion(): void {
    const prediction = this.suggestionQueue.dequeue();
    if (!prediction) {
      console.log('[NESEngine] No suggestion to skip');
      return;
    }

    console.log('[NESEngine] Skipping suggestion:', prediction);

    // 清除渲染
    this.renderer.clear();

    // 显示下一个建议
    if (this.suggestionQueue.peek()) {
      this.showFirstSuggestion();
    } else {
      console.log('[NESEngine] All suggestions processed, going to sleep');
      this.sleep();
    }
  }

  /**
   * 应用编辑
   */
  private applyEdit(prediction: Prediction): void {
    const model = this.editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    if (prediction.targetLine < 1 || prediction.targetLine > lineCount) {
      console.error('[NESEngine] Invalid target line:', prediction.targetLine);
      return;
    }

    // 替换整行
    const lineContent = model.getLineContent(prediction.targetLine);
    const range = new monaco.Range(
      prediction.targetLine,
      1,
      prediction.targetLine,
      lineContent.length + 1
    );

    // 应用编辑
    model.pushEditOperations(
      [],
      [{ range, text: prediction.suggestionText }],
      () => null
    );

    console.log('[NESEngine] Edit applied at line', prediction.targetLine);

    // 通知主入口标记为 NES 编辑
    if (this.onEditApplied) {
      this.onEditApplied(prediction.targetLine);
    }

    // 移动光标到修改位置（行尾）
    const newColumn = prediction.suggestionText.length + 1;
    this.editor.setPosition({
      lineNumber: prediction.targetLine,
      column: newColumn
    });

    // 聚焦编辑器
    this.editor.focus();

    console.log('[NESEngine] Cursor moved to line', prediction.targetLine, 'column', newColumn);
  }

  /**
   * 进入睡眠状态
   */
  sleep(): void {
    this.state = 'SLEEPING';
    this.suggestionQueue.clear();
    console.log('[NESEngine] Going to sleep');
  }

  /**
   * 检查是否激活
   */
  isActive(): boolean {
    return this.state !== 'SLEEPING';
  }

  /**
   * 获取当前状态
   */
  getState(): string {
    return this.state;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.renderer.dispose();
    this.sleep();
  }
}
