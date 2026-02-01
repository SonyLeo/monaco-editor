<script setup lang="ts">
/**
 * AICodeAssistantEditor - Vue 3 组件示例
 * 展示如何在 Vue 项目中集成 AI Code Assistant
 */
import { ref, onMounted, onUnmounted, shallowRef } from 'vue';
import * as monaco from 'monaco-editor';
import { initAICodeAssistant, type AICodeAssistant } from '../../index';

// Props
interface Props {
    modelValue?: string;
    language?: string;
    theme?: string;
    fimEndpoint?: string;
    nesEndpoint?: string;
}

const props = withDefaults(defineProps<Props>(), {
    modelValue: `// Welcome to AI Code Assistant
// Try editing this code:

function createUser(name: string) {
  console.log("Creating user:", name);
  return { name };
}

// Usage examples
const user1 = createUser("Alice");
const user2 = createUser("Bob");
const user3 = createUser("Charlie");

// Tips:
// - Edit the function to add a new parameter
// - Wait 1.5 seconds after editing
// - NES will predict where else you need to update
// - Press Tab to preview/accept suggestions
// - Press Alt+N to skip suggestions
// - Press Esc to close suggestions
`,
    language: 'typescript',
    theme: 'vs-dark',
    fimEndpoint: 'http://localhost:3000/api/completion',
    nesEndpoint: 'http://localhost:3000/api/next-edit-prediction',
});

// Emits
const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'ready', editor: monaco.editor.IStandaloneCodeEditor): void;
}>();

// Refs
const editorContainer = ref<HTMLElement | null>(null);
const editorInstance = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);
const assistant = shallowRef<AICodeAssistant | null>(null);
const logs = ref<Array<{ time: string; message: string; type: string }>>([]);

// 日志记录
function addLog(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
    const time = new Date().toLocaleTimeString();
    logs.value.push({ time, message, type });
    // 保持最多 50 条日志
    if (logs.value.length > 50) {
        logs.value = logs.value.slice(-50);
    }
}

// 初始化编辑器
onMounted(() => {
    if (!editorContainer.value) return;

    // 创建 Monaco 编辑器
    const editor = monaco.editor.create(editorContainer.value, {
        value: props.modelValue,
        language: props.language,
        theme: props.theme,
        fontSize: 14,
        glyphMargin: true,
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        roundedSelection: false,
        renderLineHighlight: 'all',
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
    });

    editorInstance.value = editor;
    addLog('Monaco Editor created', 'success');

    // 监听内容变化
    editor.getModel()?.onDidChangeContent(() => {
        emit('update:modelValue', editor.getValue());
    });

    // 初始化 AI Code Assistant
    try {
        assistant.value = initAICodeAssistant(monaco, editor, {
            fim: {
                enabled: true,
                endpoint: props.fimEndpoint,
            },
            nes: {
                enabled: true,
                endpoint: props.nesEndpoint,
            },
        });

        addLog('AI Code Assistant initialized', 'success');
        emit('ready', editor);
    } catch (error) {
        addLog(`Failed to initialize: ${error}`, 'error');
    }
});

// 清理
onUnmounted(() => {
    if (assistant.value) {
        assistant.value.dispose();
        addLog('AI Code Assistant disposed', 'info');
    }
    if (editorInstance.value) {
        editorInstance.value.dispose();
        addLog('Monaco Editor disposed', 'info');
    }
});

// 暴露方法
defineExpose({
    getEditor: () => editorInstance.value,
    getAssistant: () => assistant.value,
});
</script>

<template>
    <div class="ai-code-assistant-editor">
        <div class="editor-container" ref="editorContainer"></div>

        <div class="console-panel">
            <div class="console-header">
                <span>📋 Console</span>
                <button @click="logs = []">Clear</button>
            </div>
            <div class="console-logs">
                <div v-for="(log, index) in logs" :key="index" :class="['log-entry', log.type]">
                    <span class="log-time">[{{ log.time }}]</span>
                    <span class="log-message">{{ log.message }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.ai-code-assistant-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1e1e1e;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.editor-container {
    flex: 1;
    min-height: 400px;
}

.console-panel {
    height: 200px;
    border-top: 1px solid #3e3e3e;
    display: flex;
    flex-direction: column;
}

.console-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #252526;
    border-bottom: 1px solid #3e3e3e;
    color: #d4d4d4;
    font-size: 13px;
}

.console-header button {
    background: #3e3e3e;
    border: none;
    color: #d4d4d4;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}

.console-header button:hover {
    background: #4e4e4e;
}

.console-logs {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
}

.log-entry {
    padding: 4px 8px;
    margin-bottom: 2px;
    border-radius: 2px;
}

.log-entry.info {
    color: #4fc3f7;
}

.log-entry.success {
    color: #81c784;
}

.log-entry.error {
    color: #e57373;
}

.log-entry.warn {
    color: #ffb74d;
}

.log-time {
    opacity: 0.7;
    margin-right: 8px;
}
</style>
