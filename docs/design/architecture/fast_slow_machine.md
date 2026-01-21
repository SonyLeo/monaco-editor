# FIM 与 NES 双系统架构 (Fast & Slow Machine)

本文档详细阐述了智能代码助手背后的核心架构设计：基于心理学 **Dual Process Theory (双重加工理论)** 的 "快慢机" 架构。该架构旨在平衡响应速度（FIM）与任务复杂度（NES）。

## 1. 架构总览

系统由两个并行的处理引擎组成，通过 `SuggestionArbiter`（仲裁者）进行协调，确保在任何时刻只有一种最合适的补全模式在工作。

### 1.1 系统对比

| 特性 | System 1: Fast Machine (FIM) | System 2: Slow Machine (NES) |
| :--- | :--- | :--- |
| **核心机制** | 直觉反应 (Intuition) | 逻辑推理 (Reasoning) |
| **目标** | 毫秒级补全当前行 (Ghost Text) | 预测下一次编辑/重构 (Refactoring) |
| **触发方式** | 按键触发 (Keystroke) | 事件触发 (Pause/Save/Paste) |
| **延迟** | < 200ms | 1s - 3s |
| **上下文** | 局部 (Local Window) | 全局变更 + 编辑历史 (Edit History) |
| **UI 表现** | 灰色幽灵文本 (Inline Ghost Text) | 行号图标 (Gutter) + 预览窗口 (ViewZone) |

## 2. 核心组件交互

```mermaid
graph TD
    UserInput[用户输入/事件] --> Arbiter[Suggestion Arbiter (仲裁者)]
    
    Arbiter -- "State == IDLE" --> FastEngine[Fast Machine (FIM)]
    Arbiter -- "Debounce + Pattern" --> SlowEngine[Slow Machine (NES)]
    
    subgraph Fast Machine
    FastEngine --> |API Requests| FastModel[Small Model]
    FastModel --> Inline[Inline Ghost Text]
    end
    
    subgraph Slow Machine
    SlowEngine --> EditHistory[Edit History Tracker]
    EditHistory --> DiffEngine[Diff Engine]
    DiffEngine --> |Complex Prompt| CoTModel[Reasoning Model]
    CoTModel --> Predictions[Prediction Queue]
    Predictions --> Renderer[NES Renderer]
    end
    
    Inline --> Editor[Monaco Editor]
    Renderer --> Editor
```

## 3. 仲裁机制 (Suggestion Arbiter)

`SuggestionArbiter` 是系统的核心协调器，是一个单例模式 (Singleton) 的控制器。它维护着全局的锁定状态。

### 3.1 核心代码逻辑

位于 `src/core/arbiter/SuggestionArbiter.ts`。

```typescript
export class SuggestionArbiter {
  private static instance: SuggestionArbiter;
  private _isFimLocked: boolean = false;
  private _nesState: NESState = 'IDLE';

  // 检查 FIM 是否被锁定
  public isFimLocked(): boolean {
    // 1. 如果 NES 正在应用建议，必须锁定
    if (this._nesState === 'APPLYING') return true;
    
    // 2. 如果 NES 正在进行高负载推理，建议锁定以节省资源
    if (this._nesState === 'PREDICTING') return true;
    
    // 3. 显式的锁定 (例如用户正在预览 Diff)
    return this._isFimLocked;
  }

  // NES 系统状态更新时调用
  public updateNesState(state: NESState) {
    this._nesState = state;
    // 状态变更可能触发锁定/解锁
  }
}
```

### 3.2 冲突解决策略 (Conflict Resolution)

| 场景 | 当前状态 | 仲裁结果 (Action) | 代码实现参考 |
| :--- | :--- | :--- | :--- |
| **用户快速打字** | NES Idle | **FIM Active** | `FastCompletionProvider.provideInlineCompletions` 正常执行 |
| **NES 正在推理** | NES Predicting | **FIM Blocked** | `Arbiter.isFimLocked()` 返回 `true`，Provider 返回空数组 |
| **NES 建议展示中** | NES Suggesting | **FIM Active** | 允许 FIM，因为用户可能忽略 NES 图标继续打字 |
| **查看/应用 NES** | NES Applying | **FIM Blocked** | 防止在 Diff View 打开时出现幽灵文本干扰视觉 |

## 4. 数据流转 (Data Flow)

1.  **输入捕获**: `NESController` 监听 `onDidChangeModelContent`。
2.  **历史记录**: 变更被送入 `EditHistoryManager`，更新时间序列。
3.  **快系统分支**:
    - 如果是微小变更且未触发 NES 阈值。
    - 调用 `FastCompletionProvider`。
    - 构建 `FIM Prompt` -> 请求 API -> 渲染 `InlineCompletion`。
4.  **慢系统分支**:
    - 如果满足防抖时间 (2000ms) 或特定模式。
    - 锁定状态 -> `Analysis Phase` (分析意图) -> `Prediction Phase` (生成 Diff)。
    - 渲染图标 -> 等待用户交互。
