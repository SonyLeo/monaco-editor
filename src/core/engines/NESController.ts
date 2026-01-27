/**
 * NES Controller: 核心状态机（简化版）
 * 负责协调各个模块，管理整体工作流程
 * 职责：状态管理、事件监听、模块协调
 */

import * as monaco from "monaco-editor";
import { NESRenderer } from "../renderer/NESRenderer";
import { ToastNotification } from "../utils/ToastNotification";
import type { Prediction, EditRecord } from "../../types/nes";
import type { Symptom } from "../../types/dispatcher";

import { SuggestionQueue } from "./SuggestionQueue";
import { EditHistoryManager } from "./EditHistoryManager";
import { FeedbackCollector } from "./FeedbackCollector";
import { PredictionService } from "./PredictionService";
import { NES_CONFIG } from "../config";
import { CoordinateFixer } from "../utils/CoordinateFixer";
import { EditDispatcher } from "../dispatcher/EditDispatcher";

// ✅ P1: 新的管理器
import { NESLifecycleManager } from "./NESLifecycleManager";
import { NESSuggestionManager } from "./NESSuggestionManager";
import { NESEventHandler } from "./NESEventHandler";

export class NESController {
  private state: "IDLE" | "PREDICTING" | "SUGGESTING" = "IDLE";
  private lastSnapshot = "";

  // 核心模块
  private renderer: NESRenderer;
  private toast: ToastNotification;

  // 模块化管理器
  private suggestionQueue: SuggestionQueue;
  private editHistoryManager: EditHistoryManager;
  private feedbackCollector: FeedbackCollector;
  private predictionService: PredictionService;
  private coordinateFixer: CoordinateFixer;
  private dispatcher: EditDispatcher | null = null;

  // ✅ P1: 新的管理器
  private lifecycleManager: NESLifecycleManager;
  private suggestionManager: NESSuggestionManager;
  private eventHandler: NESEventHandler;

  // 回调：通知 Dispatcher NES 完成
  private onCompleteCallback: (() => void) | null = null;

  constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
    this.renderer = new NESRenderer(editor);
    this.toast = new ToastNotification();

    // 初始化模块化管理器
    this.lastSnapshot = editor.getValue();
    this.suggestionQueue = new SuggestionQueue();
    this.editHistoryManager = new EditHistoryManager(this.lastSnapshot);
    this.feedbackCollector = new FeedbackCollector();
    this.predictionService = new PredictionService();
    this.coordinateFixer = new CoordinateFixer(editor, {
      filterComments: false,
      tabSize: 4,
    });

    // ✅ P1: 初始化新的管理器
    this.lifecycleManager = new NESLifecycleManager(
      editor,
      this.predictionService,
      this.coordinateFixer,
      (state) => {
        if (state === "SUGGESTING") {
          this.state = "SUGGESTING";
        } else if (state === "TREATING") {
          this.state = "PREDICTING";
        } else if (state === "SLEEPING") {
          this.state = "IDLE";
        }
      }
    );

    this.suggestionManager = new NESSuggestionManager(
      this.renderer,
      this.suggestionQueue,
      this.feedbackCollector,
      this.toast,
      this.dispatcher,
      () => this.sleep()
    );

    this.eventHandler = new NESEventHandler(editor, this.suggestionQueue);

    this.bindListeners();
    console.log("✅ [NESController] Initialized");

    this.injectStyles();
  }

  public setDispatcher(dispatcher: EditDispatcher): void {
    this.dispatcher = dispatcher;
    // 更新 suggestionManager 的 dispatcher 引用
    (this.suggestionManager as any).dispatcher = dispatcher;
  }

  public setOnCompleteCallback(callback: () => void): void {
    this.onCompleteCallback = callback;
  }

  /**
   * 被 Dispatcher 唤醒（检测到症状）
   */
  public async wakeUp(symptom: Symptom, editHistory: EditRecord[] = []): Promise<void> {
    if (this.lifecycleManager.getState() !== "SLEEPING") {
      console.warn(
        `[NESController] Already ${this.lifecycleManager.getState()}, ignoring wake up`,
      );
      return;
    }

    const predictions = await this.lifecycleManager.wakeUp(symptom, editHistory);

    if (!predictions || predictions.length === 0) {
      console.log("[NESController] No predictions, going to sleep");
      this.sleep();
      return;
    }

    // 验证所有建议
    const validPredictions = predictions.filter((pred) =>
      this.validatePrediction(pred),
    );

    if (validPredictions.length === 0) {
      console.warn("[NESController] All predictions failed validation");
      this.sleep();
      return;
    }

    // 保存到队列并显示
    this.suggestionManager.addPredictions(validPredictions);
    this.lifecycleManager.toSuggesting();
    this.suggestionManager.showCurrent();

    this.lastSnapshot = this.editor.getValue();
  }

  /**
   * NES 完成工作，回到休眠
   */
  private sleep(): void {
    this.lifecycleManager.sleep();
    this.state = "IDLE";
    this.suggestionManager.clear();

    console.log("[NESController] 😴 Going to sleep");

    // ✅ P1: 添加 NES 冷却期
    this.dispatcher?.lockFIM(NES_CONFIG.TIME.LOCK_DURATION_MS);
    this.dispatcher?.lockNES(3000);

    if (this.onCompleteCallback) {
      this.onCompleteCallback();
    }
  }

  /**
   * 绑定事件监听器
   */
  private bindListeners(): void {
    this.editor.onDidChangeModelContent((e) => {
      const model = this.editor.getModel();
      if (!model) return;

      const currentSnapshot = this.editor.getValue();
      this.editHistoryManager.updateSnapshot(currentSnapshot);

      e.changes.forEach((change) => {
        this.editHistoryManager.recordEdit(change, model);
      });

      // 用户打字时：隐藏 ViewZone
      if (this.state === "SUGGESTING") {
        this.renderer.hideViewZone();
      }

      this.handleContentChange(e);
    });

    // 监听光标位置变化
    this.editor.onDidChangeCursorPosition(() => {
      const prediction = this.suggestionManager.getCurrent();
      if (prediction) {
        this.eventHandler.handleCursorChange(prediction, (pred) => {
          this.suggestionManager.updateHintBar(pred);
        });
      }
    });

    // Escape 键拦截
    this.editor.addCommand(monaco.KeyCode.Escape, () => {
      if (this.state === "SUGGESTING") {
        console.log("[NESController] ⎋ Escape pressed, dismissing NES");
        this.suggestionManager.rejectAll();
      }
    });
  }

  /**
   * 处理内容变更
   */
  private handleContentChange(
    e: monaco.editor.IModelContentChangedEvent,
  ): void {
    if (this.state !== "SUGGESTING") return;

    const applyingLine = this.suggestionManager.getApplyingLine();
    if (applyingLine === null) {
      console.log("[NESController] 🔪 User typing detected, clearing NES UI");
      this.suggestionManager.clear();
      this.sleep();
      return;
    }

    if (!this.suggestionQueue.isEmpty) {
      const currentPrediction = this.suggestionQueue.current();
      const isFromSuggestion = this.eventHandler.isEditFromSuggestion(
        e,
        applyingLine,
        currentPrediction,
      );

      if (isFromSuggestion) {
        return;
      }

      const isInQueueRange = this.eventHandler.isEditInQueueRange(e);
      if (isInQueueRange) {
        console.log("[NESController] ⚠️ User editing in queue range");
        this.suggestionManager.clear();
      }
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
   * 双重验证：防止模型幻觉
   */
  private validatePrediction(pred: Prediction): boolean {
    const model = this.editor.getModel();
    if (!model) return false;

    if (pred.targetLine < 1 || pred.targetLine > model.getLineCount()) {
      console.warn(`[NESController] Invalid line number ${pred.targetLine}`);
      return false;
    }

    if (pred.originalLineContent !== undefined) {
      const actualLine = model.getLineContent(pred.targetLine);

      if (!actualLine && !pred.originalLineContent) {
        return true;
      }

      const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
      const expectedNormalized = normalize(pred.originalLineContent);
      const actualNormalized = normalize(actualLine);

      if (expectedNormalized !== actualNormalized) {
        const similarity = this.calculateSimilarity(
          expectedNormalized,
          actualNormalized,
        );

        if (similarity > NES_CONFIG.VALIDATION.SIMILARITY_THRESHOLD) {
          return true;
        }

        console.warn(
          `[NESController] Content mismatch (similarity: ${similarity.toFixed(2)})`,
        );
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

    let matches = 0;
    const shorter = str1.length < str2.length ? str1 : str2;
    const longer = str1.length < str2.length ? str2 : str1;

    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i] ?? "")) matches++;
    }

    return matches / longer.length;
  }

  /**
   * 获取当前生命周期状态（供 Dispatcher 查询）
   */
  public getLifecycleState():
    | "SLEEPING"
    | "DIAGNOSING"
    | "SUGGESTING"
    | "TREATING" {
    return this.lifecycleManager.getState();
  }

  /**
   * 显示右键菜单
   */
  public showContextMenu(
    x: number,
    y: number,
    callbacks: {
      onNavigate?: () => void;
      onAccept?: () => void;
      onDismiss?: () => void;
    },
  ): void {
    this.renderer.showContextMenu(x, y, callbacks);
  }

  /**
   * 跳转到建议位置
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
      console.log("[NESController] No active suggestion");
      return;
    }

    const prediction = this.suggestionManager.getCurrent();
    if (!prediction) return;

    const isOnLine = this.editor.getPosition()?.lineNumber === prediction.targetLine;

    if (!isOnLine) {
      console.log("[NESController] 🧭 Navigating to suggestion line");
      this.eventHandler.jumpToSuggestion(prediction);
      this.renderer.showPreview(prediction);
      return;
    }

    this.acceptSuggestion();
  }

  /**
   * 接受建议
   */
  public acceptSuggestion(): void {
    const hasNext = this.suggestionManager.accept();
    if (hasNext) {
      this.suggestionManager.showCurrent();
    }
  }

  /**
   * 跳过建议
   */
  public skipSuggestion(): void {
    const hasNext = this.suggestionManager.skip();
    if (!hasNext) {
      this.sleep();
    }
  }

  /**
   * 拒绝所有建议
   */
  public rejectAllSuggestions(): void {
    this.suggestionManager.rejectAll();
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
    this.renderer.dispose();
    this.toast.dispose();
    console.log("[NESController] Disposed");
  }
}
