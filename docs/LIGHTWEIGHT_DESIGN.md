好的，我来制定一个详细的、可测试的实施计划。

## 📋 详细实施计划

### 阶段 0：准备工作（30分钟）

**目标**：创建独立的开发环境，不影响现有代码

**步骤**：

1. **创建新目录结构**
```
项目根目录/
├── src/                          # 现有代码（保持不变）
├── ai-code-assistant/            # 🆕 新的轻量化实现
│   ├── index.ts
│   ├── config.ts
│   ├── fim/
│   ├── nes/
│   ├── shared/
│   ├── ui/
│   └── types/
├── examples/                     # 🆕 测试示例
│   ├── basic-test.html          # 基础测试页面
│   └── migration-test.html      # 迁移对比测试
└── package.json
```

2. **创建独立的测试页面**
   - `examples/basic-test.html` - 使用新实现
   - `examples/migration-test.html` - 对比新旧实现

3. **配置独立的构建脚本**
```json
// package.json 新增脚本
{
  "scripts": {
    "dev": "vite",                    // 现有的开发服务器
    "dev:new": "vite --config vite.new.config.ts",  // 🆕 新实现的开发服务器
    "build:assistant": "tsc && vite build --config vite.assistant.config.ts"  // 🆕 打包新实现
  }
}
```

**测试目标**：
- ✅ 新目录创建成功
- ✅ 测试页面可以访问
- ✅ 构建脚本可以运行

---

### 阶段 1：搭建骨架（1小时）

**目标**：创建完整的文件结构和类型定义，确保可以编译通过

**步骤**：

1. **创建类型定义** (`ai-code-assistant/types/`)
```typescript
// types/index.d.ts
export interface AICodeAssistantConfig { ... }
export interface FIMConfig { ... }
export interface NESConfig { ... }

// types/fim.d.ts
export interface FIMPrediction { ... }

// types/nes.d.ts
export interface Prediction { ... }
export interface Symptom { ... }
```

2. **创建配置文件** (`ai-code-assistant/config.ts`)
```typescript
export const DEFAULT_CONFIG = { ... }
export const TIME_CONFIG = { ... }
```

3. **创建入口文件** (`ai-code-assistant/index.ts`)
```typescript
export function initAICodeAssistant(
  monaco: any,
  editor: any,
  config: AICodeAssistantConfig
): AICodeAssistant {
  // 空实现，返回 dispose 方法
  return {
    dispose: () => {}
  };
}
```

4. **创建所有模块的空骨架**
```typescript
// fim/FIMEngine.ts
export class FIMEngine {
  constructor() {}
  register() {}
  dispose() {}
}

// nes/NESEngine.ts
export class NESEngine {
  constructor() {}
  start() {}
  dispose() {}
}

// ... 其他模块类似
```

5. **创建测试页面** (`examples/basic-test.html`)
```html
<!DOCTYPE html>
<html>
<head>
  <title>AI Code Assistant - Basic Test</title>
</head>
<body>
  <div id="container" style="width:800px;height:600px;"></div>
  <script type="module">
    import * as monaco from 'monaco-editor';
    import { initAICodeAssistant } from '../ai-code-assistant/index.ts';
    
    const editor = monaco.editor.create(document.getElementById('container'), {
      value: 'function hello() {\n  console.log("Hello");\n}',
      language: 'typescript'
    });
    
    const assistant = initAICodeAssistant(monaco, editor, {
      fim: { endpoint: 'http://localhost:3000/api/fim/complete' },
      nes: { endpoint: 'http://localhost:3000/api/nes/predict' }
    });
    
    console.log('✅ Assistant initialized:', assistant);
  </script>
</body>
</html>
```

**测试目标**：
- ✅ TypeScript 编译通过（无类型错误）
- ✅ 测试页面可以加载
- ✅ `initAICodeAssistant` 可以调用并返回对象
- ✅ 控制台输出 "✅ Assistant initialized"

**验证命令**：
```bash
# 编译检查
npx tsc --noEmit --project ai-code-assistant/tsconfig.json

# 启动测试服务器
npm run dev:new

# 访问 http://localhost:5174/examples/basic-test.html
```

---

### 阶段 2：实现 FIM 引擎（1.5小时）

**目标**：实现完整的 FIM 功能，可以显示 Ghost Text

**步骤**：

1. **迁移 `FastCompletionProvider` → `FIMEngine`**
   - 复制 `src/core/engines/FastCompletionProvider.ts` 的核心逻辑
   - 简化为 150 行以内
   - 移除 Dispatcher 依赖（暂时）

2. **实现 API 调用**
```typescript
// shared/PredictionService.ts
export class PredictionService {
  async callFIM(prefix: string, suffix: string): Promise<string> {
    const response = await fetch(this.fimEndpoint, {
      method: 'POST',
      body: JSON.stringify({ prefix, suffix })
    });
    const data = await response.json();
    return data.completion;
  }
}
```

3. **注册 Inline Completion Provider**
```typescript
// fim/FIMEngine.ts
export class FIMEngine {
  register() {
    monaco.languages.registerInlineCompletionsProvider('typescript', {
      provideInlineCompletions: async (model, position) => {
        const completion = await this.getCompletion(model, position);
        return { items: [{ insertText: completion }] };
      }
    });
  }
}
```

4. **更新测试页面**
```html
<!-- examples/basic-test.html -->
<script type="module">
  const assistant = initAICodeAssistant(monaco, editor, {
    fim: { 
      enabled: true,
      endpoint: 'http://localhost:3000/api/fim/complete' 
    },
    nes: { enabled: false } // 暂时禁用 NES
  });
  
  // 测试：输入代码，观察 Ghost Text
  console.log('✅ FIM Engine ready. Try typing...');
</script>
```

**测试目标**：
- ✅ 输入代码时出现灰色 Ghost Text
- ✅ 按 Tab 可以接受补全
- ✅ API 调用成功（检查 Network 面板）
- ✅ 控制台无错误

**验证步骤**：
1. 启动后端服务：`node server.mjs`
2. 启动前端：`npm run dev:new`
3. 打开测试页面
4. 在编辑器中输入 `function add`
5. 观察是否出现 Ghost Text 补全

---

### 阶段 3：实现编辑历史和 Dispatcher（1小时）

**目标**：实现编辑历史记录和 FIM/NES 协调逻辑

**步骤**：

1. **迁移 `EditHistoryManager`**
   - 复制 `src/core/engines/EditHistoryManager.ts`
   - 保持当前逻辑不变（150行）

2. **简化 `EditDispatcher`**
```typescript
// shared/EditDispatcher.ts (~200行)
export class EditDispatcher {
  private nesState: 'SLEEPING' | 'ACTIVE' = 'SLEEPING';
  private fimLocked = false;
  
  async dispatch(editHistory: EditRecord[]): Promise<{
    target: 'FIM' | 'NES',
    symptom?: Symptom
  }> {
    // 检测症状
    const symptom = await this.symptomDetector.detect(editHistory);
    
    if (symptom) {
      this.nesState = 'ACTIVE';
      return { target: 'NES', symptom };
    }
    
    return { target: 'FIM' };
  }
  
  isFIMLocked(): boolean {
    return this.nesState === 'ACTIVE' || this.fimLocked;
  }
}
```

3. **集成到 FIM Engine**
```typescript
// fim/FIMEngine.ts
export class FIMEngine {
  constructor(
    private dispatcher: EditDispatcher
  ) {}
  
  async provideInlineCompletions(model, position) {
    // 检查是否被锁定
    if (this.dispatcher.isFIMLocked()) {
      return { items: [] };
    }
    
    // 继续补全逻辑...
  }
}
```

4. **更新入口函数**
```typescript
// index.ts
export function initAICodeAssistant(monaco, editor, config) {
  const editHistory = new EditHistoryManager(editor.getValue());
  const dispatcher = new EditDispatcher();
  const fimEngine = new FIMEngine(dispatcher);
  
  // 监听编辑事件
  editor.onDidChangeModelContent(() => {
    editHistory.recordEdit(/* ... */);
  });
  
  fimEngine.register();
  
  return { dispose: () => { /* ... */ } };
}
```

**测试目标**：
- ✅ 编辑历史正确记录
- ✅ FIM 在 NES 激活时被抑制
- ✅ 控制台输出编辑历史日志

**验证步骤**：
1. 在测试页面添加日志：
```javascript
editor.onDidChangeModelContent(() => {
  const history = assistant.getEditHistory(); // 暴露方法
  console.log('Edit history:', history);
});
```
2. 输入代码，观察控制台输出

---

### 阶段 4：实现症状检测和语义分析（2小时）

**目标**：实现完整的症状检测，可以识别函数重命名等场景

**步骤**：

1. **迁移 `SemanticAnalyzer`**
   - 复制 `src/core/utils/SemanticAnalyzer.ts`
   - 保持完整功能（250行）

2. **迁移 `SymptomDetector`**
   - 复制 `src/core/dispatcher/SymptomDetector.ts`
   - 保留所有症状检测逻辑（250行）

3. **迁移工具类**
   - `CodeParser.ts` (~50行)
   - `CoordinateFixer.ts` (~50行)

4. **集成到 Dispatcher**
```typescript
// shared/EditDispatcher.ts
export class EditDispatcher {
  constructor(
    private symptomDetector: SymptomDetector
  ) {}
  
  setModel(model: monaco.editor.ITextModel) {
    this.symptomDetector.setModel(model);
  }
  
  async dispatch(editHistory: EditRecord[]) {
    const symptom = await this.symptomDetector.detect(editHistory);
    // ...
  }
}
```

5. **创建症状检测测试页面**
```html
<!-- examples/symptom-test.html -->
<script type="module">
  const assistant = initAICodeAssistant(monaco, editor, {
    fim: { enabled: false },
    nes: { enabled: true, endpoint: 'http://localhost:3000/api/nes/predict' }
  });
  
  // 监听症状检测
  assistant.onSymptomDetected((symptom) => {
    console.log('🩺 Symptom detected:', symptom);
    document.getElementById('status').textContent = 
      `Detected: ${symptom.type} - ${symptom.description}`;
  });
</script>
<div id="status">Waiting for symptoms...</div>
```

**测试目标**：
- ✅ 修改函数名时检测到 `RENAME_FUNCTION`
- ✅ 添加参数时检测到 `ADD_PARAMETER`
- ✅ 控制台输出症状详情
- ✅ 页面显示检测状态

**验证步骤**：
1. 打开 `examples/symptom-test.html`
2. 修改代码：`function hello()` → `function greet()`
3. 等待 500ms
4. 观察控制台和页面状态

---

### 阶段 5：实现 NES 引擎核心（2小时）

**目标**：实现 NES 预测逻辑，可以调用 API 并返回建议

**步骤**：

1. **创建 `NESEngine`（整合 Controller + Lifecycle）**
```typescript
// nes/NESEngine.ts (~250行)
export class NESEngine {
  private state: 'SLEEPING' | 'DIAGNOSING' | 'SUGGESTING' = 'SLEEPING';
  private currentPredictions: Prediction[] = [];
  
  async wakeUp(symptom: Symptom, editHistory: EditRecord[]) {
    this.state = 'DIAGNOSING';
    
    // 构建 payload
    const payload = this.buildPayload(symptom, editHistory);
    
    // 调用 API
    const predictions = await this.predictionService.predict(payload);
    
    if (predictions && predictions.length > 0) {
      this.currentPredictions = predictions;
      this.state = 'SUGGESTING';
      this.showFirstSuggestion();
    } else {
      this.sleep();
    }
  }
  
  private buildPayload(symptom: Symptom, editHistory: EditRecord[]): NESPayload {
    // 滑动窗口逻辑
    const codeWindow = this.getCodeWindow(symptom.affectedLine);
    return {
      codeWindow,
      windowInfo: { startLine: 1, totalLines: 100 },
      diffSummary: symptom.description,
      editHistory,
      requestId: Date.now()
    };
  }
  
  sleep() {
    this.state = 'SLEEPING';
    this.currentPredictions = [];
  }
}
```

2. **实现 `SuggestionQueue`**
   - 复制 `src/core/engines/SuggestionQueue.ts`
   - 保持完整功能（150行）

3. **实现 API 调用**
```typescript
// shared/PredictionService.ts
export class PredictionService {
  async predict(payload: NESPayload): Promise<Prediction[]> {
    const response = await fetch(this.nesEndpoint, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    return data.predictions || [];
  }
}
```

4. **集成到入口函数**
```typescript
// index.ts
export function initAICodeAssistant(monaco, editor, config) {
  // ... FIM 初始化
  
  const nesEngine = new NESEngine(editor, predictionService);
  
  // 监听编辑，通过 Dispatcher 分发
  editor.onDidChangeModelContent(async () => {
    const editHistory = editHistoryManager.getRecentEdits(5);
    const result = await dispatcher.dispatch(editHistory);
    
    if (result.target === 'NES' && result.symptom) {
      await nesEngine.wakeUp(result.symptom, editHistory);
    }
  });
  
  return { dispose: () => { /* ... */ } };
}
```

5. **创建 NES 测试页面**
```html
<!-- examples/nes-test.html -->
<script type="module">
  const assistant = initAICodeAssistant(monaco, editor, {
    fim: { enabled: false },
    nes: { enabled: true, endpoint: 'http://localhost:3000/api/nes/predict' }
  });
  
  assistant.onPrediction((predictions) => {
    console.log('🔮 Predictions:', predictions);
    document.getElementById('predictions').textContent = 
      JSON.stringify(predictions, null, 2);
  });
</script>
<pre id="predictions">Waiting for predictions...</pre>
```

**测试目标**：
- ✅ 检测到症状后调用 NES API
- ✅ 成功返回预测结果
- ✅ 控制台输出预测详情
- ✅ 页面显示预测 JSON

**验证步骤**：
1. 确保后端 `/api/nes/predict` 可用
2. 打开 `examples/nes-test.html`
3. 修改函数签名：`function add(a)` → `function add(a, b)`
4. 等待 500ms
5. 观察 Network 面板和控制台

---

### 阶段 6：实现 NES 渲染层（2小时）

**目标**：实现 Glyph 箭头、Diff 预览、HintBar 等 UI

**步骤**：

1. **创建简化的 `NESRenderer`（整合 ViewZone + Decoration）**
```typescript
// nes/NESRenderer.ts (~200行)
export class NESRenderer {
  private viewZoneId: string | null = null;
  private decorationIds: string[] = [];
  
  showSuggestion(prediction: Prediction) {
    // 1. 显示 Glyph 箭头
    this.showGlyph(prediction.targetLine);
    
    // 2. 显示 HintBar
    this.showHintBar(prediction.targetLine);
  }
  
  showPreview(prediction: Prediction) {
    // 1. 创建 ViewZone（内嵌 Diff Editor）
    this.createViewZone(prediction);
    
    // 2. 高亮目标行
    this.highlightLine(prediction.targetLine);
  }
  
  private showGlyph(lineNumber: number) {
    const decorations = this.editor.deltaDecorations([], [{
      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        glyphMarginClassName: 'nes-glyph-arrow',
        glyphMarginHoverMessage: { value: 'Click to preview' }
      }
    }]);
    this.decorationIds = decorations;
  }
  
  private createViewZone(prediction: Prediction) {
    // 创建 Diff Editor 容器
    const domNode = document.createElement('div');
    domNode.style.height = '200px';
    
    // 创建 Diff Editor
    const diffEditor = monaco.editor.createDiffEditor(domNode, {
      readOnly: true,
      renderSideBySide: false
    });
    
    // 设置 Diff 内容
    diffEditor.setModel({
      original: monaco.editor.createModel(prediction.originalLineContent, 'typescript'),
      modified: monaco.editor.createModel(prediction.suggestionText, 'typescript')
    });
    
    // 插入 ViewZone
    this.editor.changeViewZones((accessor) => {
      this.viewZoneId = accessor.addZone({
        afterLineNumber: prediction.targetLine,
        heightInPx: 200,
        domNode
      });
    });
  }
}
```

2. **迁移 `HintBarWidget`**
   - 复制 `src/core/renderer/HintBarWidget.ts`
   - 保持完整功能（150行）

3. **迁移 `TabKeyHandler`**
   - 复制 `src/core/utils/TabKeyHandler.ts`
   - 保持完整功能（100行）

4. **集成到 NESEngine**
```typescript
// nes/NESEngine.ts
export class NESEngine {
  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    private renderer: NESRenderer
  ) {}
  
  private showFirstSuggestion() {
    const prediction = this.suggestionQueue.peek();
    if (prediction) {
      this.renderer.showSuggestion(prediction);
    }
  }
  
  applySuggestion() {
    const prediction = this.suggestionQueue.peek();
    if (prediction) {
      this.renderer.showPreview(prediction);
    }
  }
  
  acceptSuggestion() {
    const prediction = this.suggestionQueue.dequeue();
    if (prediction) {
      // 应用代码变更
      this.applyEdit(prediction);
      this.renderer.clear();
      
      // 显示下一个建议
      this.showFirstSuggestion();
    }
  }
}
```

5. **注册快捷键**
```typescript
// index.ts
export function initAICodeAssistant(monaco, editor, config) {
  // ... 初始化
  
  const tabKeyHandler = new TabKeyHandler(editor, nesEngine);
  
  // Tab 键
  editor.addCommand(monaco.KeyCode.Tab, () => {
    const handled = tabKeyHandler.handleTab();
    if (!handled) {
      editor.trigger('keyboard', 'tab', {});
    }
  });
  
  // Alt+Enter 键
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => {
    nesEngine.applySuggestion();
  });
  
  // Alt+N 键
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyN, () => {
    nesEngine.skipSuggestion();
  });
  
  return { dispose: () => { /* ... */ } };
}
```

6. **创建完整测试页面**
```html
<!-- examples/full-test.html -->
<script type="module">
  const assistant = initAICodeAssistant(monaco, editor, {
    fim: { enabled: true, endpoint: 'http://localhost:3000/api/fim/complete' },
    nes: { enabled: true, endpoint: 'http://localhost:3000/api/nes/predict' }
  });
  
  console.log('✅ Full AI Code Assistant ready');
</script>
```

**测试目标**：
- ✅ 检测到症状后显示紫色 Glyph 箭头
- ✅ 点击箭头显示 Diff 预览
- ✅ 显示 HintBar（Tab 按钮 + 方向箭头）
- ✅ 按 Tab 接受建议
- ✅ 按 Alt+N 跳过建议

**验证步骤**：
1. 打开 `examples/full-test.html`
2. 修改函数签名：`function add(a)` → `function add(a, b)`
3. 等待 500ms，观察行号旁是否出现紫色箭头
4. 点击箭头，观察是否展开 Diff 预览
5. 按 Tab，观察是否接受建议并跳到下一个

---

### 阶段 7：代码优化和压缩（2小时）

**目标**：将代码压缩到 2000 行以内

**步骤**：

1. **统计当前代码行数**
```bash
# 创建统计脚本
cat > count-lines.sh << 'EOF'
#!/bin/bash
echo "=== AI Code Assistant Line Count ==="
find ai-code-assistant -name "*.ts" -not -path "*/node_modules/*" | while read file; do
  lines=$(wc -l < "$file")
  echo "$lines  $file"
done | sort -rn
echo "---"
echo "Total: $(find ai-code-assistant -name "*.ts" -not -path "*/node_modules/*" -exec wc -l {} + | tail -1)"
EOF

chmod +x count-lines.sh
./count-lines.sh
```

2. **识别冗余代码**
   - 重复的类型定义
   - 未使用的工具函数
   - 过度的注释和日志

3. **压缩策略**
   - 合并相似的函数
   - 移除调试日志
   - 简化错误处理
   - 内联小函数

4. **重点优化模块**
   - `NESRenderer.ts`：从 400 行压缩到 200 行
   - `DiffEngine.ts`：从 200 行压缩到 50 行（只保留核心）
   - `SemanticAnalyzer.ts`：从 250 行压缩到 200 行

5. **验证功能完整性**
   - 运行所有测试页面
   - 确保功能无损

**测试目标**：
- ✅ 总代码行数 ≤ 2000 行
- ✅ 所有功能正常工作
- ✅ 无 TypeScript 错误

---

### 阶段 8：迁移验证（1小时）

**目标**：验证可移植性，确保可以轻松集成到其他项目

**步骤**：

1. **创建迁移测试项目**
```bash
mkdir test-migration
cd test-migration
npm init -y
npm install monaco-editor vite
```

2. **复制 `ai-code-assistant` 文件夹**
```bash
cp -r ../ai-code-assistant ./
```

3. **创建简单的测试页面**
```html
<!-- test-migration/index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Migration Test</title>
</head>
<body>
  <div id="container" style="width:100vw;height:100vh;"></div>
  <script type="module">
    import * as monaco from 'monaco-editor';
    import { initAICodeAssistant } from './ai-code-assistant/index.ts';
    
    const editor = monaco.editor.create(document.getElementById('container'), {
      value: 'function test() {}',
      language: 'typescript'
    });
    
    const assistant = initAICodeAssistant(monaco, editor, {
      fim: { endpoint: 'http://localhost:3000/api/fim/complete' },
      nes: { endpoint: 'http://localhost:3000/api/nes/predict' }
    });
    
    console.log('✅ Migration successful!');
  </script>
</body>
</html>
```

4. **启动并测试**
```bash
npx vite
# 访问 http://localhost:5173
```

**测试目标**：
- ✅ 复制文件夹后可以直接使用
- ✅ 无需修改任何代码
- ✅ FIM 和 NES 功能正常
- ✅ 无依赖问题

---

### 阶段 9：文档和交付（30分钟）

**目标**：编写使用文档和迁移指南

**步骤**：

1. **创建 README**
```markdown
<!-- ai-code-assistant/README.md -->
# AI Code Assistant

轻量级的 Monaco Editor AI 助手，支持 FIM（实时补全）和 NES（编辑预测）。

## 快速开始

1. 复制 `ai-code-assistant` 文件夹到你的项目
2. 安装依赖：`npm install monaco-editor fast-diff`
3. 使用：

\`\`\`typescript
import { initAICodeAssistant } from './ai-code-assistant';
import * as monaco from 'monaco-editor';

const editor = monaco.editor.create(container, { ... });

const assistant = initAICodeAssistant(monaco, editor, {
  fim: { endpoint: 'YOUR_FIM_API' },
  nes: { endpoint: 'YOUR_NES_API' }
});
\`\`\`

## 配置选项

...

## API 文档

...
```

2. **创建迁移指南**
```markdown
<!-- MIGRATION_GUIDE.md -->
# 从现有项目迁移到轻量化版本

## 对比

| 特性 | 旧版本 | 新版本 |
|------|--------|--------|
| 代码行数 | ~3000 行 | ~2000 行 |
| 文件数量 | 20+ 个 | 12 个 |
| 依赖 | Vue + Monaco | 仅 Monaco |

## 迁移步骤

1. 复制 `ai-code-assistant` 文件夹
2. 替换初始化代码
3. 更新 API 端点配置

## 功能对比

- ✅ 保留：FIM、NES、症状检测、语义分析
- ❌ 移除：右键菜单、Toast 通知、反馈收集
```

**测试目标**：
- ✅ README 清晰易懂
- ✅ 迁移指南完整
- ✅ 代码示例可运行

---

好的，我看到文档被截断了。让我分析一下需要补充的内容：

## 📋 需要补充的内容

### 1. **总体时间表完整版**（文档被截断）

需要补充阶段 4-9 的时间统计：

```markdown
| 阶段 | 时间 | 累计 | 可测试目标 |
|------|------|------|-----------|
| 4. 症状检测 | 2h | 6h | 症状检测工作 |
| 5. NES 引擎 | 2h | 8h | API 调用成功 |
| 6. NES 渲染 | 2h | 10h | Diff 预览显示 |
| 7. 代码优化 | 2h | 12h | 代码 ≤ 2000 行 |
| 8. 迁移验证 | 1h | 13h | 可移植性验证 |
| 9. 文档交付 | 0.5h | 13.5h | 文档完整 |
```

---

### 2. **依赖清单**

需要明确列出所有依赖：

```markdown
## 📦 依赖清单

### 必需依赖（Peer Dependencies）
- `monaco-editor`: ^0.45.0 - Monaco 编辑器核心
- `fast-diff`: ^1.3.0 - 文本 Diff 计算

### 开发依赖
- `typescript`: ^5.0.0
- `vite`: ^5.0.0

### 依赖说明
- **monaco-editor**: 必需，作为 peer dependency，由使用方提供
- **fast-diff**: 必需，用于 DiffEngine 计算代码差异
- 无其他运行时依赖，保持轻量
```

---

### 3. **配置接口完整定义**

需要补充完整的 TypeScript 接口定义：

```markdown
## 🔧 配置接口定义

\`\`\`typescript
// ai-code-assistant/types/index.d.ts

export interface AICodeAssistantConfig {
  // FIM 配置
  fim?: {
    enabled?: boolean;           // 默认 true
    endpoint: string;            // FIM API 端点（必需）
    debounceMs?: number;         // 防抖延迟，默认 300ms
    maxTokens?: number;          // 最大生成 token 数，默认 64
    temperature?: number;        // 温度参数，默认 0.2
  };
  
  // NES 配置
  nes?: {
    enabled?: boolean;           // 默认 true
    endpoint: string;            // NES API 端点（必需）
    debounceMs?: number;         // 防抖延迟，默认 500ms
    symptoms?: SymptomType[];    // 启用的症状类型，默认全部
    windowSize?: number;         // 代码窗口大小，默认 30 行
  };
  
  // 通用配置
  language?: string;             // 编程语言，默认 'typescript'
  enableSemanticAnalysis?: boolean; // 是否启用语义分析，默认 true
}

export type SymptomType = 
  | 'RENAME_FUNCTION'
  | 'RENAME_VARIABLE'
  | 'ADD_PARAMETER'
  | 'REMOVE_PARAMETER'
  | 'CHANGE_TYPE'
  | 'LOGIC_ERROR'
  | 'WORD_FIX';

export interface AICodeAssistant {
  dispose: () => void;
  // 可选的事件监听器
  onSymptomDetected?: (callback: (symptom: Symptom) => void) => void;
  onPrediction?: (callback: (predictions: Prediction[]) => void) => void;
}
\`\`\`
```

---

### 4. **API 接口规范**

需要明确后端 API 的请求/响应格式：

```markdown
## 🌐 API 接口规范

### FIM API

**端点**: `POST /api/fim/complete`

**请求体**:
\`\`\`json
{
  "prefix": "function add(a, b) {\n  return ",
  "suffix": ";\n}",
  "max_tokens": 64,
  "temperature": 0.2
}
\`\`\`

**响应体**:
\`\`\`json
{
  "completion": "a + b"
}
\`\`\`

---

### NES API

**端点**: `POST /api/nes/predict`

**请求体**:
\`\`\`json
{
  "codeWindow": "function add(a, b) {\n  return a + b;\n}\n\nconst result = add(1, 2);",
  "windowInfo": {
    "startLine": 1,
    "totalLines": 5
  },
  "diffSummary": "Function 'add' parameter added",
  "editHistory": [
    {
      "timestamp": 1234567890,
      "lineNumber": 1,
      "column": 15,
      "type": "insert",
      "oldText": "",
      "newText": ", b",
      "rangeLength": 0
    }
  ],
  "requestId": 1234567890
}
\`\`\`

**响应体**:
\`\`\`json
{
  "predictions": [
    {
      "targetLine": 5,
      "suggestionText": "const result = add(1, 2, 3);",
      "originalLineContent": "const result = add(1, 2);",
      "explanation": "Updated function call to match new signature",
      "confidence": 0.95
    }
  ]
}
\`\`\`
```

---

### 5. **故障排查指南**

需要添加常见问题和解决方案：

```markdown
## 🔧 故障排查指南

### 问题 1: Ghost Text 不显示

**症状**: 输入代码后没有灰色补全提示

**排查步骤**:
1. 检查 FIM API 是否可访问：`curl -X POST http://localhost:3000/api/fim/complete`
2. 打开浏览器 Network 面板，查看是否有 API 请求
3. 检查控制台是否有错误日志
4. 确认 `fim.enabled` 配置为 `true`

**常见原因**:
- API 端点配置错误
- CORS 跨域问题
- API 响应格式不正确

---

### 问题 2: 症状检测不工作

**症状**: 修改代码后没有触发 NES 预测

**排查步骤**:
1. 检查是否等待了足够的防抖时间（默认 500ms）
2. 查看控制台是否有 "Symptom detected" 日志
3. 确认 Monaco Model 已正确设置：`dispatcher.setModel(model)`
4. 检查 TypeScript Worker 是否初始化成功

**常见原因**:
- 防抖时间太短，用户还在快速输入
- 语义分析未启用
- 症状检测规则不匹配当前编辑

---

### 问题 3: Diff 预览不显示

**症状**: 点击 Glyph 箭头后没有展开预览

**排查步骤**:
1. 检查 NES API 是否返回了有效的 prediction
2. 查看 `prediction.originalLineContent` 是否存在
3. 检查 ViewZone 是否创建成功
4. 查看控制台是否有 Monaco 相关错误

**常见原因**:
- API 返回的数据格式不正确
- ViewZone 高度计算错误
- Diff Editor 创建失败

---

### 问题 4: Tab 键不接受补全

**症状**: 按 Tab 键后补全消失但代码未插入

**排查步骤**:
1. 检查 TabKeyHandler 是否正确注册
2. 查看是否有多个 Tab 键监听器冲突
3. 确认 Monaco Suggest Widget 优先级正确

**常见原因**:
- 快捷键冲突
- TabKeyHandler 逻辑错误
- Monaco 内置补全优先级问题
```

---

### 6. **性能优化建议**

需要添加性能相关的最佳实践：

```markdown
## ⚡ 性能优化建议

### 1. API 调用优化

**问题**: 频繁的 API 调用导致性能下降

**优化方案**:
- 增加防抖延迟（FIM: 300ms → 500ms）
- 启用请求缓存（相同输入返回缓存结果）
- 使用 AbortController 取消过期请求

\`\`\`typescript
// 示例：启用缓存
const assistant = initAICodeAssistant(monaco, editor, {
  fim: {
    endpoint: '...',
    enableCache: true,  // 启用缓存
    cacheSize: 100      // 缓存最近 100 个结果
  }
});
\`\`\`

---

### 2. 语义分析优化

**问题**: TypeScript Worker 初始化慢

**优化方案**:
- 延迟初始化 Worker（首次使用时才加载）
- 限制语义分析的使用场景（只在必要时启用）
- 使用 Web Worker 避免阻塞主线程

\`\`\`typescript
// 示例：按需启用语义分析
const assistant = initAICodeAssistant(monaco, editor, {
  nes: {
    endpoint: '...',
    enableSemanticAnalysis: false  // 禁用语义分析，使用正则匹配
  }
});
\`\`\`

---

### 3. 渲染性能优化

**问题**: Diff Editor 创建导致卡顿

**优化方案**:
- 复用 Diff Editor 实例（不每次创建新的）
- 限制 Diff 内容长度（超过 100 行截断）
- 使用虚拟滚动（大文件场景）

---

### 4. 内存管理

**问题**: 长时间使用后内存占用增加

**优化方案**:
- 定期清理编辑历史（保留最近 10 条）
- 及时 dispose 不用的 Diff Editor
- 清理过期的 ViewZone 和 Decoration

\`\`\`typescript
// 示例：定期清理
setInterval(() => {
  assistant.cleanup();  // 清理过期资源
}, 60000);  // 每分钟清理一次
\`\`\`
```

---

需要明确支持的版本范围：

```markdown
## 🔄 版本兼容性

### Monaco Editor 版本
- **推荐**: v0.45.0+
- **最低**: v0.40.0
- **已测试**: v0.45.0, v0.44.0, v0.43.0

### 浏览器支持
- Chrome/Edge: v90+
- Firefox: v88+
- Safari: v14+
- 不支持 IE

### TypeScript 版本
- **推荐**: v5.0+
- **最低**: v4.5+

### Node.js 版本（开发环境）
- **推荐**: v18+
- **最低**: v16+
```

-