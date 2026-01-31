/**
 * NES Engine - Next Edit Suggestion 引擎
 * 负责调用后端 API 进行症状检测和编辑预测
 */

import * as monaco from 'monaco-editor';
import type { EditRecord, Prediction, NESConfig, Symptom } from '../types/index';
import { SymptomDetector } from '../shared/SymptomDetector';
import { SuggestionQueue } from './SuggestionQueue';
import { NESRenderer } from './NESRenderer';
import { DiffCalculator } from '../shared/DiffCalculator';
import { PositionFinder } from '../shared/PositionFinder'; // ✅ 新增

export class NESEngine {
  private state: 'SLEEPING' | 'DIAGNOSING' | 'SUGGESTING' = 'SLEEPING';
  private previewShown: boolean = false; // 当前建议是否已展开预览
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
    console.log('[NESEngine] Received predictions:', predictions.length, 'items');

    // 获取编辑器模型
    const model = this.editor.getModel();
    if (!model) {
      console.error('[NESEngine] No model available');
      return;
    }

    // 过滤并处理每个预测
    const processedPredictions = predictions
      .filter(pred => {
        // 验证行号范围
        if (pred.targetLine < 1 || pred.targetLine > model.getLineCount()) {
          console.warn('[NESEngine] Invalid line number:', pred.targetLine);
          return false;
        }

        // 验证 originalLineContent 与实际行内容是否匹配
        const actualLine = model.getLineContent(pred.targetLine);
        if (pred.originalLineContent) {
          const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
          const expectedNormalized = normalize(pred.originalLineContent);
          const actualNormalized = normalize(actualLine);

          if (expectedNormalized !== actualNormalized) {
            // 计算相似度，如果太低则跳过
            const similarity = this.calculateSimilarity(expectedNormalized, actualNormalized);
            if (similarity < 0.8) {
              console.warn('[NESEngine] Content mismatch, skipping prediction:', {
                targetLine: pred.targetLine,
                expected: pred.originalLineContent,
                actual: actualLine,
                similarity: similarity.toFixed(2)
              });
              return false;
            }
            console.log('[NESEngine] Content similar enough, proceeding:', similarity.toFixed(2));
          }
        }

        return true;
      })
      .map(pred => {
      // 如果没有 originalLineContent，从模型中获取
      const originalLine = pred.originalLineContent || model.getLineContent(pred.targetLine);
      
      // ✅ 策略 1：优先使用上下文匹配（准确率 90%+）
      if (pred.context) {
        console.log('[NESEngine] Trying context matching for line', pred.targetLine);
        
        const position = PositionFinder.findByContext(originalLine, pred.context);
        
        if (position) {
          console.log('[NESEngine] ✓ Context matching succeeded', {
            line: pred.targetLine,
            startColumn: position.startColumn,
            endColumn: position.endColumn,
            target: pred.context.target,
          });
          
          // 根据 changeType 构造完整的位置信息
          if (pred.changeType === 'REPLACE_WORD') {
            return {
              ...pred,
              originalLineContent: originalLine,
              wordReplaceInfo: {
                word: pred.context.target,
                replacement: '', // 将从 suggestionText 中提取
                startColumn: position.startColumn,
                endColumn: position.endColumn,
              },
            };
          } else if (pred.changeType === 'INLINE_INSERT') {
            return {
              ...pred,
              originalLineContent: originalLine,
              inlineInsertInfo: {
                content: '', // 将从 suggestionText 中提取
                insertColumn: position.startColumn,
              },
            };
          }
        } else {
          console.warn('[NESEngine] ✗ Context matching failed, will fallback to DiffCalculator');
        }
      }
      
      // ✅ 策略 2：降级到 DiffCalculator（兜底方案）
      console.log('[NESEngine] Using DiffCalculator for line', pred.targetLine);
      const diff = DiffCalculator.detectChangeType(originalLine, pred.suggestionText);
      
      console.log('[NESEngine] Auto-calculated diff:', {
        line: pred.targetLine,
        changeType: diff.changeType,
        wordReplaceInfo: diff.wordReplaceInfo,
        inlineInsertInfo: diff.inlineInsertInfo
      });

      // 返回增强后的预测
      return {
        ...pred,
        originalLineContent: originalLine,
        changeType: diff.changeType,
        wordReplaceInfo: diff.wordReplaceInfo,
        inlineInsertInfo: diff.inlineInsertInfo
      };
    });

    // 按优先级排序
    const sorted = processedPredictions.sort((a, b) => {
      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;
      return priorityB - priorityA;
    });

    // 一次性加入队列（传入整个数组）
    this.suggestionQueue.enqueue(sorted);
    console.log('[NESEngine] Queue size after enqueue:', this.suggestionQueue.size());

    this.state = 'SUGGESTING';
    this.showFirstSuggestion();
  }

  /**
   * 显示第一个建议（只显示 Glyph，不展开预览）
   */
  private showFirstSuggestion(): void {
    const prediction = this.suggestionQueue.peek();
    if (prediction) {
      console.log('[NESEngine] Showing suggestion (Glyph only):', prediction);
      
      // 计算进度
      const current = this.suggestionQueue.getCurrentIndex() + 1;
      const total = this.suggestionQueue.size();
      const progress = total > 1 ? `${current}/${total}` : undefined;
      
      // 只显示 Glyph 和 HintBar，不展开预览
      this.renderer.renderSuggestion(prediction);
      this.renderer.showHintBar(prediction.targetLine, prediction.explanation, false, progress);
      
      // 设置预览状态为未展开
      this.previewShown = false;
    }
  }

  /**
   * 切换到预览模式（Tab 键触发）
   */
  public togglePreview(): void {
    const prediction = this.suggestionQueue.peek();
    if (!prediction) {
      console.log('[NESEngine] No suggestion to preview');
      return;
    }

    if (!this.previewShown) {
      console.log('[NESEngine] Expanding preview');
      
      // 跳转到建议位置
      this.editor.setPosition({
        lineNumber: prediction.targetLine,
        column: 1
      });
      this.editor.revealLineInCenter(prediction.targetLine);
      
      // 展开预览
      this.renderer.showPreview(prediction);
      
      // 计算进度
      const current = this.suggestionQueue.getCurrentIndex() + 1;
      const total = this.suggestionQueue.size();
      const progress = total > 1 ? `${current}/${total}` : undefined;
      
      // 更新 HintBar 提示（显示 "Tab Accept"）
      this.renderer.showHintBar(prediction.targetLine, prediction.explanation, true, progress);
      
      // 更新状态
      this.previewShown = true;
    } else {
      console.log('[NESEngine] Preview already shown');
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
    console.log('[NESEngine] Remaining suggestions:', this.suggestionQueue.size());

    // 使用新的 API：applySuggestion（自动根据 changeType 处理）
    this.renderer.applySuggestion(prediction);

    // 重置预览状态
    this.previewShown = false;

    // 显示下一个建议
    if (this.suggestionQueue.peek()) {
      console.log('[NESEngine] Showing next suggestion');
      this.showFirstSuggestion();
    } else {
      console.log('[NESEngine] All suggestions processed, going to sleep');
      this.sleep();
    }

    // 通知主入口标记为 NES 编辑
    if (this.onEditApplied) {
      this.onEditApplied(prediction.targetLine);
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
    console.log('[NESEngine] Remaining suggestions:', this.suggestionQueue.size());

    // 清除渲染
    this.renderer.clear();

    // 重置预览状态
    this.previewShown = false;

    // 显示下一个建议
    if (this.suggestionQueue.peek()) {
      console.log('[NESEngine] Showing next suggestion');
      this.showFirstSuggestion();
    } else {
      console.log('[NESEngine] All suggestions processed, going to sleep');
      this.sleep();
    }
  }

  /**
   * 关闭当前建议（不跳过，保持在队列中）
   */
  closeSuggestion(): void {
    console.log('[NESEngine] Closing suggestion preview');
    
    // 只清除渲染，不移除队列
    this.renderer.clear();
    
    // 如果还有建议，重新显示（只显示 Glyph 和 HintBar）
    const prediction = this.suggestionQueue.peek();
    if (prediction) {
      // 计算进度
      const current = this.suggestionQueue.getCurrentIndex() + 1;
      const total = this.suggestionQueue.size();
      const progress = total > 1 ? `${current}/${total}` : undefined;
      
      this.renderer.renderSuggestion(prediction);
      this.renderer.showHintBar(prediction.targetLine, prediction.explanation, false, progress);
    }
  }

  /**
   * 完全关闭 NES（清除队列并进入睡眠）
   */
  closeCompletely(): void {
    console.log('[NESEngine] Closing NES completely');
    
    // 清除渲染
    this.renderer.clear();
    
    // 清除队列并进入睡眠
    this.sleep();
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
   * 检查预览是否已展开
   */
  isPreviewShown(): boolean {
    return this.previewShown;
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

  /**
   * 计算两个字符串的相似度（Levenshtein 距离）
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const len1 = str1.length;
    const len2 = str2.length;

    // 创建距离矩阵
    const matrix: number[][] = [];
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // 填充矩阵
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // 删除
          matrix[i][j - 1] + 1,      // 插入
          matrix[i - 1][j - 1] + cost // 替换
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  }
}
