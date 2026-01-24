# NES Prompt Strategy & Engineering (V2.0)

本文档详细描述了 NES (Next Edit Suggestion) 系统的提示词工程（Prompt Engineering）设计。
当前基于 **MDRP (Model-Driven Rendering Protocol)** 协议，即模型不仅输出代码，还直接输出前端渲染指令 (`changeType`)。

## 1. 核心设计哲学

### 1.1 "Think like a Renderer" (像渲染器一样思考)
传统的代码生成模型只返回 content。NES V2.0 要求模型充当 "Remote Rendering Engine"，它必须根据修改的性质（是修了一个 typo，还是重写了整行），显式地告诉前端应该如何绘制 UI。

- **Typos/Tweaks** -> `REPLACE_WORD` (Inline Diff)
- **Logic Fixes** -> `REPLACE_LINE` (Ghost Text / Diff View)
- **New Features** -> `INSERT` (Ghost Text)

### 1.2 "Chain of Thought" (思维链)
为了避免模型幻觉（修改不存在的代码）或误判意图，我们强制模型执行两阶段推理：
1.  **Analysis Phase**: 分析意图、识别模式、评估影响。
2.  **Prediction Phase**: 基于分析结果生成具体的代码和渲染指令。

## 2. System Prompt 架构

**文件源**: `server/prompts/nes/systemPrompt.mjs` (引用 `NES_SYSTEM_PROMPT`)

### 2.1 JSON Output Schema (Strict)

模型必须返回符合以下 TypeScript 接口的 JSON：

```typescript
interface Response {
  // Phase 1: Meta-Analysis
  analysis: {
    change_type: "addParameter" | "renameFunction" | "fixTypo" | "refactorPattern" | ...;
    summary: string; // 人类可读的摘要，如 "Renamed 'user' to 'userInfo' in 3 places"
    impact: string;  // 影响范围评估
    pattern: string; // 识别到的编辑模式
  };

  // Phase 2: Execution Instructions
  predictions: Array<{
    // --- 锚点定位 ---
    targetLine: number;           // 1-based line number
    originalLineContent: string;  // 强校验字段：必须与编辑器内容完全一致，否则前端丢弃

    // --- 渲染指令 (MDRP Core) ---
    changeType: "REPLACE_LINE" | "REPLACE_WORD" | "INSERT" | "DELETE" | "INLINE_INSERT";

    // --- 内容载荷 ---
    suggestionText: string;       // 用于应用修改的文本
    explanation: string;          // 展示给用户的简短解释

    // --- 细粒度渲染参数 (Optional) ---
    wordReplaceInfo?: {           // 当 changeType="REPLACE_WORD" 时必须存在
      word: string;               // 被替换的词
      replacement: string;        // 替换后的词
      startColumn: number;        // 高亮起始列
      endColumn: number;          // 高亮结束列
    };

    inlineInsertInfo?: {          // 当 changeType="INLINE_INSERT" 时必须存在
      content: string;            // 插入的内容
      insertColumn: number;       // 插入位置
    };
    
    priority: number;             // 排序优先级 (1-5)
    confidence: number;           // 置信度 (用于过滤 < 0.8 的噪音)
  }> | null; // 如果无建议，必须返回 null
}
```

### 2.2 决策树 (Decision Tree)

模型依据此逻辑树选择 `changeType`：

1.  **DELETE**: Is the line being removed completely?
2.  **INSERT**: Is a new line being added?
3.  **REPLACE_LINE**: Is the *structure* of the line changing, or logic being rewritten?
4.  **REPLACE_WORD**: Is it just a specific token update (variable name, operator, type, typo)?
5.  **INLINE_INSERT**: Is it an addition *inside* an existing line (e.g., adding a parameter)?

## 3. Prompt 构建策略 (Builder Strategy)

**文件源**: `server/prompts/nes/builder.mjs`

我们在运行时动态构建 User Prompt，以最大化上下文相关性并控制 Token 消耗。

### 3.1 上下文组装 (Context Assembly)

Prompt 包含以下动态模块：

1.  **`<edit_history>`**: 
    - 来源：`EditHistoryManager`
    - 格式：`[Timestamp] Line N: Actions...`
    - 作用：帮助模型识别用户的连续意图 (User Intent)。

2.  **`<recent_change>`**: 
    - 来源：`DiffEngine` summary
    - 作用：提供最近一次操作的直接上下文。

3.  **`<detected_pattern>`** (New):
    - 来源：基于规则的简单模式匹配器
    - 作用：Hinting。如果我们检测到用户正在重命名，显式告诉模型 "Pattern: Rename Detected"，缩小搜索空间。

4.  **`<code_window>`**:
    - 来源：当前编辑器内容
    - 策略：**Center-Out Truncation**。保留光标附近的 ±100 行，智能丢弃无关的远端代码，但保留 Top-level Imports 和 Class Definitions。

5.  **`<change_type_examples>`**:
    - 来源：`examples.mjs`
    - 作用：**In-Context Learning (Few-Shot)**。展示每种 `changeType` 的标准输出格式，确保模型遵循 Schema。

### 3.2 动态 Few-Shot 选择

为了节省 Token，我们不把所有例题都塞进去。根据 `detected_pattern` 动态加载：
- 如果检测到重命名 -> 加载 `Rename Examples`
- 如果检测到 Typos -> 加载 `Fix Examples`
- 默认 -> 加载 `Generic Examples`

## 4. 接口协议 (API Protocol)

### 4.1 Request Payload
```typescript
interface NESPayload {
  codeWindow: string;
  windowInfo: { startLine: number; totalLines: number };
  diffSummary: string;
  editHistory: EditEvent[];
  userFeedback?: Feedback[]; // 包含用户之前 Accept/Reject 的历史，用于强化学习
  requestId: number;
}
```

### 4.2 Response Validation
前端收到 JSON 后，执行严格校验：
1.  **JSON Parse**: 失败则丢弃。
2.  **Schema Check**: 缺少 `changeType` 或关键字段则丢弃。
3.  **Anchor Check**: `originalLineContent` vs `Editor Line Content`。相似度 < 0.9 则丢弃（防止幻觉）。

## 5. 最佳实践指南

1.  **Explicit Rejection**: Prompt 中必须包含 *"If no edits are needed, return null"*。防止模型为了回答而编造建议。
2.  **Column Precision**: 对于 `REPLACE_WORD`，列号必须精确。我们在 System Prompt 中提供了详细的 Column 计算规则示例。
3.  **Latency Control**: 
    - 输入 Token 上限：4k (约 100-200 行代码 + 历史)。
    - 输出 Token 上限：512 (通常只需生成几行 JSON)。
    - 预期延迟：< 1.5s。
