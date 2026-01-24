# NES System V2.0 改造实施方案 (Implementation Plan V2.1)

**Version**: 2.1.0 (基于代码实现分析后的修订版)
**Status**: Ready for Execution
**Last Updated**: 2026-01-24

本文档汇总了 NES 系统 V2.0 的完整重构计划，基于对现有代码 (`NESController.ts`, `NESRenderer.ts`, `builder.mjs`, `systemPrompt.mjs`) 的深度分析后制定。

---

## 1. 总体目标 (Objectives)

1.  **消除视觉冲突**: 确保 FIM (Ghost Text) 与 NES (Gutter Icon) 在时序和空间上严格互斥。
2.  **数据驱动渲染 (MDRP)**: 后端模型直接输出渲染指令 (`changeType`)，前端 Renderer 纯派发执行。
3.  **确定性交互**: 优化现有状态机，明确 Tab 和 Esc 在任何时刻的行为。
4.  **提升连贯性**: 利用现有 `SuggestionQueue`，实现零延迟的连续代码跳转与修改。

---

## 2. 现有代码状态评估 (Code Audit Summary)

在规划改造前，必须了解当前代码的真实状态，避免重复劳动。

### 2.1 已完成模块 ✅

| 模块 | 文件 | 状态 | 说明 |
| :--- | :--- | :--- | :--- |
| **Renderer 派发逻辑** | `NESRenderer.ts` | ✅ 完成 | 已支持 5 种 `changeType` 的渲染派发 |
| **Decoration 渲染** | `DecorationManager.ts` | ✅ 完成 | 已实现 State1/State2 渲染 |
| **ViewZone 渲染** | `ViewZoneManager.ts` | ✅ 完成 | 已实现懒加载 DiffEditor |
| **建议队列** | `SuggestionQueue.ts` | ✅ 完成 | 已实现 `add()`, `next()`, `current()` |
| **System Prompt** | `systemPrompt.mjs` | ✅ 完成 | `NES_SYSTEM_PROMPT` 已定义 `changeType` |
| **Few-Shot Examples** | `examples.mjs` | ✅ 完成 | 已包含 6 种 `changeType` 示例 |

### 2.2 待改造模块 ⚠️

| 模块 | 文件 | 问题 | 改造目标 |
| :--- | :--- | :--- | :--- |
| **Prompt Builder** | `builder.mjs` | ❌ 使用了简化版 Prompt | 切换到 `NES_SYSTEM_PROMPT` |
| **Controller 状态机** | `NESController.ts` | ⚠️ 状态定义与 V2.0 不完全匹配 | 适配 `TYPING` Kill-Switch 逻辑 |
| **Arbiter 锁** | `SuggestionArbiter.ts` | ⚠️ 缺少 `isNesActive()` | 新增 NES 状态检查 |
| **FIM Provider** | `FastCompletionProvider.ts` | ⚠️ 缺少 NES 状态门禁 | 在入口检查 Arbiter |

---

## 3. 实施阶段拆解 (Phased Implementation)

### Phase 0: 代码审计与基线测试 (Day 0)
**目标**: 确保改造前系统功能正常，建立回归测试基线。

| Task ID | Task | File | Description |
| :--- | :--- | :--- | :--- |
| P0.1 | 运行现有 Demo | `NesEditor.vue` | 验证 5 种 `changeType` 的 Mock 渲染正常 |
| P0.2 | API 连通性测试 | `server.mjs` | 验证后端能返回 JSON (即使 `changeType` 可能缺失) |
| P0.3 | 记录基线指标 | - | 记录当前 API Latency (~2s) |

---

### Phase 1: Backend Protocol Upgrade (Day 1)
**目标**: 让后端返回包含 `changeType` 的完整 MDRP 数据。

| Task ID | Task | File | Code Change |
| :--- | :--- | :--- | :--- |
| P1.1 | 切换 System Prompt | `builder.mjs` | 修改 `import { NEXT_EDIT_SYSTEM_PROMPT }` 为 `import { NES_SYSTEM_PROMPT }` |
| P1.2 | 更新 Builder 调用 | `builder.mjs` | 将 `buildNextEditPrompt` 中对 `NEXT_EDIT_SYSTEM_PROMPT` 的引用改为 `NES_SYSTEM_PROMPT` |
| P1.3 | 确保 Examples 注入 | `builder.mjs` | 验证 `CHANGE_TYPE_EXAMPLES` 在 User Prompt 中正确注入 |

**验证点 (Checkpoint)**:
```bash
# 启动 Server，发送测试请求
curl -X POST http://localhost:3000/api/nes/predict \
  -H "Content-Type: application/json" \
  -d '{"codeWindow": "const x = funct ion() {}", ...}'

# 预期响应包含:
# "changeType": "REPLACE_WORD",
# "wordReplaceInfo": { "word": "funct ion", "replacement": "function", ... }
```

---

### Phase 2: Controller Kill-Switch Adaptation (Day 2)
**目标**: 实现"用户输入立即销毁 NES UI"的 Kill-Switch 逻辑。

| Task ID | Task | File | Code Change |
| :--- | :--- | :--- | :--- |
| P2.1 | 增强 `handleContentChange` | `NESController.ts` | 在函数顶部添加 `this.renderer.clear()` 和 `this.suggestionQueue.clear()` (Kill-Switch) |
| P2.2 | 状态语义调整 | `NESController.ts` | 将现有 `SUGGESTING` 状态的行为对齐到 `NES_ACTIVE` 语义 |
| P2.3 | 超时保护 | `NESController.ts` | 在 `predict()` 中添加 `AbortController` 3s 超时逻辑 |

**具体代码变更 (P2.1)**:
```typescript
// NESController.ts - handleContentChange() 顶部
private handleContentChange(e: monaco.editor.IModelContentChangedEvent): void {
  // ========== V2.0 Kill-Switch ==========
  // 任何用户输入立即清空 NES UI，确保 FIM 独占
  if (this.state === 'SUGGESTING') {
    console.log('[NES] Kill-Switch: User typing, clearing NES UI');
    this.renderer.clear();
    this.suggestionQueue.clear();
    this.state = 'IDLE'; // 强制回到 IDLE，等待下一轮防抖
  }
  // ========================================
  
  // ... 原有逻辑 ...
}
```

**验证点 (Checkpoint)**:
1.  启动编辑器，触发一个 NES 建议 (Gutter Icon 出现)。
2.  立即开始打字。
3.  **预期**: Gutter Icon 立即消失，无任何残留。

---

### Phase 3: Queue & Rendering Verification (Day 3)
**目标**: 验证现有队列和渲染逻辑与 MDRP 数据的兼容性。

| Task ID | Task | File | Description |
| :--- | :--- | :--- | :--- |
| P3.1 | MDRP 数据流验证 | `NESController.ts` | 在 `predict()` 成功后，打印完整的 `Prediction` 对象，确认包含 `changeType` |
| P3.2 | 渲染派发验证 | `NESRenderer.ts` | 确认 `renderSuggestion()` 正确根据 `changeType` 调用 `DecorationManager` |
| P3.3 | 队列消费验证 | `NESController.ts` | 确认 `acceptSuggestion()` 正确调用 `suggestionQueue.next()` 并渲染下一个 |

**验证点 (Checkpoint)**:
1.  构造一个需要修改 3 处的场景 (如重命名变量)。
2.  等待 NES 返回 3 条建议。
3.  连续按 3 次 Tab。
4.  **预期**: 3 处修改全部完成，中间无明显网络等待。

---

### Phase 4: Interaction & Arbitration (Day 4)
**目标**: 完善键盘交互，并实现 FIM/NES 互斥锁。

| Task ID | Task | File | Code Change |
| :--- | :--- | :--- | :--- |
| P4.1 | Escape 键拦截 | `NESController.ts` | 在 Constructor 中注册 `editor.addCommand(monaco.KeyCode.Escape, ...)` |
| P4.2 | Arbiter 状态导出 | `SuggestionArbiter.ts` | 新增 `isNesActive(): boolean` 方法 |
| P4.3 | FIM 入口门禁 | `FastCompletionProvider.ts` | 在 `provideInlineCompletions` 顶部检查 `arbiter.isNesActive()` |

**具体代码变更 (P4.1)**:
```typescript
// NESController.ts - constructor 或 bindListeners
this.editor.addCommand(monaco.KeyCode.Escape, () => {
  if (this.state === 'SUGGESTING') {
    console.log('[NES] Escape pressed, dismissing NES');
    this.rejectAllSuggestions(); // 已有方法
  }
});
```

**具体代码变更 (P4.3)**:
```typescript
// FastCompletionProvider.ts - provideInlineCompletions
provideInlineCompletions: async (model, position, _, token) => {
  // ========== V2.0 NES Gate ==========
  if (this.arbiter.isNesActive()) {
    console.log('[FIM] NES is active, suppressing completion');
    return { items: [] };
  }
  // ====================================
  
  // ... 原有逻辑 ...
}
```

**验证点 (Checkpoint)**:
1.  触发 NES 建议。
2.  按 `Escape`。
3.  **预期**: NES UI 立即消失。
4.  NES 建议激活状态下，尝试触发 FIM (如输入一个字符然后立即删除)。
5.  **预期**: FIM Ghost Text 不出现。

---

### Phase 5: End-to-End Testing & Polish (Day 5)
**目标**: 全场景验收测试。

| Test Case | Steps | Expected Result |
| :--- | :--- | :--- |
| **TC1: 互斥性** | 快速打字 (持续 5s) | 屏幕上始终无 NES UI |
| **TC2: 可撤销性** | 触发 NES -> Esc | NES 立即消失 |
| **TC3: 数据驱动 (REPLACE_WORD)** | 构造 Typo 场景 | 仅单词被高亮，非整行 |
| **TC4: 数据驱动 (INSERT)** | 构造缺少属性场景 | 新行以绿色 Ghost 形式显示 |
| **TC5: 连贯性** | 重命名变量 (3处调用) | 连续 Tab 3 次，0 延迟切换 |

---

## 4. 代码修改清单 (Change List Summary)

| File | Type | Description |
| :--- | :--- | :--- |
| `server/prompts/nes/builder.mjs` | Modify | 切换 Prompt 导入 |
| `src/core/engines/NESController.ts` | Modify | 添加 Kill-Switch, Escape 拦截, 超时保护 |
| `src/core/arbiter/SuggestionArbiter.ts` | Modify | 新增 `isNesActive()` |
| `src/core/engines/FastCompletionProvider.ts` | Modify | 添加 NES 门禁检查 |

**预计修改代码量**: ~100 行 (精确定向修改)

---

## 5. 风险与回滚策略

| Risk | Probability | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| 新 Prompt 导致模型输出不稳定 | Medium | High | 保留旧 Prompt 作为 Fallback，通过环境变量切换 |
| Kill-Switch 过于激进 | Low | Medium | 添加 50ms 防抖，避免误杀 |
| FIM 门禁误判 | Low | Medium | 添加详细日志，便于调试 |

**回滚命令**:
```bash
git revert <commit-hash>  # 回滚特定 Phase 的提交
```

---

## 6. 时间线与里程碑

| Day | Phase | Milestone |
| :--- | :--- | :--- |
| Day 0 | P0 | 基线测试通过 |
| Day 1 | P1 | 后端返回 MDRP 数据 ✅ |
| Day 2 | P2 | Kill-Switch 生效 ✅ |
| Day 3 | P3 | 队列连续消费验证 ✅ |
| Day 4 | P4 | Escape 和 FIM 门禁生效 ✅ |
| Day 5 | P5 | 全场景验收通过 🎉 |

---

**Document Owner**: Antigravity
**Reviewers**: Frontend Architecture Team
