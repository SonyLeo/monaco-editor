# 快速启动指南

## 🚀 5 分钟快速开始

### 1. 启动后端服务

```bash
node server.mjs
```

输出应该显示：
```
✅ Server running on http://localhost:3000
```

### 2. 启动前端开发服务器（新终端）

```bash
npm run dev:new
```

输出应该显示：
```
  VITE v7.2.4  ready in 123 ms

  ➜  Local:   http://localhost:5174/
```

### 3. 打开测试页面

在浏览器中打开以下任一页面：

#### 基础测试
```
http://localhost:5174/examples/basic-test.html
```
- 验证 AI Code Assistant 初始化
- 查看控制台输出

#### FIM 测试
```
http://localhost:5174/examples/fim-test.html
```
- 输入代码，观察 Ghost Text
- 按 Tab 接受补全

#### 症状检测测试
```
http://localhost:5174/examples/symptom-test.html
```
- 修改函数名：`hello` → `greet`
- 添加参数：`()` → `(name)`
- 修复拼写：`functoin` → `function`
- 观察症状检测结果

#### 集成测试
```
http://localhost:5174/examples/integration-test.html
```
- 测试 FIM 和 Dispatcher 的协调
- 观察 FIM 锁定/解锁

## 📊 验证清单

### 后端服务
- [ ] 服务器在 `http://localhost:3000` 运行
- [ ] `/api/completion` 端点可访问
- [ ] `/api/next-edit-prediction` 端点可访问

### 前端应用
- [ ] Vite 开发服务器在 `http://localhost:5174` 运行
- [ ] 测试页面可以加载
- [ ] 控制台无错误

### FIM 功能
- [ ] 输入代码时出现 Ghost Text
- [ ] 按 Tab 可以接受补全
- [ ] 按 Esc 可以关闭补全

### 症状检测
- [ ] 修改函数名时检测到 `RENAME_FUNCTION`
- [ ] 添加参数时检测到 `ADD_PARAMETER`
- [ ] 修复拼写时检测到 `WORD_FIX`

### 协调机制
- [ ] 检测到症状时 FIM 被锁定
- [ ] 症状消失后 FIM 被解锁
- [ ] 控制台显示正确的日志

## 🔧 常见问题

### Q: 后端服务无法启动

**A**: 检查端口 3000 是否被占用
```bash
# Windows
netstat -ano | findstr :3000

# macOS/Linux
lsof -i :3000
```

### Q: 前端页面加载失败

**A**: 检查 Vite 服务器是否运行
```bash
npm run dev:new
```

### Q: Ghost Text 不显示

**A**: 
1. 检查后端 `/api/completion` 是否可访问
2. 打开浏览器 Network 面板查看 API 请求
3. 检查控制台是否有错误

### Q: 症状检测不工作

**A**:
1. 等待 500ms 后再检查（防抖延迟）
2. 确保编辑是有效的（如修改函数名）
3. 查看控制台是否有错误日志

## 📁 项目结构

```
ai-code-assistant/          # 核心库
├── index.ts               # 主入口
├── config.ts              # 配置
├── types/                 # 类型定义
├── fim/                   # FIM 引擎
├── nes/                   # NES 引擎
├── shared/                # 共享模块
└── ui/                    # UI 组件

examples/                  # 测试页面
├── basic-test.html
├── fim-test.html
├── symptom-test.html
└── integration-test.html

docs/                      # 文档
├── LIGHTWEIGHT_DESIGN.md  # 设计文档
├── IMPLEMENTATION_PROGRESS.md  # 进度
├── PHASE_2_SUMMARY.md     # 阶段总结
└── QUICK_START.md         # 本文件
```

## 🎯 下一步

### 开发
1. 实现 NES 引擎核心
2. 实现 NES 渲染层
3. 优化代码和性能

### 测试
1. 运行所有测试页面
2. 验证功能完整性
3. 检查浏览器兼容性

### 部署
1. 构建生产版本
2. 迁移到其他项目
3. 集成到现有系统

## 📚 相关文档

- [实现进度](./IMPLEMENTATION_PROGRESS.md)
- [设计文档](./LIGHTWEIGHT_DESIGN.md)
- [阶段总结](./PHASE_2_SUMMARY.md)
- [使用指南](../ai-code-assistant/README.md)

## 💬 获取帮助

### 查看日志
打开浏览器开发者工具（F12），查看 Console 标签

### 检查网络请求
打开 Network 标签，查看 API 请求和响应

### 查看源代码
所有源代码都在 `ai-code-assistant/` 目录中

---

**提示**: 如果遇到问题，请检查控制台输出和网络请求，大多数问题都可以通过日志找到原因。
