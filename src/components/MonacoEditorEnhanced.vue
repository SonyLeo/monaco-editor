<template>
  <div class="monaco-container">
    <div class="header">
      <h2>🤖 Monaco Editor with AI Copilot</h2>
      <div class="status-group">
        <div class="status" :class="{ thinking: isAIThinking }">
          <span class="indicator"></span>
          {{ isAIThinking ? "🤔 AI 正在思考..." : "💡 就绪" }}
        </div>
        <div class="status" :class="{ connected: isServerHealthy }">
          <span class="indicator"></span>
          {{ isServerHealthy ? `✅ ${aiProvider}` : "❌ 服务器未连接" }}
        </div>
      </div>
    </div>
    <div class="editor-info">
      <p>
        💡
        <strong>使用提示：</strong>
        开始输入代码，AI 将自动提供智能补全建议
      </p>
      <p>
        ⌨️
        <strong>快捷键：</strong>
        Tab 键接受补全 | Esc 取消补全 | Alt+\ 手动触发补全
      </p>
      <p>
        🎯
        <strong>当前语言：</strong>
        {{ language }}
      </p>
    </div>
    <div ref="editorContainer" class="editor"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import * as monaco from "monaco-editor";
import { registerCompletion } from "monacopilot";
import {
  API_ENDPOINTS,
  API_CONFIG,
  EDITOR_CONFIG,
  COMPLETION_TRIGGER_CONFIG,
} from "../constants";
import { shouldTriggerCompletion } from "../utils/completionTrigger";
import { createCompletionCallbacks } from "../utils/completionCallbacks";
import { requestManager } from "../utils/requestManager";

const editorContainer = ref<HTMLElement | null>(null);
const isServerHealthy = ref(false);
const isAIThinking = ref(false);
const language = ref<string>(EDITOR_CONFIG.DEFAULT_LANGUAGE);
const filename = ref<string>('untitled.js');
const aiProvider = ref<string>('未知');

let editor: monaco.editor.IStandaloneCodeEditor | null = null;

/**
 * 从编辑器获取文件信息
 */
const updateFileContext = () => {
  if (!editor) return;
  
  const model = editor.getModel();
  if (!model) return;
  
  // 获取文件路径
  const uri = model.uri;
  const path = uri.path || 'untitled.js';
  filename.value = path.split('/').pop() || 'untitled.js';
  
  // 获取语言
  const lang = model.getLanguageId();
  language.value = lang;
};

// 检查服务器健康状态
const checkServerHealth = async () => {
  try {
    const response = await fetch(API_ENDPOINTS.HEALTH);
    const data = await response.json();
    isServerHealthy.value = response.ok && data.status === "ok";
    
    // 获取 AI 提供商信息
    if (data.provider) {
      aiProvider.value = data.provider === 'qwen-coder' 
        ? 'Qwen Coder' 
        : data.provider === 'deepseek-coder'
        ? 'DeepSeek Coder'
        : data.provider;
    }
  } catch (error) {
    isServerHealthy.value = false;
    aiProvider.value = '未连接';
    console.error("❌ 服务器健康检查失败:", error);
  }
};

onMounted(() => {
  if (!editorContainer.value) return;

  // 检查服务器状态
  checkServerHealth();

  // 定时检查服务器状态
  const healthCheckInterval = setInterval(
    checkServerHealth,
    API_CONFIG.HEALTH_CHECK_INTERVAL
  );

  // 创建 Monaco Editor 实例
  editor = monaco.editor.create(editorContainer.value, {
    value: `// 欢迎使用 Monaco Editor + DeepSeek AI Copilot!
// 请确保后端服务器已启动: node server.mjs
// 
// 开始输入代码，体验 AI 智能补全...

function calculateSum(a, b) {
  return 
}

async function fetchUserData(userId) {
  
}

class UserProfile {
  
}

const config = {
  
}
`,
    language: language.value,
    theme: EDITOR_CONFIG.THEME,
    fontSize: EDITOR_CONFIG.FONT_SIZE,
    minimap: { enabled: EDITOR_CONFIG.MINIMAP_ENABLED },
    automaticLayout: EDITOR_CONFIG.AUTOMATIC_LAYOUT,
    tabSize: EDITOR_CONFIG.TAB_SIZE,
    suggestOnTriggerCharacters: EDITOR_CONFIG.SUGGEST_ON_TRIGGER_CHARACTERS,
    quickSuggestions: EDITOR_CONFIG.QUICK_SUGGESTIONS,
    wordBasedSuggestions: EDITOR_CONFIG.WORD_BASED_SUGGESTIONS
  });

  // 更新文件上下文
  updateFileContext();

  // 配置请求管理器
  requestManager.setEndpoint(API_ENDPOINTS.COMPLETION);
  requestManager.setDebounceDelay(200); // 设置防抖延迟为 200ms
  requestManager.setDebounceEnabled(true); // 启用防抖

  // 注册 AI 补全功能
  try {
    registerCompletion(monaco, editor, {
      language: language.value,
      endpoint: API_ENDPOINTS.COMPLETION,
      
      // 🎯 文件名
      filename: filename.value,
      
      trigger: COMPLETION_TRIGGER_CONFIG.TRIGGER_MODE,
      maxContextLines: COMPLETION_TRIGGER_CONFIG.MAX_CONTEXT_LINES,
      enableCaching: COMPLETION_TRIGGER_CONFIG.ENABLE_CACHING,
      allowFollowUpCompletions: COMPLETION_TRIGGER_CONFIG.ALLOW_FOLLOW_UP,
      triggerIf: shouldTriggerCompletion,
      ...createCompletionCallbacks(isAIThinking),
      
      // 🚀 自定义请求处理器 - 支持防抖 + 请求取消
      requestHandler: requestManager.createRequestHandler(),
    });
  } catch (error) {
    console.error("❌ AI 补全注册失败:", error);
  }

  onBeforeUnmount(() => {
    clearInterval(healthCheckInterval);
    requestManager.reset(); // 清理请求管理器
    editor?.dispose();
  });
});
</script>

<style scoped>
.monaco-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #fff;
}

.header {
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.status-group {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.3s ease;
}

.status.connected {
  background: rgba(76, 175, 80, 0.2);
  border: 1px solid rgba(76, 175, 80, 0.5);
}

.indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f44336;
  animation: pulse 2s infinite;
}

.status.connected .indicator {
  background: #4caf50;
}

.status.thinking {
  background: rgba(255, 193, 7, 0.2);
  border: 1px solid rgba(255, 193, 7, 0.5);
}

.status.thinking .indicator {
  background: #ffc107;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.editor-info {
  padding: 1rem 1.5rem;
  background: #252525;
  border-bottom: 1px solid #3e3e3e;
  font-size: 0.9rem;
  line-height: 1.6;
}

.editor-info p {
  margin: 0.3rem 0;
}

.editor-info strong {
  color: #4fc3f7;
}

.editor {
  flex: 1;
  min-height: 0;
}
</style>
