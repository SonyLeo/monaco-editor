# AI Code Assistant - 示例

本目录包含 AI Code Assistant 的各种集成示例。

## 目录结构

```
examples/
├── vue-demo/       # Vue 3 示例
│   ├── AICodeAssistantEditor.vue
│   ├── App.vue
│   └── README.md
│
└── README.md       # 本文件
```

## 快速开始

### 运行 Vue 示例

```bash
# 1. 启动开发服务器
pnpm ai:vue

# 2. 访问
http://localhost:5175/
```

### 使用 Vue 组件

详见 [vue-demo/README.md](./vue-demo/README.md)

## 功能演示

### FIM（Fill-In-Middle）补全

- 输入代码时自动显示补全建议
- 按 `Tab` 接受补全
- 按 `Esc` 取消

### NES（Next Edit Suggestion）预测

1. 修改函数签名（如添加参数）
2. 等待 1.5 秒
3. NES 自动预测需要更新的位置
4. 按 `Tab` 预览 → 再按 `Tab` 接受
5. 或按 `Alt+N` 跳过，`Esc` 关闭

## 更多信息

- [AI Code Assistant 设计文档](../docs/DESIGN.md)
- [API 参考](../docs/API.md)
