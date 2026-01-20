# Monaco Editor with NES (Next Edit Suggestions)

基于 DeepSeek 的智能代码编辑器，实现了 Dual Engine 架构：
- **Fast Engine**: 毫秒级代码补全（Ghost Text）
- **Slow Engine**: 智能下一步预测（NES）

## ✨ 特性

- 🚀 **双引擎架构**：Fast Track 补全 + Slow Track 预测
- 🧠 **智能预测**：基于 DeepSeek V3/R1 的 Next Edit Suggestions
- 🎯 **防御性编程**：Request ID 校验 + 双重验证 + 滑动窗口优化
- ⚡ **极速响应**：Fast Engine < 500ms，优化的 Token 使用
- 🎨 **精美 UI**：紫色箭头指示 + Diff 预览面板

## 📦 安装

```bash
# 安装依赖
pnpm install
```

## ⚙️ 配置

1. **复制环境变量模板**：
```bash
cp .env.example .env
```

2. **编辑 `.env` 文件**，填入你的 DeepSeek API Key：
```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_api_key_here
PORT=3000
```

> 获取 API Key: https://platform.deepseek.com/api_keys

## 🚀 启动

开发模式（推荐同时启动）：

```bash
# Terminal 1: 启动后端服务器
npm run server

# Terminal 2: 启动前端开发服务器
npm run dev
```

或者使用并发启动：

```bash
npm start
```

## 🎮 使用指南

### 基础补全 (Fast Engine)
- 输入代码，自动显示灰色幽灵文本
- 按 `Tab` 键接受补全
- 按 `Esc` 取消补全

### Next Edit Suggestions (Slow Engine)
1. **编辑代码**，例如修改函数签名
2. **等待 1.5 秒**，NES 会分析你的修改
3. **查看箭头**：如果有预测，行号旁会出现紫色箭头
4. **导航建议**：
   - 按 `Alt+Enter` 跳转到建议位置
   - 或点击紫色箭头
5. **接受建议**：
   - 在预览处按 `Tab` 应用修改
6. **取消建议**：按 `Esc`

## 📂 项目结构

```
src/
├── components/
│   └── NesEditor.vue              # 主编辑器组件
├── utils/nes/
│   ├── FastCompletionProvider.ts  # 快速补全引擎
│   ├── NESController.ts           # NES 状态机
│   └── NESRenderer.ts             # UI 渲染层
└── types/
    └── nes.d.ts                   # TypeScript 类型定义

server.mjs                         # 后端 API 服务器
```

## 🔧 技术架构

### Fast Engine (代码补全)
- **输入**：Prefix + Suffix
- **模型**：DeepSeek-Coder
- **优化**：单文件场景，无需跨文件上下文
- **响应时间**：< 500ms

### Slow Engine (NES 预测)
- **输入**：Diff History + 滑动窗口（±100 行）
- **模型**：DeepSeek-Coder / DeepSeek-Reasoner (R1)
- **优化**：
  - Request ID 校验（防止时序错乱）
  - 双重验证（行号 + 内容匹配）
  - Token 优化（减少 90%）
- **响应时间**：1-3s

## 📝 示例场景

```typescript
// 1. 修改函数签名（添加参数）
function createUser(name: string, age: number) {  // 新增 age 参数
  console.log("Creating user:", name);
  return { name, age };
}

// 2. 等待 1.5 秒，NES 会预测需要更新以下调用处
const user1 = createUser("Alice");  // ⬅️ 紫色箭头会出现在这里
const user2 = createUser("Bob");
```

## 🐛 故障排查

### 服务器启动失败
- 检查 `.env` 文件是否正确配置
- 确认 API Key 有效

### 补全不工作
- 检查后端服务器是否运行（`npm run server`）
- 查看浏览器 Console 是否有错误
- 确认 API 额度是否充足

### NES 不显示
- 确保修改代码后等待 1.5 秒
- 查看后端日志，确认预测请求是否成功
- 某些修改可能不会触发预测（例如只修改注释）

## 📊 性能指标

| 指标 | Fast Engine | Slow Engine |
|------|------------|-------------|
| 平均延迟 | 300-500ms | 1-3s |
| Token 消耗 | ~100 tokens | ~500 tokens |
| 准确率 | 高 | 中-高 |

## 🛠️ 开发

```bash
# 类型检查
npx vue-tsc --noEmit

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 📄 License

MIT

## 🙏 致谢

- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [DeepSeek](https://www.deepseek.com/)
- [Continue](https://continue.dev/) - Context 管理策略参考
- [Void Editor](https://voideditor.com/) - NES 交互逻辑参考
