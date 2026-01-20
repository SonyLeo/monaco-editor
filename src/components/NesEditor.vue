<template>
    <div class="nes-editor-container">
        <div class="nes-header">
            <div class="title">
                <span class="icon">🤖</span>
                <span>NES Editor</span>
                <span class="badge">Dual Engine</span>
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
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue';
import * as monaco from 'monaco-editor';
import { FastCompletionProvider } from '../utils/nes/FastCompletionProvider';
import { NESController } from '../utils/nes/NESController';

const editorContainer = ref<HTMLElement | null>(null);
const nesStatus = ref('Idle');
const editorRef = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);

let fastProvider: FastCompletionProvider | null = null;
let nesController: NESController | null = null;

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
        language: 'typescript',
        theme: 'vs-dark',
        fontSize: 14,
        glyphMargin: true, // 必须开启，用于显示 NES 箭头
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

    // 启动 Fast Engine (代码补全)
    fastProvider = new FastCompletionProvider();
    fastProvider.register();

    // 启动 Slow Engine (NES 预测)
    nesController = new NESController(editor);

    // Tab 键：完整优先级处理（修复 Suggest Widget 冲突）
    editor.addCommand(monaco.KeyCode.Tab, () => {
        // 🔥 优先级 0: Monaco Suggest Widget（建议框 - 最高优先级）
        try {
            // @ts-ignore - 访问内部 Suggest Controller
            const suggestController = editor.getContribution('editor.contrib.suggestController');
            const widgetVisible = suggestController?.widget?.value?.suggestWidgetVisible?.get();

            if (widgetVisible) {
                // 建议框打开，选择当前高亮的建议
                editor.trigger('keyboard', 'acceptSelectedSuggestion', {});
                console.log('[NesEditor] ✅ Suggest widget item selected');
                return; // 不执行后续逻辑
            }
        } catch (e) {
            // Suggest Widget 检测失败，继续
        }

        // 🔧 优先级 1: Inline Completion（内联补全 - Fast Engine）
        try {
            // @ts-ignore - 访问内部 API
            const widget = editor.getContribution('editor.contrib.inlineSuggest');
            if (widget?.model?.state?.inlineCompletion) {
                editor.trigger('keyboard', 'editor.action.inlineSuggest.commit', {});
                console.log('[NesEditor] ✅ Inline completion accepted (widget detected)');
                return; // 成功接受，直接返回，不执行后续逻辑
            }
        } catch (e) {
            // 内部 API 失败，降级到方案2
        }

        // 🔧 优先级 2: 延迟检查光标位置（降级方案）
        const oldPosition = editor.getPosition();
        editor.trigger('keyboard', 'editor.action.inlineSuggest.commit', {});

        setTimeout(() => {
            const newPosition = editor.getPosition();

            // 如果光标移动了，说明补全被接受
            if (
                oldPosition &&
                newPosition &&
                (oldPosition.lineNumber !== newPosition.lineNumber ||
                    oldPosition.column !== newPosition.column)
            ) {
                console.log('[NesEditor] ✅ Inline completion accepted (cursor moved)');
                return; // 不执行缩进
            }

            // 优先级 3: NES Preview
            if (nesController && nesController.hasActivePreview()) {
                nesController.acceptSuggestion();
                console.log('[NesEditor] ✅ NES preview accepted');
                return;
            }

            // 优先级 4: NES Suggestion
            if (nesController && nesController.hasActiveSuggestion()) {
                nesController.applySuggestion();
                console.log('[NesEditor] ✅ NES suggestion applied');
                return;
            }

            // 优先级 5: 默认 Tab（缩进）
            editor.trigger('keyboard', 'tab', {});
        }, 10); // 10ms 足够检测光标变化
    });

    // Esc 键处理
    editor.addCommand(monaco.KeyCode.Escape, () => {
        if (nesController?.hasActivePreview()) {
            // 优先关闭 NES 预览
            nesController.closePreview();
        } else {
            // 默认 Esc 行为
            editor.trigger('keyboard', 'cancelSelection', null);
        }
    });

    // Alt+Enter 键处理（跳转到 NES 建议）
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => {
        if (nesController?.hasActiveSuggestion()) {
            nesController.applySuggestion();
        }
    });

    console.log('✅ NES Editor initialized');
});

onBeforeUnmount(() => {
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

.badge {
    font-size: 0.7rem;
    background: rgba(255, 255, 255, 0.2);
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
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

/* NES 内嵌 DiffEditor 容器样式 */
:deep(.nes-native-diff-container) {
    /* 移除边框和背景，让 DiffEditor 自行渲染 */
    border-left: 3px solid #4a9eff; /* 保持左侧蓝色指示条 */
    margin-left: 50px; /* 对齐行号 */
    background: transparent;
    /* 必要的，确保 DiffEditor 能撑开 */
    display: block;
}

/* 隐藏原生 DiffEditor 的装饰元素，让它看起来更干净 */
:deep(.nes-native-diff-container .monaco-diff-editor .diff-review-line-number) {
    display: none !important;
}

:deep(.nes-native-diff-container .monaco-editor .margin) {
    display: none !important; /* 隐藏内部行号区 */
}

/* NES 箭头图标样式 - 还原 Copilot Tab 箭头样式 */
:deep(.nes-arrow-icon) {
    /* 使用类似 Copilot 的 ->| 图标 */
    background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="%234a9eff"><path fill-rule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/><path fill-rule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/></svg>')
        no-repeat center center;
    background-size: 14px 14px;
    cursor: pointer;
    opacity: 0.9;
    transition: all 0.2s ease;
}

:deep(.nes-arrow-icon:hover) {
    opacity: 1;
    filter: drop-shadow(0 0 2px #4a9eff);
}
</style>
