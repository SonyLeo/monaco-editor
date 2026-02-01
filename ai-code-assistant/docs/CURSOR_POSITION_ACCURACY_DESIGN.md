# NES 光标位置精确定位方案

## 1. 问题背景

### 1.1 当前实现的局限性

当前方案使用 `fast-diff` 进行文本比对来推断光标位置：

```typescript
// 当前流程
AI 返回 suggestionText (完整行文本)
  ↓
前端用 fast-diff 比对 originalLine 和 suggestionText
  ↓
从 diff 结果推断 startColumn 和 endColumn
```

**存在的问题：**

#### 问题 1：多处相同文本导致匹配错误

```typescript
原文：const name = "name";
建议：const name = "username";
问题：有两个 "name"，diff 可能匹配到错误的位置
```

#### 问题 2：空格和缩进干扰

```typescript
原文：  function test() {
建议：function test() {
问题：删除前导空格，diff 计算的列号可能错误
```

#### 问题 3：多处修改只能找到第一处

```typescript
原文：const x = 1; const y = 2;
建议：let x = 10; let y = 20;
问题：有多处修改，diff 只能找到第一处
```

#### 问题 4：AI 计算列号不可靠

之前尝试让 AI 直接返回 `startColumn` 和 `endColumn`，但实验证明：
- AI 对列号的理解不准确（特别是有 Tab、多字节字符时）
- AI 容易数错位置
- 准确率 < 70%

---

## 2. 业界最佳实践

### 2.1 GitHub Copilot 的方案

**核心策略：AI 只负责生成代码，位置计算完全由前端处理**


- AI 返回完整的新代码片段
- 前端使用 AST 分析找到修改位置
- 使用 Tree-sitter 进行精确匹配

### 2.2 Cursor 的方案

**核心策略：基于 AST Diff + 语义理解**

- AI 返回修改后的完整代码块
- 前端用 AST 解析原代码和新代码
- 计算 AST 的 diff（而不是文本 diff）
- 根据 AST 节点定位精确位置

### 2.3 JetBrains AI Assistant 的方案

**核心策略：基于 LSP (Language Server Protocol)**

- AI 返回修改意图的描述
- 前端调用 LSP 的 rename/refactor API
- LSP 返回精确的修改位置

### 2.4 共同点

✅ **AI 不计算列号**：避免 AI 计算错误  
✅ **前端负责定位**：使用语法分析工具  
✅ **语义级别匹配**：基于代码结构，不是文本  

---

## 3. 推荐方案对比

### 3.1 方案 A：唯一上下文匹配（推荐立即实施）

#### 核心思路

AI 提供目标文本的上下文（前后文本），前端通过上下文精确定位。

#### AI 返回格式

```json
{
  "changeType": "REPLACE_WORD",
  "targetLine": 12,
  "suggestionText": "const username = \"john\";",
  "explanation": "Fix typo: 'name' should be 'username'",
  
  "context": {
    "before": "const ",       // 目标前面的文本（3-10 字符）
    "target": "name",         // 要修改的文本
    "after": " = \"john\""    // 目标后面的文本（3-10 字符）
  }
}
```

#### 前端处理逻辑

```typescript
function findTargetPosition(line: string, context: Context): Position | null {
  // 1. 构造搜索模式
  const pattern = context.before + context.target + context.after;
  
  // 2. 在行中查找
  const index = line.indexOf(pattern);
  
  if (index === -1) {
    // 降级：只用 target 查找
    const targetIndex = line.indexOf(context.target);
    if (targetIndex === -1) return null;
    
    return {
      startColumn: targetIndex + 1,
      endColumn: targetIndex + context.target.length + 1,
    };
  }
  
  // 3. 计算精确位置
  const startColumn = index + context.before.length + 1;
  const endColumn = startColumn + context.target.length;
  
  // 4. 验证
  const extracted = line.substring(startColumn - 1, endColumn - 1);
  if (extracted !== context.target) {
    console.error('[Position] Validation failed', {
      extracted,
      expected: context.target,
      line,
      context
    });
    return null;
  }
  
  return { startColumn, endColumn };
}
```

#### 优势与劣势

| 维度 | 评估 |
|------|------|
| 准确度 | ⭐⭐⭐⭐ 90%+ |
| 性能 | ⭐⭐⭐⭐⭐ 极高（字符串查找） |
| 实现复杂度 | ⭐⭐⭐⭐⭐ 低（~50 行） |
| AI 负担 | ⭐⭐⭐⭐⭐ 低（只需提取上下文） |
| 依赖 | ⭐⭐⭐⭐⭐ 无需额外库 |
| 多语言支持 | ⭐⭐⭐⭐⭐ 语言无关 |

**适用场景：**
- 单行修改
- 目标文本在行中唯一或有明显上下文
- 快速验证和迭代

---

### 3.2 方案 B：Tree-sitter 语法解析（推荐长期方案）

#### 核心思路

使用 Tree-sitter 进行语法级别的精确匹配，基于 AST 节点定位。

#### AI 返回格式

```json
{
  "changeType": "REPLACE_WORD",
  "targetLine": 12,
  "suggestionText": "const username = \"john\";",
  "explanation": "Fix typo",
  
  "query": {
    "nodeType": "identifier",           // AST 节点类型
    "value": "name",                    // 节点的值
    "parentType": "variable_declarator", // 父节点类型
    "index": 0                          // 如果有多个匹配，取第几个
  }
}
```

#### 前端处理逻辑

```typescript
import Parser from 'web-tree-sitter';

async function findWithTreeSitter(
  line: string,
  query: Query
): Promise<Position | null> {
  // 1. 初始化 parser（只需初始化一次）
  if (!parserInitialized) {
    await Parser.init();
    const parser = new Parser();
    const TypeScript = await Parser.Language.load('tree-sitter-typescript.wasm');
    parser.setLanguage(TypeScript);
    parserInitialized = true;
  }
  
  // 2. 解析代码
  const tree = parser.parse(line);
  
  // 3. 遍历 AST 查找匹配节点
  let matchCount = 0;
  let targetNode = null;
  
  const cursor = tree.walk();
  
  function visit() {
    const node = cursor.currentNode();
    
    // 检查节点类型
    if (node.type === query.nodeType) {
      // 检查节点值
      if (node.text === query.value) {
        // 检查父节点类型（可选）
        if (!query.parentType || node.parent?.type === query.parentType) {
          if (matchCount === query.index) {
            targetNode = node;
            return true; // 找到目标
          }
          matchCount++;
        }
      }
    }
    
    // 递归遍历子节点
    if (cursor.gotoFirstChild()) {
      do {
        if (visit()) return true;
      } while (cursor.gotoNextSibling());
      cursor.gotoParent();
    }
    
    return false;
  }
  
  visit();
  
  // 4. 返回精确位置
  if (targetNode) {
    return {
      startColumn: targetNode.startPosition.column + 1,
      endColumn: targetNode.endPosition.column + 1,
    };
  }
  
  return null;
}
```

#### 优势与劣势

| 维度 | 评估 |
|------|------|
| 准确度 | ⭐⭐⭐⭐⭐ 99.9%+ |
| 性能 | ⭐⭐⭐⭐⭐ 极高（增量解析） |
| 实现复杂度 | ⭐⭐⭐ 中（~150 行 + 配置） |
| AI 负担 | ⭐⭐⭐ 中（需理解 AST 概念） |
| 依赖 | ⭐⭐⭐ 需要 Tree-sitter |
| 多语言支持 | ⭐⭐⭐⭐⭐ 支持 40+ 语言 |

**适用场景：**
- 需要最高准确度
- 复杂的代码重构
- 多语言支持
- 长期维护的项目

---

### 3.3 方案 C：混合方案（最佳实践）

#### 核心思路

结合方案 A 和方案 B，提供三层容错机制。

#### 处理流程

```typescript
async function applyChange(prediction: Prediction): Promise<void> {
  const line = model.getLineContent(prediction.targetLine);
  
  // ✅ 策略 1：唯一上下文匹配（快速路径）
  if (prediction.context) {
    const position = findTargetPosition(line, prediction.context);
    
    if (position) {
      console.log('[Position] Found by context matching');
      return applyWithPosition(position, prediction);
    }
  }
  
  // ✅ 策略 2：Tree-sitter 语法匹配（精确路径）
  if (prediction.query && treeSitterAvailable) {
    const position = await findWithTreeSitter(line, prediction.query);
    
    if (position) {
      console.log('[Position] Found by Tree-sitter');
      return applyWithPosition(position, prediction);
    }
  }
  
  // ✅ 策略 3：fast-diff 降级（兜底方案）
  console.log('[Position] Fallback to fast-diff');
  const diff = DiffCalculator.detectChangeType(line, prediction.suggestionText);
  return applyWithDiff(diff, prediction);
}
```

#### 优势

✅ **准确度最高**：三层容错，覆盖 95%+ 场景  
✅ **性能优化**：优先使用快速方法  
✅ **渐进增强**：可以逐步迁移到 Tree-sitter  
✅ **风险可控**：保留现有方案作为降级  

---

## 4. 实施路线图

### 阶段 1：快速验证（1-2 天）

**目标：验证方案 A 的可行性**

1. 调整后端提示词，要求 AI 返回 `context`
2. 前端实现 `findTargetPosition()` 函数
3. 测试 20 个典型场景，统计准确率
4. 如果准确率 > 85%，进入阶段 2

**预期成果：**
- 准确率从 70% 提升到 90%
- 代码量：~100 行（提示词 + 前端逻辑）

### 阶段 2：生产部署（3-5 天）

**目标：将方案 A 部署到生产环境**

1. 完善错误处理和降级逻辑
2. 添加详细日志，收集错误案例
3. 优化提示词，提高 AI 上下文提取质量
4. 编写单元测试和集成测试

**预期成果：**
- 准确率稳定在 90%+
- 用户体验显著提升

### 阶段 3：引入 Tree-sitter（2-3 周）

**目标：进一步提升准确度到 99%+**

1. 集成 Tree-sitter 库
2. 实现 `findWithTreeSitter()` 函数
3. 调整提示词，添加 `query` 字段
4. 实现混合方案（方案 C）

**预期成果：**
- 准确率提升到 99%+
- 支持更复杂的代码重构场景

### 阶段 4：持续优化（长期）

**目标：优化性能和用户体验**

1. 收集用户反馈和错误案例
2. 优化 Tree-sitter 查询模式
3. 支持多语言（Python、Rust 等）
4. 添加机器学习模型，预测最佳匹配策略

---

## 5. 提示词设计

### 5.1 方案 A 的提示词（立即实施）

```javascript
export const systemPrompt = `
你是一个代码编辑助手，负责预测用户的下一步编辑意图。

## 输出格式

返回 JSON 数组，每个预测包含：

{
  "changeType": "REPLACE_WORD" | "INLINE_INSERT" | "REPLACE_LINE" | "INSERT" | "DELETE",
  "targetLine": 12,
  "suggestionText": "const username = \\"john\\";",
  "explanation": "Fix typo: 'name' should be 'username'",
  "priority": 1,
  "confidence": 0.95,
  
  // ✅ 唯一上下文（用于精确定位）
  "context": {
    "before": "const ",       // 目标前面的文本（3-10 个字符）
    "target": "name",         // 要修改的文本
    "after": " = \\"john\\""    // 目标后面的文本（3-10 个字符）
  }
}

## 上下文提取规则

**目标：让 before + target + after 在行中唯一**

### 1. before（目标前面的文本）
- 长度：3-10 个字符
- 包含足够的上下文，确保唯一性
- 如果目标是第二个相同文本，before 应该包含第一个之后的内容

### 2. target（要修改的文本）
- 精确匹配要替换的内容
- 不要包含多余的空格或标点

### 3. after（目标后面的文本）
- 长度：3-10 个字符
- 包含足够的上下文，确保唯一性

## 示例

### 示例 1：简单替换
\`\`\`
原文：const name = "john";
目标：替换 "name" 为 "username"
\`\`\`

返回：
{
  "changeType": "REPLACE_WORD",
  "targetLine": 12,
  "suggestionText": "const username = \\"john\\";",
  "context": {
    "before": "const ",
    "target": "name",
    "after": " = \\"john\\""
  }
}

### 示例 2：多处相同文本
\`\`\`
原文：const name = "name";
目标：替换第一个 "name"（变量名，不是字符串）
\`\`\`

返回：
{
  "changeType": "REPLACE_WORD",
  "targetLine": 12,
  "suggestionText": "const username = \\"name\\";",
  "context": {
    "before": "const ",
    "target": "name",
    "after": " = \\""
  }
}

### 示例 3：复杂场景
\`\`\`
原文：function test(name, age) { return name; }
目标：替换第二个 "name"（return 语句中的）
\`\`\`

返回：
{
  "changeType": "REPLACE_WORD",
  "targetLine": 12,
  "suggestionText": "function test(name, age) { return username; }",
  "context": {
    "before": "return ",
    "target": "name",
    "after": "; }"
  }
}

### 示例 4：行首修改
\`\`\`
原文：  const x = 1;
目标：删除前导空格
\`\`\`

返回：
{
  "changeType": "REPLACE_LINE",
  "targetLine": 12,
  "suggestionText": "const x = 1;",
  "context": {
    "before": "",
    "target": "  const",
    "after": " x = 1"
  }
}

## 验证方法

前端会执行以下验证：
1. 在行中查找 before + target + after
2. 提取 target 位置的文本
3. 检查是否匹配 context.target

如果验证失败，说明上下文不够唯一，请调整 before 和 after 的长度。

## 特殊情况处理

### 情况 1：目标在行首
- before 为空字符串 ""
- after 包含足够的上下文

### 情况 2：目标在行尾
- before 包含足够的上下文
- after 为空字符串 ""

### 情况 3：整行替换
- 使用 REPLACE_LINE
- context 可以省略（前端会替换整行）
`;
```

---

## 6. 代码实现

### 6.1 前端核心逻辑

```typescript
// ai-code-assistant/shared/PositionFinder.ts

export interface Context {
  before: string;
  target: string;
  after: string;
}

export interface Position {
  startColumn: number;
  endColumn: number;
}

export class PositionFinder {
  /**
   * 基于上下文查找目标位置
   */
  static findByContext(line: string, context: Context): Position | null {
    // 1. 构造搜索模式
    const pattern = context.before + context.target + context.after;
    
    // 2. 在行中查找
    const index = line.indexOf(pattern);
    
    if (index === -1) {
      console.warn('[PositionFinder] Pattern not found, trying target only', {
        pattern,
        line,
      });
      
      // 降级：只用 target 查找
      return this.findByTargetOnly(line, context.target);
    }
    
    // 3. 计算精确位置
    const startColumn = index + context.before.length + 1; // Monaco 列号从 1 开始
    const endColumn = startColumn + context.target.length;
    
    // 4. 验证
    const extracted = line.substring(startColumn - 1, endColumn - 1);
    if (extracted !== context.target) {
      console.error('[PositionFinder] Validation failed', {
        extracted,
        expected: context.target,
        line,
        context,
        startColumn,
        endColumn,
      });
      return null;
    }
    
    console.log('[PositionFinder] Found by context', {
      startColumn,
      endColumn,
      target: context.target,
    });
    
    return { startColumn, endColumn };
  }
  
  /**
   * 降级方案：只用 target 查找
   */
  private static findByTargetOnly(line: string, target: string): Position | null {
    const index = line.indexOf(target);
    
    if (index === -1) {
      console.error('[PositionFinder] Target not found in line', {
        target,
        line,
      });
      return null;
    }
    
    const startColumn = index + 1;
    const endColumn = startColumn + target.length;
    
    console.warn('[PositionFinder] Found by target only (may be inaccurate)', {
      startColumn,
      endColumn,
      target,
    });
    
    return { startColumn, endColumn };
  }
}
```

### 6.2 集成到 NESEngine

```typescript
// ai-code-assistant/nes/NESEngine.ts

import { PositionFinder } from '../shared/PositionFinder';

private handlePredictions(predictions: Prediction[]): void {
  const model = this.editor.getModel();
  if (!model) return;

  const processedPredictions = predictions.map(pred => {
    const originalLine = pred.originalLineContent || model.getLineContent(pred.targetLine);
    
    // ✅ 优先使用上下文匹配
    if (pred.context) {
      const position = PositionFinder.findByContext(originalLine, pred.context);
      
      if (position) {
        // 根据 changeType 构造完整的位置信息
        if (pred.changeType === 'REPLACE_WORD') {
          return {
            ...pred,
            originalLineContent: originalLine,
            wordReplaceInfo: {
              startColumn: position.startColumn,
              endColumn: position.endColumn,
              word: pred.context.target,
            },
          };
        } else if (pred.changeType === 'INLINE_INSERT') {
          return {
            ...pred,
            originalLineContent: originalLine,
            inlineInsertInfo: {
              column: position.startColumn,
              text: pred.suggestionText.substring(
                position.startColumn - 1,
                position.endColumn - 1
              ),
            },
          };
        }
      }
    }
    
    // ✅ 降级到 DiffCalculator
    console.log('[NESEngine] Context matching failed, fallback to DiffCalculator');
    const diff = DiffCalculator.detectChangeType(originalLine, pred.suggestionText);
    
    return {
      ...pred,
      originalLineContent: originalLine,
      changeType: diff.changeType,
      wordReplaceInfo: diff.wordReplaceInfo,
      inlineInsertInfo: diff.inlineInsertInfo,
    };
  });

  // 继续处理...
}
```

---

## 7. 测试验证

### 7.1 测试场景

| 场景 | 原文 | 目标 | 难度 |
|------|------|------|------|
| 1. 简单替换 | `const name = "john";` | 替换 name → username | ⭐ |
| 2. 多处相同文本 | `const name = "name";` | 替换第一个 name | ⭐⭐ |
| 3. 嵌套相同文本 | `function test(name, age) { return name; }` | 替换第二个 name | ⭐⭐⭐ |
| 4. 前导空格 | `  const x = 1;` | 删除空格 | ⭐⭐ |
| 5. 行尾修改 | `const x = 1` | 添加分号 | ⭐ |
| 6. 多字节字符 | `const 名字 = "张三";` | 替换 名字 → 姓名 | ⭐⭐⭐ |
| 7. Tab 字符 | `\tfunction test() {` | 替换 Tab → 空格 | ⭐⭐ |
| 8. 字符串内修改 | `const msg = "hello world";` | 替换 hello → hi | ⭐⭐ |
| 9. 注释修改 | `// TODO: fix this` | 替换 TODO → DONE | ⭐ |
| 10. 复杂表达式 | `const result = a + b * c;` | 替换 b → (b + 1) | ⭐⭐⭐ |

### 7.2 评估指标

**定量指标：**
- 准确率：正确定位的场景数 / 总场景数
- 降级率：使用降级方案的次数 / 总次数
- 失败率：完全无法定位的次数 / 总次数

**定性指标：**
- 用户是否需要手动调整位置
- 修改是否符合预期
- 是否有误操作（修改了错误的位置）

### 7.3 预期结果

| 方案 | 准确率 | 降级率 | 失败率 |
|------|--------|--------|--------|
| 当前（fast-diff） | 70% | - | 30% |
| 方案 A（上下文匹配） | 90% | 5% | 5% |
| 方案 C（混合方案） | 95% | 3% | 2% |

---

## 8. 总结

### 8.1 推荐方案

**立即实施：方案 A（唯一上下文匹配）**

- 准确率：90%+
- 实现成本：~150 行代码
- 时间：1-2 天
- 风险：低

**长期优化：方案 C（混合方案）**

- 准确率：95%+
- 实现成本：~300 行代码
- 时间：2-3 周
- 风险：中

### 8.2 核心优势

✅ **不依赖 AI 计算列号**：避免 AI 计算错误  
✅ **语义级别匹配**：基于上下文，不是简单文本比对  
✅ **三层容错**：上下文 → Tree-sitter → fast-diff  
✅ **业界验证**：GitHub Copilot、Cursor 都用类似方案  
✅ **渐进增强**：可以逐步迁移，不破坏现有功能  

### 8.3 实施建议

1. **第 1 周**：实现方案 A，测试验证
2. **第 2 周**：部署到生产，收集反馈
3. **第 3-4 周**：如果准确率不够，引入 Tree-sitter
4. **长期**：持续优化，支持更多语言和场景
