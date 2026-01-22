# Prompts 目录结构

AI Prompt 模块化管理，按功能分离 FIM 代码补全和 NES 编辑预测。

## 目录结构

```
server/prompts/
├── index.mjs                    # 统一导出入口
├── fim/                         # FIM 代码补全
│   ├── systemPrompt.mjs        # System Prompts
│   └── instructions.mjs        # 指令模板
└── nes/                         # NES 编辑预测
    ├── systemPrompt.mjs        # System Prompts
    ├── builder.mjs             # Prompt 构建器
    ├── patterns.mjs            # 编辑模式定义
    ├── examples.mjs            # Few-shot 示例
    └── formatters.mjs          # 格式化工具
```

## 模块说明

### FIM (Fill-In-the-Middle)

实时代码补全，支持代码和注释的智能补全。

**核心文件：**
- `systemPrompt.mjs` - AI 角色定义和补全规则
- `instructions.mjs` - 代码/注释补全指令模板

**主要导出：**
```javascript
import {
  FIM_SYSTEM_PROMPT,      // 完整 System Prompt
  FIM_FAST_PROMPT,        // 快速补全 Prompt
  createCodeInstruction,  // 代码补全指令
  createUserPrompt,       // User Prompt 构建
  BLOCK_COMMENT_INSTRUCTION,  // JSDoc 注释
  LINE_COMMENT_INSTRUCTION,   // 行注释
} from './server/prompts/index.mjs';
```

### NES (Next Edit Suggestion)

智能预测下一步编辑，支持重命名、重构等模式识别。

**核心文件：**
- `systemPrompt.mjs` - NES System Prompts
- `builder.mjs` - Prompt 构建逻辑
- `patterns.mjs` - 编辑模式指令（rename, refactor, add_field 等）
- `examples.mjs` - Few-shot 示例库
- `formatters.mjs` - 编辑历史和用户反馈格式化

**主要导出：**
```javascript
import {
  NES_SYSTEM_PROMPT,      // NES 主 Prompt
  buildNESUserPrompt,     // User Prompt 构建
} from './server/prompts/index.mjs';
```

**注意：** 其他函数（formatters, patterns, examples）为内部实现，不对外暴露。

## 使用指南

### 统一导入

所有导出通过 `index.mjs` 统一管理：

```javascript
import { FIM_SYSTEM_PROMPT, NES_SYSTEM_PROMPT } from './server/prompts/index.mjs';
```

### 模块职责

- **systemPrompt.mjs** - AI 角色定义
- **instructions.mjs** - 任务指令模板
- **builder.mjs** - Prompt 组装逻辑
- **formatters.mjs** - 数据格式化
- **patterns.mjs** - 模式定义
- **examples.mjs** - Few-shot 示例

### 扩展流程

1. 在对应模块创建新文件
2. 在 `index.mjs` 添加导出
3. 更新文档

## 设计原则

- **职责分离** - System/User Prompt、格式化逻辑独立
- **模块独立** - FIM 和 NES 完全解耦
- **易于测试** - 函数职责单一
- **类型安全** - JSDoc 注释


## 重构记录

- 2026-01-21: 模块化重构，FIM/NES 分离
- 2026-01-21: 合并 `server/formatters/` 到 `nes/formatters.mjs`
- 2026-01-21: 删除未使用的 `shared/` 目录
- 2026-01-21: 清理未使用的导出，只保留外部接口
