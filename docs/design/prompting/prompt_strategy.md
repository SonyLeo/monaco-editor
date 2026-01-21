# Prompt Engineering 策略

本文档详细描述了双系统架构下的提示词工程（Prompt Engineering）设计，特别是针对 NES 系统的思维链设计。

## 1. NES Chain-of-Thought (思维链) 策略

NES 的目标是进行复杂的意图理解。直接要求模型“生成代码”往往会导致幻觉或不符合上下文的修改。因此，我们采用两阶段推理策略。

**System Prompt 文件**: `server/prompts/nesSystemPrompt.mjs`

### 1.1 结构化输出 Schema

我们强制模型返回严格的 JSON 格式，包含 `analysis` 和 `predictions` 两个部分。

```typescript
interface Response {
  // 阶段 1: 思考与分析
  analysis: {
    change_type: "addParameter" | "renameFunction" | "refactorPattern" | ...;
    summary: string; // 简述发生了什么
    impact: string;  // 变更的影响范围
    pattern: string; // 识别到的编辑模式
  };

  // 阶段 2: 执行预测
  predictions: Array<{
    targetLine: number;
    originalLineContent: string; // 用于锚点验证
    suggestionText: string;
    explanation: string;
    priority: number;
  }> | null;
}
```

### 1.2 Prompt 组成部分

一个完整的 NES Prompt 包含以下模块：

1.  **System Prompt**: 定义角色和输出 JSON Schema (TypeScript Interface)。
2.  **Edit History**: 用户的最近编辑操作序列（从 `EditHistoryManager` 获取）。
    ```xml
    <edit_history>
    [10:30:01] Line 5: Replaced "user" with "userInfo"
    [10:30:05] Line 12: Replaced "user" with "userInfo"
    </edit_history>
    ```
3.  **Recent Change**: 最近一次触发变更的摘要。
4.  **Code Window**: 当前变更点附近的完整代码块（带行号）。

### 1.3 锚点验证 (Anchor Validation)

为了防止模型“指鹿为马”（修改了错误的行），我们要求模型在 `originalLineContent` 中返回它认为它正在修改的那行代码的原始内容。

**NESController 中的验证逻辑**:

```typescript
// src/core/engines/NESController.ts

private validatePrediction(pred: Prediction): boolean {
  const actualLine = model.getLineContent(pred.targetLine);
  
  // 必须完全匹配（或高相似度匹配）才能接受建议
  if (normalize(actualLine) !== normalize(pred.originalLineContent)) {
    console.warn("Prediction rejected due to content mismatch");
    return false;
  }
  return true;
}
```

## 2. FIM Prompt 策略

FIM (Fill-In-the-Middle) 更关注补全的流畅性和语法正确性。

### 2.1 格式选择

*   **Codestral / DeepSeek-V2**: 推荐使用 `<fim_prefix>`, `<fim_suffix>`, `<fim_middle>` 标记。
*   **Base Models**: 有时需要使用自然语言引导。

### 2.2 上下文截断 (Truncation Strategy)

由于 Token 限制，我们必须明智地丢弃上下文。

1.  **优先保留**: 当前函数体、Import 语句、相邻的变量定义。
2.  **丢弃**: 远处的注释、无关的类定义。
3.  **计算逻辑**:
    - 计算 `PreToken` + `SufToken`。
    - 如果超过 `MaxContextWindow` (如 8k)，则优先裁剪 `Prefix` 的头部和 `Suffix` 的尾部，保留光标中心向外的扩散区域。

## 3. 示例：重命名变量的 CoT 过程

**用户操作**: 将 `calculatePrice` 重命名为 `calculateTotalPrice`。

**模型推理过程 (Analysis)**:
1.  **检测**: 发现 Edit History 中有一次重命名操作。
2.  **搜索**: 在 Code Window 中查找所有 `calculatePrice` 的引用。
3.  **判断**: 这是一次 Refactoring 操作，而非单纯的新增功能。
4.  **生成**: 为每一个引用点生成一个 `Prediction`。

**输出 JSON**:
```json
{
  "analysis": {
    "change_type": "renameFunction",
    "summary": "User renamed calculatePrice to calculateTotalPrice",
    "pattern": "Rename Refactoring"
  },
  "predictions": [
    { "targetLine": 45, "suggestionText": "const total = calculateTotalPrice(cart);", ... }
  ]
}
```
