# FIM 引擎设计详述 (Fast Machine)

FIM (Fill-In-the-Middle) 引擎是快系统的核心，专注于提供极低延迟的代码补全。它基于 Monaco Editor 的标准 `InlineCompletions` 接口实现。

## 1. 核心实现类

主要逻辑位于 `src/core/engines/FastCompletionProvider.ts`。

### 1.1 注册 Provider

我们通过 Monaco 的语言服务注册 Provider。

```typescript
public register(): void {
  monaco.languages.registerInlineCompletionsProvider('typescript', {
    provideInlineCompletions: async (model, position, context, token) => {
      // 1. 检查仲裁锁
      if (this.arbiter.isFimLocked()) return { items: [] };

      // 2. 获取上下文
      const { prefix, suffix } = this.getPrefixSuffix(model, position);

      // 3. 构建 Prompt 并请求
      const completion = await this.fetchCompletion(prefix, suffix, token);

      // 4. 后处理与验证
      if (!this.isValidCompletion(completion, suffix)) return { items: [] };

      // 5. 返回结果
      return {
        items: [{
          insertText: completion,
          range: new monaco.Range(position.lineNumber, position.column, ...)
        }]
      };
    },
    
    freeInlineCompletions: () => {
      // 资源清理
    }
  });
}
```

## 2. 关键技术细节

### 2.1 任务取消 (Cancellation)

FIM 请求非常频繁。当用户继续打字时，必须取消上一次未完成的请求，以节省 token 和带宽。

*   **机制**: 使用 `AbortController` 和 Monaco 的 `CancellationToken`。

```typescript
// 在 provideInlineCompletions 中
const abortController = new AbortController();

// 监听 Monaco 取消信号
token.onCancellationRequested(() => {
  abortController.abort();
});

// fetch 请求绑定 signal
await fetch(apiUrl, {
  signal: abortController.signal,
  // ...
});
```

### 2.2 后缀去重 (Suffix Duplication Check)

这是一个常见问题：如果光标后已经有 `});`，模型可能会再次生成 `});`，导致代码变成 `});});`。

*   **实现**: `checkSuffixDuplication` 方法。

```typescript
private checkSuffixDuplication(completion: string, suffix: string): boolean {
  // 标准化：去除所有空白字符进行比较
  const normalize = (s: string) => s.replace(/\s+/g, '');
  
  const normCompletion = normalize(completion);
  const normSuffix = normalize(suffix);

  // 如果后缀以补全内容开头（忽略空格），则视为重复
  return normSuffix.startsWith(normCompletion);
}
```

### 2.3 上下文截取 (Context Trimming)

为了平衡 Prompt 长度和准确性，我们需要智能截取 Prefix 和 Suffix。

*   **文件**: `server/utils/fimPromptBuilder.mjs`
*   **策略**:
    1.  **Cursor Context Analysis**: 分析光标是在函数内、对象内还是全局作用域。
    2.  **Lines Limit**: 限制 Prefix 发送 100 行，Suffix 发送 50 行（可配置）。
    3.  **Meta Info**: 保留函数签名和 JSDoc，即使它们超出了行数限制。

```javascript
// server/utils/fimPromptBuilder.mjs
optimizePrefix(prefix) {
  const MAX_LINES = 100;
  const lines = prefix.split('\n');
  return lines.slice(-MAX_LINES).join('\n');
}
```

## 3. FIM Prompt 构建

FIM 模式通常使用特定的标记符。我们采用 DeepSeek/Codestral 兼容的格式。

```
<｜fim begin｜>{prefix}<｜fim hole｜>{suffix}<｜fim end｜>
```

或者使用标准的：

```javascript
const prompt = `${PREFIX_TAG}${prefix}${SUFFIX_TAG}${suffix}${MIDDLE_TAG}`;
```

引擎会负责根据光标位置将文档切分为这三部分。
