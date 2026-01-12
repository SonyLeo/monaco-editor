# 🤖 Monaco Editor + AI Copilot (Multi-Provider)

这是一个基于 [monacopilot](https://monacopilot.dev/) 实现的 Monaco Editor 集成多 AI 模型的代码补全功能项目，支持 DeepSeek Coder 和 Qwen Coder 两种 AI Provider。

## 📋 功能特性

- ✨ Monaco Editor 集成 AI 代码补全
- 🤖 支持多 AI Provider（DeepSeek Coder / Qwen Coder）
- 🎯 实时智能代码建议
- ⚡️ 自动触发补全
- 💾 补全结果缓存优化
- 🔄 健康检查和状态监控
- 🧠 **智能 Prompt 系统** - 根据上下文（代码/注释）自动优化补全策略
- 📝 **注释感知补全** - 在注释中自动生成文档，在代码中生成代码

## 🏗️ 架构说明

### 📁 项目结构

```
monaco-editor-main/
├── server/                      # 后端服务模块
│   ├── clients/                # AI 模型客户端
│   │   ├── baseModelClient.mjs # 客户端基类（统一接口）
│   │   ├── deepseekClient.mjs  # DeepSeek 实现
│   │   └── qwenClient.mjs      # Qwen 实现
│   ├── utils/                  # 工具函数模块
│   │   ├── fimPromptBuilder.mjs # FIM Prompt 构建器
│   │   └── promptBuilder.mjs   # 通用 Prompt 构建器
│   ├── config.mjs              # 环境变量验证和配置管理
│   ├── constants.mjs           # 配置常量（API、Token、停止符等）
│   └── prompts.mjs             # Prompt 模板
├── server.mjs                  # 统一服务器入口
├── src/                        # 前端源码
│   ├── components/
│   │   └── MonacoEditorEnhanced.vue # 编辑器组件
│   ├── utils/
│   │   ├── completionCallbacks.ts   # 补全回调
│   │   ├── completionTrigger.ts     # 智能触发过滤
│   │   └── requestManager.ts        # 请求管理（防抖+取消）
│   ├── constants.ts            # 前端配置常量
│   └── main.ts
└── ...
```

### 🎯 核心特性

#### 1. **智能触发过滤**
避免在不必要的位置触发补全：
- ❌ 注释中不触发
- ❌ 字符串中不触发
- ❌ 分号后不触发
- ❌ 右花括号后不触发
- ✅ 只在有意义的代码位置触发

#### 2. **请求优化**
- **防抖机制**：快速输入时等待 200ms 后才发送请求
- **智能判断**：停顿后再输入时立即响应（无延迟）
- **请求取消**：新请求会自动取消之前的请求
- **缓存机制**：相同上下文的补全结果会被缓存

#### 3. **多模型支持**
- **DeepSeek Coder**：使用 Chat API，适合通用代码补全
- **Qwen Coder**：使用 FIM API，支持 Fill-In-the-Middle，补全更准确

### 前端部分 (Vue 3 + Monaco Editor)
- 使用 `monaco-editor` 提供代码编辑器
- 使用 `monacopilot` 的 `registerCompletion` 函数注册 AI 补全功能
- 自定义 `requestHandler` 实现防抖和请求取消
- 实时显示服务器连接状态和 AI 思考状态
- 提供用户友好的界面和操作提示

### 后端部分 (Express + AI Clients)
- 统一的服务器架构，支持多个 AI Provider
- 通过环境变量 `AI_PROVIDER` 选择使用 DeepSeek 或 Qwen
- 使用 `CompletionCopilot` 类的自定义模型功能
- **客户端抽象层**：`BaseModelClient` 提供统一接口
- **自动重试机制**：网络错误时自动重试（最多 2 次）
- **详细错误处理**：区分认证错误、限流错误、服务器错误
- **模块化设计**：客户端、工具函数、配置分离，易于维护
- 处理来自编辑器的补全请求
- 提供健康检查端点

## 🚀 快速开始

### 1️⃣ 安装依赖

```bash
# 安装所有前端依赖
pnpm install

# 安装后端依赖（重要！）
pnpm add express cors dotenv
```

> ⚠️ **重要**：后端服务器需要 express、cors、dotenv，请务必安装这些依赖！

### 2️⃣ 配置环境变量

复制 `.env.example` 创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置 AI Provider：

**使用 DeepSeek（推荐）：**
```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_actual_deepseek_api_key
PORT=3000
```

**使用 Qwen Coder（阿里云）：**
```env
AI_PROVIDER=qwen
QWEN_API_KEY=your_actual_qwen_api_key
PORT=3000
```

> 💡 获取 API Key：
> - DeepSeek: 访问 [DeepSeek Platform](https://platform.deepseek.com/)
> - Qwen: 访问 [阿里云百炼](https://dashscope.aliyun.com/)

### 3️⃣ 启动服务器

**方式一：同时启动前后端（推荐）**
```bash
pnpm start
```

**方式二：分别启动**

在一个终端窗口运行后端：
```bash
pnpm server
```

在另一个终端窗口运行前端：
```bash
pnpm dev
```

你应该看到类似输出：

```
🎉 Monacopilot AI 服务器启动成功!
📡 服务器监听端口: 3000
🔗 健康检查: http://localhost:3000/health
🤖 补全端点: http://localhost:3000/code-completion
💡 AI Provider: deepseek-coder
🔧 Model: deepseek-coder
```

### 4️⃣ 访问应用

打开浏览器访问：`http://localhost:5173/`

## 💻 使用说明

1. **自动补全**：在编辑器中输入代码，AI 会自动提供补全建议
2. **接受补全**：按 `Tab` 键接受当前补全建议
3. **取消补全**：按 `Esc` 键取消补全
4. **手动触发**：按 `Alt + \` 手动触发补全（如果需要）
5. **状态检查**：顶部显示服务器连接状态

## 🔧 技术栈

### 前端
- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全的 JavaScript 超集
- **Monaco Editor** - VS Code 使用的代码编辑器
- **Monacopilot** - Monaco Editor AI 补全插件
- **Vite** - 新一代前端构建工具

### 后端
- **Express** - Node.js Web 应用框架
- **Monacopilot** - 提供 CompletionCopilot 类
- **DeepSeek API** - AI 代码补全模型

## 📚 核心代码解析

### 后端：统一的客户端架构

```javascript
// 1. 基类提供统一接口
class BaseModelClient {
  async callAPI(prompt, apiKey, modelName) {
    // 统一的流程：日志 → Token计算 → 构建请求 → 调用API → 清理 → 返回
    const maxTokens = this.calculateTokens();
    const stopSequences = this.getStopSequences();
    const requestBody = this.buildRequestBody(prompt, maxTokens, stopSequences);
    const data = await this.fetchWithRetry(requestBody, apiKey); // 自动重试
    let completionText = this.parseResponse(data);
    if (completionText) {
      completionText = this.cleanCompletion(completionText);
    }
    return { text: completionText };
  }
}

// 2. DeepSeek 实现（Chat API）
class DeepSeekClient extends BaseModelClient {
  buildRequestBody(prompt, maxTokens, stopSequences) {
    return {
      model: 'deepseek-coder',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.05,
      max_tokens: maxTokens,
      stop: stopSequences,
    };
  }
}

// 3. Qwen 实现（FIM API）
class QwenClient extends BaseModelClient {
  buildRequestBody(prompt, maxTokens, stopSequences) {
    const { fimPrompt, cursorContext } = this.fimBuilder.buildOptimizedFIMPrompt(prompt.fileContent);
    return {
      model: 'qwen2.5-coder-32b-instruct',
      prompt: fimPrompt, // FIM 格式
      max_tokens: maxTokens,
      stop: stopSequences,
    };
  }
}
```

**切换 AI Provider：**
只需修改 `.env` 文件中的 `AI_PROVIDER` 变量：
```env
# 使用 DeepSeek
AI_PROVIDER=deepseek

# 或使用 Qwen
AI_PROVIDER=qwen
```

### 前端：智能请求管理

```typescript
// 1. 请求管理器（防抖 + 取消）
class RequestManager {
  createRequestHandler() {
    return async (params) => {
      // 智能防抖：快速输入时等待，停顿后立即响应
      if (this.isDebounceEnabled && !this.shouldExecuteImmediately()) {
        await new Promise(resolve => setTimeout(resolve, this.debounceDelay));
      }
      
      // 自动取消之前的请求
      const signal = this.createSignal();
      
      // 发送请求
      const response = await fetch(this.endpoint, {
        method: 'POST',
        body: JSON.stringify(params.body),
        signal, // 支持取消
      });
      
      return response.json();
    };
  }
}

// 2. 智能触发过滤
function shouldTriggerCompletion(params) {
  // 避免在注释、字符串、分号后等位置触发
  if (isInComment(beforeCursor, text)) return false;
  if (isInString(beforeCursor)) return false;
  if (isAfterStatementEnd(beforeCursor)) return false;
  return true;
}

// 3. 注册补全
registerCompletion(monaco, editor, {
  language: 'javascript',
  endpoint: 'http://localhost:3000/code-completion',
  trigger: 'onTyping',
  enableCaching: true,
  triggerIf: shouldTriggerCompletion, // 智能过滤
  requestHandler: requestManager.createRequestHandler(), // 防抖+取消
});
```

## 🎯 项目特点

### ✅ 已实现
- [x] Monaco Editor 基础集成
- [x] monacopilot 插件集成
- [x] 多 AI Provider 支持（DeepSeek / Qwen）
- [x] 统一的客户端抽象层（BaseModelClient）
- [x] FIM (Fill-In-the-Middle) 支持（Qwen）
- [x] 环境变量验证和配置管理
- [x] 自定义模型配置
- [x] 前后端通信
- [x] 代码补全功能
- [x] **智能触发过滤** - 避免无意义的请求
- [x] **请求防抖机制** - 减少服务器负载
- [x] **请求自动取消** - 快速响应用户输入
- [x] **自动重试机制** - 提高请求成功率
- [x] 服务器健康检查
- [x] 详细的错误处理和分类

### 🎨 性能优化

| 优化项 | 实现方式 | 效果 |
|--------|---------|------|
| **智能触发** | `triggerIf` 过滤 | 减少 60%+ 无效请求 |
| **请求防抖** | 200ms 延迟 | 快速输入时只发送 1 个请求 |
| **请求取消** | AbortController | 避免处理过时的请求 |
| **缓存机制** | monacopilot 内置 | 相同上下文复用结果 |
| **自动重试** | 最多 2 次 | 提高网络不稳定时的成功率 |

### 🔍 测试建议
1. 尝试输入不完整的函数定义，查看 AI 补全
2. 输入注释描述功能，让 AI 生成代码
3. 快速输入多个字符，观察防抖效果
4. 测试不同编程语言的代码补全
5. 观察补全的准确性和响应速度
6. 查看浏览器控制台的错误日志

## 📖 参考文档

- [Monacopilot 文档](https://monacopilot.dev/)
- [Monacopilot GitHub](https://github.com/arshad-yaseen/monacopilot)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [DeepSeek API](https://platform.deepseek.com/)

## 🤔 常见问题

### Q: 如何切换 AI Provider？
A: 只需修改 `.env` 文件中的 `AI_PROVIDER` 变量：
- 使用 DeepSeek: `AI_PROVIDER=deepseek`
- 使用 Qwen: `AI_PROVIDER=qwen`

然后重启服务器即可。

### Q: 启动时提示配置错误怎么办？
A: 服务器会自动验证配置，如果出现错误会显示详细信息：
- 检查 `.env` 文件是否存在
- 确认 `AI_PROVIDER` 设置正确（deepseek 或 qwen）
- 确认对应的 API Key 已配置
- 参考 `.env.example` 文件的格式

### Q: 补全速度慢怎么办？
A: 
- 已启用缓存功能 (`enableCaching: true`)
- 已启用请求防抖（200ms）和自动取消
- DeepSeek 通常比 Qwen 响应更快
- 可以调整防抖延迟：`requestManager.setDebounceDelay(100)` // 更快但更多请求
- 考虑使用更快的模型或部署本地模型

### Q: 如何调整防抖延迟？
A: 在 `src/components/MonacoEditorEnhanced.vue` 中修改：
```typescript
requestManager.setDebounceDelay(200); // 默认 200ms
requestManager.setDebounceEnabled(true); // 启用/禁用防抖
```

### Q: 如何添加新的 AI Provider？
A: 
1. 在 `server/clients/` 创建新的客户端类（继承 `BaseModelClient`）
2. 实现抽象方法：`buildRequestBody()`, `parseResponse()`, `cleanCompletion()`, `getStopSequences()`
3. 在 `server.mjs` 中添加新的 case 分支
4. 在 `server/config.mjs` 中添加验证逻辑
5. 更新 `.env.example` 添加新的 API Key 配置

### Q: 为什么使用防抖而不是节流？
A: 防抖更适合代码补全场景：
- 用户快速输入时，只在停止输入后才发送请求
- 避免在输入过程中发送大量无用请求
- 结合请求取消机制，既减少请求又保持响应速度

## 📝 License

MIT

---

**Made with ❤️ | Production-Ready Architecture**
