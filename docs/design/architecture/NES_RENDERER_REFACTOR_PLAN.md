# NES Renderer 重构方案 (V2.0 完整技术规格)

**Version**: 2.0.0
**Status**: Implementation Complete (Frontend), Pending Integration (Backend Protocol)
**Last Updated**: 2026-01-24

本文档是 NES Renderer 系统 V2.0 改造的完整技术规格书，涵盖前后端接口设计、渲染机制、提示词工程及实施细节。

---

## 第一部分：系统架构总览

### 1.1 设计目标

将 NESRenderer 从 **"硬编码场景驱动"** 升级为 **"数据驱动渲染 (MDRP: Model-Driven Rendering Protocol)"**。

| 旧架构 | V2.0 新架构 |
| :--- | :--- |
| 前端根据业务逻辑判断 UI | 后端模型直接输出 UI 渲染指令 (`changeType`) |
| `if (isRename) {...}` 硬编码 | `switch (prediction.changeType)` 纯派发 |
| 新场景需要改前端代码 | 新场景只需要调 Prompt，前端零修改 |

### 1.2 核心模块依赖关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Monaco Editor)                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │  NESController  │───►│   NESRenderer   │───►│    Monaco    │ │
│  │  (State Machine)│    │   (Coordinator) │    │  Editor API  │ │
│  └────────┬────────┘    └────────┬────────┘    └──────────────┘ │
│           │                      │                               │
│           │                      ├──► DecorationManager          │
│           │                      ├──► ViewZoneManager            │
│           │                      └──► HintBarWidget              │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │PredictionService│◄──── HTTP ────┐                             │
│  └─────────────────┘               │                             │
└────────────────────────────────────┼─────────────────────────────┘
                                     │
┌────────────────────────────────────┼─────────────────────────────┐
│                        Backend (Node.js Server)                  │
│                                    │                             │
│  ┌─────────────────┐    ┌─────────┴───────┐    ┌──────────────┐ │
│  │  PromptBuilder  │───►│   LLM Gateway   │───►│  LLM (GPT-4) │ │
│  │  (builder.mjs)  │    │  (server.mjs)   │    │              │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
│           ▲                                                      │
│           │                                                      │
│  ┌────────┴────────┐                                             │
│  │ systemPrompt.mjs │◄─── examples.mjs, patterns.mjs             │
│  └─────────────────┘                                             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 第二部分：前后端接口协议 (API Protocol)

### 2.1 请求接口 (Request)

**Endpoint**: `POST /api/nes/predict`

**Request Body (`NESPayload`)**:
```typescript
interface NESPayload {
  /** 当前代码窗口（光标附近 ±N 行） */
  codeWindow: string;
  
  /** 窗口元信息 */
  windowInfo: {
    startLine: number;   // Code Window 在文件中的起始行号 (1-based)
    totalLines: number;  // 文件总行数
  };
  
  /** Diff 摘要（由 DiffEngine 生成） */
  diffSummary: string;
  
  /** 编辑历史（最近 5-10 条） */
  editHistory: Array<{
    timestamp: string;
    lineNumber: number;
    action: 'insert' | 'replace' | 'delete';
    oldText?: string;
    newText?: string;
    context?: string; // 如 "functionName", "variableName"
  }>;
  
  /** 用户反馈历史（可选，用于 RLHF） */
  userFeedback?: Array<{
    predictionId: string;
    action: 'accepted' | 'rejected' | 'skipped';
  }>;
  
  /** 请求唯一标识（用于取消去重） */
  requestId: number;
}
```

### 2.2 响应接口 (Response)

**Response Body (`NESResponse`)**:
```typescript
interface NESResponse {
  /** 阶段一：思考分析（CoT） */
  analysis: {
    change_type: 'addParameter' | 'renameFunction' | 'renameVariable' | 'changeType' | 'refactorPattern' | 'fixTypo' | 'other';
    summary: string;   // 如 "User renamed 'foo' to 'bar' in 2 places"
    impact: string;    // 如 "Need to update 3 more usages"
    pattern: string;   // 如 "Sequential rename pattern detected"
  };
  
  /** 阶段二：渲染指令集 */
  predictions: Array<Prediction> | null;
}

interface Prediction {
  // --- 锚点定位 ---
  targetLine: number;           // 1-based 行号（相对于 codeWindow.startLine）
  originalLineContent: string;  // 强校验字段：必须与编辑器实际内容匹配
  
  // --- 渲染指令 (MDRP Core) ---
  changeType: 'REPLACE_LINE' | 'REPLACE_WORD' | 'INSERT' | 'DELETE' | 'INLINE_INSERT';
  
  // --- 内容载荷 ---
  suggestionText: string;       // 新代码内容
  explanation: string;          // 用户可读的解释
  
  // --- 元信息 ---
  confidence: number;           // 0.0 - 1.0
  priority: number;             // 1 (最高) - 5 (最低)
  
  // --- 细粒度参数 (Conditional) ---
  wordReplaceInfo?: {           // 当 changeType='REPLACE_WORD' 时必须存在
    word: string;               // 被替换的词（如 "||"）
    replacement: string;        // 替换后的词（如 "&&"）
    startColumn: number;        // 1-based 起始列
    endColumn: number;          // 1-based 结束列 (exclusive)
  };
  
  inlineInsertInfo?: {          // 当 changeType='INLINE_INSERT' 时必须存在
    content: string;            // 插入的内容（如 " + z ** 2"）
    insertColumn: number;       // 1-based 插入位置
  };
}
```

### 2.3 错误处理

| HTTP Status | Scenario | Frontend Action |
| :--- | :--- | :--- |
| 200 + `predictions: null` | 模型认为无需修改 | State -> IDLE，不渲染任何 UI |
| 200 + `predictions: []` | 同上 | 同上 |
| 408 / Timeout | 网络超时 (>3s) | State -> IDLE，静默失败 |
| 500 | 服务端错误 | Toast 提示，State -> IDLE |

---

## 第三部分：提示词工程 (Prompt Engineering)

### 3.1 System Prompt 结构

**文件位置**: `server/prompts/nes/systemPrompt.mjs`

System Prompt 的核心目标是将模型从 "Code Generator" 转变为 "Rendering Instruction Generator"。

```javascript
// systemPrompt.mjs (核心片段)
export const NES_SYSTEM_PROMPT = `You are an intelligent code refactoring assistant.

### INSTRUCTIONS
Your task is to predict **ALL necessary edits** based on recent code changes.
You must analyze the "EDIT HISTORY" to identify patterns, then find **ALL locations** that need updating.

### STRICT OUTPUT SCHEMA (TypeScript Interface)
You must output a single valid JSON object. Do not include markdown or comments.

\`\`\`typescript
interface Response {
  analysis: {
    change_type: "addParameter" | "renameFunction" | "renameVariable" | ...;
    summary: string;
    impact: string;
    pattern: string;
  };

  predictions: Array<{
    targetLine: number;
    originalLineContent: string;  // MUST match editor content exactly
    suggestionText: string;
    explanation: string;
    confidence: number;
    priority: number;
    
    // 🆕 REQUIRED: Rendering Instruction
    changeType: "REPLACE_LINE" | "REPLACE_WORD" | "INSERT" | "DELETE" | "INLINE_INSERT";
    
    // 🆕 Conditional fields
    wordReplaceInfo?: { word, replacement, startColumn, endColumn };
    inlineInsertInfo?: { content, insertColumn };
  }> | null;
}
\`\`\`

### CHANGE TYPE CLASSIFICATION RULES (CRITICAL)

**1. REPLACE_LINE** - Entire line content changes
   - Logic error fixes, function signature changes
   - \`suggestionText\`: Full new line content

**2. REPLACE_WORD** - Only a word/operator changes
   - Typos, variable renames, operator fixes
   - **MUST provide \`wordReplaceInfo\`**
   - \`suggestionText\`: Only the replacement word

**3. INSERT** - Adding a new line
   - New properties, methods, imports
   - Line inserted AFTER \`targetLine\`

**4. DELETE** - Removing a line
   - \`suggestionText\`: Empty string ""

**5. INLINE_INSERT** - Inserting code WITHIN a line
   - Adding parameters, extending expressions
   - **MUST provide \`inlineInsertInfo\`**

### DECISION TREE
1. Is entire line replaced? → REPLACE_LINE
2. Is only a word/operator changed? → REPLACE_WORD
3. Is a new line added? → INSERT
4. Is a line removed? → DELETE
5. Is content added within a line? → INLINE_INSERT
`;
```

### 3.2 Few-Shot Examples (In-Context Learning)

**文件位置**: `server/prompts/nes/examples.mjs`

我们提供 6 种 `changeType` 的标准示例，确保模型遵循 Schema。

```javascript
// examples.mjs (核心片段)
export const CHANGE_TYPE_EXAMPLES = `
### Example 1: REPLACE_LINE (Logic Error)
<code>
function findMax(a: number, b: number): number {
  return a > b ? b : a;  // ❌ Wrong logic
}
</code>

<prediction>
{
  "targetLine": 2,
  "originalLineContent": "  return a > b ? b : a;",
  "suggestionText": "  return a > b ? a : b;",
  "changeType": "REPLACE_LINE"
}
</prediction>

---

### Example 2: REPLACE_WORD (Operator Error)
<code>
if (value !== null || value !== undefined) {
</code>

<prediction>
{
  "targetLine": 1,
  "originalLineContent": "if (value !== null || value !== undefined) {",
  "suggestionText": "&&",
  "changeType": "REPLACE_WORD",
  "wordReplaceInfo": {
    "word": "||",
    "replacement": "&&",
    "startColumn": 22,
    "endColumn": 24
  }
}
</prediction>

---

### Example 3: INLINE_INSERT (Extend Expression)
<code>
return Math.sqrt(this.x ** 2 + this.y ** 2);
</code>

<prediction>
{
  "targetLine": 1,
  "suggestionText": " + this.z ** 2",
  "changeType": "INLINE_INSERT",
  "inlineInsertInfo": {
    "content": " + this.z ** 2",
    "insertColumn": 46
  }
}
</prediction>
`;
```

### 3.3 Prompt Builder

**文件位置**: `server/prompts/nes/builder.mjs`

Builder 负责动态组装 Prompt，注入上下文、历史和示例。

```javascript
// builder.mjs
import { NES_SYSTEM_PROMPT } from './systemPrompt.mjs';
import { CHANGE_TYPE_EXAMPLES } from './examples.mjs';

export function buildNESUserPrompt(codeWindow, windowInfo, diffSummary, editHistory, userFeedback) {
  const formattedHistory = formatEditHistory(editHistory);
  const formattedCode = formatCodeWindow(codeWindow, windowInfo);

  return `<edit_history>
${formattedHistory}
</edit_history>

<recent_change>
${diffSummary}
</recent_change>

<file_info>
Total Lines: ${windowInfo.totalLines}
Window Start: ${windowInfo.startLine}
</file_info>

<code_window>
${formattedCode}
</code_window>

<change_type_examples>
${CHANGE_TYPE_EXAMPLES}
</change_type_examples>

Analyze the <edit_history> and predict the next logical edit in <code_window>.
CRITICAL: You MUST include the correct "changeType" field in each prediction.`;
}
```

---

## 第四部分：前端渲染机制 (Rendering Mechanism)

### 4.1 模块职责划分

| 模块 | 文件 | 职责 |
| :--- | :--- | :--- |
| **NESRenderer** | `NESRenderer.ts` | Coordinator，不包含任何 DOM 操作逻辑，只负责分发 |
| **DecorationManager** | `DecorationManager.ts` | 管理 Gutter Icon 和行内高亮 (Decorations) |
| **ViewZoneManager** | `ViewZoneManager.ts` | 管理行间嵌入区域 (ViewZone)，可选嵌入 DiffEditor |
| **HintBarWidget** | `HintBarWidget.ts` | 悬浮提示条 (Tab to Accept / Tab to Jump) |

### 4.2 渲染状态机

Renderer 根据 Controller 的指令在以下视觉状态间切换：

```
State 0: CLEAN (纯净模式)
  └──▶ State 1: HINT (提示模式)
         └──▶ State 2: PREVIEW (预览模式)
                └──▶ State 0: CLEAN (应用后)
```

| State | UI Elements | Trigger |
| :--- | :--- | :--- |
| **CLEAN** | 无 NES 相关 UI | `renderer.clear()` |
| **HINT** | Gutter Icon + HintBar | `renderer.renderSuggestion()` |
| **PREVIEW** | HINT + ViewZone/InlineDecoration | `renderer.showPreview()` |

### 4.3 changeType 到 UI 的映射

```typescript
// NESRenderer.ts (核心逻辑)
public renderSuggestion(prediction: Prediction): void {
  const changeType = prediction.changeType || 'REPLACE_LINE';
  
  // 派发给 DecorationManager
  this.decorationManager.renderState1(
    changeType,
    prediction.targetLine,
    prediction.explanation,
    prediction.wordReplaceInfo
  );
}

public showPreview(prediction: Prediction): void {
  const changeType = prediction.changeType || 'REPLACE_LINE';
  
  const result = this.decorationManager.renderState2(
    changeType,
    prediction.targetLine,
    prediction.suggestionText,
    prediction.wordReplaceInfo,
    prediction.inlineInsertInfo
  );
  
  // 如果需要展开 ViewZone（如 REPLACE_LINE, INSERT）
  if (result.useViewZone && result.viewZoneConfig) {
    this.viewZoneManager.show(result.viewZoneConfig);
  }
}
```

### 4.4 DecorationManager 实现细节

DecorationManager 使用 Monaco 的 `deltaDecorations` API 进行增量更新。

**State 1 (Hint) 渲染**:
```typescript
// DecorationManager.ts
public renderState1(changeType, targetLine, explanation, wordReplaceInfo?) {
  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  
  // 1. Gutter Icon (所有 changeType 通用)
  decorations.push({
    range: new monaco.Range(targetLine, 1, targetLine, 1),
    options: {
      glyphMarginClassName: 'nes-gutter-icon',
      glyphMarginHoverMessage: { value: explanation }
    }
  });
  
  // 2. 行高亮 (根据 changeType 决定样式)
  switch (changeType) {
    case 'REPLACE_LINE':
    case 'DELETE':
      // 整行红色背景
      decorations.push({
        range: new monaco.Range(targetLine, 1, targetLine, MAX_COLUMN),
        options: { className: 'nes-line-highlight-red' }
      });
      break;
    case 'REPLACE_WORD':
      // 只高亮单词
      if (wordReplaceInfo) {
        decorations.push({
          range: new monaco.Range(
            targetLine, 
            wordReplaceInfo.startColumn, 
            targetLine, 
            wordReplaceInfo.endColumn
          ),
          options: { inlineClassName: 'nes-word-highlight-red' }
        });
      }
      break;
    case 'INSERT':
      // 蓝色背景表示"将在此行后插入"
      decorations.push({
        range: new monaco.Range(targetLine, 1, targetLine, MAX_COLUMN),
        options: { className: 'nes-line-highlight-blue' }
      });
      break;
  }
  
  this.decorationIds = this.editor.deltaDecorations(this.decorationIds, decorations);
}
```

### 4.5 ViewZoneManager 实现细节

ViewZone 用于在编辑器行间插入 DOM 元素（如 Diff 预览）。

```typescript
// ViewZoneManager.ts
public show(config: ViewZoneConfig): void {
  this.editor.changeViewZones(accessor => {
    // 清理旧的 Zone
    if (this.currentZoneId) {
      accessor.removeZone(this.currentZoneId);
    }
    
    // 创建 DOM 容器
    const domNode = document.createElement('div');
    domNode.className = 'nes-viewzone-container';
    
    // 计算高度（行数 * 行高 + padding）
    const lineHeight = this.editor.getOptions().lineHeight;
    const heightInLines = config.lines || 3;
    
    this.currentZoneId = accessor.addZone({
      afterLineNumber: config.afterLine,
      heightInPx: heightInLines * lineHeight + 16,
      domNode: domNode,
      
      // 关键：懒加载 DiffEditor
      onDomNodeTop: (top) => {
        if (!this.diffEditor) {
          this.initDiffEditor(domNode, config);
        }
      }
    });
  });
}

private initDiffEditor(container: HTMLElement, config: ViewZoneConfig): void {
  this.diffEditor = monaco.editor.createDiffEditor(container, {
    readOnly: true,
    renderSideBySide: false, // 使用 Inline Diff 模式
    minimap: { enabled: false }
  });
  
  this.diffEditor.setModel({
    original: monaco.editor.createModel(config.originalCode, 'typescript'),
    modified: monaco.editor.createModel(config.modifiedCode, 'typescript')
  });
}
```

---

## 第五部分：Controller 调度逻辑

### 5.1 核心状态机

```typescript
// NESController.ts
enum NESState {
  IDLE = 'IDLE',           // 空闲，等待输入
  DEBOUNCING = 'DEBOUNCING', // 防抖中
  PREDICTING = 'PREDICTING', // 请求中
  SUGGESTING = 'SUGGESTING'  // 展示建议中
}
```

### 5.2 预测与队列

```typescript
// NESController.ts
private async predict(): Promise<void> {
  this.state = 'PREDICTING';
  
  const payload = this.buildSmartPayload(currentCode, diffInfo);
  const response = await this.predictionService.predict(payload);
  
  // 验证并入队
  const validPredictions = response.predictions.filter(p => this.validatePrediction(p));
  this.suggestionQueue.add(validPredictions);
  
  // 显示第一个
  this.showCurrentSuggestion();
}

private validatePrediction(pred: Prediction): boolean {
  const actualLine = this.editor.getModel().getLineContent(pred.targetLine);
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  
  // Anchor Validation: 防止模型幻觉
  if (normalize(actualLine) !== normalize(pred.originalLineContent)) {
    console.warn('[NES] Prediction rejected: content mismatch');
    return false;
  }
  return true;
}
```

### 5.3 应用建议

```typescript
// NESRenderer.ts
public applySuggestion(prediction: Prediction): void {
  const changeType = prediction.changeType || 'REPLACE_LINE';
  
  switch (changeType) {
    case 'REPLACE_LINE':
      this.applyReplaceLine(prediction);
      break;
    case 'REPLACE_WORD':
      this.applyReplaceWord(prediction);
      break;
    case 'INSERT':
      this.applyInsert(prediction);
      break;
    case 'DELETE':
      this.applyDelete(prediction);
      break;
    case 'INLINE_INSERT':
      this.applyInlineInsert(prediction);
      break;
  }
  
  this.clear();
}

private applyReplaceLine(prediction: Prediction): void {
  const model = this.editor.getModel();
  const { targetLine, suggestionText } = prediction;
  
  this.editor.executeEdits('nes-replace-line', [{
    range: new monaco.Range(targetLine, 1, targetLine, model.getLineMaxColumn(targetLine)),
    text: suggestionText,
    forceMoveMarkers: true
  }]);
}

private applyReplaceWord(prediction: Prediction): void {
  const { targetLine, wordReplaceInfo } = prediction;
  if (!wordReplaceInfo) return;
  
  this.editor.executeEdits('nes-replace-word', [{
    range: new monaco.Range(
      targetLine,
      wordReplaceInfo.startColumn,
      targetLine,
      wordReplaceInfo.endColumn
    ),
    text: wordReplaceInfo.replacement,
    forceMoveMarkers: true
  }]);
}
```

---

## 第六部分：CSS 样式系统

所有样式集中在 `src/core/renderer/styles/nes-styles.ts`，通过 JS 动态注入。

```typescript
// nes-styles.ts (核心样式)
export function injectNESStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Gutter Icon */
    .nes-gutter-icon {
      background: url('data:image/svg+xml,...') center center no-repeat;
      cursor: pointer;
    }
    
    /* 行高亮 */
    .nes-line-highlight-red {
      background-color: rgba(255, 0, 0, 0.1);
    }
    .nes-line-highlight-blue {
      background-color: rgba(0, 100, 255, 0.1);
    }
    
    /* 单词高亮 */
    .nes-word-highlight-red {
      background-color: rgba(255, 0, 0, 0.2);
      text-decoration: line-through;
    }
    .nes-word-highlight-green {
      background-color: rgba(0, 255, 0, 0.2);
    }
    
    /* ViewZone 容器 */
    .nes-viewzone-container {
      background-color: var(--vscode-editor-background);
      border-top: 1px solid var(--vscode-editorGroup-border);
      border-bottom: 1px solid var(--vscode-editorGroup-border);
    }
  `;
  document.head.appendChild(style);
}
```

---

## 第七部分：实施进度追踪

### ✅ Phase 1-3：前端重构（已完成）
- ✅ 扩展 `Prediction` 类型定义
- ✅ 创建 `DecorationManager`
- ✅ 创建 `ViewZoneManager`
- ✅ 重构 `NESRenderer.ts`
- ✅ 更新 `NESController.ts`

### ✅ Phase 4：后端 Prompt 改造（已完成）
- ✅ 创建 `NES_SYSTEM_PROMPT` (含 changeType 规则)
- ✅ 创建 `CHANGE_TYPE_EXAMPLES` (6 个示例)
- ✅ 更新 `builder.mjs`

### 🔄 Phase 5：集成与测试（进行中）
- [ ] 切换 builder.mjs 使用 `NES_SYSTEM_PROMPT` (当前使用简版)
- [ ] 端到端测试所有 5 种 changeType
- [ ] 性能测试（Latency < 2s）

---

## 第八部分：风险与缓解

| 风险 | 缓解措施 |
| :--- | :--- |
| 模型无法准确判断 changeType | 前端添加兜底：基于 `suggestionText` 与 `originalLineContent` 的 Diff 自动推断 |
| `wordReplaceInfo.startColumn` 计算错误 | 前端添加自动校正：使用 `indexOf` 重新定位 |
| Anchor Validation 误杀 | 降低相似度阈值 (0.9 -> 0.8) |

---

**Document Owner**: Antigravity
**Review Status**: Pending Team Review
