# FIM 与 NES 交互设计最佳实践

## 业界标杆分析

### GitHub Copilot NES（2025年2月正式发布）

**核心设计哲学**：
```
FIM (Fill-In-Middle) ≠ NES (Next Edit Suggestions)
它们是两个完全独立的系统，服务不同的场景
```

**关键特性**：
- **时序分离**：用户输入时只显示 FIM，停止输入后才触发 NES
- **渐进式导航**：一次只显示一个建议，Tab 接受后自动分析下一个
- **视觉简洁**：箭头（gutter）+ 灰色文本（ghost text）
- **智能触发**：只在"有意义的编辑"后触发（重命名、逻辑改变、参数添加等）

**用户流程**：
```
用户编辑代码 → 停止输入 → NES 分析 → 显示箭头指向下一个位置
              ↓
         按 Tab 跳转到该位置
              ↓
         按 Tab 接受建议
              ↓
         NES 自动分析下一个 → 继续显示箭头
```

### Cursor Tab Fusion（2024-2025年持续迭代）

**核心创新**：统一 FIM 和 NES

```
Cursor 的做法：不分离，而是融合
一个模型同时预测：
1. 当前光标位置的编辑（类似 FIM）
2. 下一个应该跳转的位置（类似 NES）
```

**关键特性**：
- **即时跳转**：延迟从 475ms 降到 260ms
- **更长上下文**：从 5500 tokens 增加到 13000 tokens
- **更高准确率**：难度编辑预测提升 25%，建议长度增加 10 倍
- **统一交互**：Tab 既接受当前建议，也跳转到下一个位置

**技术优势**：
```javascript
// Cursor 的 Fusion 模型
{
  currentEdit: "在光标处的编辑建议",
  nextJump: "下一个应该跳转的位置",
  confidence: 0.95
}

// 一次推理，两个输出
// 避免了两次 API 调用
```

## 两种模式对比

| 维度 | GitHub Copilot NES | Cursor Tab Fusion |
|------|-------------------|-------------------|
| **哲学** | 分离：FIM 和 NES 是两个系统 | 融合：一个模型预测所有 |
| **触发** | 用户停止输入后 | 实时 + 停止输入 |
| **显示** | 箭头 + 灰色文本 | 灰色文本 + 自动跳转 |
| **导航** | Tab 跳转 → Tab 接受 | Tab 接受 + 跳转 |
| **性能** | 两次推理（FIM + NES） | 一次推理 |
| **成本** | 较高（两个模型） | 较低（一个模型） |
| **准确率** | 高（专门优化） | 更高（统一训练） |

## 当前混合模式的问题

### 问题 1：认知负担过重

```
用户正在输入 → FIM 显示灰色补全
              ↓
         同时 NES 显示 Glyph Icon
              ↓
         用户：我该看哪个？Tab 会做什么？
```

**核心问题**：
- 两种意图冲突：FIM 说"继续当前行"，NES 说"跳到别处"
- Tab 键语义模糊：用户按 Tab 是想接受 FIM 还是跳转到 NES？
- 视觉干扰：正在思考当前代码时，gutter 的图标分散注意力

### 问题 2：时序混乱

```javascript
// 当前实现的时间线
t=0ms:   用户输入 'c'
t=50ms:  FIM 触发 → 显示 "const x = ..."
t=100ms: 用户继续输入 'o'
t=150ms: FIM 更新 → 显示 "const x = ..."
t=1500ms: NES 触发 → 显示 Glyph Icon
         ↓
    问题：用户还在输入，NES 就出现了
```

**Copilot 的做法**：
```javascript
// Copilot 的时间线
t=0ms:   用户输入 'const'
t=50ms:  FIM 触发 → 显示补全
t=200ms: 用户按 Tab 接受
t=201ms: FIM 消失
t=500ms: 用户停止输入（编辑完成）
t=1000ms: NES 分析 → 显示箭头
         ↓
    清晰：FIM 和 NES 从不同时出现
```

### 问题 3：优先级机制是伪需求

```javascript
// 当前：用优先级解决冲突
const priorities = {
  FIM: 1,    // 高优先级
  NES: 2     // 低优先级
};
```

**为什么这是伪需求**：
- 如果 FIM 优先，NES 永远不显示 → NES 没用
- 如果 NES 优先，FIM 被抑制 → 实时补全失效
- **真正问题**：它们不应该同时存在

**Copilot 的做法**：
```javascript
// 不需要优先级，因为它们在不同阶段
if (用户正在输入) {
  只显示 FIM;
} else if (用户完成编辑) {
  只显示 NES;
}
```

## 多条预测方案的问题

### 问题 1：视觉爆炸

```
 1 | function farewell() {     ← 🔵 Glyph Icon 1
 2 |   console.log("bye");
 3 | }
 4 |
 5 | farewell();               ← 🔵 Glyph Icon 2
 6 |
 7 | const x = farewell();     ← 🔵 Glyph Icon 3
 8 |
 9 | export { farewell };      ← 🔵 Glyph Icon 4
```

**用户反应**：
- "这么多图标，我该先看哪个？"
- "它们之间有什么关系？"
- "我能一次性接受所有吗？"

### 问题 2：导航混乱

```javascript
// 当前方案：队列管理
const queue = [suggestion1, suggestion2, suggestion3];
let currentIndex = 0;

// 用户按 Tab
currentIndex++;  // 跳到下一个

// 问题：
// 1. 用户不知道还有几个
// 2. 用户不知道当前在第几个
// 3. 用户想跳过某个怎么办？
// 4. 用户想回到上一个怎么办？
```

### 问题 3：链式依赖不清晰

```javascript
// 场景：重命名函数
function oldName() { ... }  // 改为 newName
                            ↓
// NES 预测 3 个位置需要改
oldName();        // 位置 1
const x = oldName();  // 位置 2
export { oldName };   // 位置 3

// 问题：
// 如果用户只接受位置 1，跳过位置 2
// 那位置 3 还有意义吗？
// 代码会不会不一致？
```

### 问题 4：性能和成本

```javascript
// 一次分析多个位置
const suggestions = await analyzeAllRelatedEdits();
// 可能返回 5-10 个建议

// 问题：
// 1. API 调用成本高（一次分析多个位置）
// 2. 用户可能只需要第一个
// 3. 后面的建议可能因为接受第一个而失效
```

### Copilot 的解决方案：渐进式单点导航

```javascript
// 核心思想：一次只显示一个，接受后再分析下一个

// Step 1: 用户编辑
function farewell() { ... }  // 改名完成

// Step 2: NES 分析，只显示最相关的一个
farewell();  ← 显示箭头 + 建议

// Step 3: 用户按 Tab 接受

// Step 4: NES 重新分析，显示下一个
const x = farewell();  ← 显示箭头 + 建议

// Step 5: 用户按 Tab 接受

// Step 6: 继续...
```

**优势**：
- ✅ 视觉简洁：一次只有一个箭头
- ✅ 导航清晰：Tab 就是"接受并继续"
- ✅ 动态调整：每次接受后重新分析，避免过时建议
- ✅ 成本可控：按需分析，不浪费

## 渐进式实现路线图

### 阶段 1：严格分离（对标 Copilot NES）

**目标**：完全分离 FIM 和 NES，避免冲突

```javascript
// 状态机设计
const EditorState = {
  TYPING: 'typing',           // 用户正在输入
  IDLE: 'idle',               // 用户停止输入
  NES_SHOWING: 'nes_showing', // NES 建议显示中
  NES_JUMPING: 'nes_jumping'  // 用户跳转到 NES 位置
};

let currentState = EditorState.IDLE;
let typingTimer = null;

// 核心：状态转换
editor.onDidChangeModelContent((e) => {
  // 任何输入都进入 TYPING 状态
  currentState = EditorState.TYPING;
  
  // 清除之前的 NES 建议
  clearNESSuggestions();
  
  // 触发 FIM（实时补全）
  triggerFIM();
  
  // 重置计时器
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    // 1.5s 后进入 IDLE 状态
    currentState = EditorState.IDLE;
    
    // 判断是否触发 NES
    if (isSignificantEdit(e)) {
      analyzeAndShowNES();
    }
  }, 1500);
});

// Tab 键逻辑
onTabKey() {
  switch (currentState) {
    case EditorState.TYPING:
      // 用户正在输入，Tab 接受 FIM
      if (hasFIMSuggestion()) {
        acceptFIM();
      }
      break;
      
    case EditorState.NES_SHOWING:
      // NES 建议显示中，Tab 跳转
      jumpToNESSuggestion();
      currentState = EditorState.NES_JUMPING;
      break;
      
    case EditorState.NES_JUMPING:
      // 已跳转到 NES 位置，Tab 接受建议
      acceptNESSuggestion();
      // 接受后立即分析下一个
      analyzeAndShowNES();
      break;
  }
}

// 判断是否是有意义的编辑
function isSignificantEdit(change) {
  // 1. 不是空格/缩进变化
  if (isWhitespaceOnly(change)) return false;
  
  // 2. 是删除或替换（不是插入）
  if (change.rangeLength > 0) return true;
  
  // 3. 是多字符输入
  if (change.text.length > 1) return true;
  
  // 4. 是特殊字符（括号、分号等）
  if (isSpecialCharacter(change.text)) return true;
  
  return false;
}
```

**优势**：
- ✅ 清晰的状态转换
- ✅ 用户不会困惑（一次只有一种建议）
- ✅ 实现简单，易于调试

**劣势**：
- ❌ 两次 API 调用（成本高）
- ❌ 延迟较高（需要等待 1.5s）

**实施步骤**：
1. 实现状态机
2. 改进 NES 显示方式（箭头 + 灰色文本）
3. 实现 `isSignificantEdit()` 判断
4. 移除 Arbiter 的优先级机制
5. 简化 Tab 键逻辑

**预期时间**：1-2 周

### 阶段 2：智能融合（对标 Cursor Fusion）

**目标**：一次推理，同时预测 FIM 和 NES

```javascript
// 统一模型：一次推理，多个输出
async function unifiedPrediction(context) {
  const result = await model.predict({
    code: context.code,
    cursorPosition: context.cursor,
    recentEdits: context.editHistory,
    
    // 关键：同时请求两种预测
    tasks: ['fim', 'nes']
  });
  
  return {
    fim: {
      text: result.currentCompletion,
      confidence: result.fimConfidence
    },
    nes: {
      nextLocation: result.nextEditLocation,
      suggestion: result.nextEditSuggestion,
      confidence: result.nesConfidence
    }
  };
}

// 智能显示逻辑
async function smartSuggestion() {
  const prediction = await unifiedPrediction(getContext());
  
  // 策略 1：基于置信度
  if (prediction.fim.confidence > 0.8) {
    // FIM 置信度高，优先显示
    showFIM(prediction.fim);
    
    // 但同时预加载 NES（不显示）
    preloadNES(prediction.nes);
  } else if (prediction.nes.confidence > 0.8) {
    // NES 置信度高，显示箭头提示
    showNESHint(prediction.nes);
  }
  
  // 策略 2：基于用户行为
  if (isUserTypingFast()) {
    // 用户快速输入，只显示 FIM
    showFIM(prediction.fim);
  } else if (isUserPausing()) {
    // 用户暂停，显示 NES
    showNES(prediction.nes);
  }
}
```

**优势**：
- ✅ 一次 API 调用（成本低）
- ✅ 更快的响应（预加载）
- ✅ 更智能的决策（基于置信度）

**劣势**：
- ❌ 实现复杂
- ❌ 需要训练统一模型

**实施步骤**：
1. 设计统一的 API 接口
2. 实现预测缓存机制
3. 实现置信度评估
4. 优化模型调用策略

**预期时间**：3-6 月（需要模型支持）

### 阶段 3：自适应混合（最佳实践）

**目标**：根据场景动态切换策略

```javascript
// 核心思想：根据场景动态切换策略

class AdaptiveSuggestionController {
  constructor() {
    this.mode = 'auto'; // auto | fim-only | nes-only
    this.userPreference = this.loadUserPreference();
  }
  
  async suggest(context) {
    // 1. 分析当前场景
    const scenario = this.analyzeScenario(context);
    
    switch (scenario.type) {
      case 'NEW_CODE':
        // 场景：写新代码
        // 策略：只用 FIM，快速补全
        return this.fimOnly(context);
        
      case 'REFACTORING':
        // 场景：重构代码
        // 策略：FIM + NES，但 NES 优先级更高
        return this.nesFirst(context);
        
      case 'FIXING_BUG':
        // 场景：修复 bug
        // 策略：NES 主导，预测相关修改点
        return this.nesOnly(context);
        
      case 'EXPLORING':
        // 场景：浏览代码
        // 策略：不显示任何建议，避免干扰
        return null;
        
      default:
        // 默认：智能混合
        return this.smartMix(context);
    }
  }
  
  analyzeScenario(context) {
    // 基于多个信号判断场景
    const signals = {
      isNewFile: context.file.lineCount < 10,
      hasRecentRename: this.detectRename(context.editHistory),
      hasRecentDelete: this.detectDelete(context.editHistory),
      cursorMovement: this.analyzeCursorMovement(),
      typingSpeed: this.calculateTypingSpeed()
    };
    
    // 场景识别逻辑
    if (signals.hasRecentRename) {
      return { type: 'REFACTORING', confidence: 0.9 };
    }
    
    if (signals.isNewFile && signals.typingSpeed > 50) {
      return { type: 'NEW_CODE', confidence: 0.85 };
    }
    
    // ... 更多场景判断
  }
  
  async smartMix(context) {
    // 统一预测
    const prediction = await unifiedPrediction(context);
    
    // 动态决策
    if (this.isUserTyping()) {
      // 输入中：只显示 FIM
      return {
        type: 'fim',
        suggestion: prediction.fim,
        nesPreloaded: prediction.nes // 预加载但不显示
      };
    } else {
      // 停止输入：显示 NES
      return {
        type: 'nes',
        suggestion: prediction.nes,
        fimCached: prediction.fim // 缓存以备快速切换
      };
    }
  }
}
```

**优势**：
- ✅ 最智能的体验
- ✅ 适应不同编码场景
- ✅ 可持续优化

**实施步骤**：
1. 实现场景识别算法
2. 收集用户行为数据
3. A/B 测试不同策略
4. 持续优化和迭代

**预期时间**：持续优化（3-6 月）

## 用户体验关键原则

### 1. 单一焦点原则

```
❌ 错误：同时显示多个建议
用户：我该看哪个？

✅ 正确：一次只显示一个焦点
用户：清晰明了，知道该做什么
```

### 2. 渐进式揭示原则

```
❌ 错误：一次显示所有 5 个需要修改的位置
用户：压力山大，不知道从哪开始

✅ 正确：显示第一个 → 接受 → 显示第二个
用户：一步一步来，有掌控感
```

### 3. 非侵入式原则

```
❌ 错误：弹窗、对话框、模态提示
用户：打断思路，很烦

✅ 正确：灰色文本、箭头提示、可忽略
用户：需要时看，不需要时忽略
```

### 4. 即时反馈原则

```
❌ 错误：按 Tab 后等待 2 秒才跳转
用户：卡顿，体验差

✅ 正确：按 Tab 立即跳转（<100ms）
用户：流畅，像原生功能
```

### 5. 可预测性原则

```
❌ 错误：Tab 键有时接受 FIM，有时跳转 NES
用户：不知道会发生什么

✅ 正确：清晰的视觉提示 + 一致的行为
用户：知道按 Tab 会做什么
```

## 实施建议

### 短期（1-2 周）：实现阶段 1 - 严格分离

```javascript
// 最小可行方案
1. 完全分离 FIM 和 NES 的触发时机
2. 用状态机管理 Tab 键行为
3. 改进 NES 显示方式（箭头 + 灰色文本）
4. 实现 isSignificantEdit() 判断
```

### 中期（1-2 月）：优化为阶段 3 - 自适应混合

```javascript
// 优化方案
1. 实现场景识别（新代码 vs 重构 vs 修 bug）
2. 根据场景动态调整策略
3. 收集用户行为数据，优化触发时机
4. A/B 测试不同策略的效果
```

### 长期（3-6 月）：探索阶段 2 - 统一模型

```javascript
// 终极方案
1. 训练或使用统一模型（如果成本允许）
2. 实现预测缓存和预加载
3. 持续优化延迟和准确率
4. 考虑跨文件的 NES 支持
```

## 核心原则

**先做对（分离清晰），再做好（智能融合），最后做快（统一模型）**

## 参考资料

- [GitHub Copilot NES 官方博客](https://code.visualstudio.com/blogs/2025/02/12/next-edit-suggestions)
- [GitHub Next - Copilot Next Edit Suggestions](https://githubnext.com/projects/copilot-next-edit-suggestions)
- [Cursor Tab Fusion 更新](https://cursor.com/blog/tab-update)
- [Cursor Tab 文档](https://docs.cursor.com/tab/overview)

## 预期改进指标

| 指标 | 当前 | 优化后 | 改进 |
|------|------|--------|------|
| 交互清晰度 | 混乱 | 清晰 | ⬆️ 大幅 |
| API 调用 | 2x | 1x | ⬇️ 50% |
| 用户困惑 | 高 | 低 | ⬇️ 大幅 |
| 响应时间 | 长 | 短 | ⬇️ 明显 |
| 准确率 | 中等 | 高 | ⬆️ 明显 |
