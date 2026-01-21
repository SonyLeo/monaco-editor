/**
 * NES Controller: 核心状态机
 * 负责监听编辑、计算 Diff、异步预测、管理状态
 */

import * as monaco from "monaco-editor";
import { NESRenderer } from "../renderer/NESRenderer";
import { ToastNotification } from "../utils/ToastNotification";
import type {
  NESState,
  Prediction,
  DiffInfo,
  NESPayload,
  EditRecord,
} from "../../types/nes";

import { DiffEngine } from "../diff/DiffEngine";
import { SuggestionArbiter } from "../arbiter/SuggestionArbiter";

export class NESController {
  private state: NESState = "IDLE";
  private lastSnapshot = "";
  private lastRequestId = 0;
  private abortController: AbortController | null = null;
  private debounceTimer: number | null = null;
  private renderer: NESRenderer;
  private toast: ToastNotification;
  private diffEngine: DiffEngine;
  private arbiter: SuggestionArbiter;
  private editHistory: EditRecord[] = []; // 🆕 编辑历史
  private readonly MAX_HISTORY_SIZE = 10; // 保留最近 10 次编辑
  private pendingEdit: EditRecord | null = null; // 🆕 待合并的编辑
  private editMergeTimer: number | null = null; // 🆕 编辑合并计时器
  
  // 🆕 建议队列管理
  private suggestionQueue: Prediction[] = [];
  private currentSuggestionIndex = 0;
  private isUserOnSuggestionLine = false; // 🆕 用户是否在建议行
  
  // 🆕 用户反馈历史
  private userFeedbackHistory: Array<{
    prediction: Prediction;
    action: 'accepted' | 'skipped' | 'rejected';
    timestamp: number;
  }> = [];
  private readonly MAX_FEEDBACK_HISTORY = 20;
  
  // 🆕 正在应用建议的标记（用于区分编辑来源）
  private applyingSuggestionLine: number | null = null;

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
    this.renderer = new NESRenderer(editor);
    this.toast = new ToastNotification();
    this.diffEngine = new DiffEngine();
    this.arbiter = SuggestionArbiter.getInstance();
    this.arbiter.setEditor(editor);
    this.lastSnapshot = editor.getValue();
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

      // 🆕 收集编辑并合并连续的小编辑
      e.changes.forEach(change => {
        this.recordEdit(change, model);
      });

      // 用户打字时：隐藏 ViewZone，保留 Glyph Icon
      if (this.state === "SUGGESTING") {
        this.renderer.hideViewZone();
      }

      // 🔧 智能判断：是否需要重新预测
      this.handleContentChange(e);
    });

    // 🆕 监听光标位置变化，更新 HintBar
    this.editor.onDidChangeCursorPosition(() => {
      this.updateHintBarBasedOnCursorPosition();
    });
  }

  /**
   * 🆕 处理内容变更（智能判断是否重新预测）
   */
  private handleContentChange(e: monaco.editor.IModelContentChangedEvent): void {
    // 🔧 如果正在应用建议，忽略所有编辑事件
    if (this.applyingSuggestionLine !== null) {
      console.log('[NESController] 🔒 Ignoring edit during suggestion application');
      return;
    }

    // 如果没有队列，正常预测
    if (this.suggestionQueue.length === 0) {
      this.schedulePredict();
      return;
    }

    // 🔧 智能判断：编辑是否来自当前建议
    const isFromCurrentSuggestion = this.isEditFromSuggestion(e);
    
    if (isFromCurrentSuggestion) {
      // 来自建议的编辑，保留队列
      console.log('[NESController] ✅ Edit from suggestion, keeping queue');
      return;
    }

    // 🔧 智能判断：编辑是否在队列范围内
    const isInQueueRange = this.isEditInQueueRange(e);
    
    if (isInQueueRange) {
      // 用户可能在手动修改建议行，清空队列
      console.log('[NESController] ⚠️ User editing in queue range, clearing queue');
      this.clearSuggestionQueue('user edited suggestion line');
    } else {
      // 用户在其他地方编辑，清空队列
      console.log('[NESController] 🔄 User editing elsewhere, clearing queue');
      this.clearSuggestionQueue('user edited elsewhere');
    }

    // 重新预测
    this.schedulePredict();
  }

  /**
   * 🆕 判断编辑是否来自当前建议
   */
  private isEditFromSuggestion(e: monaco.editor.IModelContentChangedEvent): boolean {
    // 🔧 如果有标记，说明正在应用建议
    if (this.applyingSuggestionLine !== null) {
      const isMatchingLine = e.changes.some(
        change => change.range.startLineNumber === this.applyingSuggestionLine
      );
      
      if (isMatchingLine) {
        console.log('[NESController] 🎯 Detected edit from suggestion (via marker):', {
          line: this.applyingSuggestionLine,
          changes: e.changes.length
        });
        return true;
      }
    }
    
    // 🔧 备用检查：检查上一个接受的建议
    if (this.currentSuggestionIndex === 0) return false;
    
    const lastAcceptedPrediction = this.suggestionQueue[this.currentSuggestionIndex - 1];
    if (!lastAcceptedPrediction) return false;

    // 检查编辑的行号和内容是否匹配
    return e.changes.some(change => {
      const isTargetLine = change.range.startLineNumber === lastAcceptedPrediction.targetLine;
      
      // 检查是否包含建议的文本（去除空格比较）
      const changeText = change.text.replace(/\s+/g, '');
      const suggestionText = lastAcceptedPrediction.suggestionText.replace(/\s+/g, '');
      const containsSuggestion = changeText.includes(suggestionText) || suggestionText.includes(changeText);
      
      const result = isTargetLine && containsSuggestion;
      
      if (result) {
        console.log('[NESController] 🎯 Detected edit from suggestion (via content match):', {
          line: change.range.startLineNumber,
          changeText: change.text.substring(0, 50),
          suggestionText: lastAcceptedPrediction.suggestionText.substring(0, 50)
        });
      }
      
      return result;
    });
  }

  /**
   * 🆕 判断编辑是否在队列范围内
   */
  private isEditInQueueRange(e: monaco.editor.IModelContentChangedEvent): boolean {
    const queueLines = this.suggestionQueue.map(p => p.targetLine);
    return e.changes.some(change => 
      queueLines.includes(change.range.startLineNumber)
    );
  }

  /**
   * 🆕 调度预测（防抖）
   */
  private schedulePredict(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.state = "DEBOUNCING";
    
    this.debounceTimer = window.setTimeout(() => {
      this.predict();
    }, 1500);
  }

  /**
   * 记录编辑（带合并逻辑）
   */
  private recordEdit(change: monaco.editor.IModelContentChange, model: monaco.editor.ITextModel): void {
    const editType = this.detectEditType(change);
    const oldText = this.getOldText(change, this.lastSnapshot);
    const newText = change.text;
    const lineContent = model.getLineContent(change.range.startLineNumber);

    // 🆕 分析语义上下文
    const context = this.analyzeEditContext(change, lineContent, oldText, newText);

    const currentEdit: EditRecord = {
      timestamp: Date.now(),
      lineNumber: change.range.startLineNumber,
      column: change.range.startColumn,
      type: editType,
      oldText,
      newText,
      rangeLength: change.rangeLength,
      context
    };

    // 🆕 合并逻辑：如果是连续的小编辑（如逐字符输入），合并为一个编辑
    if (this.shouldMergeEdit(currentEdit)) {
      this.mergePendingEdit(currentEdit);
    } else {
      // 提交之前的待合并编辑
      this.flushPendingEdit();
      // 开始新的待合并编辑
      this.pendingEdit = currentEdit;
      
      // 设置合并计时器（500ms 内的连续编辑会被合并）
      if (this.editMergeTimer) {
        clearTimeout(this.editMergeTimer);
      }
      this.editMergeTimer = window.setTimeout(() => {
        this.flushPendingEdit();
      }, 500);
    }
  }

  /**
   * 判断是否应该合并编辑
   */
  private shouldMergeEdit(currentEdit: EditRecord): boolean {
    if (!this.pendingEdit) return false;

    const timeDiff = currentEdit.timestamp - this.pendingEdit.timestamp;
    const isSameLine = currentEdit.lineNumber === this.pendingEdit.lineNumber;
    const isConsecutive = Math.abs(currentEdit.column - (this.pendingEdit.column + this.pendingEdit.newText.length)) <= 1;
    const isSameType = currentEdit.type === this.pendingEdit.type;
    const isSmallEdit = currentEdit.newText.length <= 3 && this.pendingEdit.newText.length <= 10;

    // 合并条件：同一行、连续位置、相同类型、小编辑、时间间隔 < 500ms
    return isSameLine && isConsecutive && isSameType && isSmallEdit && timeDiff < 500;
  }

  /**
   * 合并待处理的编辑
   */
  private mergePendingEdit(currentEdit: EditRecord): void {
    if (!this.pendingEdit) return;

    // 合并文本
    if (currentEdit.type === 'insert') {
      this.pendingEdit.newText += currentEdit.newText;
    } else if (currentEdit.type === 'delete') {
      this.pendingEdit.oldText += currentEdit.oldText;
    } else {
      this.pendingEdit.newText += currentEdit.newText;
      this.pendingEdit.oldText += currentEdit.oldText;
    }

    // 更新时间戳和上下文
    this.pendingEdit.timestamp = currentEdit.timestamp;
    this.pendingEdit.context = currentEdit.context;
  }

  /**
   * 提交待处理的编辑到历史
   */
  private flushPendingEdit(): void {
    if (!this.pendingEdit) return;

    this.editHistory.push(this.pendingEdit);
    this.pendingEdit = null;

    // 保留最近 N 次编辑
    if (this.editHistory.length > this.MAX_HISTORY_SIZE) {
      this.editHistory = this.editHistory.slice(-this.MAX_HISTORY_SIZE);
    }
  }

  /**
   * 分析编辑的语义上下文
   */
  private analyzeEditContext(
    change: monaco.editor.IModelContentChange,
    lineContent: string,
    _oldText: string,
    newText: string
  ): EditRecord['context'] {
    const column = change.range.startColumn - 1;
    
    // 检测是否在字符串中
    const beforeCursor = lineContent.substring(0, column);
    const inString = (beforeCursor.match(/"/g) || []).length % 2 === 1 ||
                     (beforeCursor.match(/'/g) || []).length % 2 === 1;
    
    // 检测是否在注释中
    const inComment = beforeCursor.includes('//') || beforeCursor.includes('/*');

    // 检测语义类型
    let semanticType: 'functionName' | 'variableName' | 'parameter' | 'functionCall' | 'other' = 'other';
    
    // 函数定义：function xxx( 或 const xxx = (
    if (/function\s+\w*$/.test(beforeCursor) || /const\s+\w+\s*=\s*\(?$/.test(beforeCursor)) {
      semanticType = 'functionName';
    }
    // 函数调用：xxx(
    else if (/\w+\s*\($/.test(lineContent.substring(0, column + newText.length))) {
      semanticType = 'functionCall';
    }
    // 变量声明：const/let/var xxx
    else if (/(const|let|var)\s+\w*$/.test(beforeCursor)) {
      semanticType = 'variableName';
    }
    // 参数：在括号内
    else if (beforeCursor.includes('(') && !beforeCursor.includes(')')) {
      semanticType = 'parameter';
    }

    return {
      lineContent,
      tokenType: inString ? 'string' : inComment ? 'comment' : 'identifier',
      semanticType
    };
  }

  /**
   * 检测编辑类型
   */
  private detectEditType(change: monaco.editor.IModelContentChange): 'insert' | 'delete' | 'replace' {
    const hasOldContent = change.rangeLength > 0;
    const hasNewContent = change.text.length > 0;

    if (hasOldContent && hasNewContent) return 'replace';
    if (hasNewContent) return 'insert';
    return 'delete';
  }

  /**
   * 获取被替换的旧文本
   */
  private getOldText(change: monaco.editor.IModelContentChange, snapshot: string): string {
    if (change.rangeLength === 0) return '';

    const lines = snapshot.split('\n');
    const startLine = change.range.startLineNumber - 1;
    const endLine = change.range.endLineNumber - 1;
    const startCol = change.range.startColumn - 1;
    const endCol = change.range.endColumn - 1;

    if (startLine === endLine) {
      return lines[startLine]?.substring(startCol, endCol) || '';
    }

    // 多行变更
    const result: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      if (i === startLine) {
        result.push(lines[i]?.substring(startCol) || '');
      } else if (i === endLine) {
        result.push(lines[i]?.substring(0, endCol) || '');
      } else {
        result.push(lines[i] || '');
      }
    }
    return result.join('\n');
  }

  /**
   * 执行预测
   */
  private async predict(): Promise<void> {
    this.state = "PREDICTING";

    // Abort 旧请求
    this.abortController?.abort();
    this.abortController = new AbortController();

    const currentCode = this.editor.getValue();
    const diffInfo = this.calculateDiff(this.lastSnapshot, currentCode);

    // 如果没有实质性变更，不预测
    if (diffInfo.type === "NONE" || diffInfo.lines.length === 0) {
      this.state = "IDLE";
      return;
    }

    // 滑动窗口优化 - 🔧 传递完整的 diffInfo
    const payload = this.buildSmartPayload(currentCode, diffInfo);

    // Request ID
    const requestId = ++this.lastRequestId;
    payload.requestId = requestId;

    try {
      const response = await fetch(
        "http://localhost:3000/api/next-edit-prediction",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: this.abortController.signal,
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const apiResponse: { predictions: Prediction[]; totalCount: number; hasMore: boolean; requestId: number } = await response.json();

      // Request ID 校验
      if (requestId !== this.lastRequestId) {
        console.log("[NESController] Discarding stale response");
        return;
      }

      // 检查是否有建议
      if (!apiResponse || !apiResponse.predictions || apiResponse.predictions.length === 0) {
        console.log("[NESController] No predictions returned");
        this.state = "IDLE";
        return;
      }

      // 🆕 处理多个建议
      const predictions = apiResponse.predictions;
      console.log(`[NESController] Received ${predictions.length} prediction(s)`);

      // 验证所有建议
      const validPredictions = predictions.filter(pred => this.validatePrediction(pred));
      
      if (validPredictions.length === 0) {
        console.warn("[NESController] All predictions failed validation");
        this.state = "IDLE";
        return;
      }

      // 🆕 保存到队列
      this.suggestionQueue = validPredictions;
      this.currentSuggestionIndex = 0;

      // 显示第一个建议
      this.showCurrentSuggestion();

      this.lastSnapshot = currentCode;
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("[NESController] Prediction error:", error);
        this.toast.show("Prediction failed", "error", 2000);
      }
      this.state = "IDLE";
    }
  }

  /**
   * 🆕 注入 CSS 样式
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
   * 滑动窗口：只发送变更区域 ±30 行（优化后）
   * 减少 Token 使用 70%，提升模型聚焦能力
   */
  private buildSmartPayload(
    currentCode: string,
    diffInfo: DiffInfo,
  ): NESPayload {
    const lines = currentCode.split("\n");
    const changedLine = diffInfo.lines[0] || 1;
    
    // 🔧 优化：从 ±100 减少到 ±30
    const windowStart = Math.max(0, changedLine - 30 - 1);
    const windowEnd = Math.min(lines.length, changedLine + 30);

    const codeWindow = lines.slice(windowStart, windowEnd).join("\n");

    // 🆕 格式化用户反馈（最近 5 条）
    const recentFeedback = this.userFeedbackHistory.slice(-5).map(fb => ({
      targetLine: fb.prediction.targetLine,
      action: fb.action,
      suggestionText: fb.prediction.suggestionText,
      timestamp: fb.timestamp
    }));

    return {
      codeWindow,
      windowInfo: {
        startLine: windowStart + 1, // 1-indexed
        totalLines: lines.length,
      },
      diffSummary: diffInfo.summary || `Changed line ${changedLine}`,
      editHistory: this.editHistory.slice(-5), // 🆕 最近 5 次编辑
      userFeedback: recentFeedback.length > 0 ? recentFeedback : undefined, // 🆕 用户反馈
      requestId: 0, // Will be set later
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
        
        // 🔧 临时禁用验证：阈值设为 0（始终显示）
        // TODO: 修复后端 Prompt 后恢复到 0.6
        if (similarity > 0.6) {
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

    // 转换为旧格式以保持兼容性
    return {
      type: diffResult.type,
      lines: diffResult.lines,
      changes: diffResult.changes,
      summary: `Changed ${diffResult.lines.length} line(s)`,
      range: {
        start: diffResult.lines[0] || 0,
        end: diffResult.lines[diffResult.lines.length - 1] || 0,
      },
    };
  }

  /**
   * 🆕 根据光标位置更新 HintBar
   */
  private updateHintBarBasedOnCursorPosition(): void {
    if (this.state !== "SUGGESTING" || this.suggestionQueue.length === 0) {
      return;
    }

    const prediction = this.suggestionQueue[this.currentSuggestionIndex];
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
   * 🆕 更新 HintBar 显示
   */
  private updateHintBar(prediction: Prediction): void {
    const position = this.editor.getPosition();
    if (!position) return;

    const currentLine = position.lineNumber;
    const currentColumn = position.column;
    const targetLine = prediction.targetLine;

    if (this.isUserOnSuggestionLine) {
      // 场景 2：用户在建议行 → 显示 "Tab to Accept" 在当前光标位置
      this.renderer.showHintBar(currentLine, currentColumn, 'accept', 'current');
    } else {
      // 场景 1：用户不在建议行 → 显示 "Tab ↓/↑" 在当前光标位置
      const direction = currentLine < targetLine ? 'down' : 'up';
      this.renderer.showHintBar(currentLine, currentColumn, 'navigate', direction);
    }
  }

  /**
   * 显示当前建议
   */
  private showCurrentSuggestion(): void {
    if (this.currentSuggestionIndex >= this.suggestionQueue.length) {
      console.log("[NESController] All suggestions processed");
      this.clearSuggestionQueue('all processed');
      return;
    }

    const prediction = this.suggestionQueue[this.currentSuggestionIndex];
    if (!prediction) {
      console.warn("[NESController] Invalid prediction at index", this.currentSuggestionIndex);
      return;
    }

    this.state = "SUGGESTING";

    // 🔧 设置标记，防止跳转触发的编辑事件被误判
    this.applyingSuggestionLine = prediction.targetLine;

    // 通过 Arbiter 提交 NES 建议
    const accepted = this.arbiter.submitNesSuggestion({
      targetLine: prediction.targetLine,
      suggestion: prediction.suggestionText,
      originalText: prediction.originalLineContent,
      changeType: 'REFACTOR'
    });

    if (accepted) {
      // 🔧 不自动跳转，只显示 Glyph Icon
      this.renderer.renderGlyphIcon(
        prediction.targetLine,
        prediction.suggestionText,
        prediction.explanation,
        prediction.originalLineContent
      );
      
      // 🆕 检查用户是否已经在建议行
      const currentLine = this.editor.getPosition()?.lineNumber || 0;
      this.isUserOnSuggestionLine = currentLine === prediction.targetLine;
      
      // 🆕 显示 HintBar（根据位置显示不同提示）
      this.updateHintBar(prediction);
      
      // Toast 通知（显示进度）
      const progress = `${this.currentSuggestionIndex + 1}/${this.suggestionQueue.length}`;
      const remaining = this.suggestionQueue.length - this.currentSuggestionIndex - 1;
      const message = remaining > 0 
        ? `Suggestion ${progress} (${remaining} more)`
        : `Last suggestion ${progress}`;
      
      this.toast.show(message, "success", 2000);
      
      console.log(`[NESController] 📌 Showing suggestion ${progress} at line ${prediction.targetLine}`);
    } else {
      console.log("[NESController] Suggestion rejected by Arbiter");
      this.state = "IDLE";
    }

    // 🔧 清除标记
    setTimeout(() => {
      this.applyingSuggestionLine = null;
    }, 100);
  }

  /**
   * 🆕 跳转到建议位置并智能定位光标
   */
  private jumpToSuggestionWithSmartCursor(prediction: Prediction): void {
    const model = this.editor.getModel();
    if (!model) return;

    const targetLine = prediction.targetLine;
    const lineContent = model.getLineContent(targetLine);
    
    // 🔧 智能查找光标位置：找到建议文本中变化的部分
    let targetColumn = 1;
    
    if (prediction.originalLineContent && prediction.suggestionText) {
      // 找到第一个不同的字符位置
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
      
      // 在行内容中查找这个位置
      const trimmedLine = lineContent.trim();
      const leadingSpaces = lineContent.length - trimmedLine.length;
      targetColumn = leadingSpaces + diffIndex + 1;
      
      console.log('[NESController] 🎯 Smart cursor positioning:', {
        line: targetLine,
        column: targetColumn,
        diffIndex,
        original: original.substring(0, 30),
        suggestion: suggestion.substring(0, 30)
      });
    } else {
      // 如果没有原始内容，定位到第一个非空白字符
      const match = lineContent.match(/\S/);
      targetColumn = match ? match.index! + 1 : 1;
    }

    // 设置光标位置
    this.editor.setPosition({ 
      lineNumber: targetLine, 
      column: targetColumn 
    });
    
    // 滚动到中心
    this.editor.revealLineInCenter(targetLine);
  }

  /**
   * 🆕 记录用户反馈
   */
  private recordUserFeedback(
    prediction: Prediction,
    action: 'accepted' | 'skipped' | 'rejected'
  ): void {
    this.userFeedbackHistory.push({
      prediction,
      action,
      timestamp: Date.now()
    });

    // 保留最近 N 条反馈
    if (this.userFeedbackHistory.length > this.MAX_FEEDBACK_HISTORY) {
      this.userFeedbackHistory = this.userFeedbackHistory.slice(-this.MAX_FEEDBACK_HISTORY);
    }

    console.log(`[NESController] User ${action} suggestion at line ${prediction.targetLine}`);
  }

  /**
   * 清空建议队列
   */
  private clearSuggestionQueue(reason?: string): void {
    if (this.suggestionQueue.length > 0) {
      const remaining = this.suggestionQueue.length - this.currentSuggestionIndex;
      console.log(`[NESController] 🗑️ Clearing queue: ${remaining} suggestion(s) remaining${reason ? ` (${reason})` : ''}`);
    }
    
    this.suggestionQueue = [];
    this.currentSuggestionIndex = 0;
    this.isUserOnSuggestionLine = false; // 🆕 重置状态
    this.state = "IDLE";
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

    const prediction = this.suggestionQueue[this.currentSuggestionIndex];
    if (!prediction) return;

    // 🆕 场景 1：用户不在建议行 → 跳转到建议行 + 展开预览
    if (!this.isUserOnSuggestionLine) {
      console.log('[NESController] 🧭 Navigating to suggestion line');
      this.jumpToSuggestionWithSmartCursor(prediction);
      this.isUserOnSuggestionLine = true;
      this.updateHintBar(prediction);
      
      // 🔧 立即展开预览
      this.renderer.showPreview();
      return;
    }

    // 🆕 场景 2：用户在建议行 → 接受建议
    console.log('[NESController] ✅ Accepting suggestion (applying code)');
    this.acceptSuggestion();
  }

  /**
   * 接受建议（应用代码修改）
   */
  public acceptSuggestion(): void {
    console.log('[NESController] ✅ Accepting suggestion (applying code)');
    
    const acceptedPrediction = this.suggestionQueue[this.currentSuggestionIndex];
    if (!acceptedPrediction) {
      console.warn('[NESController] No prediction to accept');
      return;
    }
    
    // 🔧 设置标记，表示正在应用建议
    this.applyingSuggestionLine = acceptedPrediction.targetLine;
    
    // 应用建议
    this.renderer.applySuggestion();
    this.arbiter.lockFim(500);
    
    // 记录用户反馈
    this.recordUserFeedback(acceptedPrediction, 'accepted');
    
    // 🔧 清除标记（延迟清除，确保编辑事件已处理）
    setTimeout(() => {
      this.applyingSuggestionLine = null;
    }, 100);
    
    // 🆕 移动到下一个建议
    this.currentSuggestionIndex++;
    if (this.currentSuggestionIndex < this.suggestionQueue.length) {
      console.log(`[NESController] 📍 Moving to next suggestion (${this.currentSuggestionIndex + 1}/${this.suggestionQueue.length})`);
      
      // 🔧 延迟显示下一个建议，确保当前建议的编辑已完成
      setTimeout(() => {
        this.showCurrentSuggestion();
      }, 150);
    } else {
      console.log('[NESController] 🎉 All suggestions completed');
      this.toast.show('All suggestions applied!', 'success', 2000);
      this.clearSuggestionQueue('all accepted');
    }
  }

  /**
   * 🆕 跳过当前建议，跳转到下一个
   */
  public skipSuggestion(): void {
    const skippedPrediction = this.suggestionQueue[this.currentSuggestionIndex];
    if (skippedPrediction) {
      this.recordUserFeedback(skippedPrediction, 'skipped');
      console.log(`[NESController] ⏭️ Skipped suggestion at line ${skippedPrediction.targetLine}`);
    }
    
    this.currentSuggestionIndex++;
    if (this.currentSuggestionIndex < this.suggestionQueue.length) {
      console.log('[NESController] Skipping to next suggestion...');
      this.showCurrentSuggestion();
    } else {
      console.log('[NESController] No more suggestions');
      this.clearSuggestionQueue('all skipped');
    }
  }

  /**
   * 🆕 拒绝所有剩余建议
   */
  public rejectAllSuggestions(): void {
    // 记录所有剩余建议为拒绝
    for (let i = this.currentSuggestionIndex; i < this.suggestionQueue.length; i++) {
      const prediction = this.suggestionQueue[i];
      if (prediction) {
        this.recordUserFeedback(prediction, 'rejected');
      }
    }
    
    console.log('[NESController] ❌ All remaining suggestions rejected');
    this.clearSuggestionQueue('user rejected all');
  }

  /**
   * 关闭预览
   */
  public closePreview(): void {
    this.renderer.clearViewZone();
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.abortController?.abort();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.renderer.dispose();
    this.toast.dispose();
    console.log("[NESController] Disposed");
  }
}
