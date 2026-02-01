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
import { PositionFinder } from '../shared/PositionFinder';
import { logger } from '../shared/logger';

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
      return;
    }

    // 准备 payload
    const payload = this.symptomDetector.preparePayload(editHistory);
    if (!payload) {
      return;
    }

    this.state = 'DIAGNOSING';

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

      // 处理症状信息
      if (data.symptom) {
        this.handleSymptom(data.symptom);
      }

      // 处理预测结果
      // 后端返回: { symptom?, predictions: [...], totalCount, hasMore, requestId }
      if (data.predictions && data.predictions.length > 0) {
        this.handlePredictions(data.predictions);
      } else {
        this.sleep();
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
      } else {
        logger.error('[NESEngine] API call failed:', error);
      }
      this.sleep();
    }
  }

  /**
   * 处理症状
   */
  private handleSymptom(_symptom: Symptom): void {
    // 可以触发事件通知外部
  }

  /**
   * 处理预测结果
   */
  private handlePredictions(predictions: Prediction[]): void {

    // 获取编辑器模型
    const model = this.editor.getModel();
    if (!model) {
      logger.error('[NESEngine] No model available');
      return;
    }

    // 过滤并处理每个预测
    const processedPredictions = predictions
      .filter(pred => {
        // 验证行号范围
        if (pred.targetLine < 1 || pred.targetLine > model.getLineCount()) {
          logger.warn('[NESEngine] Invalid line number:', pred.targetLine);
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
              logger.warn('[NESEngine] Content mismatch, skipping prediction:', {
                targetLine: pred.targetLine,
                expected: pred.originalLineContent,
                actual: actualLine,
                similarity: similarity.toFixed(2)
              });
              return false;
            }
          }
        }

        return true;
      })
      .map(pred => {
      // 获取编辑器当前的行内容（用于定位）
      const actualLine = model.getLineContent(pred.targetLine);
      // 获取 AI 认为的原始行内容（用于 diff 计算）
      const originalLine = pred.originalLineContent || actualLine;
      
      // ✅ 优先使用 DiffCalculator 计算完整的变更信息
      const diffResult = DiffCalculator.detectChangeType(originalLine, pred.suggestionText);
      
      // 使用 AI 指定的 changeType（如果有），否则用 diff 自动检测的
      const finalChangeType = pred.changeType || diffResult.changeType;
      
      // ✅ 策略：PositionFinder 只用于验证/修正位置，DiffCalculator 提供完整内容
      let finalWordReplaceInfo = diffResult.wordReplaceInfo;
      let finalInlineInsertInfo = diffResult.inlineInsertInfo;
      
      // 如果有 context，尝试用 context 修正位置（更精确）
      if (pred.context && pred.context.target !== undefined) {
        
        // 使用 actualLine 进行定位（编辑器当前内容）
        const position = PositionFinder.findByContext(actualLine, pred.context);
        
        if (position) {
          
          // 根据 changeType 修正位置
          if (finalChangeType === 'REPLACE_WORD' && finalWordReplaceInfo) {
            // 用 context 定位的 startColumn/endColumn 更精确
            finalWordReplaceInfo = {
              ...finalWordReplaceInfo,
              startColumn: position.startColumn,
              endColumn: position.endColumn,
            };
          } else if (finalChangeType === 'INLINE_INSERT' && finalInlineInsertInfo) {
            // 用 context 定位的插入点
            const insertColumn = pred.context.target === '' 
              ? position.startColumn 
              : position.endColumn;
            finalInlineInsertInfo = {
              ...finalInlineInsertInfo,
              insertColumn: insertColumn,
            };
          }
        } else {
          logger.warn('[NESEngine] ✗ Context matching failed, using DiffCalculator result');
        }
      }

      // 返回增强后的预测（完整信息）
      return {
        ...pred,
        originalLineContent: originalLine,
        changeType: finalChangeType,
        wordReplaceInfo: finalWordReplaceInfo,
        inlineInsertInfo: finalInlineInsertInfo,
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

    this.state = 'SUGGESTING';
    this.showFirstSuggestion();
  }

  /**
   * 显示第一个建议（只显示 Glyph，不展开预览）
   */
  private showFirstSuggestion(): void {
    const prediction = this.suggestionQueue.peek();
    if (prediction) {
      
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
      return;
    }

    if (!this.previewShown) {
      
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
    }
  }

  /**
   * 接受当前建议
   */
  acceptSuggestion(): void {
    const prediction = this.suggestionQueue.dequeue();
    if (!prediction) {
      return;
    }

    // 使用新的 API：applySuggestion（自动根据 changeType 处理）
    this.renderer.applySuggestion(prediction);

    // 重置预览状态
    this.previewShown = false;

    // 显示下一个建议
    if (this.suggestionQueue.peek()) {
      this.showFirstSuggestion();
    } else {
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
      return;
    }


    // 清除渲染
    this.renderer.clear();

    // 重置预览状态
    this.previewShown = false;

    // 显示下一个建议
    if (this.suggestionQueue.peek()) {
      this.showFirstSuggestion();
    } else {
      this.sleep();
    }
  }

  /**
   * 关闭当前建议（不跳过，保持在队列中）
   */
  closeSuggestion(): void {
    
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
      matrix[0]![j] = j;
    }

    // 填充矩阵
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j]! + 1,      // 删除
          matrix[i]![j - 1]! + 1,      // 插入
          matrix[i - 1]![j - 1]! + cost // 替换
        );
      }
    }

    const distance = matrix[len1]![len2]!;
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  }
}
