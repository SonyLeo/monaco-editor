/**
 * NES Controller: 核心状态机
 * 负责协调各个模块，管理整体工作流程
 * 职责：状态管理、事件监听、模块协调
 */

import * as monaco from "monaco-editor";
import { NESRenderer } from "../renderer/NESRenderer";
import { ToastNotification } from "../utils/ToastNotification";
import type {
  NESState,
  Prediction,
  DiffInfo,
  NESPayload,
} from "../../types/nes";

import { DiffEngine } from "../diff/DiffEngine";
import { SuggestionArbiter } from "../arbiter/SuggestionArbiter";
import { SuggestionQueue } from "./SuggestionQueue";
import { EditHistoryManager } from "./EditHistoryManager";
import { FeedbackCollector } from "./FeedbackCollector";
import { PredictionService } from "./PredictionService";
import { NES_CONFIG } from "../config";

export class NESController {
  private state: NESState = "IDLE";
  private lastSnapshot = "";
  private debounceTimer: number | null = null;
  
  // 核心模块
  private renderer: NESRenderer;
  private toast: ToastNotification;
  private diffEngine: DiffEngine;
  private arbiter: SuggestionArbiter;
  
  // 🆕 模块化管理器
  private suggestionQueue: SuggestionQueue;
  private editHistoryManager: EditHistoryManager;
  private feedbackCollector: FeedbackCollector;
  private predictionService: PredictionService;
  
  // 🆕 UI状态
  private isUserOnSuggestionLine = false;
  private applyingSuggestionLine: number | null = null;

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
    this.renderer = new NESRenderer(editor);
    this.toast = new ToastNotification();
    this.diffEngine = new DiffEngine();
    this.arbiter = SuggestionArbiter.getInstance();
    this.arbiter.setEditor(editor);
    
    // 初始化模块化管理器
    this.lastSnapshot = editor.getValue();
    this.suggestionQueue = new SuggestionQueue();
    this.editHistoryManager = new EditHistoryManager(this.lastSnapshot);
    this.feedbackCollector = new FeedbackCollector();
    this.predictionService = new PredictionService();
    
    this.bindListeners();
    console.log("✅ [NESController] Initialized");

    // 添加动画样式
    this.injectStyles();
  }

  /**
   * 绑定事件监听器
   */
  private bindListeners(): void {
    this.editor.onDidChangeModelContent((e) => {
      const model = this.editor.getModel();
      if (!model) return;

      // 🔧 只更新 EditHistoryManager 的快照（用于 getOldText）
      const currentSnapshot = this.editor.getValue();
      this.editHistoryManager.updateSnapshot(currentSnapshot);

      // 收集编辑并合并连续的小编辑
      e.changes.forEach(change => {
        this.editHistoryManager.recordEdit(change, model);
      });

      // 用户打字时：隐藏 ViewZone，保留 Glyph Icon
      if (this.state === "SUGGESTING") {
        this.renderer.hideViewZone();
      }

      // 智能判断：是否需要重新预测
      this.handleContentChange(e);
    });

    // 监听光标位置变化，更新 HintBar
    this.editor.onDidChangeCursorPosition(() => {
      this.updateHintBarBasedOnCursorPosition();
    });
  }

  /**
   * 处理内容变更（智能判断是否重新预测）
   */
  private handleContentChange(e: monaco.editor.IModelContentChangedEvent): void {
    // 如果正在应用建议，忽略所有编辑事件
    if (this.applyingSuggestionLine !== null) {
      return;
    }

    // 如果没有队列，正常预测
    if (this.suggestionQueue.isEmpty) {
      this.schedulePredict();
      return;
    }

    // 智能判断：编辑是否来自当前建议
    const isFromCurrentSuggestion = this.isEditFromSuggestion(e);
    
    if (isFromCurrentSuggestion) {
      console.log('[NESController] ✅ Edit from suggestion, keeping queue');
      return;
    }

    // 智能判断：编辑是否在队列范围内
    const isInQueueRange = this.isEditInQueueRange(e);
    
    if (isInQueueRange) {
      console.log('[NESController] ⚠️ User editing in queue range, clearing queue');
      this.clearSuggestionQueue('user edited suggestion line');
    } else {
      console.log('[NESController] 🔄 User editing elsewhere, clearing queue');
      this.clearSuggestionQueue('user edited elsewhere');
    }

    // 重新预测
    this.schedulePredict();
  }

  /**
   * 判断编辑是否来自当前建议
   */
  private isEditFromSuggestion(e: monaco.editor.IModelContentChangedEvent): boolean {
    // 如果有标记，说明正在应用建议
    if (this.applyingSuggestionLine !== null) {
      const isMatchingLine = e.changes.some(
        change => change.range.startLineNumber === this.applyingSuggestionLine
      );
      
      if (isMatchingLine) {
        console.log('[NESController] 🎯 Detected edit from suggestion (via marker)');
        return true;
      }
    }
    
    // 备用检查：检查上一个接受的建议
    const currentPrediction = this.suggestionQueue.current();
    if (!currentPrediction) return false;

    return e.changes.some(change => {
      const isTargetLine = change.range.startLineNumber === currentPrediction.targetLine;
      
      const changeText = change.text.replace(/\s+/g, '');
      const suggestionText = currentPrediction.suggestionText.replace(/\s+/g, '');
      const containsSuggestion = changeText.includes(suggestionText) || suggestionText.includes(changeText);
      
      return isTargetLine && containsSuggestion;
    });
  }

  /**
   * 判断编辑是否在队列范围内
   */
  private isEditInQueueRange(e: monaco.editor.IModelContentChangedEvent): boolean {
    const queueLines = this.suggestionQueue.getAllLines();
    return e.changes.some(change => 
      queueLines.includes(change.range.startLineNumber)
    );
  }

  /**
   * 调度预测（防抖）
   */
  private schedulePredict(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.state = "DEBOUNCING";
    
    this.debounceTimer = window.setTimeout(() => {
      this.predict();
    }, NES_CONFIG.TIME.DEBOUNCE_MS);
  }

  /**
   * 执行预测
   */
  private async predict(): Promise<void> {
    this.state = "PREDICTING";

    const currentCode = this.editor.getValue();
    const diffInfo = this.calculateDiff(this.lastSnapshot, currentCode);

    // 如果没有实质性变更，不预测
    if (diffInfo.type === "NONE" || diffInfo.lines.length === 0) {
      this.state = "IDLE";
      return;
    }

    // 构建payload
    const payload = this.buildSmartPayload(currentCode, diffInfo);

    try {
      const apiResponse = await this.predictionService.predict(payload);

      // 检查是否有建议
      if (!apiResponse || !apiResponse.predictions || apiResponse.predictions.length === 0) {
        console.log("[NESController] No predictions returned");
        this.state = "IDLE";
        return;
      }

      const predictions = apiResponse.predictions;
      console.log(`[NESController] Received ${predictions.length} prediction(s)`);

      // 验证所有建议
      const validPredictions = predictions.filter(pred => this.validatePrediction(pred));
      
      if (validPredictions.length === 0) {
        console.warn("[NESController] All predictions failed validation");
        this.state = "IDLE";
        return;
      }

      // 保存到队列
      this.suggestionQueue.add(validPredictions);

      // 显示第一个建议
      this.showCurrentSuggestion();

      // 预测成功后更新快照（用于下次 diff 计算）
      this.lastSnapshot = currentCode;
    } catch (error: any) {
      if (error.message !== "Request aborted") {
        console.error("[NESController] Prediction error:", error);
        this.toast.show("Prediction failed", "error", 2000);
      }
      this.state = "IDLE";
    }
  }

  /**
   * 注入 CSS 样式
   */
  private injectStyles(): void {
    const styleId = "nes-toast-styles";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes fadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 滑动窗口：只发送变更区域 ±30 行
   */
  private buildSmartPayload(
    currentCode: string,
    diffInfo: DiffInfo,
  ): NESPayload {
    const lines = currentCode.split("\n");
    const changedLine = diffInfo.lines[0] || 1;
    
    const windowStart = Math.max(0, changedLine - NES_CONFIG.WINDOW.WINDOW_SIZE - 1);
    const windowEnd = Math.min(lines.length, changedLine + NES_CONFIG.WINDOW.WINDOW_SIZE);

    const codeWindow = lines.slice(windowStart, windowEnd).join("\n");

    // 格式化用户反馈（最近 5 条）
    const recentFeedback = this.feedbackCollector.getRecentFeedback(5);

    return {
      codeWindow,
      windowInfo: {
        startLine: windowStart + 1,
        totalLines: lines.length,
      },
      diffSummary: diffInfo.summary || `Changed line ${changedLine}`,
      editHistory: this.editHistoryManager.getRecentEdits(5),
      userFeedback: recentFeedback.length > 0 ? recentFeedback : undefined,
      requestId: 0, // Will be set by PredictionService
    };
  }

  /**
   * 双重验证：防止模型幻觉
   */
  private validatePrediction(pred: Prediction): boolean {
    const model = this.editor.getModel();
    if (!model) return false;

    // 1. 行号合法性
    if (pred.targetLine < 1 || pred.targetLine > model.getLineCount()) {
      console.warn(`[NESController] Invalid line number ${pred.targetLine}`);
      return false;
    }

    // 2. 内容匹配（如果后端提供了 originalLineContent）
    if (pred.originalLineContent !== undefined) {
      const actualLine = model.getLineContent(pred.targetLine);

      // 如果两边都是空行，允许通过
      if (!actualLine && !pred.originalLineContent) {
        return true;
      }

      const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
      const expectedNormalized = normalize(pred.originalLineContent);
      const actualNormalized = normalize(actualLine);

      if (expectedNormalized !== actualNormalized) {
        // 使用模糊匹配
        const similarity = this.calculateSimilarity(expectedNormalized, actualNormalized);
        
        if (similarity > NES_CONFIG.VALIDATION.SIMILARITY_THRESHOLD) {
          return true;
        }
        
        console.warn(`[NESController] Content mismatch (similarity: ${similarity.toFixed(2)})`);
        return false;
      }
    }

    return true;
  }

  /**
   * 计算字符串相似度
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // 简化版：基于最长公共子序列
    let matches = 0;
    const shorter = str1.length < str2.length ? str1 : str2;
    const longer = str1.length < str2.length ? str2 : str1;

    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i] ?? "")) matches++;
    }

    return matches / longer.length;
  }

  /**
   * 计算 Diff（使用 DiffEngine）
   */
  private calculateDiff(oldCode: string, newCode: string): DiffInfo {
    const diffResult = this.diffEngine.calculateDiff(oldCode, newCode);

    // 如果没有实质性变更，返回空 diff
    if (!diffResult) {
      return {
        type: "NONE",
        lines: [],
        changes: [],
        summary: "No changes",
      };
    }

    return {
      type: diffResult.type,
      lines: diffResult.lines,
      changes: diffResult.changes,
      summary: diffResult.summary,
      range: {
        start: diffResult.lines[0] || 0,
        end: diffResult.lines[diffResult.lines.length - 1] || 0,
      },
    };
  }

  /**
   * 根据光标位置更新 HintBar
   */
  private updateHintBarBasedOnCursorPosition(): void {
    if (this.state !== "SUGGESTING" || this.suggestionQueue.isEmpty) {
      return;
    }

    const prediction = this.suggestionQueue.current();
    if (!prediction) return;

    const position = this.editor.getPosition();
    if (!position) return;

    const wasOnLine = this.isUserOnSuggestionLine;
    this.isUserOnSuggestionLine = position.lineNumber === prediction.targetLine;

    // 如果状态改变，更新 HintBar
    if (wasOnLine !== this.isUserOnSuggestionLine) {
      this.updateHintBar(prediction);
    }
  }

  /**
   * 更新 HintBar 显示
   */
  private updateHintBar(prediction: Prediction): void {
    const position = this.editor.getPosition();
    if (!position) return;

    const currentLine = position.lineNumber;
    const currentColumn = position.column;

    if (this.isUserOnSuggestionLine) {
      // 场景 2：用户在建议行 → 显示 "Tab to Accept"
      this.renderer.showHintBar(currentLine, currentColumn, 'accept', 'current');
    } else {
      // 场景 1：用户不在建议行 → 显示 "Tab ↓/↑"
      const direction = currentLine < prediction.targetLine ? 'down' : 'up';
      this.renderer.showHintBar(currentLine, currentColumn, 'navigate', direction);
    }
  }

  /**
   * 显示当前建议
   */
  private showCurrentSuggestion(): void {
    if (!this.suggestionQueue.hasMore) {
      console.log("[NESController] All suggestions processed");
      this.clearSuggestionQueue('all processed');
      return;
    }

    const prediction = this.suggestionQueue.current();
    if (!prediction) {
      console.warn("[NESController] Invalid prediction");
      return;
    }

    this.state = "SUGGESTING";

    // 设置标记，防止跳转触发的编辑事件被误判
    this.applyingSuggestionLine = prediction.targetLine;

    // 通过 Arbiter 提交 NES 建议
    const accepted = this.arbiter.submitNesSuggestion({
      targetLine: prediction.targetLine,
      suggestion: prediction.suggestionText,
      originalText: prediction.originalLineContent,
      changeType: 'REFACTOR'
    });

    if (accepted) {
      // 不自动跳转，只显示 Glyph Icon
      this.renderer.renderGlyphIcon(
        prediction.targetLine,
        prediction.suggestionText,
        prediction.explanation,
        prediction.originalLineContent
      );
      
      // 检查用户是否已经在建议行
      const currentLine = this.editor.getPosition()?.lineNumber || 0;
      this.isUserOnSuggestionLine = currentLine === prediction.targetLine;
      
      // 显示 HintBar
      this.updateHintBar(prediction);
      
      // Toast 通知
      const progress = this.suggestionQueue.getProgress();
      const message = progress.remaining > 0 
        ? `Suggestion ${progress.current}/${progress.total} (${progress.remaining} more)`
        : `Last suggestion ${progress.current}/${progress.total}`;
      
      this.toast.show(message, "success", 2000);
      
      console.log(`[NESController] 📌 Showing suggestion ${progress.current}/${progress.total} at line ${prediction.targetLine}`);
    } else {
      console.log("[NESController] Suggestion rejected by Arbiter");
      this.state = "IDLE";
    }

    // 清除标记
    setTimeout(() => {
      this.applyingSuggestionLine = null;
    }, 100);
  }

  /**
   * 跳转到建议位置并智能定位光标
   */
  private jumpToSuggestionWithSmartCursor(prediction: Prediction): void {
    const model = this.editor.getModel();
    if (!model) return;

    const targetLine = prediction.targetLine;
    const lineContent = model.getLineContent(targetLine);
    
    // 智能查找光标位置
    let targetColumn = 1;
    
    if (prediction.originalLineContent && prediction.suggestionText) {
      const original = prediction.originalLineContent.trim();
      const suggestion = prediction.suggestionText.trim();
      
      let diffIndex = 0;
      const minLength = Math.min(original.length, suggestion.length);
      
      for (let i = 0; i < minLength; i++) {
        if (original[i] !== suggestion[i]) {
          diffIndex = i;
          break;
        }
      }
      
      const trimmedLine = lineContent.trim();
      const leadingSpaces = lineContent.length - trimmedLine.length;
      targetColumn = leadingSpaces + diffIndex + 1;
    } else {
      const match = lineContent.match(/\S/);
      targetColumn = match ? match.index! + 1 : 1;
    }

    this.editor.setPosition({ 
      lineNumber: targetLine, 
      column: targetColumn 
    });
    
    this.editor.revealLineInCenter(targetLine);
  }

  /**
   * 清空建议队列
   */
  private clearSuggestionQueue(reason?: string): void {
    if (this.suggestionQueue.remaining > 0) {
      console.log(`[NESController] 🗑️ Clearing queue: ${this.suggestionQueue.remaining} suggestion(s) remaining${reason ? ` (${reason})` : ''}`);
    }
    
    this.suggestionQueue.clear();
    this.isUserOnSuggestionLine = false;
    this.state = "IDLE";
    this.renderer.clear();
  }

  /**
   * 显示右键菜单
   */
  public showContextMenu(x: number, y: number, callbacks: {
    onNavigate?: () => void;
    onAccept?: () => void;
    onDismiss?: () => void;
  }): void {
    this.renderer.showContextMenu(x, y, callbacks);
  }

  /**
   * 跳转到建议位置（不应用）
   */
  public jumpToSuggestion(): void {
    this.renderer.jumpToSuggestion();
  }

  /**
   * 检查是否有激活的建议
   */
  public hasActiveSuggestion(): boolean {
    return this.state === "SUGGESTING";
  }

  /**
   * 检查是否有激活的预览
   */
  public hasActivePreview(): boolean {
    return this.renderer.hasViewZone();
  }

  /**
   * 应用建议（Tab 键处理）
   */
  public applySuggestion(): void {
    if (!this.hasActiveSuggestion()) {
      console.log('[NESController] No active suggestion');
      return;
    }

    const prediction = this.suggestionQueue.current();
    if (!prediction) return;

    // 场景 1：用户不在建议行 → 跳转到建议行 + 展开预览
    if (!this.isUserOnSuggestionLine) {
      console.log('[NESController] 🧭 Navigating to suggestion line');
      this.jumpToSuggestionWithSmartCursor(prediction);
      this.isUserOnSuggestionLine = true;
      this.updateHintBar(prediction);
      
      // 立即展开预览
      this.renderer.showPreview();
      return;
    }

    // 场景 2：用户在建议行 → 接受建议
    console.log('[NESController] ✅ Accepting suggestion (applying code)');
    this.acceptSuggestion();
  }

  /**
   * 接受建议（应用代码修改）
   */
  public acceptSuggestion(): void {
    console.log('[NESController] ✅ Accepting suggestion (applying code)');
    
    const acceptedPrediction = this.suggestionQueue.current();
    if (!acceptedPrediction) {
      console.warn('[NESController] No prediction to accept');
      return;
    }
    
    // 设置标记，表示正在应用建议
    this.applyingSuggestionLine = acceptedPrediction.targetLine;
    
    // 应用建议
    this.renderer.applySuggestion();
    this.arbiter.lockFim(NES_CONFIG.TIME.LOCK_DURATION_MS);
    
    // 记录用户反馈
    this.feedbackCollector.recordFeedback(acceptedPrediction, 'accepted');
    
    // 清除标记
    setTimeout(() => {
      this.applyingSuggestionLine = null;
    }, 100);
    
    // 移动到下一个建议
    const nextPrediction = this.suggestionQueue.next();
    if (nextPrediction) {
      console.log(`[NESController] 📍 Moving to next suggestion (${this.suggestionQueue.index + 1}/${this.suggestionQueue.total})`);
      
      setTimeout(() => {
        this.showCurrentSuggestion();
      }, NES_CONFIG.TIME.SUGGESTION_APPLY_DELAY_MS);
    } else {
      console.log('[NESController] 🎉 All suggestions completed');
      this.toast.show('All suggestions applied!', 'success', 2000);
      this.clearSuggestionQueue('all accepted');
    }
  }

  /**
   * 跳过当前建议
   */
  public skipSuggestion(): void {
    const skippedPrediction = this.suggestionQueue.skip();
    if (skippedPrediction) {
      this.feedbackCollector.recordFeedback(skippedPrediction, 'skipped');
      console.log(`[NESController] ⏭️ Skipped suggestion at line ${skippedPrediction.targetLine}`);
    }
    
    if (this.suggestionQueue.hasMore) {
      console.log('[NESController] Skipping to next suggestion...');
      this.showCurrentSuggestion();
    } else {
      console.log('[NESController] No more suggestions');
      this.clearSuggestionQueue('all skipped');
    }
  }

  /**
   * 拒绝所有剩余建议
   */
  public rejectAllSuggestions(): void {
    // 记录当前建议为拒绝
    const currentPrediction = this.suggestionQueue.current();
    if (currentPrediction) {
      this.feedbackCollector.recordFeedback(currentPrediction, 'rejected');
    }
    
    console.log('[NESController] ❌ All remaining suggestions rejected');
    this.clearSuggestionQueue('user rejected all');
  }

  /**
   * 关闭预览
   */
  public closePreview(): void {
    this.renderer.hideViewZone();
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.predictionService.dispose();
    this.editHistoryManager.dispose();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.renderer.dispose();
    this.toast.dispose();
    console.log("[NESController] Disposed");
  }
}
