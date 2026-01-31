# 🚀 快速验证指南

## 目标
验证光标位置精确定位方案（方案 A）是否正常工作

---

## 步骤 1: 运行单元测试 ✅

```bash
npx vitest run ai-code-assistant/test/CoordinateFixer.test.ts
```

**预期结果**: 10/10 测试通过

**如果失败**: 检查 `PositionFinder.ts` 和 `CoordinateFixer.ts` 实现

---

## 步骤 2: 测试前端集成 🌐

1. **启动开发服务器**:
   ```bash
   npm run dev
   ```

2. **打开测试页面**:
   ```
   http://localhost:5173/examples/context-position-test.html
   ```

3. **点击 "Run All Tests" 按钮**

4. **检查结果**:
   - ✅ 准确率应该 > 90%
   - ✅ 大部分测试应该使用 Layer 1 (Context-based)
   - ⚠️ 少数测试可能降级到 Layer 3 (fast-diff)

**如果准确率 < 90%**: 检查浏览器控制台日志，查看失败原因

---

## 步骤 3: 验证 AI 响应 🤖

### 3.1 生成测试提示词

```bash
node test-ai-context.mjs
```

这会输出：
- System Prompt（系统提示词）
- User Prompt（用户提示词）
- Expected Context（期望的上下文）

### 3.2 手动测试 AI

1. **复制 System Prompt**（从输出中）

2. **复制 User Prompt**（从输出中）

3. **发送到你的 AI 模型**:
   - DeepSeek API
   - Qwen API
   - 或其他兼容的模型

4. **检查 AI 响应**:

**✅ 正确的响应示例**:
```json
{
  "analysis": {
    "change_type": "renameFunction",
    "summary": "...",
    "impact": "...",
    "pattern": "..."
  },
  "predictions": [
    {
      "targetLine": 5,
      "originalLineContent": "const user1 = createUser(\"Alice\", 30);",
      "suggestionText": "const user1 = createUserInfo(\"Alice\", 30);",
      "explanation": "Rename function to match new name",
      "confidence": 0.95,
      "priority": 1,
      "changeType": "REPLACE_WORD",
      "context": {
        "before": "user1 = ",
        "target": "createUser",
        "after": "(\"Alice\""
      }
    }
  ]
}
```

**❌ 错误的响应（缺少 context）**:
```json
{
  "predictions": [
    {
      "targetLine": 5,
      "suggestionText": "const user1 = createUserInfo(\"Alice\", 30);",
      "changeType": "REPLACE_WORD"
      // ❌ 缺少 context 字段
    }
  ]
}
```

### 3.3 如果 AI 不返回 context

**可能原因**:
1. AI 模型没有理解提示词
2. 提示词需要更强调
3. AI 模型版本太旧

**解决方案**:
1. 在 `server/prompts/nes/systemPrompt.mjs` 中增强提示:
   ```javascript
   // 在 CRITICAL RULES 部分添加
   6. **MANDATORY: ALWAYS include "context" field for REPLACE_WORD and INLINE_INSERT**
   ```

2. 添加更多示例

3. 使用更新的 AI 模型

---

## 步骤 4: 端到端测试 🔄

### 4.1 启动完整系统

1. **启动 NES 服务器**:
   ```bash
   node server.mjs
   ```

2. **启动前端**:
   ```bash
   npm run dev
   ```

3. **打开主应用**:
   ```
   http://localhost:5173
   ```

### 4.2 测试真实场景

1. **输入测试代码**:
   ```javascript
   function createUser(name, age) {
     return { name, age };
   }
   
   const user1 = createUser("Alice", 30);
   const user2 = createUser("Bob", 25);
   ```

2. **修改第 1 行**: 将 `createUser` 改为 `createUserInfo`

3. **等待 NES 建议出现**

4. **检查建议位置**:
   - ✅ 应该高亮第 4 行和第 5 行的 `createUser`
   - ✅ 位置应该精确（不是整行高亮）
   - ✅ 按 Tab 应该正确替换

5. **查看浏览器控制台**:
   ```
   [CoordinateFixer] ✅ Layer 1: Context-based matching succeeded
   [PositionFinder] ✅ Found by context { startColumn: 15, endColumn: 25, ... }
   ```

### 4.3 测试复杂场景

**场景 1: 多处相同文本**
```javascript
const name = "name";
```
修改第一个 `name` → 应该只高亮变量名，不是字符串

**场景 2: 嵌套相同文本**
```javascript
function test(name, age) { return name; }
```
修改 return 中的 `name` → 应该精确定位第二个 name

**场景 3: 添加参数**
```javascript
createUser("Bob")
```
添加 `, 30` → 应该在 "Bob" 后面插入

---

## 步骤 5: 性能验证 ⚡

### 5.1 检查响应时间

打开浏览器开发者工具 → Performance 标签

**预期**:
- PositionFinder.findByContext: < 1ms
- CoordinateFixer.fix: < 5ms
- 总体响应: < 10ms

### 5.2 检查内存使用

**预期**:
- 无内存泄漏
- 内存增长 < 10MB（长时间使用）

---

## 步骤 6: 日志分析 📊

### 6.1 成功案例日志

```
[PositionFinder] Searching with context {
  pattern: 'user1 = createUser("Alice"',
  lineLength: 58,
  context: { before: 'user1 = ', target: 'createUser', after: '("Alice"' }
}
[PositionFinder] ✅ Found by context {
  startColumn: 15,
  endColumn: 25,
  target: 'createUser',
  extracted: 'createUser'
}
[CoordinateFixer] ✅ Layer 1: Context-based matching succeeded
```

### 6.2 降级案例日志

```
[PositionFinder] Pattern not found, trying target only {
  pattern: 'WRONG_CONTEXTcreateUserWRONG_CONTEXT',
  line: 'const user = createUser("Alice");'
}
[PositionFinder] ⚠️ Found by target only (may be inaccurate) {
  startColumn: 14,
  endColumn: 24,
  target: 'createUser'
}
[CoordinateFixer] ⚠️ Layer 3: fast-diff fallback succeeded
```

### 6.3 失败案例日志

```
[PositionFinder] ❌ Target not found in line {
  target: 'createUser',
  line: 'const user = getUser("Alice");'
}
[CoordinateFixer] ❌ All layers failed for REPLACE_WORD
```

---

## 验证清单 ✅

### 基础功能
- [ ] 单元测试全部通过（10/10）
- [ ] 前端测试页面准确率 > 90%
- [ ] AI 正确返回 context 字段
- [ ] context 值符合预期格式

### 核心场景
- [ ] 简单替换工作正常
- [ ] 多处相同文本能精确定位
- [ ] 嵌套相同文本能区分
- [ ] INLINE_INSERT 正确插入
- [ ] REPLACE_LINE 不受影响

### 性能指标
- [ ] 响应时间 < 10ms
- [ ] 无内存泄漏
- [ ] 降级率 < 10%
- [ ] 失败率 < 5%

### 日志和监控
- [ ] 成功案例有清晰日志
- [ ] 降级案例有警告日志
- [ ] 失败案例有错误日志
- [ ] 可以追踪使用了哪一层

---

## 常见问题 ❓

### Q1: 测试页面显示 "Module not found"

**A**: 确保使用开发服务器（`npm run dev`），不要直接打开 HTML 文件

### Q2: AI 不返回 context 字段

**A**: 
1. 检查 `server/prompts/nes/systemPrompt.mjs` 是否更新
2. 增强提示词强调
3. 尝试不同的 AI 模型

### Q3: 准确率 < 90%

**A**:
1. 检查浏览器控制台，查看失败原因
2. 分析失败案例的 context
3. 调整提示词或算法

### Q4: Layer 1 总是失败，降级到 Layer 3

**A**:
1. 检查 AI 是否返回 context
2. 检查 context 格式是否正确
3. 检查 PositionFinder 实现

### Q5: 性能很慢

**A**:
1. 检查是否有大量日志输出
2. 检查是否有不必要的计算
3. 考虑添加缓存

---

## 下一步 🎯

### 如果验证成功 ✅
1. 部署到生产环境
2. 收集真实用户数据
3. 持续优化

### 如果验证失败 ❌
1. 分析失败原因
2. 调整提示词或算法
3. 重新测试

### 可选优化 🚀
1. 实现 Layer 2 (Tree-sitter)
2. 添加更多测试场景
3. 优化性能

---

## 联系支持 📞

如有问题，请查看：
- 设计文档: `docs/CURSOR_POSITION_ACCURACY_DESIGN.md`
- 实施状态: `docs/IMPLEMENTATION_STATUS.md`
- 测试页面: `examples/context-position-test.html`
