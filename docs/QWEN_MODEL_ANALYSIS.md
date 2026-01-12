# Qwen Coder 集成指南

本文档说明如何在项目中集成和使用阿里云百炼的 Qwen Coder 模型进行代码补全。

## 📋 目录

- [概述](#概述)
- [支持的模型](#支持的模型)
- [配置步骤](#配置步骤)
- [使用方法](#使用方法)
- [API 差异](#api-差异)
- [测试验证](#测试验证)
- [故障排除](#故障排除)

## 🎯 概述

Qwen Coder 是阿里云百炼提供的代码补全模型，专为代码生成和补全场景优化。与 DeepSeek 不同，Qwen Coder 使用 **Completions API** 和 **FIM (Fill In the Middle)** 技术。

### 主要特点

- ✅ 支持前缀补全（prefix-only）
- ✅ 支持中间补全（prefix + suffix）
- ✅ 专为代码场景优化
- ✅ 支持多种模型规模（0.5B - 32B）
- ⚠️ 仅适用于中国大陆版（北京地域）

## 🤖 支持的模型

| 模型名称 | 参数规模 | 适用场景 |
|---------|---------|---------|
| qwen2.5-coder-0.5b-instruct | 0.5B | 轻量级补全 |
| qwen2.5-coder-1.5b-instruct | 1.5B | 快速补全 |
| qwen2.5-coder-3b-instruct | 3B | 平衡性能 |
| qwen2.5-coder-7b-instruct | 7B | 高质量补全 |
| qwen2.5-coder-14b-instruct | 14B | 复杂场景 |
| qwen2.5-coder-32b-instruct | 32B | 最佳质量（默认） |
| qwen-coder-turbo-latest | Turbo | 快速响应 |

## ⚙️ 配置步骤

### 1. 获取 API Key

1. 访问 [阿里云百炼控制台](https://dashscope.console.aliyun.com/)
2. 创建应用并获取 API Key
3. 确保使用的是**中国（北京）地域**的 API Key

### 2. 配置环境变量

在项目根目录的 `.env` 文件中添加：

```bash
# Qwen API Key (阿里云百炼 - 中国北京地域)
QWEN_API_KEY=sk-your-qwen-api-key-here
```

### 3. 选择模型（可选）

默认使用 `qwen2.5-coder-32b-instruct`。如需更改，编辑 `server/constants.mjs`：

```javascript
export const QWEN_CONFIG = {
  API_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/completions',
  MODEL: 'qwen2.5-coder-7b-instruct', // 修改为其他模型
  DEFAULT_TEMPERATURE: 0.05,
  TOP_P: 0.95,
  PRESENCE_PENALTY: 0.2,
};
```

### 4. 调整 FIM 优化参数（可选）

在 `server/constants.mjs` 中调整 FIM 优化配置：

```javascript
export const QWEN_CONFIG = {
  // ... 其他配置
  
  // FIM 优化配置
  FIM_OPTIMIZATION: {
    MAX_PREFIX_LINES: 100,      // 前缀最大行数（减少可提升速度）
    MAX_SUFFIX_LINES: 50,       // 后缀最大行数
    ENABLE_CONTEXT_ANALYSIS: true,  // 启用上下文分析
    ENABLE_DYNAMIC_TOKENS: true,    // 启用动态 token 计算
  },
  
  // Token 配置（根据上下文类型）
  TOKEN_LIMITS: {
    EXPRESSION: 64,      // 表达式补全（如 a + b）
    STATEMENT: 256,      // 语句补全（如完整函数）
    FUNCTION: 200,       // 函数体补全
    CLASS: 256,          // 类定义补全
    DEFAULT: 128,        // 默认
  },
};
```

## 🚀 使用方法

### 方式 1: 运行 Qwen 服务器

```bash
# 仅启动 Qwen 服务器（端口 3001）
pnpm run server:qwen

# 同时启动 Qwen 服务器和前端开发服务器
pnpm run start:qwen
```

### 方式 2: 运行测试脚本

```bash
# 测试 Qwen API 连接和功能
pnpm run test:qwen
```

测试脚本会执行三个测试用例：
1. 函数补全（只有前缀）
2. 中间补全（前缀 + 后缀）
3. TypeScript 类型补全

### 方式 3: 集成到现有项目

如果要在现有的 `server.mjs` 中切换到 Qwen：

```javascript
// 替换导入
import { callQwenAPI } from './server/utils/qwenClient.mjs';

// 修改 copilot 配置
const copilot = new CompletionCopilot(undefined, {
  model: async (prompt) => {
    return await callQwenAPI(prompt, process.env.QWEN_API_KEY);
  },
});
```

## 🔄 API 差异

### DeepSeek vs Qwen

| 特性 | DeepSeek | Qwen Coder |
|-----|----------|------------|
| API 类型 | Chat Completions | Completions (FIM) |
| Prompt 格式 | System + User Messages | FIM 标记 |
| 响应字段 | `choices[0].message.content` | `choices[0].text` |
| 补全方式 | 对话式 | 填充式 |

### FIM (Fill In the Middle) 格式

Qwen Coder 使用特殊的 FIM 标记：

```
<|fim_prefix|>{前缀内容}<|fim_suffix|>{后缀内容}<|fim_middle|>
```

**示例 1: 只有前缀**
```
<|fim_prefix|>function quickSort(arr) {<|fim_suffix|>
```

**示例 2: 前缀 + 后缀**
```
<|fim_prefix|>function reverseString(str) {
  // 反转字符串
  <|fim_suffix|>
  return result;
}<|fim_middle|>
```

## 🧪 测试验证

### 运行测试

```bash
pnpm run test:qwen
```

### 预期输出

```
🧪 开始测试 Qwen Coder API...

📝 测试 1: 函数补全（只有前缀）
==================================================
✅ 生成的补全: ...
📊 使用的 tokens: 150
结果 1: ✅ 成功

📝 测试 2: 中间补全（前缀 + 后缀）
==================================================
✅ 生成的补全: ...
📊 使用的 tokens: 120
结果 2: ✅ 成功

📝 测试 3: TypeScript 类型补全
==================================================
✅ 生成的补全: ...
📊 使用的 tokens: 80
结果 3: ✅ 成功

==================================================
🎯 测试完成!
✅ 成功: 3/3
❌ 失败: 0/3
```

## 🔧 故障排除

### 问题 1: API Key 错误

**错误信息:**
```
❌ Qwen API 错误: 401 Unauthorized
```

**解决方案:**
- 检查 `.env` 文件中的 `QWEN_API_KEY` 是否正确
- 确认使用的是中国（北京）地域的 API Key
- 验证 API Key 是否已激活

### 问题 2: 模型不支持

**错误信息:**
```
❌ Qwen API 错误: 400 Model not found
```

**解决方案:**
- 检查 `server/constants.mjs` 中的模型名称是否正确
- 确认该模型在您的账户中可用
- 参考[支持的模型](#支持的模型)列表

### 问题 3: 补全质量不佳

**解决方案:**
1. 调整 `temperature` 参数（降低以获得更确定的结果）
2. 尝试使用更大的模型（如 32B）
3. 优化 Prompt 的上下文信息
4. 调整 `max_tokens` 限制

### 问题 4: 响应速度慢

**解决方案:**
1. 使用较小的模型（如 7B 或 turbo 版本）
2. 减少 `max_tokens` 设置
3. 优化输入的上下文长度

## 📊 性能对比

| 指标 | DeepSeek Coder | Qwen 2.5 Coder 32B |
|-----|----------------|-------------------|
| 响应速度 | 快 | 中等 |
| 补全质量 | 高 | 高 |
| 上下文理解 | 强 | 强 |
| FIM 支持 | 否 | 是 |
| 多语言支持 | 是 | 是 |

## 📚 相关文档

- [Qwen Coder 官方文档](https://help.aliyun.com/zh/model-studio/developer-reference/qwen-coder-api)
- [阿里云百炼控制台](https://dashscope.console.aliyun.com/)
- [FIM 技术说明](https://arxiv.org/abs/2207.14255)

## 🤝 贡献

如有问题或建议，欢迎提交 Issue 或 Pull Request。

## 📄 许可证

本项目遵循 MIT 许可证。
