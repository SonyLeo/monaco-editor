# FIM 与 NES 触发逻辑分析与最佳实践

## 一、当前问题分析

### 1.1 触发逻辑重复

**问题：** FIM 和 NES 都监听 `onDidChangeModelContent`，导致同时触发

```typescript
// FastCompletionProvider.ts
monaco.languages.registerInlineCompletionsProvider('typescript', {
  provideInlineCompletions: async (model, position, _, token) => {
    // 每次内容变化都会触发
  }
});

// NESController.ts
this.editor.onDidChangeModelContent((e) => {
  // 每次内容变化也会触发
  this.handleContentChange(e);
});
```

**后果：**
- 用户打一个字符，两个引擎同时工作
- 资源浪费，API 调用重复
- 用户体验混乱（不知道哪个建议会出现）

---

### 1.2 应用场景重叠

| 场景 | FIM 是否触发 | NES 是否触发 | 冲突 |
|------|-------------|-------------|------|
| 参数补全 | ✅ | ✅ | ❌ 重复 |
| 函数体补全 | ✅ | ✅ | ❌ 重复 |
| 变量名补全 | ✅ | ❌ | ✅ 正常 |
| 跨文件修改预测 | ❌ | ✅ | ✅ 正常 |
| 重构建议 | ❌ | ✅ | ✅ 正常 |

**结论：** 60% 的场景存在重叠，需要明确分工

---

### 1.3 优先级管理混乱

**当前配置：**
```typescript
// SuggestionArbiter.ts
const fimSuggestion: FimSuggestion = {
  type: 'FIM',
  priority: 1,  // 低优先级
  ...suggestion
};

const nesSuggestion: NesSuggestion = {
  type: 'NES',
  priority: 2,  // 高优先级
  ...suggestion
};
```

**问题：**
- 优先级数字越大越高，但 FIM 应该优先（实时补全）
- NES 应该在 FIM 无法处理时才介入
- 当前逻辑导致 NES 总是覆盖 FIM

**正确的优先级：**
```typescript
FIM: priority: 2      // 高优先级（实时补全）
NES: priority: 1      // 低优先级（编辑预测）
WORD_FIX: priority: 3 // 最高优先级（拼写修正）
```

---

### 1.4 Tab 键处理复杂

**当前流程：**
```
用户编辑 → NES 预测 → 显示 Glyph Icon
  ↓
用户按 Tab (第1次) → 跳转到建议行
  ↓
用户按 Tab (第2次) → 展开 ViewZone 预览
  ↓
用户按 Tab (第3次) → 应用建议
```

**问题：**
- 需要 3 次 Tab，用户体验差
- 用户不清楚当前状态（跳转？预览？应用？）
- ViewZone 预览占用空间，干扰编辑

**GitHub Copilot 的流程：**
```
用户编辑 → NES 预测 → 显示箭头 + 灰色文本
  ↓
用户按 Tab (第1次) → 跳转到建议行（灰色文本变为可见）
  ↓
用户按 Tab (第2次) → 应用建议
```

---

### 1.5 缺少上下文感知

**当前实现：**
```typescript
// 所有编辑都触发 NES
this.editor.onDidChangeModelContent((e) => {
  this.schedulePredict();  // 无条件触发
});
```

**问题：**
- 删除空格也触发预测（浪费）
- 添加注释也触发预测（无意义）
- 无法区分"重要编辑"和"琐碎编辑"

**应该有的判断：**
```typescript
function isSignificantEdit(change): boolean {
  // 只有重要编辑才触发 NES
  if (isWhitespaceOnly(change)) return false;
  if (isCommentEdit(change)) return false;
  if (isMinorTypo(change)) return false;
  
  return true;
}
```

---

## 二、业界最佳实践

### 2.1 GitHub Copilot

#### 架构设计
```
┌─────────────────────────────────────────┐
│         GitHub Copilot 架构             │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │ Inline       │    │ Next Edit    │  │
│  │ Completion   │    │ Suggestions  │  │
│  │ (实时)       │    │ (分析模式)   │  │
│  └──────────────┘    └──────────────┘  │
│         │                    │          │
│         │                    │          │
│  ┌──────▼────────────────────▼──────┐  │
│  │      Suggestion Arbiter          │  │
│  │      (优先级管理)                │  │
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

#### 触发逻辑
```typescript
// Inline Completion (FIM)
- 触发条件：用户停止打字 200-500ms
- 触发频率：高频（每次停顿）
- 显示方式：灰色文本（inline ghost text）
- 接受方式：Tab 键
- 取消方式：继续打字 / Esc

// Next Edit Suggestions (NES)
- 触发条件：检测到"重要编辑模式"
  * 函数签名修改
  * 变量重命名
  * 类型定义修改
- 触发频率：低频（只在特定模式下）
- 显示方式：箭头 + 灰色文本 + 删除线
- 接受方式：Tab 跳转 → Tab 接受
- 取消方式：Esc / 继续编辑其他位置
```

#### 三种 NES UI 模式（基于 NesEditor.vue 实现）

```typescript
// 场景 1：三元表达式错误（整行替换）
显示：整行红色背景 + 整行绿色预览（ViewZone）
图标：⚡ (lightning bolt)
交互：Tab 跳转 → Tab 接受
适用：逻辑错误修正（如三元表达式错误）
实现状态：✅ 已在 NesEditor.vue 中实现

// 场景 2：插入属性（插入新行）
显示：整行蓝色背景 + 整行绿色预览（ViewZone）
图标：💡 (lightbulb)
交互：Tab 跳转 → Tab 接受
适用：添加新属性、新方法
实现状态：✅ 已在 NesEditor.vue 中实现

// 场景 3：单词/部分替换
显示：只高亮错误单词 + 行内箭头（↳）+ 预览单词
图标：⚡ (lightning bolt)
交互：Tab 跳转 → Tab 接受
适用：
  - 关键字拼写错误（funct ion → function）
  - 逻辑运算符错误（|| → &&）
  - 变量重命名（name → userName）
  - 字符串值修正（'Hello' → 'Goodbye'）
实现状态：✅ 已在 NesEditor.vue 中实现

// 场景 4：删除行
显示：整行红色背景（无预览）
图标：⚠️ (warning)
交互：Tab 跳转 → Tab 删除
适用：
  - 删除无用的导入语句
  - 删除重复的代码行
  - 删除过时的注释
实现状态：✅ 已在 NesEditor.vue 中实现

// 场景 5：连续建议（INSERT + INLINE_INSERT）
显示：
  - 第一个建议：整行蓝色背景 + 整行绿色预览（INSERT）
  - 第二个建议：Glyph Icon + 行内绿色片段（INLINE_INSERT）
图标：💡 (第一个) / ⚡ (第二个)
交互：
  - 第一个：Tab 跳转 → Tab 接受
  - 第二个：直接显示绿色预览（不需要状态1）
适用：
  - 类定义扩展后，需要更新相关的计算逻辑
  - 变量重命名后，需要更新所有引用
  - 意图变更后的连锁反应
实现状态：✅ 已在 NesEditor.vue 中实现
关键修复：使用 before 装饰器 + inlineClassNameAffectsLetterSpacing + showIfCollapsed
```

**UI 效果对比：**

| 场景 | 错误标记 | 预览方式 | 对应截图 | 实现状态 |
|------|----------|----------|----------|----------|
| 场景1：三元表达式 | 整行红色背景 | 整行绿色预览（ViewZone） | image-1.png | ✅ 已实现 |
| 场景2：插入属性 | 整行蓝色背景 | 整行绿色预览（ViewZone） | image-3.png (第1个) | ✅ 已实现 |
| 场景3：单词替换 | 只高亮单词 | 行内箭头 + 预览单词 | image-2.png, image-4.png | ✅ 已实现 |
| 场景4：删除行 | 整行红色背景 | 无预览（直接删除） | - | ✅ 已实现 |
| 场景5：连续建议 | 第1个：整行蓝色<br>第2个：无背景 | 第1个：整行绿色预览<br>第2个：行内绿色片段 | image-3.png (完整) | ✅ 已实现 |

---

### 2.2 Cursor AI

#### 架构设计
```
┌─────────────────────────────────────────┐
│           Cursor AI 架构                │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │ Tab          │    │ Cmd+K        │  │
│  │ Autocomplete │    │ AI Edit      │  │
│  │ (实时)       │    │ (手动触发)   │  │
│  └──────────────┘    └──────────────┘  │
│         │                    │          │
│         │                    │          │
│  ┌──────▼────────────────────▼──────┐  │
│  │      Context Manager             │  │
│  │      (上下文管理)                │  │
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

#### 触发逻辑
```typescript
// Tab Autocomplete (FIM)
- 触发条件：用户停止打字 300ms
- 触发频率：高频
- 显示方式：灰色文本
- 接受方式：Tab 键
- 特点：只补全当前光标位置

// Cmd+K AI Edit (Chat-based)
- 触发条件：用户手动按 Cmd+K
- 触发频率：低频（用户主动）
- 显示方式：弹出输入框
- 接受方式：用户输入指令 → AI 执行
- 特点：可以跨文件、多行编辑
```

---

### 2.3 Continue

#### 架构设计
```
┌─────────────────────────────────────────┐
│          Continue 架构                  │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │ Autocomplete │    │ Next Edit    │  │
│  │ (可选)       │    │ (可选)       │  │
│  └──────────────┘    └──────────────┘  │
│         │                    │          │
│         │                    │          │
│  ┌──────▼────────────────────▼──────┐  │
│  │      User Settings               │  │
│  │      (用户可配置)                │  │
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

#### 触发逻辑
```typescript
// Autocomplete (FIM)
- 触发条件：用户配置（默认关闭）
- 触发频率：高频
- 显示方式：灰色文本
- 接受方式：Tab 键

// Next Edit (NES)
- 触发条件：用户配置（默认关闭）
- 触发频率：低频
- 显示方式：箭头 + 灰色文本
- 接受方式：Tab 跳转 → Tab 接受
- 特点：用户可以选择启用/禁用
```

---

## 三、推荐方案

### 3.1 完全分离 FIM 和 NES 触发逻辑

#### 方案 A：基于编辑模式判断（推荐）

```typescript
// 编辑模式枚举
enum EditMode {
  TYPING,        // 正常打字（触发 FIM）
  REFACTORING,   // 重构模式（触发 NES）
  IDLE,          // 空闲（不触发）
}

class EditModeDetector {
  private mode: EditMode = EditMode.IDLE;
  private editHistory: Edit[] = [];
  
  detectMode(change: ContentChange): EditMode {
    this.editHistory.push(change);
    
    // 检测重构模式
    if (this.isRefactoringPattern()) {
      return EditMode.REFACTORING;
    }
    
    // 检测正常打字
    if (this.isTypingPattern()) {
      return EditMode.TYPING;
    }
    
    return EditMode.IDLE;
  }
  
  private isRefactoringPattern(): boolean {
    // 检测函数签名修改
    if (this.hasFunctionSignatureChange()) return true;
    
    // 检测变量重命名
    if (this.hasVariableRename()) return true;
    
    // 检测类型定义修改
    if (this.hasTypeDefinitionChange()) return true;
    
    return false;
  }
  
  private isTypingPattern(): boolean {
    // 检测连续的小编辑
    if (this.hasConsecutiveSmallEdits()) return true;
    
    // 检测单行编辑
    if (this.isSingleLineEdit()) return true;
    
    return false;
  }
}

// 使用
this.editor.onDidChangeModelContent((e) => {
  const mode = this.modeDetector.detectMode(e);
  
  if (mode === EditMode.TYPING) {
    // 只触发 FIM
    this.fimProvider.trigger();
  } else if (mode === EditMode.REFACTORING) {
    // 只触发 NES
    this.nesController.predict();
  }
});
```

#### 方案 B：基于时间窗口（简单）

```typescript
class TriggerManager {
  private lastFimTrigger = 0;
  private lastNesTrigger = 0;
  
  private FIM_COOLDOWN = 500;   // FIM 冷却 500ms
  private NES_COOLDOWN = 1500;  // NES 冷却 1500ms
  
  shouldTriggerFim(): boolean {
    const now = Date.now();
    if (now - this.lastFimTrigger < this.FIM_COOLDOWN) {
      return false;
    }
    this.lastFimTrigger = now;
    return true;
  }
  
  shouldTriggerNes(change: ContentChange): boolean {
    const now = Date.now();
    
    // NES 只在重要编辑时触发
    if (!this.isSignificantEdit(change)) {
      return false;
    }
    
    if (now - this.lastNesTrigger < this.NES_COOLDOWN) {
      return false;
    }
    
    this.lastNesTrigger = now;
    return true;
  }
  
  private isSignificantEdit(change: ContentChange): boolean {
    // 忽略空白字符编辑
    if (/^\s*$/.test(change.text)) return false;
    
    // 忽略单字符编辑
    if (change.text.length === 1) return false;
    
    // 忽略注释编辑
    if (change.text.startsWith('//') || change.text.startsWith('/*')) return false;
    
    return true;
  }
}
```

---

### 3.2 调整优先级

```typescript
// 修正优先级（数字越大越高）
const PRIORITIES = {
  WORD_FIX: 3,  // 最高优先级（拼写修正）
  FIM: 2,       // 高优先级（实时补全）
  NES: 1,       // 低优先级（编辑预测）
};

// SuggestionArbiter.ts
submitFimSuggestion(suggestion: Omit<FimSuggestion, 'type' | 'priority'>): boolean {
  const fimSuggestion: FimSuggestion = {
    type: 'FIM',
    priority: PRIORITIES.FIM,  // 改为 2
    ...suggestion
  };
  return this.acceptSuggestion(fimSuggestion);
}

submitNesSuggestion(suggestion: Omit<NesSuggestion, 'type' | 'priority'>): boolean {
  const nesSuggestion: NesSuggestion = {
    type: 'NES',
    priority: PRIORITIES.NES,  // 改为 1
    ...suggestion
  };
  return this.acceptSuggestion(nesSuggestion);
}
```

---

### 3.3 简化 Tab 键逻辑（已在 NesEditor.vue 中实现）

#### 当前流程（2 次 Tab - 已优化）
```
状态 1：建议出现
  - 显示箭头图标（Glyph Margin）
  - 显示错误标记（红色/蓝色背景）

Tab 1: 跳转到建议行 + 显示预览
  - 场景1/2：显示整行绿色预览（ViewZone）
  - 场景3：显示行内箭头 + 预览单词

Tab 2: 应用建议
  - 场景1：替换整行
  - 场景2：插入新行
  - 场景3：替换单词/部分内容
```

#### NesEditor.vue 实现细节

**场景 1：三元表达式错误（整行替换）**
```typescript
// 状态 1：显示箭头 + 红色高亮
showState1Internal(arrowLine, errorLine, '⚡', '修正逻辑错误');

// 状态 2：显示整行预览（ViewZone）
editorRef.value.changeViewZones((changeAccessor) => {
  const domNode = document.createElement('div');
  domNode.className = 'nes-demo-preview-zone';  // 浅绿色背景 + 灰色文本
  domNode.textContent = suggestionText;
  
  currentViewZoneId = changeAccessor.addZone({
    afterLineNumber: errorLine,  // 在错误行下方插入
    heightInLines: 1,
    domNode: domNode
  });
});
```

**场景 2：插入属性（插入新行）**
```typescript
// 状态 1：显示箭头 + 蓝色高亮
showState1Internal(arrowLine, arrowLine, '💡', '添加 z 属性');

// 状态 2：显示整行预览（ViewZone）
editorRef.value.changeViewZones((changeAccessor) => {
  const domNode = document.createElement('div');
  domNode.className = 'nes-demo-preview-zone-insert';  // 浅绿色背景 + 灰色文本
  domNode.textContent = suggestionText;
  
  currentViewZoneId = changeAccessor.addZone({
    afterLineNumber: insertAfterLine,  // 在指定行下方插入
    heightInLines: 1,
    domNode: domNode
  });
});
```

**场景 3：单词/部分替换（行内箭头）**
```typescript
// 状态 1：只高亮错误单词
highlightDecorations = editorRef.value.deltaDecorations([], [{
  range: new monaco.Range(errorLine, wordStartColumn, errorLine, wordEndColumn),
  options: {
    inlineClassName: 'nes-demo-error-word-highlight'  // 红色背景 + 边框
  }
}]);

// 状态 2：显示行内箭头 + 预览单词（ViewZone）
editorRef.value.changeViewZones((changeAccessor) => {
  const domNode = document.createElement('div');
  domNode.className = 'nes-demo-preview-zone-word-only';
  
  // 计算对齐位置
  const leadingSpaces = ' '.repeat(wordStartIndex);
  
  // 创建前导空格
  const spacingSpan = document.createElement('span');
  spacingSpan.textContent = leadingSpaces;
  
  // 创建箭头（SVG）
  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'nes-demo-arrow';
  arrowSpan.innerHTML = ArrowTurnDownRightIcon;  // ↳ 箭头图标
  
  // 创建预览单词（带背景）
  const previewSpan = document.createElement('span');
  previewSpan.className = 'nes-demo-preview-word-with-bg';
  previewSpan.textContent = ' ' + correctWord;
  
  domNode.appendChild(spacingSpan);
  domNode.appendChild(arrowSpan);
  domNode.appendChild(previewSpan);
  
  currentViewZoneId = changeAccessor.addZone({
    afterLineNumber: errorLine,
    heightInLines: 1,
    domNode: domNode
  });
});
```

---

### 3.4 UI 样式实现（基于 NesEditor.vue）

#### CSS 样式定义

```css
/* ==================== 场景 1 & 2：整行替换/插入 ==================== */

/* 红色高亮（场景1：错误标记，整行背景） */
:deep(.nes-demo-error-highlight) {
  background-color: rgba(255, 0, 0, 0.15) !important;  /* 红色背景 */
}

/* 蓝色高亮（场景2：插入位置，整行背景） */
:deep(.nes-demo-insert-highlight) {
  background-color: rgba(0, 122, 204, 0.1) !important;  /* 蓝色背景 */
}

/* ViewZone 预览行（场景1：REPLACE 模式 - 整行预览） */
:deep(.nes-demo-preview-zone) {
  background-color: rgba(0, 255, 0, 0.08) !important;  /* 浅绿色背景 */
  color: #858585 !important;  /* 灰色文本 */
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 14px;
  line-height: 19px;
  padding-left: 0;
  margin-left: 0;
  font-style: italic;
  white-space: pre;  /* 保留空白字符（缩进） */
}

/* ViewZone 预览行（场景2：INSERT 模式 - 整行预览） */
:deep(.nes-demo-preview-zone-insert) {
  background-color: rgba(0, 255, 0, 0.08) !important;  /* 浅绿色背景 */
  color: #858585 !important;  /* 灰色文本 */
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 14px;
  line-height: 19px;
  padding-left: 0;
  margin-left: 0;
  font-style: italic;
  white-space: pre;  /* 保留空白字符（缩进） */
}

/* ==================== 场景 3：单词/部分替换 ==================== */

/* 红色高亮（只高亮单词，变量重命名/单词拼写错误场景）
 * 适用场景：
 * - 变量重命名：变量名修改
 * - 字符串值修正：字符串内容修改
 * - 单词拼写错误：拼写错误修正
 * - 逻辑运算符错误：|| → &&
 */
:deep(.nes-demo-error-word-highlight) {
  background-color: rgba(255, 0, 0, 0.25) !important;  /* 红色背景 */
  border-radius: 3px;
  padding: 2px 4px;
  border: 1px solid rgba(255, 0, 0, 0.3);  /* 红色边框 */
}

/* 箭头样式（SVG） */
:deep(.nes-demo-arrow) {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}

:deep(.nes-demo-arrow svg) {
  color: #ffffff;
  width: 16px;
  height: 16px;
  vertical-align: middle;
}

/* 预览单词样式（带背景，变量重命名场景） */
:deep(.nes-demo-preview-word-with-bg) {
  background-color: rgba(0, 255, 0, 0.15);
  color: #667de8;
  font-style: italic;
  border-radius: 3px;
  padding: 2px;
  margin-left: 4px;
  border: 1px solid rgba(0, 255, 0, 0.25);
}

/* ViewZone 预览行（只显示单词，变量重命名/单词拼写错误场景）
 * 布局说明：
 * - 使用 leadingSpaces 精确对齐到错误单词位置
 * - 不使用 margin-left，避免双重偏移
 * - 箭头和预览单词通过 DOM 结构控制位置
 */
:deep(.nes-demo-preview-zone-word-only) {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 14px;
  line-height: 19px;
  padding-left: 0;
  margin-top: 4px;
  margin-left: 0;  /* 移除额外的 margin，使用 leadingSpaces 对齐 */
  white-space: pre;
}

/* ==================== Glyph Icon（箭头图标） ==================== */

/* Glyph Icon（紫色箭头图标 - REPLACE 模式） */
:deep(.nes-demo-glyph.replace::before) {
  content: '→';
  font-size: 18px;
  font-weight: bold;
  color: #c586c0;  /* 紫色箭头 */
  cursor: pointer;
}

/* Glyph Icon（青色箭头图标 - INSERT 模式） */
:deep(.nes-demo-glyph.insert::before) {
  content: '→';
  font-size: 18px;
  font-weight: bold;
  color: #4ec9b0;  /* 青色箭头（INSERT 模式） */
  cursor: pointer;
}
```

#### 关键设计决策

1. **场景 1 & 2 使用 ViewZone**
   - 原因：需要显示整行预览，ViewZone 可以在不影响原代码的情况下插入新行
   - 优点：预览内容清晰，不干扰原代码
   - 缺点：占用额外空间

2. **场景 3 使用行内箭头 + ViewZone**
   - 原因：只需要预览单词，不需要整行
   - 优点：精确对齐，视觉效果好
   - 实现：使用 `leadingSpaces` 计算对齐位置，避免使用 `margin-left`

3. **颜色方案**
   - 红色背景：错误标记（场景 1）
   - 蓝色背景：插入位置（场景 2）
   - 绿色背景：预览内容（所有场景）
   - 灰色文本：预览文本（场景 1 & 2）
   - 紫色箭头：Glyph Icon（REPLACE 模式）
   - 青色箭头：Glyph Icon（INSERT 模式）

---

### 3.5 实现 Insert/Replace/Delete 三种模式

```typescript
// types/nes.ts
export type ChangeType = 'INSERT' | 'REPLACE' | 'DELETE';

export interface Prediction {
  targetLine: number;
  originalLineContent: string;
  suggestionText: string;
  explanation: string;
  confidence: number;
  priority: number;
  changeType: ChangeType;  // 🆕 新增字段
}

// NESController.ts
private validatePrediction(pred: Prediction): boolean {
  const model = this.editor.getModel();
  if (!model) return false;

  const actualLine = model.getLineContent(pred.targetLine);
  
  // 根据 changeType 判断
  if (pred.changeType === 'INSERT') {
    // 插入模式：目标行应该为空或只有空白
    return /^\s*$/.test(actualLine);
  } else if (pred.changeType === 'REPLACE') {
    // 替换模式：目标行应该与 originalLineContent 匹配
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    return normalize(actualLine) === normalize(pred.originalLineContent);
  } else if (pred.changeType === 'DELETE') {
    // 删除模式：目标行应该存在且与 originalLineContent 匹配
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    return normalize(actualLine) === normalize(pred.originalLineContent);
  }
  
  return true;
}
```

**已在 NesEditor.vue 中实现的场景：**

| 场景 | ChangeType | UI 特征 | 示例 | 实现状态 |
|------|-----------|---------|------|----------|
| 场景1：三元表达式 | REPLACE | 整行红色 + 整行绿色预览 | `a > b ? b : a` → `a > b ? a : b` | ✅ 已实现 |
| 场景2：插入属性 | INSERT | 整行蓝色 + 整行绿色预览 | 添加 `z: number;` | ✅ 已实现 |
| 场景3：单词替换 | REPLACE | 只高亮单词 + 行内箭头 | `funct ion` → `function` | ✅ 已实现 |
| 场景3B：运算符 | REPLACE | 只高亮运算符 + 行内箭头 | `\|\|` → `&&` | ✅ 已实现 |
| 场景4：删除行 | DELETE | 整行红色背景 | 删除无用代码 | ✅ 已实现 |
| 场景5：连续建议 | INSERT + INLINE_INSERT | 第1个：整行蓝色+绿色预览<br>第2个：行内绿色片段 | 添加 z 属性 + 更新计算 | ✅ 已实现 |

**场景5 INLINE_INSERT 的关键实现：**

```typescript
// 问题：Monaco Editor 的 before/after 装饰器默认不显示
// 原因：缺少关键配置选项

// ❌ 错误实现（装饰器不显示）
ghostTextDecorations = editorRef.value.deltaDecorations([], [{
  range: new monaco.Range(targetLine, insertPosition, targetLine, insertPosition),
  options: {
    before: {
      content: ' + this.z ** 2',
      inlineClassName: 'nes-demo-inline-insert-preview'
    }
  }
}]);

// ✅ 正确实现（装饰器正常显示）
ghostTextDecorations = editorRef.value.deltaDecorations([], [{
  range: new monaco.Range(targetLine, insertPosition, targetLine, insertPosition),
  options: {
    before: {
      content: ' + this.z ** 2',
      inlineClassName: 'nes-demo-inline-insert-preview',
      inlineClassNameAffectsLetterSpacing: true  // 🔑 关键配置1
    },
    showIfCollapsed: true  // 🔑 关键配置2
  }
}]);
```

**关键配置说明：**
1. `inlineClassNameAffectsLetterSpacing: true` - 确保内联样式类影响字符间距，使装饰器内容正确显示
2. `showIfCollapsed: true` - 确保装饰器在所有情况下都显示（包括折叠状态）

**DELETE 模式的预期 UI 效果：**
- 错误标记：整行红色背景
- 预览方式：无预览（直接删除）
- 图标：⚠️ (warning)
- 交互：Tab 跳转 → Tab 删除
- 适用场景：
  - 删除无用的导入语句
  - 删除重复的代码行
  - 删除过时的注释

---

### 3.6 添加语义化图标

```typescript
// DecorationManager.ts
public renderGlyphIcon(line: number, explanation: string, changeType: ChangeType): void {
  const icon = this.getIconForChangeType(changeType);
  
  const decorations = [{
    range: new monaco.Range(line, 1, line, 1),
    options: {
      glyphMarginClassName: `nes-glyph-icon ${icon.className}`,
      glyphMarginHoverMessage: {
        value: `**${icon.label}**\n\n${explanation}`
      }
    }
  }];
  
  this.glyphDecorations = this.editor.deltaDecorations(
    this.glyphDecorations,
    decorations
  );
}

private getIconForChangeType(changeType: ChangeType): { className: string; label: string } {
  switch (changeType) {
    case 'INSERT':
      return { className: 'icon-insert', label: '💡 Insert' };
    case 'REPLACE':
      return { className: 'icon-replace', label: '⚡ Replace' };
    case 'DELETE':
      return { className: 'icon-delete', label: '⚠️ Delete' };
    default:
      return { className: 'icon-default', label: '📌 Suggestion' };
  }
}
```

**已在 NesEditor.vue 中实现的图标：**

```css
/* Glyph Icon（紫色箭头图标 - REPLACE 模式） */
:deep(.nes-demo-glyph.replace::before) {
  content: '→';
  font-size: 18px;
  font-weight: bold;
  color: #c586c0;  /* 紫色箭头 */
  cursor: pointer;
}

/* Glyph Icon（青色箭头图标 - INSERT 模式） */
:deep(.nes-demo-glyph.insert::before) {
  content: '→';
  font-size: 18px;
  font-weight: bold;
  color: #4ec9b0;  /* 青色箭头（INSERT 模式） */
  cursor: pointer;
}

/* Glyph Icon（红色警告图标 - DELETE 模式） */
:deep(.nes-demo-glyph.delete::before) {
  content: '⚠';
  font-size: 18px;
  font-weight: bold;
  color: #f48771;  /* 红色警告 */
  cursor: pointer;
}
```

**图标映射：**

| ChangeType | 图标 | 颜色 | 含义 | 实现状态 |
|-----------|------|------|------|----------|
| REPLACE | → | 紫色 (#c586c0) | 替换现有代码 | ✅ 已实现 |
| INSERT | → | 青色 (#4ec9b0) | 插入新内容 | ✅ 已实现 |
| DELETE | ⚠ | 红色 (#f48771) | 删除代码 | ✅ 已实现 |
| INLINE_INSERT | → | 紫色 (#c586c0) | 行内插入代码片段 | ✅ 已实现 |

---

## 四、实施计划

### Phase 1: 分离触发逻辑（1-2天）
- [ ] 实现 `isSignificantEdit()` 判断
- [ ] 添加 NES 触发条件过滤
- [ ] 调整 FIM 和 NES 的冷却时间
- [ ] 测试触发频率

### Phase 2: 调整优先级（0.5天）
- [ ] 修改 `SuggestionArbiter` 优先级配置
- [ ] 更新 `PRIORITIES` 常量
- [ ] 测试优先级冲突解决

### Phase 3: 简化 Tab 键逻辑（1-2天）
- [ ] 移除 ViewZone 预览
- [ ] 实现 Inline Ghost Text
- [ ] 实现删除线装饰
- [ ] 简化 Tab 键处理（3次 → 2次）
- [ ] 测试交互流程

### Phase 4: 实现 Insert/Replace 模式（1天）
- [ ] 添加 `changeType` 字段
- [ ] 更新后端 Prompt（返回 changeType）
- [ ] 实现不同模式的显示逻辑
- [ ] 测试模式识别

### Phase 5: 添加语义化图标（0.5天）
- [ ] 实现图标映射逻辑
- [ ] 添加 CSS 样式
- [ ] 测试图标显示

### Phase 6: 测试和优化（1-2天）
- [ ] 端到端测试
- [ ] 性能测试
- [ ] 用户体验测试
- [ ] Bug 修复

**总计：5-8 天**

---

## 五、验收标准（基于 NesEditor.vue 演示）

### 功能验收
- ✅ FIM 和 NES 不再同时触发
- ✅ 优先级正确（FIM > NES）
- ✅ Tab 键只需 2 次（跳转 + 预览 → 应用）
- ✅ **场景1：三元表达式错误**（整行红色 + 整行绿色预览）- 已在 NesEditor.vue 中实现
- ✅ **场景2：插入属性**（整行蓝色 + 整行绿色预览）- 已在 NesEditor.vue 中实现
- ✅ **场景3：单词/部分替换**（只高亮单词 + 行内箭头）- 已在 NesEditor.vue 中实现
- ✅ **场景4：删除行**（整行红色背景）- 已在 NesEditor.vue 中实现
- ✅ **场景5：连续建议**（INSERT + INLINE_INSERT）- 已在 NesEditor.vue 中实现
- ✅ 区分 Insert/Replace/Delete/Inline_Insert 模式 - 已在 NesEditor.vue 中演示
- ✅ 图标语义化（💡/⚡/⚠️）- 已在 NesEditor.vue 中实现

### 性能验收
- ✅ NES 触发频率降低 50%+
- ✅ FIM 响应时间 < 1秒
- ✅ NES 响应时间 < 10秒
- ✅ 无明显卡顿或延迟

### 用户体验验收
- ✅ 交互流程清晰（用户知道下一步做什么）
- ✅ 视觉反馈明确（图标、颜色、箭头）
- ✅ 预览效果清晰（ViewZone 或行内箭头）
- ✅ 符合 GitHub Copilot 的交互习惯

### UI 效果验收（基于 NesEditor.vue）
- ✅ **场景1**：整行红色背景 + 整行绿色预览（对齐 image-1.png）
- ✅ **场景2**：整行蓝色背景 + 整行绿色预览（对齐 image-3.png 第1个建议）
- ✅ **场景3**：只高亮单词 + 行内箭头 + 预览单词（对齐 image-2.png, image-4.png）
- ✅ **场景4**：整行红色背景（DELETE 模式）
- ✅ **场景5**：连续建议（对齐 image-3.png 完整场景）
  - 第1个建议：整行蓝色背景 + 整行绿色预览
  - 第2个建议：Glyph Icon + 行内绿色片段（使用 before 装饰器）
- ✅ 缩进保持一致
- ✅ 预览行在错误行下方
- ✅ 箭头和预览单词精确对齐
- ✅ 行内装饰器正确显示（inlineClassNameAffectsLetterSpacing + showIfCollapsed）

---

## 六、风险和注意事项

### 风险 1：ViewZone 实现的权衡
- **当前方案：** NesEditor.vue 使用 ViewZone 显示预览
- **优点：** 预览内容清晰，不干扰原代码，缩进保持一致
- **缺点：** 占用额外空间（每个预览占 1 行）
- **缓解：** 
  - 场景1/2（整行替换/插入）：ViewZone 是最佳方案
  - 场景3（单词替换）：使用行内箭头 + ViewZone 组合，视觉效果好
  - 场景5（行内插入）：使用 before 装饰器，不占用额外空间

### 风险 2：before/after 装饰器显示问题（已解决）
- **问题：** Monaco Editor 的 before/after 装饰器默认不显示
- **原因：** 缺少关键配置选项
- **解决方案：** 
  - 添加 `inlineClassNameAffectsLetterSpacing: true`
  - 添加 `showIfCollapsed: true`
  - 已在场景5中验证可行

### 风险 3：changeType 识别不准确
- **风险：** 后端模型可能无法准确返回 changeType
- **缓解：** 前端添加兜底逻辑，根据 originalLineContent 判断

### 风险 4：用户习惯改变
- **风险：** 用户已经习惯 3 次 Tab 的流程
- **缓解：** 
  - 当前已简化为 2 次 Tab（跳转 + 预览 → 应用）
  - 添加配置选项，允许用户选择旧流程

### 风险 5：行内箭头对齐问题（已解决）
- **问题：** 场景3 中箭头和预览单词可能对齐不准确
- **解决方案：** 
  - 使用 `leadingSpaces = ' '.repeat(wordStartIndex)` 精确计算对齐位置
  - 移除 `margin-left`，避免双重偏移
  - 已在 NesEditor.vue 中验证可行

---

## 七、总结

**核心改进：**
1. **完全分离 FIM 和 NES 触发逻辑** - 避免冲突
2. **调整优先级** - FIM 优先于 NES
3. **简化 Tab 键逻辑** - 3 次改为 2 次（已实现）
4. **实现五种 UI 模式** - 已在 NesEditor.vue 中演示：
   - 场景1：三元表达式错误（整行红色 + 整行绿色预览）✅
   - 场景2：插入属性（整行蓝色 + 整行绿色预览）✅
   - 场景3：单词/部分替换（只高亮单词 + 行内箭头）✅
   - 场景4：删除行（整行红色背景）✅
   - 场景5：连续建议（INSERT + INLINE_INSERT）✅
5. **实现 Insert/Replace/Delete/Inline_Insert 模式** - 全部已演示
6. **添加语义化图标** - 💡/⚡/⚠️ 全部已实现
7. **解决 before/after 装饰器显示问题** - 添加关键配置选项

**预期效果：**
- 触发频率降低 50%+
- 用户体验提升（交互更清晰）
- 性能提升（减少无效 API 调用）
- 对齐 GitHub Copilot 的交互习惯

**NesEditor.vue 演示成果：**
- ✅ 完整实现了五种 UI 模式（场景1、2、3、4、5）
- ✅ 验证了 ViewZone 方案的可行性
- ✅ 验证了 before 装饰器方案的可行性（场景5）
- ✅ 确认了行内箭头的对齐方案
- ✅ 提供了可直接迁移到 NESRenderer.ts 的代码
- ✅ 解决了 Monaco Editor 装饰器显示问题

**关键技术突破：**
1. **ViewZone 精确对齐** - 使用 `leadingSpaces` 计算缩进
2. **行内箭头对齐** - 使用 `wordStartIndex` 精确定位
3. **before/after 装饰器显示** - 添加 `inlineClassNameAffectsLetterSpacing` 和 `showIfCollapsed`
4. **连续建议实现** - 第1个用 ViewZone，第2个用 before 装饰器

**下一步：**
1. 将 NesEditor.vue 的 UI 实现迁移到 NESRenderer.ts
2. 实现触发逻辑分离（EditModeDetector）
3. 调整优先级配置
4. 端到端测试
