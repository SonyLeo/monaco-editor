/**
 * AI Code Assistant - 主入口
 * 支持 FIM（实时补全）和 NES（编辑预测）
 */

import * as monaco from 'monaco-editor';
import type { AICodeAssistantConfig, AICodeAssistant } from './types/index';
import { DEFAULT_CONFIG } from './config';
import { FIMEngine } from './fim/FIMEngine';
import { NESEngine } from './nes/NESEngine';
import { EditDispatcher } from './shared/EditDispatcher';
import { EditHistoryManager } from './shared/EditHistoryManager';
import { logger } from './shared/logger';

// 加载样式
import './nes/styles.css';

/**
 * 初始化 AI 代码助手
 * @param monacoInstance Monaco 编辑器模块
 * @param editor Monaco 编辑器实例
 * @param config 配置选项
 * @returns AI 代码助手实例
 */
export function initAICodeAssistant(
  _monacoInstance: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  config: AICodeAssistantConfig
): AICodeAssistant {

  // 合并配置
  const finalConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    fim: { ...DEFAULT_CONFIG.fim, ...config.fim },
    nes: { ...DEFAULT_CONFIG.nes, ...config.nes },
  };

  const model = editor.getModel();
  if (!model) {
    throw new Error('Editor model is required');
  }

  // 初始化核心组件
  const editHistory = new EditHistoryManager(model.getValue());
  const dispatcher = new EditDispatcher();

  // 初始化 FIM 引擎
  let fimEngine: FIMEngine | null = null;
  if (finalConfig.fim?.enabled && finalConfig.fim.endpoint) {
    fimEngine = new FIMEngine(finalConfig.fim.endpoint);
    fimEngine.register();
  }

  // 初始化 NES 引擎
  let nesEngine: NESEngine | null = null;
  if (finalConfig.nes?.enabled && finalConfig.nes.endpoint) {
    nesEngine = new NESEngine(editor, {
      ...finalConfig.nes,
      endpoint: finalConfig.nes.endpoint, // 确保 endpoint 存在
    });
  }

  // 监听编辑事件
  let debounceTimer: number | null = null;
  let nextEditIsNES = false; // 标记下一次编辑是否来自 NES
  let nextEditIsFIM = false; //  标记下一次编辑是否来自 FIM
  let nesEditProtectionUntil = 0; // NES 编辑保护期（时间戳）

  // 设置 NES 编辑回调
  if (nesEngine) {
    nesEngine.setOnEditApplied((_lineNumber) => {
      nextEditIsNES = true;
      // 设置 2 秒保护期，期间不触发新的 NES 检测
      nesEditProtectionUntil = Date.now() + 2000;
    });
  }

  model.onDidChangeContent((event) => {
    //  检测 FIM 接受（大块插入）
    if (fimEngine && fimEngine.hasGhostText()) {
      event.changes.forEach((change) => {
        // 如果是大块插入（> 10 个字符），且 Ghost Text 可见
        if (change.text.length > 10 && change.rangeLength === 0) {
          nextEditIsFIM = true;
          fimEngine!.markGhostTextGone(); // 标记 Ghost Text 已消失
        }
      });
    }

    // 记录编辑历史（标记来源）
    const source = nextEditIsFIM ? 'fim' : (nextEditIsNES ? 'nes' : 'user');
    event.changes.forEach((change) => {
      editHistory.recordEdit(change, model, source);
    });

    // 重置标记
    if (nextEditIsFIM) {
      nextEditIsFIM = false;
    }
    if (nextEditIsNES) {
      nextEditIsNES = false;
      return; // NES 编辑不触发新的检测
    }

    // 如果 NES 未启用，直接返回
    if (!nesEngine || !finalConfig.nes?.enabled) {
      return;
    }

    // 检查保护期
    if (Date.now() < nesEditProtectionUntil) {
      return;
    }

    // 如果 NES 已经激活，不触发新的检测
    if (nesEngine.isActive()) {
      return;
    }

    // 防抖处理 NES 检测
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(async () => {
      //  检查 FIM 状态，等待用户决策
      if (fimEngine && fimEngine.hasGhostText()) {
        const fimDecided = await fimEngine.waitForDecision(5000); // 等待最多 5 秒
        
        if (fimDecided) {
        } else {
        }
      }

      const recentEdits = editHistory.getRecentEdits(10);
      
      // 再次检查 NES 是否激活（防抖期间可能已激活）
      if (nesEngine!.isActive()) {
        return;
      }

      // 唤醒 NES
      await nesEngine!.wakeUp(recentEdits);

      // 更新 Dispatcher 状态（用于锁定 FIM）
      dispatcher.setNESActive(nesEngine!.isActive());
      
      // 锁定/解锁 FIM
      if (fimEngine) {
        if (nesEngine!.isActive()) {
          fimEngine.lock();
        } else {
          fimEngine.unlock();
        }
      }
    }, finalConfig.nes.debounceMs);
  });

  logger.info('[AICodeAssistant] Initialized successfully');

  //  监听编辑器事件，检测 Ghost Text 消失
  if (fimEngine) {
    // 监听光标移动（Ghost Text 可能因光标移动而消失）
    editor.onDidChangeCursorPosition(() => {
      if (fimEngine!.hasGhostText()) {
        // 延迟检查，避免误判
        setTimeout(() => {
          // 简单假设：光标移动后，如果没有新的 Ghost Text，则已消失
          // （更精确的方式需要 Monaco API 支持）
          if (fimEngine!.getGhostTextAge() > 200) {
            fimEngine!.markGhostTextGone();
          }
        }, 100);
      }
    });
  }

  // 快捷键处理
  if (nesEngine) {
    // Tab - 只在 NES 激活时拦截，否则让 Monaco 处理（FIM、智能提示等）
    editor.onKeyDown((e) => {
      if (e.keyCode === monaco.KeyCode.Tab) {
        // 只有在 NES 激活且没有 FIM Ghost Text 时才拦截
        if (nesEngine!.isActive() && !(fimEngine && fimEngine.hasGhostText())) {
          e.preventDefault();
          e.stopPropagation();
          nesEngine!.acceptSuggestion();
        }
        // 否则不拦截，让 Monaco 自然处理
      }
    });

    // Alt+N - 跳过建议
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyN, () => {
      if (nesEngine!.isActive()) {
        nesEngine!.skipSuggestion();
      }
    });

    // Esc - 智能处理：有 FIM 时关闭 FIM，NES 激活时关闭 NES
    editor.onKeyDown((e) => {
      if (e.keyCode === monaco.KeyCode.Escape) {
        // 优先级 1：如果有 FIM Ghost Text，让 Monaco 处理（不拦截）
        if (fimEngine && fimEngine.hasGhostText()) {
          // 不阻止，让 Monaco 关闭 Ghost Text
          return;
        }

        // 优先级 2：如果 NES 激活，关闭 NES
        if (nesEngine!.isActive()) {
          e.preventDefault();
          e.stopPropagation();
          nesEngine!.closeCompletely();
          
          // 解锁 FIM
          dispatcher.setNESActive(false);
          if (fimEngine) {
            fimEngine.unlock();
          }
          logger.debug('[AICodeAssistant] NES closed by Esc, FIM unlocked');
        }
        // 否则让 Monaco 处理默认行为
      }
    });
  }

  // 返回 API
  return {
    dispose: () => {
      if (fimEngine) fimEngine.dispose();
      if (nesEngine) nesEngine.dispose();
      if (debounceTimer) clearTimeout(debounceTimer);
      logger.info('[AICodeAssistant] Disposed');
    },
  };
}
export type { AICodeAssistant, AICodeAssistantConfig };
