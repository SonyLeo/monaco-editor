# 🚀 快速集成指南 (Integration Guide)

本文档将指导你如何将 `monaco-ai-assistant` 集成到现有的 Monaco Editor 项目中。

## 1. 安装依赖

```bash
# 安装核心依赖
pnpm add monaco-ai-assistant web-tree-sitter
```

## 2. 准备静态资源 (关键步骤)

AI 助手依赖 `web-tree-sitter` 进行代码分析，你需要将 `.wasm` 文件复制到你的 `public` 目录中。

**必须文件：**
- `tree-sitter.wasm`
- `tree-sitter-typescript.wasm` (或其他语言包)

在你的 `package.json` 中添加一个 `postinstall` 脚本来自动复制：

```json
{
  "scripts": {
    "postinstall": "cp node_modules/web-tree-sitter/tree-sitter.wasm public/"
  }
}
```

> **注意**：你需要确保这些 `.wasm` 文件可以通过 HTTP 直接访问，例如 `http://localhost:port/tree-sitter.wasm`。

## 3. 初始化 AI 助手

在你的编辑器初始化代码中（例如 `main.ts` 或组件的 `onMounted`）：

```typescript
import * as monaco from 'monaco-editor';
import { initAICodeAssistant } from 'monaco-ai-assistant';

// 1. 创建 Monaco Editor 实例
const editor = monaco.editor.create(document.getElementById('container'), {
  value: '// Start coding...',
  language: 'typescript',
  automaticLayout: true
});

// 2. 初始化 AI 助手
const aiAssistant = initAICodeAssistant(monaco, editor, {
  // FIM (Fill-In-Middle) - 实时代码补全
  fim: {
    enabled: true,
    endpoint: '/api/completion', // 你的后端代理地址
    debounceMs: 300,             // 防抖时间
  },
  
  // NES (Next Edit Suggestion) - 下一步预测
  nes: {
    enabled: true,
    endpoint: '/api/next-edit-prediction',
    debounceMs: 1500, // 停顿多久后触发预测
  },
  
  // Tree-sitter 配置 (重要)
  treeSitter: {
     wasmPath: '/tree-sitter.wasm', // 指向 public 目录下的文件
     languageWasmPath: '/tree-sitter-typescript.wasm'
  }
});

// 3. 销毁时清理
// aiAssistant.dispose();
```

## 4. 后端 API 规范

前端组件需要配合后端 API 使用。你的后端需要提供以下接口：

### 补全接口 (FIM)
- **POST** `/api/completion`
- **Body**: `{ prompt: string, suffix: string }`
- **Response**: `{ completion: string }` (或流式 SSE)

### 预测接口 (NES)
- **POST** `/api/next-edit-prediction`
- **Body**: `{ fileContent: string, cursorOffset: number, editHistory: [...] }`
- **Response**: `{ predictions: [{ targetLine: 10, text: "..." }] }`

> 详细的 API 协议请参考 [API 文档](./API_REFERENCE.md)。
