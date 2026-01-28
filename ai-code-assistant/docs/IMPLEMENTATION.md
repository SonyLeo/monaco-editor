# AI Code Assistant - 技术实现文档

## 1. 概述

**AI Code Assistant** 是一个轻量级的 Monaco Editor AI 助手，提供两种核心能力：

- **FIM (Fill-In-Middle)**：实时代码补全，300ms 响应
- **NES (Next Edit Suggestion)**：智能编辑预测，预测用户下一步需要修改的位置

**代码规模**：~1400 行，14 个模块  
**技术栈**：TypeScript + Monaco Editor + fast-diff  
**设计理念**：前后端分离，AI 负责语义理解，前端负责坐标计算和渲染

---

## 2. 整体架构

### 2.1 Dual Engine 设计

采用双引擎架构，FIM 和 NES 互斥运行：

| 特性 | FIM Engine | NES Engine |
|------|-----------|-----------|
| **场景** | 实时补全 | 编辑预测 |
| **触发** | 光标变化 + 300ms 防抖 | 编辑停顿 + 3s 防抖 |
| **UI** | Ghost Text（灰色幽灵文本） | Glyph + Diff 预览 |
| **互斥** | NES 激活时自动锁定 | 激活时锁定 FIM |

### 2.2 分层架构

```
┌─────────────────────────────────────────┐
│  Entry Layer (index.ts)                 │  初始化 + 事件绑定
├─────────────────────────────────────────┤
│  Engine Layer                           │
│  ├─ FIMEngine: 补全逻辑                 │
│  └─ NESEngine: 预测逻辑 + 状态管理      │
├─────────────────────────────────────────┤
│  Renderer Layer                         │
│  ├─ NESRenderer: 渲染协调               │
│  ├─ DecorationManager: Glyph + 高亮    │
│  └─ ViewZoneManager: 预览区域          │
├─────────────────────────────────────────┤
│  Utility Layer                          │
│  ├─ DiffCalculator: 坐标自动计算       │
│  ├─ SymptomDetector: 症状检测          │
│  ├─ EditHistoryManager: 编辑历史       │
│  └─ SuggestionQueue: 建议队列          │
└─────────────────────────────────────────┘
```

### 2.3 目录结构

```
ai-code-assistant/
├── index.ts                    # 主入口：初始化 + 事件协调
├── config.ts                   # 配置常量
├── types/index.d.ts           # TypeScript 类型定义
│
├── fim/
│   └── FIMEngine.ts           # FIM 引擎：实时补全
│
├── nes/
│   ├── NESEngine.ts           # NES 引擎：核心逻辑 + 状态管理
│   ├── NESRenderer.ts         # 渲染协调器：统一渲染接口
│   ├── DecorationManager.ts  # Glyph 图标 + 行高亮
│   ├── ViewZoneManager.ts    # 预览区域管理
│   ├── SuggestionQueue.ts    # 建议队列：优先级 + 导航
│   └── styles.css            # UI 样式
│
└── shared/
    ├── DiffCalculator.ts      # 坐标自动计算（核心算法）
    ├── SymptomDetector.ts     # 症状检测：7 种编辑模式
    ├── EditHistoryManager.ts  # 编辑历史：记录 + 来源标记
    ├── EditDispatcher.ts      # 事件协调：FIM/NES 互斥
    ├── PredictionService.ts   # API 调用封装
    ├── CodeParser.ts          # 代码解析工具
    └── CoordinateFixer.ts     # 坐标修复工具
```

---

## 3. FIM 引擎实现

### 3.1 触发流程

```
光标变化 → 300ms 防抖 → 提取 prefix/suffix → 调用 API → 渲染 Ghost Text
```

### 3.2 核心代码

```typescript
// 注册 Monaco Inline Completion Provider
monaco.languages.registerInlineCompletionsProvider('typescript', {
  provideInlineCompletions: async (model, position) => {
    // 1. 检查锁定状态（NES 激活时锁定）
    if (this.fimLocked) return { items: [] };

    // 2. 提取 prefix 和 suffix
    const offset = model.getOffsetAt(position);
    const prefix = model.getValue().substring(0, offset);
    const suffix = model.getValue().substring(offset);

    // 3. 调用 API
    const completion = await callFIM(prefix, suffix);

    // 4. 返回补全项
    return { items: [{ insertText: completion }] };
  }
});
```

### 3.3 锁定机制

当 NES 激活时，FIM 自动锁定并清除 Ghost Text，避免 UI 冲突。

---

## 4. NES 引擎实现

### 4.1 完整数据流

```
用户编辑
  ↓
EditHistoryManager 记录编辑（标记来源：user/nes）
  ↓
3 秒防抖 + 保护期检查
  ↓
SymptomDetector 检测症状（7 种类型）
  ↓
构建 API Payload（代码窗口 + 编辑历史）
  ↓
调用 NES API
  ↓
DiffCalculator 自动计算坐标
  ↓
SuggestionQueue 入队（按优先级排序）
  ↓
NESRenderer 渲染第一个建议（Glyph + HintBar）
  ↓
用户交互（Tab 两阶段）
  ↓
应用编辑 → 显示下一个建议
```

### 4.2 核心模块详解

#### 4.2.1 EditHistoryManager - 编辑历史管理

**职责**：记录用户编辑操作，为 AI 提供上下文

```typescript
interface EditRecord {
  timestamp: number;
  lineNumber: number;
  column: number;
  type: 'insert' | 'delete' | 'replace';
  oldText: string;
  newText: string;
  source: 'user' | 'nes';  // 标记来源，避免循环触发
}
```

**关键方法**：
- `recordEdit(change, model, source)`: 记录编辑
- `getRecentEdits(count)`: 获取最近 N 条编辑

#### 4.2.2 SymptomDetector - 症状检测

**职责**：分析编辑历史，识别 7 种编辑模式

**支持的症状类型**：
1. `RENAME_FUNCTION` - 函数重命名
2. `RENAME_VARIABLE` - 变量重命名
3. `ADD_PARAMETER` - 添加参数
4. `REMOVE_PARAMETER` - 删除参数
5. `CHANGE_TYPE` - 类型改变
6. `LOGIC_ERROR` - 逻辑错误
7. `WORD_FIX` - 拼写错误

**检测算法**：
- 分析编辑历史的时间间隔、位置、内容
- 识别连续编辑模式（如逐字符输入函数名）
- 构建 API Payload

#### 4.2.3 DiffCalculator - 坐标自动计算（核心）

**设计理念**：前后端分离
- **AI 职责**：提供 `changeType` + `suggestionText`（完整行内容）
- **前端职责**：自动计算精确坐标

**算法实现**：

```typescript
import diff from 'fast-diff';

// 1. REPLACE_WORD 计算（使用 fast-diff）
static calculateWordReplace(original: string, suggested: string) {
  const diffs = diff(original, suggested);
  
  let currentIndex = 0;
  let startColumn = -1;
  let word = '';
  let replacement = '';

  for (const [operation, text] of diffs) {
    if (operation === diff.EQUAL) {
      currentIndex += text.length;
    } else if (operation === diff.DELETE) {
      if (startColumn === -1) startColumn = currentIndex;
      word += text;
      currentIndex += text.length;
    } else if (operation === diff.INSERT) {
      if (startColumn === -1) startColumn = currentIndex;
      replacement += text;
    }
  }

  return { word, replacement, startColumn, endColumn };
}

// 2. INLINE_INSERT 计算（使用 fast-diff）
static calculateInlineInsert(original: string, suggested: string) {
  const diffs = diff(original, suggested);
  
  // 检查是否只有插入操作（没有删除）
  let hasDelete = diffs.some(([op]) => op === diff.DELETE);
  if (hasDelete) return null;

  let insertContent = '';
  let insertPosition = 0;
  let currentIndex = 0;

  for (const [operation, text] of diffs) {
    if (operation === diff.EQUAL) {
      currentIndex += text.length;
    } else if (operation === diff.INSERT) {
      if (!insertContent) insertPosition = currentIndex;
      insertContent += text;
    }
  }

  return { content: insertContent, insertColumn: insertPosition + 1 };
}
```

**优势**：
- 使用成熟的 `fast-diff` 库（Myers diff algorithm）
- 处理复杂变更场景（多处修改、中间插入等）
- AI 无需计算列号（减少提示词 84% 体积）
- 前端计算更精确（基于 diff 算法）
- 降低 AI 出错率

#### 4.2.4 SuggestionQueue - 建议队列

**职责**：管理多个预测建议，支持导航

**核心方法**：
- `enqueue(predictions)`: 入队（按优先级排序）
- `peek()`: 查看当前建议
- `dequeue()`: 移除当前建议
- `next()` / `previous()`: 导航

#### 4.2.5 NESRenderer - 渲染协调器

**职责**：协调 3 个 Manager，提供统一渲染接口

**渲染流程**：
```typescript
renderSuggestion(prediction) {
  // 1. DecorationManager 渲染 Glyph + 高亮
  this.decorationManager.render(prediction);

  // 2. ViewZoneManager 渲染预览区域（可选）
  if (showPreview) {
    this.viewZoneManager.render(prediction);
  }

  // 3. 显示 HintBar（提示文案）
  this.showHintBar(prediction);
}
```

### 4.3 5 种 changeType 渲染

| changeType | 视觉效果 | 用途 |
|-----------|---------|------|
| `REPLACE_WORD` | 单词高亮 + 替换预览 | 函数重命名、变量重命名 |
| `INLINE_INSERT` | 插入位置标记 + 预览 | 添加参数、添加属性 |
| `REPLACE_LINE` | 整行高亮 + Diff 对比 | 多处修改、逻辑变更 |
| `INSERT` | 新行插入预览 | 添加代码行 |
| `DELETE` | 删除行标记 | 移除代码行 |

### 4.4 两阶段 Tab 交互

**设计目标**：减少快捷键复杂度，统一使用 Tab 键

**交互流程**：
1. **第 1 次 Tab**：跳转到建议位置 + 展开预览
2. **第 2 次 Tab**：接受建议 + 应用编辑
3. **多建议场景**：接受后自动显示下一个建议（带进度提示 "2/3"）

**状态管理**：
```typescript
private previewShown: boolean = false;

togglePreview() {
  if (!this.previewShown) {
    // 跳转 + 展开预览
    editor.setPosition({ lineNumber: targetLine });
    renderer.showPreview(prediction);
    this.previewShown = true;
  }
}

acceptSuggestion() {
  // 应用编辑
  renderer.applySuggestion(prediction);
  this.previewShown = false;

  // 显示下一个建议
  if (queue.hasMore()) {
    showNextSuggestion();
  }
}
```

---

## 5. 关键技术点

### 5.1 循环触发防护

**问题**：NES 应用编辑 → 触发 `onDidChangeContent` → 再次调用 NES → 无限循环

**解决方案**：
1. **来源标记**：`EditHistoryManager` 标记编辑来源（`user` / `nes`）
2. **标志位**：`nextEditIsNES = true`，跳过下一次检测
3. **保护期**：NES 编辑后 2 秒内不触发新检测

```typescript
// NES 编辑回调
nesEngine.setOnEditApplied(() => {
  nextEditIsNES = true;
  nesEditProtectionUntil = Date.now() + 2000;
});

// 编辑事件监听
model.onDidChangeContent(() => {
  if (nextEditIsNES) {
    nextEditIsNES = false;
    return; // 跳过检测
  }
  if (Date.now() < nesEditProtectionUntil) return;
  // 正常触发 NES
});
```

### 5.2 提示词优化

**优化前**：15,944 字符（详细的列号计算教程）  
**优化后**：2,700 字符（精简版）  
**减少**：84%

**优化策略**：
- 移除所有列号计算说明（前端自动计算）
- 移除 `wordReplaceInfo` / `inlineInsertInfo` 字段要求
- 保留核心的 `changeType` 判断逻辑
- 精简示例和重复内容

---

## 6. API 接口设计

### 6.1 FIM API

**端点**：`POST /api/completion`

**请求**：
```json
{
  "prefix": "function add(a, b) {\n  return ",
  "suffix": ";\n}",
  "max_tokens": 64,
  "temperature": 0.2
}
```

**响应**：
```json
{
  "completion": "a + b"
}
```

### 6.2 NES API

**端点**：`POST /api/next-edit-prediction`

**请求**：
```json
{
  "codeWindow": "function createUser(name: string) { ... }",
  "windowInfo": { "startLine": 1, "totalLines": 20 },
  "diffSummary": "Function renamed from 'createUser' to 'createUserInfo'",
  "editHistory": [
    {
      "timestamp": 1234567890,
      "lineNumber": 4,
      "column": 20,
      "type": "insert",
      "oldText": "",
      "newText": "I",
      "source": "user"
    }
  ],
  "requestId": 1234567890
}
```

**响应**：
```json
{
  "analysis": {
    "change_type": "renameFunction",
    "summary": "Function 'createUser' renamed to 'createUserInfo'",
    "impact": "Need to update all calls",
    "pattern": "Sequential rename pattern"
  },
  "predictions": [
    {
      "targetLine": 10,
      "originalLineContent": "const user1 = createUser(\"Alice\");",
      "suggestionText": "const user1 = createUserInfo(\"Alice\");",
      "explanation": "Update function call to match new name",
      "confidence": 0.95,
      "priority": 1,
      "changeType": "REPLACE_WORD"
    }
  ],
  "totalCount": 3,
  "hasMore": false
}
```

---

## 7. 集成指南

### 7.1 安装依赖

```bash
npm install monaco-editor fast-diff
```

### 7.2 初始化

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
    endpoint: 'http://localhost:3000/api/completion',
    debounceMs: 300,
    maxTokens: 64
  },
  nes: {
    enabled: true,
    endpoint: 'http://localhost:3000/api/next-edit-prediction',
    debounceMs: 3000,
    windowSize: 30
  }
});

// 清理
assistant.dispose();
```

### 7.3 配置选项

```typescript
interface AICodeAssistantConfig {
  fim?: {
    enabled?: boolean;        // 默认 true
    endpoint: string;         // FIM API 端点（必需）
    debounceMs?: number;      // 防抖延迟，默认 300ms
    maxTokens?: number;       // 最大生成 token，默认 64
    temperature?: number;     // 温度参数，默认 0.2
  };
  nes?: {
    enabled?: boolean;        // 默认 true
    endpoint: string;         // NES API 端点（必需）
    debounceMs?: number;      // 防抖延迟，默认 3000ms
    windowSize?: number;      // 代码窗口大小，默认 30 行
  };
}
```

---

## 8. 提示词工程（直接调用在线 API）

如果用户无法提供后端服务，可以直接调用 DeepSeek/OpenAI 等在线 API。

### 8.1 FIM 提示词（不需要，使用原生 FIM 模型）

FIM 建议使用专门的 Fill-In-Middle 模型（如 DeepSeek-Coder），无需自定义提示词。

### 8.2 NES System Prompt（完整版）

```javascript
export const NES_SYSTEM_PROMPT = `You are an intelligent code refactoring assistant.

### CRITICAL RULES
1. ALWAYS prefer REPLACE_WORD when only ONE word/token changes
2. ALWAYS prefer INLINE_INSERT when adding content without replacing
3. Use REPLACE_LINE only when MULTIPLE tokens change
4. Frontend auto-calculates columns - you only provide changeType and suggestionText

### OUTPUT SCHEMA
Return a single JSON object:
{
  "analysis": {
    "change_type": "addParameter" | "renameFunction" | "renameVariable" | "changeType" | "fixTypo" | "refactorPattern" | "other",
    "summary": string,
    "impact": string,
    "pattern": string
  },
  "predictions": Array<{
    "targetLine": number,
    "originalLineContent": string,
    "suggestionText": string,
    "explanation": string,
    "confidence": number,
    "priority": number,
    "changeType": "REPLACE_LINE" | "REPLACE_WORD" | "INSERT" | "DELETE" | "INLINE_INSERT"
  }> | null
}

### CHANGE TYPES

**REPLACE_WORD** - Only ONE word/token changes
Examples: functoin→function, hello→greet, createUser→createUserInfo, ||→&&
Use when: Single identifier/operator changes, rest of line unchanged
suggestionText: Full line with change applied

**INLINE_INSERT** - Adding content without replacing
Examples: func("Bob")→func("Bob",30), {name}→{name,age}, x+y→x+y+z
Use when: Original content stays, new content added
suggestionText: Full line with insertion applied

**REPLACE_LINE** - Multiple tokens change
Examples: if(x>0)→if(x>=0&&y<10), return a+b→return a*b+c
Use when: 2+ changes or structural modifications
suggestionText: Full line with changes applied

**INSERT** - Adding new line
suggestionText: Full line content with indentation

**DELETE** - Removing line
suggestionText: Empty string ""

### DECISION TREE
1. Single word/token change? → REPLACE_WORD
2. Adding content (original stays)? → INLINE_INSERT
3. Multiple changes? → REPLACE_LINE
4. New line? → INSERT
5. Remove line? → DELETE

### KEY EXAMPLES

REPLACE_WORD:
- const user1 = createUser("Alice"); → const user1 = createUserInfo("Alice");
- function hello() → function greet()
- if (value || check) → if (value && check)

INLINE_INSERT:
- createUser("Bob") → createUser("Bob", 30)
- { name } → { name, age }
- return x + y; → return x + y + z;

REPLACE_LINE:
- if (x > 0) → if (x >= 0 && y < 10)
- return a + b; → return a * b + c;

### VALIDATION RULES
1. originalLineContent must EXACTLY match the code window
2. Find ALL locations needing updates (max 5)
3. Prioritize by importance (1=highest)
4. Return null if no edits needed
5. For keyword typos (functoin, cosnt, retrun), use change_type: "fixTypo"

### IMPORTANT NOTES
- Frontend will auto-calculate wordReplaceInfo and inlineInsertInfo from originalLineContent and suggestionText
- You do NOT need to provide column numbers or word/replacement fields
- Just provide correct changeType and full suggestionText
- Always provide originalLineContent for validation`;
```

### 8.3 调用示例（DeepSeek API）

```typescript
async function callNESAPI(payload: any) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: NES_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

### 8.4 User Prompt 构建

```typescript
function buildUserPrompt(payload: any): string {
  return `
### CODE WINDOW (Lines ${payload.windowInfo.startLine}-${payload.windowInfo.startLine + payload.windowInfo.totalLines - 1})
\`\`\`typescript
${payload.codeWindow}
\`\`\`

### EDIT HISTORY (Recent ${payload.editHistory.length} edits)
${JSON.stringify(payload.editHistory, null, 2)}

### DIFF SUMMARY
${payload.diffSummary}

### TASK
Analyze the edit history and predict ALL locations in the code window that need to be updated. Return predictions in JSON format.
`;
}
```

---

## 9. 快捷键

| 快捷键 | 功能 | 适用场景 |
|--------|------|---------|
| `Tab` | 接受补全/建议 | FIM + NES |
| `Tab` (第 1 次) | 跳转 + 展开预览 | NES |
| `Tab` (第 2 次) | 接受建议 | NES |
| `Alt+N` | 跳过当前建议 | NES |
| `Esc` | 关闭补全/建议 | FIM + NES |

---

## 10. 总结

**核心创新**：
1. **前后端分离**：AI 负责语义，前端负责坐标（DiffCalculator）
2. **双引擎架构**：FIM + NES 互斥，避免 UI 冲突
3. **循环触发防护**：来源标记 + 保护期机制
4. **提示词优化**：精简 84% 体积，降低 token 消耗

**适用场景**：
- 需要集成 AI 代码助手的 Web IDE
- Monaco Editor 的增强插件
- 在线代码编辑器（如 CodeSandbox、StackBlitz）

**依赖**：
- `monaco-editor`（peer dependency）
- `fast-diff`（用于精确的 Diff 计算）