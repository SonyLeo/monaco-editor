# Monaco Editor with NES (Next Edit Suggestions)

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)
![License](https://img.shields.io/badge/license-MIT-green)

> **重新定义代码辅助体验**：不仅仅是补全，而是预测你的下一步编辑意图。

基于 Monaco Editor 和 DeepSeek V3/R1 构建的智能编辑器，采用创新的 **Dual Engine (双引擎)** 架构，将毫秒级补全与深思熟虑的预测完美融合。

## 🧠 核心架构：Dual Engine

我们设计了双轨制的处理引擎，以平衡响应速度与智能深度：

| 特性 | Fast Engine (Ghost Text) | Slow Engine (NES) |
|------|--------------------------|-------------------|
| **场景** | 实时代码补全 | 复杂的重构、修改预测 |
| **触发** | 键入时实时触发 | 编辑停顿后 (Debounce) |
| **UI** | 灰色幽灵文本 (Ghost Text) | 侧边栏 Glyph 箭头 + Diff 预览 |
| **模型** | DeepSeek-Coder (Fill-In-Middle) | DeepSeek-Chat/Reasoner |
| **延迟** | < 300ms | 1.5s - 3s |

## 📂 项目结构详解

基于 **Coordinator Pattern** 和 **Manager-based** 架构，职责界限分明。

```text
monaco-editor-nes/
├── src/
│   ├── core/                        # 🧠 [核心] 业务逻辑层
│   │   ├── engines/                 #    引擎层：处理状态与数据
│   │   │   ├── NESController.ts     #    [总协调器] 管理 NES 生命周期与状态流转
│   │   │   ├── SuggestionQueue.ts   #    [队列] 管理多条预测建议的顺序与导航
│   │   │   ├── EditHistoryManager.ts#    [历史] 追踪用户编辑操作，为 AI 提供上下文
│   │   │   └── PredictionService.ts #    [服务] 封装与后端 API 的通信
│   │   │
│   │   └── renderer/                # 🎨 [渲染层] UI 呈现 (Manager 模式)
│   │       ├── NESRenderer.ts       #    [渲染协调器] 统一对外暴露渲染 API
│   │       ├── DiffEditorManager.ts #    [组件] 管理内嵌的 Monaco DiffEditor 实例
│   │       ├── ViewZoneManager.ts   #    [容器] 管理代码行间的 DOM 插入区域
│   │       ├── DecorationManager.ts #    [装饰] 管理行号旁的 Glyph 图标与高亮
│   │       └── styles/              #    样式资源隔离
│   │
│   ├── components/                  # 🧩 Vue 组件层
│   │   └── NesEditor.vue            #    编辑器入口组件
│   │
│   ├── e2e/                         # 🤖 E2E 测试 (Playwright)
│   └── test/                        # 🧪 单元测试 (Vitest)
│
├── server/                          # 🔌 后端服务层
│   ├── server.mjs                   #    Node.js 代理服务器
│   ├── prompts/                     #    Prompt 工程化模板
│   └── utils/                       #    后端工具链 (JSON 解析、格式化)
│
└── docs/                            # 📚 文档中心
    ├── design/                      #    技术设计文档
    └── refactor/                    #    重构历程记录
```

## ✨ 关键特性

### 1. 智能预测 (NES)
当你修改了函数签名后，编辑器会预测你需要更新的所有调用处。
- **触发**：修改代码后稍作停顿。
- **提示**：行号旁出现**紫色脉冲箭头**。
- **预览**：点击箭头，展开内嵌的 Diff 视图对比修改。

### 2. 也是一个全功能的 Monaco Editor
- 完整的 TypeScript 语言支持
- 语法高亮与智能提示
- 小地图 (Minimap)

## 🎮 使用指南与快捷键

| 快捷键 | 作用 | 适用范围 |
|--------|------|----------|
| `Tab` | **接受**当前的补全或 NES 建议 | 全局 |
| `Alt + Enter` | **跳转**到下一个 NES 建议位置 | NES |
| `Alt + N` | **跳过**当前建议，查看下一个候选 | NES (多建议时) |
| `Esc` | **取消/关闭**当前建议窗口 | 全局 |

## 📦 快速开始

### 前置要求
- Node.js > 18
- pnpm

### 1. 安装
```bash
pnpm install
```

### 2. 配置 DeepSeek API
新建 `.env` 文件：
```env
DEEPSEEK_API_KEY=sk-your-key-here
```

### 3. 启动全栈开发环境
```bash
pnpm start
```
> 这会自动启动前端 (Vite) 和后端 (Node) 服务。

## 🧪 测试策略

我们要确保核心逻辑的稳定性：

```bash
# 1. 单元测试: 测试队列逻辑、历史记录算法
pnpm test:run

# 2. E2E 测试: 测试真实浏览器环境下的交互流程
pnpm test:e2e
```

## 🤝 贡献

请查阅 `docs/design` 目录下的设计文档了解实现细节。
