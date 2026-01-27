# 测试指南 - 当前可测试功能

## 📊 开发进度总结

**完成阶段**: 0-2（共 9 个阶段）  
**代码行数**: ~875 行（目标 ≤ 2000 行）  
**进度**: 44% ✅

### 已完成功能

| 功能 | 状态 | 测试页面 |
|------|------|---------|
| FIM 引擎 | ✅ 完成 | `fim-test.html` |
| 症状检测 | ✅ 完成 | `symptom-test.html` |
| 编辑历史 | ✅ 完成 | `integration-test.html` |
| 协调机制 | ✅ 完成 | `integration-test.html` |
| 基础初始化 | ✅ 完成 | `basic-test.html` |

### 待实现功能

| 功能 | 状态 | 预计时间 |
|------|------|---------|
| NES 引擎核心 | ⏳ 待开始 | 2h |
| NES 渲染层 | ⏳ 待开始 | 2h |
| 代码优化 | ⏳ 待开始 | 2h |
| 迁移验证 | ⏳ 待开始 | 1h |
| 文档交付 | ⏳ 待开始 | 0.5h |

---

## 🧪 可测试的功能详解

### 1. FIM 引擎（实时代码补全）

**功能描述**：
- 实时显示 Ghost Text（灰色补全提示）
- 支持 Tab 键接受补全
- 支持 Esc 键关闭补全
- 后缀去重（避免重复补全）

**测试页面**: `http://localhost:5174/examples/fim-test.html`

**测试步骤**:
1. 启动后端：`node server.mjs`
2. 启动前端：`npm run dev:new`
3. 打开 FIM 测试页面
4. 在编辑器中输入代码片段：
   ```typescript
   function add(a, b) {
     return 
   ```
5. 观察是否出现灰色的 Ghost Text 补全
6. 按 Tab 接受补全
7. 按 Esc 关闭补全

**预期结果**:
- ✅ Ghost Text 显示正确的补全
- ✅ Tab 键可以接受补全
- ✅ Esc 键可以关闭补全
- ✅ 控制台显示 API 调用日志

**可能的问题**:
- ❌ 404 错误 → 检查后端 `/api/completion` 端点
- ❌ Ghost Text 不显示 → 检查 API 响应格式
- ❌ 控制台错误 → 查看详细错误信息

---

### 2. 症状检测系统

**功能描述**：
- 检测 5 种症状类型：
  - `WORD_FIX` - 拼写错误
  - `RENAME_FUNCTION` - 函数重命名
  - `RENAME_VARIABLE` - 变量重命名
  - `ADD_PARAMETER` - 添加参数
  - `REMOVE_PARAMETER` - 删除参数
  - `CHANGE_TYPE` - 类型改变
  - `LOGIC_ERROR` - 逻辑错误

**测试页面**: `http://localhost:5174/examples/symptom-test.html`

**测试步骤**:

#### 测试 1: 拼写错误检测
1. 打开症状检测测试页面
2. 在编辑器中输入：`functoin hello() {}`
3. 等待 500ms（防抖延迟）
4. 观察是否检测到 `WORD_FIX` 症状

**预期结果**:
```
🩺 Symptom detected: WORD_FIX
Typo detected: "functoin" should be "function"
Confidence: 95%
```

#### 测试 2: 函数重命名检测
1. 修改代码：`function hello() {}` → `function greet() {}`
2. 等待 500ms
3. 观察是否检测到 `RENAME_FUNCTION` 症状

**预期结果**:
```
🩺 Symptom detected: RENAME_FUNCTION
Function 'hello' renamed to 'greet'
Confidence: 90%
```

#### 测试 3: 添加参数检测
1. 修改代码：`function add()` → `function add(a, b)`
2. 等待 500ms
3. 观察是否检测到 `ADD_PARAMETER` 症状

**预期结果**:
```
🩺 Symptom detected: ADD_PARAMETER
Function 'add' parameter added
Confidence: 85%
```

#### 测试 4: 变量重命名检测
1. 修改代码：`const name = "John"` → `const fullName = "John"`
2. 等待 500ms
3. 观察是否检测到 `RENAME_VARIABLE` 症状

**预期结果**:
```
🩺 Symptom detected: RENAME_VARIABLE
Variable 'name' renamed to 'fullName'
Confidence: 90%
```

---

### 3. 编辑历史管理

**功能描述**：
- 记录用户的编辑操作
- 支持编辑类型检测（insert、delete、replace）
- 保留最近 10 条编辑记录
- 提供编辑上下文信息

**测试页面**: `http://localhost:5174/examples/integration-test.html`

**测试步骤**:
1. 打开集成测试页面
2. 在编辑器中进行多次编辑
3. 观察控制台中的编辑历史日志
4. 检查 "Edit Count" 状态是否正确更新

**预期结果**:
```
[EditHistoryManager] Recorded edit: {
  timestamp: 1234567890,
  lineNumber: 1,
  column: 15,
  type: "insert",
  oldText: "",
  newText: "a, b",
  rangeLength: 0,
  context: { lineContent: "function add(a, b) {" }
}
```

---

### 4. 协调机制（FIM + Dispatcher）

**功能描述**：
- FIM 和 NES 的优先级管理
- 症状检测时锁定 FIM
- 症状消失时解锁 FIM
- 防抖处理

**测试页面**: `http://localhost:5174/examples/integration-test.html`

**测试步骤**:
1. 打开集成测试页面
2. 输入代码，观察 FIM 状态
3. 修改函数名，触发症状检测
4. 观察 FIM 是否被锁定
5. 等待症状消失，观察 FIM 是否被解锁

**预期结果**:
```
[AICodeAssistant] NES activated, FIM locked
[FIMEngine] Locked
[EditDispatcher] Dispatching to NES: RENAME_FUNCTION
[FIMEngine] Unlocked
```

**状态变化**:
- 正常输入 → FIM Status: Ready
- 检测到症状 → FIM Status: Locked, NES Status: Active
- 症状消失 → FIM Status: Ready, NES Status: Sleeping

---

### 5. 基础初始化

**功能描述**：
- 验证 AI Code Assistant 可以正确初始化
- 验证所有组件都已加载
- 验证配置合并逻辑

**测试页面**: `http://localhost:5174/examples/basic-test.html`

**测试步骤**:
1. 打开基础测试页面
2. 查看控制台输出
3. 验证以下日志出现：
   - `✅ Monaco Editor loaded`
   - `✅ Editor created`
   - `✅ AI Code Assistant initialized`

**预期结果**:
```
✅ Monaco Editor loaded
✅ Editor created
✅ AI Code Assistant initialized
Assistant instance: { dispose: [Function] }
```

---

## 🔍 调试技巧

### 1. 查看控制台日志

打开浏览器开发者工具（F12），查看 Console 标签：

```javascript
// 查看所有日志
console.log('message')

// 查看错误
console.error('error message')

// 查看警告
console.warn('warning message')
```

### 2. 查看网络请求

打开 Network 标签，查看 API 请求：

- **FIM 请求**: `POST /api/completion`
  - 请求体：`{ prefix, suffix, max_tokens, temperature }`
  - 响应体：`{ completion }`

- **NES 请求**: `POST /api/next-edit-prediction`
  - 请求体：`{ codeWindow, windowInfo, diffSummary, editHistory, requestId }`
  - 响应体：`{ predictions }`

### 3. 检查编辑器状态

在控制台中执行：

```javascript
// 获取编辑器内容
editor.getValue()

// 获取光标位置
editor.getPosition()

// 获取选中文本
editor.getModel().getValueInRange(editor.getSelection())
```

### 4. 启用调试模式

设置环境变量启用详细日志：

```bash
DEBUG_PROMPT=true node server.mjs
```

---

## 📋 测试清单

### FIM 功能测试
- [ ] Ghost Text 显示正确
- [ ] Tab 键接受补全
- [ ] Esc 键关闭补全
- [ ] 后缀去重工作正常
- [ ] API 调用成功

### 症状检测测试
- [ ] 拼写错误检测
- [ ] 函数重命名检测
- [ ] 变量重命名检测
- [ ] 参数添加检测
- [ ] 参数删除检测
- [ ] 类型改变检测
- [ ] 逻辑错误检测

### 编辑历史测试
- [ ] 编辑记录正确
- [ ] 编辑类型检测正确
- [ ] 历史大小限制工作
- [ ] 上下文信息完整

### 协调机制测试
- [ ] FIM 锁定/解锁工作
- [ ] 防抖延迟正确
- [ ] 状态转换正确
- [ ] 日志输出完整

### 集成测试
- [ ] 所有组件协调工作
- [ ] 无 TypeScript 错误
- [ ] 无运行时错误
- [ ] 性能可接受

---

## 🚀 快速测试命令

```bash
# 1. 启动后端
node server.mjs

# 2. 启动前端（新终端）
npm run dev:new

# 3. 打开测试页面
# 基础测试
http://localhost:5174/examples/basic-test.html

# FIM 测试
http://localhost:5174/examples/fim-test.html

# 症状检测测试
http://localhost:5174/examples/symptom-test.html

# 集成测试
http://localhost:5174/examples/integration-test.html
```

---

## 📊 测试覆盖率

| 模块 | 测试覆盖 | 状态 |
|------|---------|------|
| FIMEngine | ✅ 完整 | 可测试 |
| SymptomDetector | ✅ 完整 | 可测试 |
| EditHistoryManager | ✅ 完整 | 可测试 |
| EditDispatcher | ✅ 完整 | 可测试 |
| PredictionService | ✅ 完整 | 可测试 |
| NESEngine | ⏳ 部分 | 待实现 |
| NESRenderer | ❌ 无 | 待实现 |

---

## 💡 常见问题

### Q: 为什么 Ghost Text 不显示？

**A**: 检查以下几点：
1. 后端服务是否运行：`node server.mjs`
2. API 端点是否正确：`/api/completion`
3. 网络请求是否成功（Network 标签）
4. API 响应格式是否正确

### Q: 症状检测为什么不工作？

**A**: 检查以下几点：
1. 等待 500ms 防抖延迟
2. 编辑是否是有效的症状（如修改函数名）
3. 控制台是否有错误日志
4. 编辑历史是否正确记录

### Q: 如何查看详细的日志？

**A**: 
1. 打开浏览器开发者工具（F12）
2. 查看 Console 标签
3. 查看 Network 标签查看 API 请求
4. 启用调试模式：`DEBUG_PROMPT=true node server.mjs`

---

## 📝 下一步计划

### 阶段 3-5: NES 引擎实现（预计 6 小时）
- 完整的 NES 预测逻辑
- 建议队列管理
- Diff 预览渲染
- Glyph 箭头显示

### 阶段 6-9: 优化和交付（预计 5.5 小时）
- 代码优化和压缩
- 迁移验证
- 文档完善

---

**最后更新**: 2026-01-27  
**总耗时**: ~3 小时  
**下一个里程碑**: 完成 NES 引擎核心实现
