# NES Renderer 技术设计

NES Renderer 是 Next Edit Suggestion (NES) 的前端渲染核心，负责将 AI 预测结果可视化的呈现给用户。

## 1. 架构演进

**Phase 1 & 2**：采用单体类设计，`NESRenderer` 包含了所有 UI 逻辑，包括装饰器管理、DiffEditor 嵌入、ViewZone 计算等，代码规模近 500 行，维护困难。

**Phase 3 (当前架构)**：重构为协调器模式（Coordinator Pattern）。

```
NESRenderer (Coordinator)
  ├── DecorationManager (Glyph UI)
  ├── ViewZoneManager (DOM Container)
  │     └── DiffEditorManager (Monaco Instance)
  └── HintBarWidget (Floating UI)
```

## 2. 核心模块详解

### 2.1 DiffEditorManager
封装了 Monaco Editor 内嵌 DiffEditor 的复杂逻辑。

**技术难点**：
- **布局抖动**：DiffEditor 渲染需要一定的 DOM 挂载时间，直接渲染会导致高度计算错误而出现闪烁。
- **解决方案**：引入 `scheduleLayout` 机制，利用 double-raf (requestAnimationFrame) 或 `setTimeout` 确保 DOM 稳定后再执行 `layout()`。

### 2.2 ViewZoneManager
管理代码行之间的嵌入式区域 (Zone Widget)。

**实现细节**：
- 使用 Monaco 的 `changeViewZones` API 动态插入 DOM 节点。
- 只有当 `onDomNodeTop` 回调触发时，才真正初始化内部的 DiffEditor，实现懒加载。
- 自动计算高度：`lines * lineHeight + padding`。

### 2.3 DecorationManager
负责管理由于预测产生的行装饰器（Gutter Icon）。

- 使用 SVG Data URI 替代 CSS 类中的硬编码图片，提升加载性能。
- 实现了 `nes-arrow-icon-enhanced` 样式，支持 hover 交互。

## 3. 性能优化策略

为了确保编辑器操作的流畅性，我们在 Renderer 层实施了以下优化：

1. **DOM 复用**：`ViewZoneManager` 和 `DiffEditorManager` 会尝试复用现有的 DOM 节点和 Editor 实例，避免频繁创建和销毁带来的开销。
2. **懒加载**：DiffEditor 仅在 ViewZone 真正进入视口（通过 `onDomNodeTop` 回调）后才进行模型设置和布局计算。
3. **SVG 优化**：将图标转换为 Data URI 并通过 CSS 注入，避免产生额外的 HTTP 请求。
4. **事件防抖**：对于频繁触发的布局更新或样式注入，使用防抖策略。

## 4. 样式管理
所有样式从 TS 代码中剥离，集中管理在 `styles/nes-styles.ts`。通过 JS 动态注入 `<style>` 标签，既保持了单文件的便携性，又实现了样式分离。

## 4. 交互流程

1. **Trigger**: `NESController` 调用 `renderer.renderGlyphIcon()`。
2. **Display**: `DecorationManager` 在指定行渲染箭头。
3. **Preview**: 用户点击箭头 -> `renderer.showPreview()` -> `ViewZoneManager` 展开 -> `DiffEditorManager` 渲染差异。
4. **Accept**: 用户按 Tab -> `renderer.applySuggestion()` -> 执行 Edit Operation -> 清理 UI。
