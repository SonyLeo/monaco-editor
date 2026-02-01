# AI Code Assistant - Vue 3 示例

这是一个展示如何在 Vue 3 项目中集成 AI Code Assistant 的示例。

## 快速开始

### 1. 安装依赖

```bash
# 在 monaco-editor 根目录
pnpm install

# 确保安装了 Vue 相关依赖
pnpm add vue @vitejs/plugin-vue -D
```

### 2. 启动后端服务

```bash
# 在 monaco-editor 根目录
node server/server.mjs
```

### 3. 在 Vue 项目中使用

```vue
<script setup lang="ts">
import AICodeAssistantEditor from './AICodeAssistantEditor.vue';
</script>

<template>
  <AICodeAssistantEditor
    v-model="code"
    language="typescript"
    theme="vs-dark"
    fim-endpoint="http://localhost:3000/api/completion"
    nes-endpoint="http://localhost:3000/api/next-edit-prediction"
    @ready="handleReady"
  />
</template>
```

## 组件 Props

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `modelValue` | `string` | 示例代码 | 编辑器内容（支持 v-model） |
| `language` | `string` | `'typescript'` | 代码语言 |
| `theme` | `string` | `'vs-dark'` | 编辑器主题 |
| `fimEndpoint` | `string` | `'http://localhost:3000/api/completion'` | FIM API 端点 |
| `nesEndpoint` | `string` | `'http://localhost:3000/api/next-edit-prediction'` | NES API 端点 |

## 组件事件

| 事件 | 参数 | 说明 |
|------|------|------|
| `update:modelValue` | `value: string` | 内容变化时触发 |
| `ready` | `editor: IStandaloneCodeEditor` | 编辑器初始化完成时触发 |

## 组件方法

通过 `ref` 可以访问组件暴露的方法：

```vue
<script setup>
import { ref } from 'vue';

const editorRef = ref();

// 获取 Monaco 编辑器实例
const editor = editorRef.value?.getEditor();

// 获取 AI Assistant 实例
const assistant = editorRef.value?.getAssistant();
</script>

<template>
  <AICodeAssistantEditor ref="editorRef" />
</template>
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Tab` | 预览/接受建议 |
| `Alt+N` | 跳过当前建议 |
| `Esc` | 关闭所有建议 |

## 功能演示

1. **FIM 补全**：输入代码时自动显示补全建议
2. **NES 预测**：修改函数签名后，自动预测需要更新的调用位置

### 测试步骤

1. 打开编辑器，找到 `createUser` 函数
2. 添加一个新参数，如 `age: number`
3. 等待 1.5 秒，NES 会自动预测需要更新的位置
4. 按 `Tab` 预览建议，再按 `Tab` 接受
5. 或按 `Alt+N` 跳过，`Esc` 关闭

## 文件结构

```
vue-demo/
├── AICodeAssistantEditor.vue  # 编辑器组件
├── App.vue                    # 示例应用
└── README.md                  # 说明文档
```
