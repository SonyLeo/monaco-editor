# NES 交互流程优化方案

## 📊 问题分析

### 原有交互流程（3步交互）

当出现多个 NES 预测时，用户需要经过以下步骤：

```
预测 #1 显示
  ↓ 按 Tab（第1次）
预测 #1 预览
  ↓ 按 Tab（第2次）
预测 #1 Accept → 预测 #2 显示
  ↓ 按 Tab（第3次）
预测 #2 预览
  ↓ 按 Tab（第4次）
预测 #2 Accept → 预测 #3 显示
  ↓ ...
```

**问题**：
- 每个预测需要按 **2次 Tab** 才能应用（第1次预览，第2次 Accept）
- 额外的交互步骤降低了用户体验
- 用户需要"按→看→按→应用"的冗余流程

### 优化后的交互流程（1步交互）

```
预测 #1 预览（自动展开）
  ↓ 按 Tab（第1次）
预测 #1 Accept → 预测 #2 预览（自动展开）
  ↓ 按 Tab（第2次）
预测 #2 Accept → 预测 #3 预览（自动展开）
  ↓ ...
```

**优势**：
- 每个预测只需按 **1次 Tab** 即可应用
- 预览自动展示，无需额外操作
- 流畅的"看→按→下一个"循环体验

---

## 🔧 实现细节

### 核心修改

#### 1. `showFirstSuggestion()` - 直接展开预览

**修改前**（只显示 Glyph）：
```typescript
private showFirstSuggestion(): void {
  const prediction = this.suggestionQueue.peek();
  if (prediction) {
    // 只显示 Glyph 和 HintBar，不展开预览
    this.renderer.renderSuggestion(prediction);
    this.renderer.showHintBar(prediction.targetLine, prediction.explanation, false, progress);
    
    // 设置预览状态为未展开
    this.previewShown = false;
  }
}
```

**修改后**（直接展开预览）：
```typescript
private showFirstSuggestion(): void {
  const prediction = this.suggestionQueue.peek();
  if (prediction) {
    // 跳转到建议位置
    this.editor.setPosition({
      lineNumber: prediction.targetLine,
      column: 1
    });
    this.editor.revealLineInCenter(prediction.targetLine);
    
    // 直接显示预览（渲染 Glyph + 展开预览）
    this.renderer.renderSuggestion(prediction);
    this.renderer.showPreview(prediction);
    
    // 显示 HintBar（提示 "Tab Accept"）
    this.renderer.showHintBar(prediction.targetLine, prediction.explanation, true, progress);
    
    // 设置预览状态为已展开
    this.previewShown = true;
  }
}
```

**关键变化**：
- ✅ 自动调用 `showPreview()`
- ✅ 自动跳转到建议位置
- ✅ `previewShown` 默认为 `true`
- ✅ HintBar 显示"Tab Accept"提示

---

#### 2. `acceptSuggestion()` - Accept 后自动展开下一个预览

**修改前**：
```typescript
acceptSuggestion(): void {
  const prediction = this.suggestionQueue.dequeue();
  if (!prediction) return;

  this.renderer.applySuggestion(prediction);
  
  // 重置预览状态
  this.previewShown = false;

  // 显示下一个建议（只显示 Glyph）
  if (this.suggestionQueue.peek()) {
    this.showFirstSuggestion(); // 旧版：不展开预览
  } else {
    this.sleep();
  }
}
```

**修改后**：
```typescript
acceptSuggestion(): void {
  const prediction = this.suggestionQueue.dequeue();
  if (!prediction) return;

  this.renderer.applySuggestion(prediction);
  
  // 通知主入口
  if (this.onEditApplied) {
    this.onEditApplied(prediction.targetLine);
  }

  // 显示下一个建议（直接展开预览）
  if (this.suggestionQueue.peek()) {
    this.showFirstSuggestion(); // 新版：自动展开预览
  } else {
    this.sleep();
  }
}
```

**关键变化**：
- ✅ 不再重置 `previewShown`（由 `showFirstSuggestion()` 控制）
- ✅ `showFirstSuggestion()` 现在会自动展开下一个预览
- ✅ 流畅的连续预览体验

---

### Tab 键路由逻辑（`index.ts`）

**已简化**，现有逻辑：

```typescript
editor.onKeyDown((e) => {
  if (e.keyCode === monaco.KeyCode.Tab) {
    // 优先级 1：FIM Ghost Text 优先
    if (fimEngine && fimEngine.hasGhostText()) {
      return; // 不阻止默认行为
    }

    // 优先级 2：NES 建议
    if (nesEngine!.isActive()) {
      e.preventDefault();
      e.stopPropagation();
      
      // ✅ 新逻辑：预览总是自动展开，直接 Accept
      nesEngine!.acceptSuggestion();
    }
  }
});
```

**工作原理**：
- 由于 `showFirstSuggestion()` 现在默认展开预览
- 因此每次按 Tab 时，直接调用 `acceptSuggestion()`
- 完美实现"看→按→下一个"的流程

---

## 📋 完整交互流程示例

### 场景：3个预测

#### 初始状态
```
NES 返回 3 个预测:
  1. Line 10: 修复拼写错误
  2. Line 15: 添加类型注解
  3. Line 20: 优化逻辑
```

#### 用户操作流程

| 步骤 | 显示内容 | 用户操作 | 系统响应 |
|------|----------|----------|----------|
| 1 | **预测 #1 自动预览**<br>- Glyph 显示<br>- 预览展开<br>- HintBar: "Tab Accept (1/3)" | 按 `Tab` | ✅ Accept 预测 #1<br>↓ |
| 2 | **预测 #2 自动预览**<br>- 光标跳转到 Line 15<br>- 预览展开<br>- HintBar: "Tab Accept (2/3)" | 按 `Tab` | ✅ Accept 预测 #2<br>↓ |
| 3 | **预测 #3 自动预览**<br>- 光标跳转到 Line 20<br>- 预览展开<br>- HintBar: "Tab Accept (3/3)" | 按 `Tab` | ✅ Accept 预测 #3<br>↓ |
| 4 | NES 进入 SLEEPING 状态 | - | - |

**总操作数**：3次 Tab（处理3个预测）

---

### 对比：旧流程

| 步骤 | 显示内容 | 用户操作 | 系统响应 |
|------|----------|----------|----------|
| 1 | **预测 #1 Glyph**<br>- 只显示 Glyph<br>- HintBar: "Tab Preview (1/3)" | 按 `Tab` | 展开预览<br>↓ |
| 2 | **预测 #1 预览**<br>- 预览展开<br>- HintBar: "Tab Accept (1/3)" | 按 `Tab` | Accept 预测 #1<br>↓ |
| 3 | **预测 #2 Glyph** | 按 `Tab` | 展开预览<br>↓ |
| 4 | **预测 #2 预览** | 按 `Tab` | Accept 预测 #2<br>↓ |
| 5 | **预测 #3 Glyph** | 按 `Tab` | 展开预览<br>↓ |
| 6 | **预测 #3 预览** | 按 `Tab` | Accept 预测 #3<br>↓ |
| 7 | NES 进入 SLEEPING 状态 | - | - |

**总操作数**：6次 Tab（处理3个预测）

**优化效果**：操作数减少 **50%** ✅

---

## 🎯 其他快捷键行为

保持不变：

| 快捷键 | 行为 |
|--------|------|
| `Tab` | Accept 当前预览 → 展示下一个预览 |
| `Alt+N` | 跳过当前预测 → 展示下一个预览 |
| `Esc` | 完全关闭 NES（清空队列） |

---

## ✅ 测试检查清单

- [ ] 单个预测：自动展开预览，按 Tab 应用
- [ ] 多个预测：每次 Tab 应用当前并展开下一个
- [ ] 光标自动跳转：每个预测展开时，光标跳转到正确行
- [ ] 进度显示：HintBar 正确显示 "(x/y)"
- [ ] Alt+N 跳过：跳过后下一个预测自动展开
- [ ] Esc 关闭：清空队列并进入 SLEEPING
- [ ] FIM 优先级：FIM Ghost Text 出现时，Tab 优先触发 FIM

---

## 📝 总结

### 修改的核心逻辑

1. **`showFirstSuggestion()`**
   - 原：只显示 Glyph
   - 新：**直接展开预览**

2. **`acceptSuggestion()`**
   - 原：Accept 后显示 Glyph
   - 新：**Accept 后展开下一个预览**

3. **交互步骤**
   - 原：显示 → 预览 → Accept（2次 Tab）
   - 新：**预览 → Accept（1次 Tab）**

### 用户体验提升

- ✅ 操作步骤减少 50%
- ✅ 预览自动展示，无需额外操作
- ✅ 流畅的"看→按→下一个"循环
- ✅ 更符合直觉的交互逻辑

### 向后兼容性

- ✅ Alt+N、Esc 等快捷键行为不变
- ✅ FIM 优先级逻辑不受影响
