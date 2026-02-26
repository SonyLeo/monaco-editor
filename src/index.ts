/**
 * AI Code Assistant - 主入口
 * 支持 FIM（实时补全）和 NES（编辑预测）
 */

import * as monaco from 'monaco-editor';
import type { AICodeAssistantConfig, AICodeAssistant } from '@/types';
import { DEFAULT_CONFIG } from './config';
import { FIMEngine } from '@/engines/FIMEngine';
import { NESEngine } from '@/engines/NESEngine';
import { EngineDispatcher } from '@/services/EngineDispatcher';
import { EditHistoryManager } from '@/services/EditHistoryManager';
import { logger } from '@/utils/logger';

// 注册调试面板快捷键 (Ctrl+Shift+V)
import '@/utils/DebugPanel';

// 加载样式
import './rendering/styles.css';

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
      endpoint: finalConfig.nes.endpoint,
    });
  }

  // 初始化调度器（协调 FIM/NES）
  const dispatcher = new EngineDispatcher(
    fimEngine,
    nesEngine,
    editHistory,
    finalConfig.nes?.debounceMs
  );

  // 监听编辑事件
  model.onDidChangeContent((event) => {
    // 检测 FIM 接受（大块插入）
    if (fimEngine && fimEngine.hasGhostText()) {
      event.changes.forEach((change) => {
        if (change.text.length > 10 && change.rangeLength === 0) {
          dispatcher.markNextEditAsFIM();
          fimEngine!.markGhostTextGone();
        }
      });
    }

    // 记录编辑历史（标记来源）
    const source = dispatcher.getEditSource();
    event.changes.forEach((change) => {
      editHistory.recordEdit(change, model, source);
    });

    // 重置编辑来源标记
    dispatcher.resetEditSource();

    // 如果是 NES 编辑，不触发新的检测
    if (source === 'nes') {
      return;
    }

    // 触发 NES 检测（带防抖和保护期检查）
    dispatcher.triggerNESDetection();
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
          return;
        }

        // 优先级 2：如果 NES 激活，关闭 NES
        if (dispatcher.isNESActive()) {
          e.preventDefault();
          e.stopPropagation();
          dispatcher.closeNES();
          logger.debug('[AICodeAssistant] NES closed by Esc, FIM unlocked');
        }
      }
    });
  }

  // 返回 API
  return {
    dispose: () => {
      if (fimEngine) fimEngine.dispose();
      if (nesEngine) nesEngine.dispose();
      dispatcher.dispose();
      logger.info('[AICodeAssistant] Disposed');
    },
  };
}
export type { AICodeAssistant, AICodeAssistantConfig };
