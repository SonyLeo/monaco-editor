/**
 * NES Engine - Next Edit Suggestion 引擎
 * 负责调用后端 API 进行症状检测和编辑预测
 */

import * as monaco from 'monaco-editor';
import type { EditRecord, Prediction, NESConfig, Symptom } from '../types/index';
import { SymptomDetector } from '../analysis/SymptomDetector';
import { SuggestionQueue } from '../services/SuggestionQueue';
import { NESRenderer } from '../rendering/NESRenderer';
import { DiffCalculator } from '../utils/DiffCalculator';
import { PositionFinder } from '../utils/PositionFinder';
import { logger } from '../utils/logger';

export class NESEngine {
  private state: 'SLEEPING' | 'DIAGNOSING' | 'SUGGESTING' = 'SLEEPING';
  private symptomDetector: SymptomDetector;
  private suggestionQueue: SuggestionQueue;
  private renderer: NESRenderer;
  private abortController: AbortController | null = null;
  private onEditApplied?: (lineNumber: number) => void;
  private requestSnapshot: { timestamp: number; codeHash: string } | null = null; // 请求时的代码快照

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

    // ✅ 记录请求时的代码快照
    const model = this.editor.getModel();
    if (model) {
      this.requestSnapshot = {
        timestamp: Date.now(),
        codeHash: this.hashCode(model.getValue())
      };
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

    // ✅ State Freshness Check: 验证代码是否在请求期间被修改
    if (this.requestSnapshot) {
      const currentHash = this.hashCode(model.getValue());
      
      if (currentHash !== this.requestSnapshot.codeHash) {
        const timeSinceRequest = Date.now() - this.requestSnapshot.timestamp;
        logger.warn(
          `[NESEngine] Code changed during request (${timeSinceRequest}ms). ` +
          `Predictions may be stale. Consider filtering.`
        );
        
        // 可选策略：如果变化太大，直接丢弃所有预测
        // 这里我们选择继续，但依赖后续的行内容匹配来过滤
        // 如果你想更激进，可以取消注释下面这行：
        // this.sleep(); return;
      }
    }

    // ✅ 去重：移除重复预测（相同 targetLine + 相同 suggestionText）
    // 原因：后端 AI 可能返回重复预测，导致用户按多次 Tab 会重复插入相同内容
    const uniquePredictions = predictions.filter((pred, index, arr) => {
      // ✅ 过滤 no-op 预测（suggestionText 和 originalLineContent 完全相同）
      if (pred.suggestionText === pred.originalLineContent) {
        logger.warn(`[NESEngine] Filtered no-op prediction for line ${pred.targetLine}: suggestion equals original`);
        return false;
      }

      // 检查当前预测之前是否已有相同的预测
      const isDuplicate = arr.slice(0, index).some(p => 
        p.targetLine === pred.targetLine && 
        p.suggestionText === pred.suggestionText
      );
      
      if (isDuplicate) {
        logger.debug(`[NESEngine] Filtered duplicate prediction for line ${pred.targetLine}`);
      }
      
      return !isDuplicate;
    });

    if (uniquePredictions.length === 0) {
      logger.warn('[NESEngine] All predictions filtered out (duplicates or invalid)');
      this.sleep();
      return;
    }

    // 过滤并处理每个预测
    const processedPredictions = uniquePredictions
      .filter(pred => {
        // 验证行号范围
        if (pred.targetLine < 1 || pred.targetLine > model.getLineCount()) {
          logger.warn('[NESEngine] Invalid line number:', pred.targetLine);
          return false;
        }

        // 尝试修正行号（容错处理）
        // 如果 targetLine 内容不匹配，尝试在附近查找
        if (pred.originalLineContent) {
          const correctedLine = this.findBestMatchingLine(model, pred.targetLine, pred.originalLineContent);
          
          if (correctedLine !== -1) {
            if (correctedLine !== pred.targetLine) {
              logger.debug(`[NESEngine] Corrected line number ${pred.targetLine} -> ${correctedLine}`);
              pred.targetLine = correctedLine;
            }
          } else {
            // 只有当找不到高相似度行时才记录警告并跳过
            // 对于 INSERT/DELETE，需要特殊放宽条件，暂不处理
             const actualLine = model.getLineContent(pred.targetLine);
             logger.warn('[NESEngine] Content mismatch, skipping prediction:', {
               targetLine: pred.targetLine,
               expected: pred.originalLineContent,
               actual: actualLine,
             });
             return false;
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
   * 显示第一个建议（直接展开预览）
   */
  private showFirstSuggestion(): void {
    const prediction = this.suggestionQueue.peek();
    if (prediction) {
      
      // 跳转到建议位置
      this.editor.setPosition({
        lineNumber: prediction.targetLine,
        column: 1
      });
      this.editor.revealLineInCenter(prediction.targetLine);
      
      // 直接显示预览（渲染 Glyph + 展开预览）
      this.renderer.renderSuggestion(prediction);
      this.renderer.showPreview(prediction);
      
      // 计算进度
      const current = this.suggestionQueue.getCurrentIndex() + 1;
      const total = this.suggestionQueue.size();
      const progress = total > 1 ? `${current}/${total}` : undefined;
      
      // 显示 HintBar（提示 "Tab Accept"）
      this.renderer.showHintBar(prediction.targetLine, prediction.explanation, true, progress);
    }
  }



  /**
   * 接受当前建议（Accept 后自动展开下一个预览）
   */
  acceptSuggestion(): void {
    const prediction = this.suggestionQueue.dequeue();
    if (!prediction) {
      return;
    }

    // 使用新的 API：applySuggestion（自动根据 changeType 处理）
    this.renderer.applySuggestion(prediction);

    // 通知主入口标记为 NES 编辑
    if (this.onEditApplied) {
      this.onEditApplied(prediction.targetLine);
    }

    // 显示下一个建议（直接展开预览）
    if (this.suggestionQueue.peek()) {
      this.showFirstSuggestion();
    } else {
      this.sleep();
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
   * 在指定行号附近查找最匹配的行
   * @param model 编辑器模型
   * @param targetLine 目标行号
   * @param content 期待的内容
   * @param range 搜索范围（上下多少行）
   * @returns 匹配的行号，如果没找到返回 -1
   */
  private findBestMatchingLine(model: monaco.editor.ITextModel, targetLine: number, content: string, range: number = 2): number {
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    const expectedNormalized = normalize(content);
    
    // 如果期待内容为空，且行号有效，直接返回（通常是 insert 到空行）
    // 注意：如果实际行不是空的，可能是 replace 整个行。这里做个权衡。
    if (expectedNormalized === '') return targetLine;

    // 搜索候选行
    let bestLine = -1;
    let maxSimilarity = 0;
    
    const start = Math.max(1, targetLine - range);
    const end = Math.min(model.getLineCount(), targetLine + range);

    for (let line = start; line <= end; line++) {
      const actualLine = model.getLineContent(line);
      const actualNormalized = normalize(actualLine);
      
      // 完全匹配直接返回
      if (actualNormalized === expectedNormalized) {
        return line;
      }
      
      const similarity = this.calculateSimilarity(expectedNormalized, actualNormalized);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        bestLine = line;
      }
    }

    // 只有相似度足够高才认为是匹配的
    return maxSimilarity >= 0.8 ? bestLine : -1;
  }

  /**
   * 计算字符串的简单哈希值（用于快速比较代码是否变化）
   */
  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * 计算两个字符串的相似度（Levenshtein 距离，空间优化版）
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const len1 = str1.length;
    const len2 = str2.length;

    // 空间优化：只使用两行（O(min(len1, len2)) 空间）
    let prevRow = Array.from({ length: len2 + 1 }, (_, i) => i);
    let currRow = new Array(len2 + 1);

    for (let i = 1; i <= len1; i++) {
      currRow[0] = i;
      
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j]! + 1,        // 删除
          currRow[j - 1]! + 1,    // 插入
          prevRow[j - 1]! + cost  // 替换
        );
      }
      
      // 交换行
      [prevRow, currRow] = [currRow, prevRow];
    }

    const distance = prevRow[len2]!;
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  }
}
