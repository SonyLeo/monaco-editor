# AI Code Assistant

轻量级的 Monaco Editor AI 助手，支持 FIM（实时补全）和 NES（编辑预测）。

## 快速开始

### 1. 复制文件夹

```bash
cp -r ai-code-assistant /path/to/your/project/
```

### 2. 安装依赖

```bash
npm install monaco-editor fast-diff
```

### 3. 使用

```typescript
import { initAICodeAssistant } from './ai-code-assistant';
import * as monaco from 'monaco-editor';

// 创建编辑器
const editor = monaco.editor.create(container, {
  value: 'function hello() {}',
  language: 'typescript'
});

// 初始化 AI 助手
const assistant = initAICodeAssistant(monaco, editor, {
  fim: {
    enabled: true,
    endpoint: 'http://localhost:3000/api/completion'
  },
  nes: {
    enabled: true,
    endpoint: 'http://localhost:3000/api/next-edit-prediction'
  }
});

// 清理
assistant.dispose();
```

## 配置选项

```typescript
interface AICodeAssistantConfig {
  // FIM 配置
  fim?: {
    enabled?: boolean;           // 默认 true
    endpoint: string;            // FIM API 端点（必需）
    debounceMs?: number;         // 防抖延迟，默认 300ms
    maxTokens?: number;          // 最大生成 token 数，默认 64
    temperature?: number;        // 温度参数，默认 0.2
  };
  
  // NES 配置
  nes?: {
    enabled?: boolean;           // 默认 true
    endpoint: string;            // NES API 端点（必需）
    debounceMs?: number;         // 防抖延迟，默认 500ms
    symptoms?: SymptomType[];    // 启用的症状类型，默认全部
    windowSize?: number;         // 代码窗口大小，默认 30 行
  };
  
  // 通用配置
  language?: string;             // 编程语言，默认 'typescript'
  enableSemanticAnalysis?: boolean; // 是否启用语义分析，默认 true
}
```

## API 接口

### FIM API

**端点**: `POST /api/completion`

**请求**:
```json
{
  "prefix": "function add(a, b) {\n  return ",
  "suffix": ";\n}",
  "max_tokens": 64,
  "temperature": 0.2
}
```

**响应**:
```json
{
  "completion": "a + b"
}
```

### NES API

**端点**: `POST /api/next-edit-prediction`

**请求**:
```json
{
  "codeWindow": "function add(a, b) { ... }",
  "windowInfo": { "startLine": 1, "totalLines": 5 },
  "diffSummary": "Function parameter added",
  "editHistory": [...],
  "requestId": 1234567890
}
```

**响应**:
```json
{
  "predictions": [
    {
      "targetLine": 5,
      "suggestionText": "const result = add(1, 2, 3);",
      "originalLineContent": "const result = add(1, 2);",
      "explanation": "Updated function call",
      "confidence": 0.95
    }
  ]
}
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Tab` | 接受补全或建议 |
| `Esc` | 关闭补全或建议 |
| `Alt+Enter` | 跳转到下一个建议 |
| `Alt+N` | 跳过当前建议 |

## 文件结构

```
ai-code-assistant/
├── index.ts                    # 主入口
├── config.ts                   # 配置
├── types/index.d.ts           # 类型定义
├── fim/FIMEngine.ts           # FIM 引擎
├── nes/
│   ├── NESEngine.ts           # NES 引擎
│   └── SuggestionQueue.ts     # 建议队列
├── shared/
│   ├── EditDispatcher.ts      # 协调器
│   ├── EditHistoryManager.ts  # 编辑历史
│   ├── PredictionService.ts   # API 服务
│   ├── SymptomDetector.ts     # 症状检测
│   ├── CodeParser.ts          # 代码解析
│   └── CoordinateFixer.ts     # 坐标修复
└── ui/TabKeyHandler.ts        # Tab 处理
```

## 症状类型

- `RENAME_FUNCTION` - 函数重命名
- `RENAME_VARIABLE` - 变量重命名
- `ADD_PARAMETER` - 添加参数
- `REMOVE_PARAMETER` - 删除参数
- `CHANGE_TYPE` - 类型改变
- `LOGIC_ERROR` - 逻辑错误
- `WORD_FIX` - 拼写错误

## 依赖

- `monaco-editor` (peer dependency)
- `fast-diff` (用于精确的 Diff 计算)