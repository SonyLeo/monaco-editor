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
  monacoInstance: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  config: AICodeAssistantConfig
): AICodeAssistant {
  console.log('[AICodeAssistant] Initializing...');

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
    fimEngine = new FIMEngine(editor, finalConfig.fim.endpoint);
    fimEngine.register();
    console.log('[AICodeAssistant] FIM Engine registered');
  }

  // 初始化 NES 引擎
  let nesEngine: NESEngine | null = null;
  if (finalConfig.nes?.enabled && finalConfig.nes.endpoint) {
    nesEngine = new NESEngine(editor, {
      ...finalConfig.nes,
      endpoint: finalConfig.nes.endpoint, // 确保 endpoint 存在
    });
    console.log('[AICodeAssistant] NES Engine initialized');
  }

  // 监听编辑事件
  let debounceTimer: number | null = null;
  let nextEditIsNES = false; // 标记下一次编辑是否来自 NES
  let nesEditProtectionUntil = 0; // NES 编辑保护期（时间戳）

  // 设置 NES 编辑回调
  if (nesEngine) {
    nesEngine.setOnEditApplied((lineNumber) => {
      console.log('[AICodeAssistant] NES edit will be applied at line', lineNumber);
      nextEditIsNES = true;
      // 设置 2 秒保护期，期间不触发新的 NES 检测
      nesEditProtectionUntil = Date.now() + 2000;
    });
  }

  model.onDidChangeContent((event) => {
    // 记录编辑历史（标记来源）
    const source = nextEditIsNES ? 'nes' : 'user';
    event.changes.forEach((change) => {
      editHistory.recordEdit(change, model, source);
    });

    // 重置标记
    if (nextEditIsNES) {
      nextEditIsNES = false;
      console.log('[AICodeAssistant] NES edit recorded, skipping detection');
      return; // NES 编辑不触发新的检测
    }

    // 如果 NES 未启用，直接返回
    if (!nesEngine || !finalConfig.nes?.enabled) {
      return;
    }

    // 检查保护期
    if (Date.now() < nesEditProtectionUntil) {
      console.log('[AICodeAssistant] In NES edit protection period, skipping detection');
      return;
    }

    // 如果 NES 已经激活，不触发新的检测
    if (nesEngine.isActive()) {
      console.log('[AICodeAssistant] NES already active, skipping detection');
      return;
    }

    // 防抖处理 NES 检测
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(async () => {
      const recentEdits = editHistory.getRecentEdits(10);
      
      // 再次检查 NES 是否激活（防抖期间可能已激活）
      if (nesEngine!.isActive()) {
        console.log('[AICodeAssistant] NES activated during debounce, skipping');
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

  console.log('[AICodeAssistant] Initialized successfully');

  // 注册快捷键（只注册 NES 相关的）
  if (nesEngine) {
    // Tab - 智能行为：
    // - 预览未展开 → 跳转并展开预览
    // - 预览已展开 → 接受建议
    // - NES 未激活 → 让 Monaco 处理（FIM）
    editor.onKeyDown((e) => {
      if (e.keyCode === monaco.KeyCode.Tab && nesEngine!.isActive()) {
        e.preventDefault();
        e.stopPropagation();
        
        // 检查预览是否已展开
        if (nesEngine!.isPreviewShown()) {
          // 预览已展开 → 接受建议
          nesEngine!.acceptSuggestion();
        } else {
          // 预览未展开 → 展开预览
          nesEngine!.togglePreview();
        }
      }
    });

    // Alt+N - 跳过建议
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyN, () => {
      if (nesEngine!.isActive()) {
        nesEngine!.skipSuggestion();
      }
    });

    // Esc - 完全关闭 NES
    editor.addCommand(monaco.KeyCode.Escape, () => {
      if (nesEngine!.isActive()) {
        nesEngine!.closeCompletely();
        
        // 解锁 FIM
        dispatcher.setNESActive(false);
        if (fimEngine) {
          fimEngine.unlock();
        }
      }
    });
  }

  // 返回 API
  return {
    dispose: () => {
      if (fimEngine) fimEngine.dispose();
      if (nesEngine) nesEngine.dispose();
      if (debounceTimer) clearTimeout(debounceTimer);
      console.log('[AICodeAssistant] Disposed');
    },
  };
}
