# FIM 和 NES 协调机制设计方案（B+C 组合）

## 1. 问题背景

### 1.1 当前架构的竞态问题

在现有实现中，FIM（实时补全）和 NES（编辑预测）是两个独立的引擎：

- **FIM**：用户输入后 300ms 触发，显示 Ghost Text
- **NES**：用户编辑后 3000ms 触发，显示编辑建议

这种独立触发机制会导致以下用户体验问题：

#### 问题 1：Tab 键优先级冲突
```
时间线：
T0: 用户输入代码
T1 (300ms): FIM 显示 Ghost Text
T2 (用户思考): 用户正在阅读 FIM 建议，考虑是否接受
T3 (3000ms): NES 触发，显示编辑建议
T4: 用户按 Tab 想接受 FIM
结果: ❌ Tab 被 NES 拦截，无法接受 FIM Ghost Text
```

#### 问题 2：NES 看到的是"过去的代码"
```
时间线：
T0: 用户输入 "console.log("
T1 (300ms): FIM 显示 Ghost Text: "hello world")"
T2 (用户思考): FIM Ghost Text 仍然显示，但未被接受
T3 (3000ms): NES 触发，读取当前代码
问题: NES 看到的代码是 "console.log("，不包含 Ghost Text
      但用户可能即将接受 FIM，导致 NES 预测基于错误的上下文
```

#### 问题 3：FIM 接受后的编辑历史混乱
```
时间线：
T0: 用户输入 "function"
T1: FIM 显示多行补全（10 行代码）
T2: 用户按 Tab 接受 FIM
T3: 编辑历史记录：一次大块 INSERT（10 行）
T4: NES 触发，看到编辑历史中的大块插入
问题: NES 无法区分这是 FIM 补全还是用户粘贴代码
      可能导致误判用户意图
```

---

## 2. B+C 组合方案设计

### 2.1 方案概述

**方案 B：NES 延迟触发 + 等待 FIM 决策**
- NES 触发前检查 FIM 状态
- 如果 FIM 有 Ghost Text，延迟 NES 触发
- 等待用户对 FIM 做出决策（接受/拒绝）

**方案 C：Tab 键智能路由**
- Tab 键优先级：FIM > NES > 默认
- 如果 FIM 有 Ghost Text，Tab 优先接受 FIM
- 只有在 FIM 无 Ghost Text 时，Tab 才触发 NES

**组合优势：**
- 方案 B 解决"NES 看到过去代码"的问题
- 方案 C 解决"Tab 键冲突"的问题
- 两者结合，提供流畅的用户体验

---

## 3. 详细设计

### 3.1 FIM 状态追踪

#### 3.1.1 在 FIMEngine 中添加状态管理

```typescript
// ai-code-assistant/fim/FIMEngine.ts

export class FIMEngine {
  private ghostTextVisible = false; // 追踪 Ghost Text 是否可见
  private lastGhostTextTimestamp = 0; // 最后一次显示 Ghost Text 的时间

  /**
   * 检查是否有 Ghost Text 显示
   */
  hasGhostText(): boolean {
    return this.ghostTextVisible;
  }

  /**
   * 获取 Ghost Text 显示时长（毫秒）
   */
  getGhostTextAge(): number {
    if (!this.ghostTextVisible) return 0;
    return Date.now() - this.lastGhostTextTimestamp;
  }

  // 在 provideInlineCompletions 中更新状态
  provideInlineCompletions: async (model, position, context, token) => {
    // ... 现有逻辑 ...

    if (completion && completion.trim() !== '') {
      this.ghostTextVisible = true;
      this.lastGhostTextTimestamp = Date.now();
      return { items: [/* ... */] };
    } else {
      this.ghostTextVisible = false;
      return { items: [] };
    }
  }
}
```

#### 3.1.2 监听 Ghost Text 消失事件

```typescript
// 监听编辑器内容变化，检测 Ghost Text 是否被接受或拒绝
model.onDidChangeContent((event) => {
  // 如果有内容变化，且 Ghost Text 可见
  if (this.ghostTextVisible) {
    // 检查是否是接受 FIM（大块插入）
    const isFIMAccept = event.changes.some(change => 
      change.text.length > 10 && change.rangeLength === 0
    );
    
    if (isFIMAccept) {
      console.log('[FIMEngine] Ghost Text accepted');
      this.ghostTextVisible = false;
    }
  }
});

// 监听光标移动，Ghost Text 可能消失
editor.onDidChangeCursorPosition(() => {
  // 简化处理：光标移动后，Ghost Text 通常会消失
  if (this.ghostTextVisible) {
    // 延迟检查，避免误判
    setTimeout(() => {
      // 如果没有新的 Ghost Text 生成，标记为消失
      this.ghostTextVisible = false;
    }, 100);
  }
});
```

---

### 3.2 NES 延迟触发逻辑

#### 3.2.1 在主入口中实现等待逻辑

```typescript
// ai-code-assistant/index.ts

model.onDidChangeContent((event) => {
  // ... 现有的编辑历史记录逻辑 ...

  // 防抖处理 NES 检测
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(async () => {
    // ✅ 新增：检查 FIM 状态
    if (fimEngine && fimEngine.hasGhostText()) {
      console.log('[AICodeAssistant] FIM Ghost Text visible, waiting for user decision...');
      
      // 等待用户决策（最多 5 秒）
      const fimDecided = await waitForFIMDecision(fimEngine, 5000);
      
      if (!fimDecided) {
        console.log('[AICodeAssistant] FIM decision timeout, proceeding with NES');
      } else {
        console.log('[AICodeAssistant] FIM decided, proceeding with NES');
      }
    }

    // 继续 NES 检测
    const recentEdits = editHistory.getRecentEdits(10);
    await nesEngine!.wakeUp(recentEdits);
    
    // ... 现有的状态更新逻辑 ...
  }, finalConfig.nes.debounceMs);
});

/**
 * 等待 FIM 决策（接受或拒绝）
 * @param fimEngine FIM 引擎实例
 * @param timeoutMs 超时时间（毫秒）
 * @returns true 如果用户做出决策，false 如果超时
 */
async function waitForFIMDecision(
  fimEngine: FIMEngine, 
  timeoutMs: number
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 100; // 每 100ms 检查一次

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      // 检查 FIM Ghost Text 是否消失
      if (!fimEngine.hasGhostText()) {
        clearInterval(checkInterval);
        resolve(true); // 用户做出决策
        return;
      }

      // 检查是否超时
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        resolve(false); // 超时
        return;
      }
    }, pollInterval);
  });
}
```

---

### 3.3 Tab 键智能路由

#### 3.3.1 修改 Tab 键事件处理

```typescript
// ai-code-assistant/index.ts

editor.onKeyDown((e) => {
  if (e.keyCode === monaco.KeyCode.Tab) {
    // ✅ 优先级 1：检查 FIM 是否有 Ghost Text
    if (fimEngine && fimEngine.hasGhostText()) {
      console.log('[AICodeAssistant] Tab → FIM (Ghost Text visible)');
      // 不阻止默认行为，让 Monaco 处理 FIM 接受
      return;
    }

    // ✅ 优先级 2：检查 NES 是否激活
    if (nesEngine && nesEngine.isActive()) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[AICodeAssistant] Tab → NES');
      
      // 新交互模式：预览总是自动展开，直接 Accept
      nesEngine.acceptSuggestion();
      return;
    }

    // ✅ 优先级 3：默认行为（缩进）
    console.log('[AICodeAssistant] Tab → Default (indent)');
    // 不阻止，让 Monaco 处理默认缩进
  }
});
```

---

### 3.4 FIM 编辑标记

#### 3.4.1 在编辑历史中标记 FIM 来源

```typescript
// ai-code-assistant/index.ts

let nextEditIsFIM = false; // 标记下一次编辑是否来自 FIM

// 监听 FIM Ghost Text 接受事件
if (fimEngine) {
  // 方法 1：通过编辑大小判断
  model.onDidChangeContent((event) => {
    event.changes.forEach((change) => {
      // 如果是大块插入（> 10 个字符），且 FIM 刚才有 Ghost Text
      if (change.text.length > 10 && change.rangeLength === 0) {
        if (fimEngine.hasGhostText() || Date.now() - fimEngine.lastGhostTextTimestamp < 500) {
          console.log('[AICodeAssistant] Detected FIM accept');
          nextEditIsFIM = true;
        }
      }
    });
  });
}

// 在编辑历史记录中使用标记
model.onDidChangeContent((event) => {
  const source = nextEditIsFIM ? 'fim' : (nextEditIsNES ? 'nes' : 'user');
  
  event.changes.forEach((change) => {
    editHistory.recordEdit(change, model, source);
  });

  // 重置标记
  if (nextEditIsFIM) {
    nextEditIsFIM = false;
  }
  if (nextEditIsNES) {
    nextEditIsNES = false;
  }
});
```

#### 3.4.2 更新 EditRecord 类型

```typescript
// ai-code-assistant/types/index.d.ts

export interface EditRecord {
  timestamp: number;
  lineNumber: number;
  column: number;
  type: 'insert' | 'delete' | 'replace';
  oldText: string;
  newText: string;
  rangeLength: number;
  source: 'user' | 'nes' | 'fim'; // ✅ 新增 'fim'
  context?: {
    lineContent: string;
  };
}
```

---

## 4. 与现有机制的对比

### 4.1 现有机制（独立触发）

```
用户输入
  ↓
  ├─→ FIM (300ms debounce)
  │     ↓
  │   显示 Ghost Text
  │
  └─→ NES (3000ms debounce)
        ↓
      显示编辑建议

问题：
❌ FIM 和 NES 互不感知
❌ Tab 键被 NES 拦截
❌ NES 看不到 FIM Ghost Text
❌ 编辑历史无法区分 FIM 补全
```

### 4.2 B+C 组合方案（协调触发）

```
用户输入
  ↓
  ├─→ FIM (300ms debounce)
  │     ↓
  │   显示 Ghost Text
  │     ↓
  │   [FIM 状态追踪]
  │
  └─→ NES (3000ms debounce)
        ↓
      ✅ 检查 FIM 状态
        ↓
      如果 FIM 有 Ghost Text
        ↓
      等待用户决策 (最多 5 秒)
        ↓
      显示编辑建议

Tab 键处理：
  ✅ 优先级 1: FIM Ghost Text
  ✅ 优先级 2: NES 建议
  ✅ 优先级 3: 默认缩进

编辑历史：
  ✅ 标记来源: 'user' | 'nes' | 'fim'
  ✅ NES 可以过滤 FIM 编辑
```

---

## 5. 优势总结

### 5.1 解决的核心问题

| 问题 | 现有机制 | B+C 方案 | 改进 |
|------|---------|---------|------|
| Tab 键冲突 | ❌ NES 拦截 Tab | ✅ FIM 优先 | 用户可以正常接受 FIM |
| NES 上下文错误 | ❌ 看不到 Ghost Text | ✅ 等待 FIM 决策 | NES 基于准确的代码状态 |
| 编辑历史混乱 | ❌ 无法区分 FIM | ✅ 标记 'fim' 来源 | NES 可以过滤 FIM 编辑 |
| 用户体验 | ❌ 功能互相干扰 | ✅ 协调工作 | 流畅、符合直觉 |

### 5.2 用户体验提升

#### 场景 1：正常使用 FIM
```
用户输入 → FIM 显示 → 用户按 Tab → ✅ 接受 FIM
（NES 延迟触发，不干扰）
```

#### 场景 2：拒绝 FIM，使用 NES
```
用户输入 → FIM 显示 → 用户继续编辑（拒绝 FIM）
→ FIM Ghost Text 消失 → NES 触发 → 显示编辑建议
```

#### 场景 3：FIM 和 NES 顺序使用
```
用户输入 → FIM 显示 → 用户按 Tab 接受 FIM
→ 编辑历史标记为 'fim' → NES 触发时过滤 FIM 编辑
→ NES 基于用户真实意图预测
```

### 5.3 技术优势

1. **状态感知**：FIM 和 NES 互相感知对方的状态
2. **优先级明确**：Tab 键有清晰的优先级规则
3. **上下文准确**：NES 基于准确的代码状态进行预测
4. **可追溯性**：编辑历史清晰标记来源，便于调试和优化
5. **可扩展性**：未来可以添加更多协调规则

---

## 6. 实现复杂度评估

### 6.1 代码修改范围

| 文件 | 修改内容 | 行数估计 |
|------|---------|---------|
| `FIMEngine.ts` | 添加状态追踪 | +30 行 |
| `index.ts` | 实现等待逻辑 + Tab 路由 | +60 行 |
| `types/index.d.ts` | 更新 EditRecord 类型 | +1 行 |
| **总计** | | **~90 行** |

### 6.2 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| FIM 状态检测不准确 | 中 | 添加详细日志，测试验证 |
| 等待逻辑阻塞 NES | 低 | 设置超时（5 秒） |
| Tab 键路由冲突 | 低 | 明确优先级，充分测试 |

### 6.3 测试建议

1. **单元测试**：测试 `hasGhostText()` 和 `waitForFIMDecision()`
2. **集成测试**：测试 FIM → NES 的完整流程
3. **手动测试**：验证 Tab 键在各种场景下的行为
4. **性能测试**：确保等待逻辑不影响响应速度

---

## 7. 未来优化方向

### 7.1 短期优化（1-2 周）
- 添加配置项：`waitForFIMTimeoutMs`（可配置等待时长）
- 优化 Ghost Text 检测精度（使用 Monaco API）
- 添加用户反馈机制（统计 Tab 键使用情况）

### 7.2 长期优化（1-3 月）
- 实现 FIM 和 NES 的智能融合（FIM 补全 + NES 预测）
- 添加机器学习模型，预测用户是否会接受 FIM
- 支持多光标场景下的协调

---

## 8. 总结

B+C 组合方案通过 **状态感知** 和 **优先级路由** 两个核心机制，解决了 FIM 和 NES 的竞态问题。相比现有的独立触发机制，该方案提供了：

✅ **更流畅的用户体验**：功能协调工作，不互相干扰  
✅ **更准确的预测**：NES 基于准确的代码状态  
✅ **更清晰的交互**：Tab 键行为符合用户直觉  
✅ **更好的可维护性**：编辑历史清晰标记来源  

实现成本约 90 行代码，风险可控，建议优先实施。
