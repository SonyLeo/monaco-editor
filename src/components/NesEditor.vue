<template>
  <div class="nes-editor-container">
    <div class="nes-header">
      <div class="title">
        <span class="icon">🤖</span>
        <span>NES Editor</span>
      </div>
      <div class="status-bar">
        <div class="status-item">
          <span class="label">Fast:</span>
          <span class="value">Ready</span>
        </div>
        <div class="status-item">
          <span class="label">Slow:</span>
          <span class="value">{{ nesStatus }}</span>
        </div>
      </div>
    </div>

    <div ref="editorContainer" class="monaco-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef } from "vue";
import * as monaco from "monaco-editor";
import { FastCompletionProvider } from "../core/engines/FastCompletionProvider";
import { NESController } from "../core/engines/NESController";
import { TabKeyHandler } from "../core/utils/TabKeyHandler";
import { EditDispatcher } from "../core/dispatcher/EditDispatcher";
import { NES_CONFIG } from "../core/config";

const editorContainer = ref<HTMLElement | null>(null);
const nesStatus = ref("Sleeping");
const editorRef = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);

let fastProvider: FastCompletionProvider | null = null;
let nesController: NESController | null = null;
let tabKeyHandler: TabKeyHandler | null = null;
let dispatcher: EditDispatcher | null = null;
let dispatchTimer: number | null = null; // ✅ 防抖定时器

onMounted(() => {
  if (!editorContainer.value) return;

  // 初始化 Monaco Editor
  const editor = monaco.editor.create(editorContainer.value, {
    value: `// Welcome to NES Editor (Next Edit Suggestions)
// Powered by DeepSeek Dual Engine

// Try editing this code:
function createUser(name: string) {
  console.log("Creating user:", name);
  return { name };
}

// Usage examples - try changing the function signature above
const user1 = createUser("Alice");
const user2 = createUser("Bob");
const user3 = createUser("Charlie");

// Tips:
// - Edit the function to add a new parameter
// - Wait 1.5 seconds after editing
// - NES will predict where else you need to update
// - Press Alt+Enter to navigate to suggestions
// - Press Tab to accept suggestions
`,
    language: "typescript",
    theme: "vs-dark",
    fontSize: 14,
    glyphMargin: true,
    automaticLayout: true,
    minimap: { enabled: false },
    suggestOnTriggerCharacters: true,
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false,
    },
  });

  editorRef.value = editor;

  // 🆕 初始化 Dispatcher
  dispatcher = new EditDispatcher();

  // ✅ 设置 Monaco Model（启用语义分析）
  const model = editor.getModel();
  if (model) {
    dispatcher.setModel(model);
  }

  // 启动 Fast Engine (代码补全)
  // ✅ P0: 传递 Dispatcher 给 FastCompletionProvider
  fastProvider = new FastCompletionProvider(dispatcher);
  fastProvider.register();

  // 启动 Slow Engine (NES 预测)
  nesController = new NESController(editor);

  // 🆕 设置 Dispatcher 引用（用于 FIM 锁定）
  nesController.setDispatcher(dispatcher);

  // 🆕 设置 NES 完成回调（通知 Dispatcher）
  nesController.setOnCompleteCallback(() => {
    dispatcher?.onNESComplete();
    nesStatus.value = "Sleeping";
  });

  // 🆕 监听编辑事件，通过 Dispatcher 分发（带防抖）
  editor.onDidChangeModelContent(async () => {
    if (!dispatcher || !nesController) return;

    // ✅ 清除之前的定时器
    if (dispatchTimer !== null) {
      clearTimeout(dispatchTimer);
    }

    // ✅ 500ms 后再检测（用户停止输入后）
    dispatchTimer = window.setTimeout(async () => {
      // 获取最近的编辑历史
      const editHistory =
        (nesController as any).editHistoryManager?.getRecentEdits(5) || [];

      // 通过 Dispatcher 分发（使用语义分析）
      const result = await dispatcher!.dispatch(editHistory);

      console.log(
        `[NesEditor] Dispatch result: ${result.target} (${result.reason})`,
      );

      // 根据分发结果更新状态
      if (result.target === "NES" && result.symptom) {
        // 检测到症状，唤醒 NES
        nesStatus.value = "Diagnosing";
        nesController!.wakeUp(result.symptom, editHistory).then(() => {
          if (!nesController) return;
          const state = nesController.getLifecycleState();
          nesStatus.value =
            state === "SUGGESTING"
              ? "Suggesting"
              : state === "TREATING"
                ? "Treating"
                : "Sleeping";
        });
      } else if (result.target === "FIM") {
        // FIM 处理（已经在 FastCompletionProvider 中处理）
        nesStatus.value = "Sleeping";
      }
    }, NES_CONFIG.TIME.NES_DETECTION_DEBOUNCE_MS); // 使用配置的防抖延迟
  });

  // 初始化 Tab 键处理器
  tabKeyHandler = new TabKeyHandler(editor, nesController);

  // Tab 键：使用 addCommand 覆盖默认行为
  editor.addCommand(
    monaco.KeyCode.Tab,
    () => {
      const handled = tabKeyHandler?.handleTab();
      if (!handled) {
        // 优先级 4: 默认 Tab（缩进）
        editor.trigger("keyboard", "tab", {});
      }
    },
    "",
  );

  // Esc 键处理
  editor.addCommand(monaco.KeyCode.Escape, () => {
    if (nesController?.hasActivePreview()) {
      // 优先关闭 NES 预览
      nesController.closePreview();
    } else {
      // 默认 Esc 行为
      editor.trigger("keyboard", "cancelSelection", null);
    }
  });

  // Alt+Enter 键处理（跳转到 NES 建议）
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => {
    if (nesController?.hasActiveSuggestion()) {
      nesController.applySuggestion();
    }
  });

  // Alt+N 键：跳过当前建议，跳到下一个
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyN, () => {
    if (nesController?.hasActiveSuggestion()) {
      nesController.skipSuggestion();
    }
  });

  // Shift+Esc 键：拒绝所有剩余建议
  editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Escape, () => {
    if (nesController?.hasActiveSuggestion()) {
      nesController.rejectAllSuggestions();
    }
  });

  // 监听 Glyph Margin 点击事件
  editor.onMouseDown((e) => {
    // 检查是否点击了 Glyph Margin 区域
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      const lineNumber = e.target.position?.lineNumber;
      if (!lineNumber) return;

      // 检查该行是否有 NES 建议
      if (nesController?.hasActiveSuggestion()) {
        console.log(`[NesEditor] Glyph Icon clicked at line ${lineNumber}`);

        // 右键点击：显示菜单
        if (e.event.rightButton) {
          e.event.preventDefault();
          const x = e.event.posx;
          const y = e.event.posy;

          nesController?.showContextMenu(x, y, {
            onNavigate: () => {
              console.log("[NesEditor] Navigate to suggestion");
              nesController?.jumpToSuggestion();
            },
            onAccept: () => {
              console.log("[NesEditor] Accept suggestion");
              nesController?.acceptSuggestion();
            },
            onDismiss: () => {
              console.log("[NesEditor] Dismiss suggestion");
              nesController?.skipSuggestion();
            },
          });
        } else {
          // 左键点击：展开预览或接受建议
          if (nesController?.hasActivePreview()) {
            nesController.acceptSuggestion();
          } else {
            nesController?.applySuggestion();
          }
        }
      }
    }
  });

  console.log("✅ NES Editor initialized");
});

onBeforeUnmount(() => {
  // ✅ 清理防抖定时器
  if (dispatchTimer !== null) {
    clearTimeout(dispatchTimer);
  }
  
  fastProvider?.dispose();
  nesController?.dispose();
  editorRef.value?.dispose();
});
</script>

<style scoped>
.nes-editor-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #1e1e1e;
  color: #d4d4d4;
}

.nes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-bottom: 1px solid #3e3e3e;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.icon {
  font-size: 1.5rem;
}

.status-bar {
  display: flex;
  gap: 1.5rem;
  font-size: 0.85rem;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.label {
  color: rgba(255, 255, 255, 0.7);
}

.value {
  color: #4fc3f7;
  font-weight: 500;
}

.monaco-container {
  flex: 1;
  overflow: hidden;
}
</style>
