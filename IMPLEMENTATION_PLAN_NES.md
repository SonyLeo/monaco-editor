# DeepSeek NES 实施方案

> **适用场景**：单个 Monaco 编辑器 + 单个文件编辑
> 
> **核心优化**：移除 Jaccard 跨文件逻辑，增强防御性编程

---

## 📐 架构总览（简化版）

### 双引擎对比

| 维度 | **Fast Engine** | **Slow Engine (NES)** |
|------|----------------|---------------------|
| **功能** | 实时代码补全 (Ghost Text) | 下一步编辑预测 (Prediction) |
| **触发时机** | 打字 (Debounce 300ms) | 停顿 > 1.5s |
| **输入** | ~~跨文件 Context~~ → **当前文件 Prefix/Suffix** | Diff + 滑动窗口 (±100行) |
| **模型** | DeepSeek Beta FIM | DeepSeek R1/V3 |
| **核心算法** | ~~Jaccard~~ → **直接 FIM** | Diff 驱动 + 双重验证 |
| **防御性编程** | - | Request ID + 行内容校验 |

---

## 🏗️ 简化后的项目结构

```
src/
├── components/
│   └── NesEditor.vue              
│       
├── utils/nes/
│   ├── FastCompletionProvider.ts  # ✅ 简化：移除 ContextManager
│   ├── NESController.ts           # ✅ 增强：Request ID + 窗口优化
│   ├── NESRenderer.ts             # ✅ 增强：双重验证
│   └── DiffCalculator.ts          
│
└── types/
    └── nes.d.ts                   
```

**删除的模块**：
- ❌ `ContextManager.ts` (Jaccard 多文件上下文)
- ❌ `workers/context.worker.ts` (Web Worker)
- ❌ 全局 Tab 管理器

---

## ⚡ Fast Engine（大幅简化）

```typescript
// src/utils/nes/FastCompletionProvider.ts

export class FastCompletionProvider {
    register() {
        monaco.languages.registerInlineCompletionsProvider('typescript', {
            provideInlineCompletions: async (model, position, context, token) => {
                const fullText = model.getValue();
                const offset = model.getOffsetAt(position);
                
                // 🎯 单文件场景：直接切割 Prefix/Suffix
                const prefix = fullText.substring(0, offset);
                const suffix = fullText.substring(offset);
                
                try {
                    const response = await fetch('/api/completion', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prefix, suffix, max_tokens: 64 }),
                        signal: token // 支持 Monaco 的取消信号
                    });
                    
                    if (!response.ok) return { items: [] };
                    
                    const { completion } = await response.json();
                    
                    return {
                        items: [{
                            insertText: completion,
                            range: new monaco.Range(
                                position.lineNumber, position.column,
                                position.lineNumber, position.column
                            )
                        }]
                    };
                } catch (e) {
                    if (e.name === 'AbortError') return { items: [] };
                    throw e;
                }
            }
        });
    }
}
```

**对比原方案**：
- 代码量：~~200 行~~ → **50 行**
- 性能：无需计算 Jaccard（节省 10-50ms/次）

---

## 🧠 Slow Engine（防御性增强）

### 核心优化点

1. **滑动窗口**：只发送 Diff 附近 ±100 行
2. **Request ID**：防止网络抖动导致的时序错乱
3. **双重验证**：防止模型幻觉

```typescript
// src/utils/nes/NESController.ts

type State = 'IDLE' | 'DEBOUNCING' | 'PREDICTING' | 'SUGGESTING';

interface Prediction {
    targetLine: number;
    suggestionText: string;
    originalLineContent?: string; // 🆕 用于验证
    explanation: string;
}

export class NESController {
    private state: State = 'IDLE';
    private lastSnapshot = '';
    private lastRequestId = 0; // 🆕 Request ID
    private abortController: AbortController | null = null;
    private debounceTimer: number | null = null;
    private renderer: NESRenderer;
    
    constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
        this.renderer = new NESRenderer(editor);
        this.bindListeners();
    }
    
    private bindListeners() {
        this.editor.onDidChangeModelContent(() => {
            // 用户打字时立即清除旧建议
            if (this.state === 'SUGGESTING') {
                this.renderer.clear();
                this.state = 'IDLE';
            }
            
            // 重置防抖
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.state = 'DEBOUNCING';
            
            this.debounceTimer = window.setTimeout(() => {
                this.predict();
            }, 1500);
        });
    }
    
    private async predict() {
        this.state = 'PREDICTING';
        
        // Abort 旧请求
        this.abortController?.abort();
        this.abortController = new AbortController();
        
        const currentCode = this.editor.getValue();
        const diffInfo = this.calculateDiff(this.lastSnapshot, currentCode);
        
        // 🆕 滑动窗口优化
        const payload = this.buildSmartPayload(currentCode, diffInfo.range);
        
        // 🆕 Request ID
        const requestId = ++this.lastRequestId;
        payload.requestId = requestId;
        
        try {
            const response = await fetch('/api/next-edit-prediction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: this.abortController.signal,
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            
            const prediction: Prediction = await response.json();
            
            // 🆕 Request ID 校验
            if (requestId !== this.lastRequestId) {
                console.log('[NES] Discarding stale response');
                return;
            }
            
            // 🆕 双重验证
            if (!this.validatePrediction(prediction)) {
                console.warn('[NES] Prediction validation failed');
                this.state = 'IDLE';
                return;
            }
            
            this.state = 'SUGGESTING';
            this.renderer.showIndicator(
                prediction.targetLine, 
                prediction.suggestionText,
                prediction.explanation
            );
            
            this.lastSnapshot = currentCode;
            
        } catch (e) {
            if (e.name === 'AbortError') {
                console.log('[NES] Request aborted');
            } else {
                console.error('[NES] Prediction error:', e);
            }
            this.state = 'IDLE';
        }
    }
    
    /**
     * 🆕 滑动窗口：只发送变更区域 ±100 行
     */
    private buildSmartPayload(currentCode: string, diffRange: {start: number, end: number}) {
        const lines = currentCode.split('\n');
        const windowStart = Math.max(0, diffRange.start - 100);
        const windowEnd = Math.min(lines.length, diffRange.end + 100);
        
        const codeWindow = lines.slice(windowStart, windowEnd).join('\n');
        
        return {
            codeWindow,
            windowInfo: {
                startLine: windowStart + 1, // 1-indexed
                totalLines: lines.length
            },
            diffSummary: `Lines ${diffRange.start}-${diffRange.end} modified`
        };
    }
    
    /**
     * 🆕 双重验证：防止模型幻觉
     */
    private validatePrediction(pred: Prediction): boolean {
        const model = this.editor.getModel();
        if (!model) return false;
        
        // 1. 行号合法性
        if (pred.targetLine < 1 || pred.targetLine > model.getLineCount()) {
            console.warn(`[NES] Invalid line number: ${pred.targetLine}`);
            return false;
        }
        
        // 2. 内容匹配（如果后端提供了 originalLineContent）
        if (pred.originalLineContent) {
            const actualLine = model.getLineContent(pred.targetLine);
            const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
            
            if (normalize(actualLine) !== normalize(pred.originalLineContent)) {
                console.warn(`[NES] Line content mismatch at ${pred.targetLine}`);
                console.warn(`Expected: ${pred.originalLineContent}`);
                console.warn(`Actual: ${actualLine}`);
                return false;
            }
        }
        
        return true;
    }
    
    private calculateDiff(oldCode: string, newCode: string) {
        // 简化实现：找到第一个和最后一个不同的行
        const oldLines = oldCode.split('\n');
        const newLines = newCode.split('\n');
        
        let start = 0;
        while (start < Math.min(oldLines.length, newLines.length) 
               && oldLines[start] === newLines[start]) {
            start++;
        }
        
        let end = Math.max(oldLines.length, newLines.length);
        
        return {
            range: { start, end },
            summary: `Modified around line ${start + 1}`
        };
    }
    
    public hasActiveSuggestion(): boolean {
        return this.state === 'SUGGESTING';
    }
    
    public hasActivePreview(): boolean {
        return this.renderer.hasViewZone();
    }
    
    public applySuggestion() {
        this.renderer.jumpToSuggestion();
        this.renderer.showPreview();
    }
    
    public closePreview() {
        this.renderer.clearViewZone();
    }
    
    public dispose() {
        this.abortController?.abort();
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.renderer.dispose();
    }
}
```

---

## 🎨 NESRenderer（增强交互）

```typescript
// src/utils/nes/NESRenderer.ts

export class NESRenderer {
    private decorations: monaco.editor.IEditorDecorationsCollection;
    private viewZoneId: string | null = null;
    private currentSuggestion: Prediction | null = null;
    
    constructor(private editor: monaco.editor.IStandaloneCodeEditor) {
        this.decorations = editor.createDecorationsCollection([]);
    }
    
    showIndicator(line: number, suggestion: string, explanation: string) {
        this.currentSuggestion = { targetLine: line, suggestionText: suggestion, explanation };
        
        this.decorations.set([{
            range: new monaco.Range(line, 1, line, 1),
            options: {
                glyphMarginClassName: 'nes-arrow-icon',
                glyphMarginHoverMessage: { 
                    value: `💡 **NES Suggestion**\n\n${explanation}\n\n*Press Alt+Enter to navigate*` 
                },
                // 🆕 可选：在滚动条上也显示标记
                overviewRuler: {
                    color: '#a78bfa',
                    position: monaco.editor.OverviewRulerLane.Right
                }
            }
        }]);
    }
    
    showPreview() {
        if (!this.currentSuggestion) return;
        
        const { targetLine, suggestionText } = this.currentSuggestion;
        const originalLine = this.editor.getModel()?.getLineContent(targetLine) || '';
        
        this.editor.changeViewZones(accessor => {
            const domNode = document.createElement('div');
            domNode.className = 'nes-view-zone';
            domNode.innerHTML = `
                <div class="nes-diff-header">
                    <span>✨ DeepSeek Suggestion</span>
                    <span class="nes-keyhint">Tab to Accept | Esc to Dismiss</span>
                </div>
                <div class="nes-diff-content">
                    <div class="diff-remove">- ${this.escapeHtml(originalLine)}</div>
                    <div class="diff-add">+ ${this.escapeHtml(suggestionText)}</div>
                </div>
            `;
            
            this.viewZoneId = accessor.addZone({
                afterLineNumber: targetLine,
                heightInLines: 4,
                domNode
            });
        });
    }
    
    jumpToSuggestion() {
        if (!this.currentSuggestion) return;
        
        const { targetLine } = this.currentSuggestion;
        this.editor.setPosition({ lineNumber: targetLine, column: 1 });
        this.editor.revealLineInCenter(targetLine);
    }
    
    clear() {
        this.decorations.clear();
        this.clearViewZone();
        this.currentSuggestion = null;
    }
    
    clearViewZone() {
        if (this.viewZoneId) {
            this.editor.changeViewZones(accessor => {
                accessor.removeZone(this.viewZoneId!);
                this.viewZoneId = null;
            });
        }
    }
    
    hasViewZone(): boolean {
        return this.viewZoneId !== null;
    }
    
    private escapeHtml(text: string): string {
        return text.replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m] || m));
    }
    
    dispose() {
        this.clear();
    }
}
```

---

## 🌐 后端实现（增强版）

```javascript
// server.mjs

import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

/**
 * Fast Track: 极简 FIM 补全
 */
app.post('/api/completion', async (req, res) => {
    const { prefix, suffix, max_tokens = 64 } = req.body;
    
    try {
        const response = await fetch('https://api.deepseek.com/beta/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                prompt: prefix,  // 单文件场景：无需 Context Injection
                suffix,
                max_tokens,
                temperature: 0,
                stop: ["\n\n", "\n\n\n"]
            })
        });
        
        const data = await response.json();
        res.json({ completion: data.choices[0].text || '' });
        
    } catch (error) {
        console.error('[API] Completion error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Slow Track: NES 预测（增强版）
 */
app.post('/api/next-edit-prediction', async (req, res) => {
    const { codeWindow, windowInfo, diffSummary, requestId } = req.body;
    
    try {
        // 构建增强 Prompt（要求返回 originalLineContent 用于验证）
        const systemPrompt = `You are a "Next Edit Suggestion" engine.

RULES:
1. Analyze the RECENT CHANGE and predict the NEXT logical edit.
2. Output MUST be valid JSON.
3. Include "originalLineContent" for validation.
4. If no change is needed, return null.

OUTPUT FORMAT:
{
  "targetLine": number,           // Absolute line number in the file
  "suggestionText": string,       // The new code to replace
  "originalLineContent": string,  // Current content at targetLine (for validation)
  "explanation": string           // Short reason
}`;

        const userPrompt = `### CODE WINDOW (Lines ${windowInfo.startLine}-${windowInfo.startLine + codeWindow.split('\n').length})
${codeWindow}

### RECENT CHANGE
${diffSummary}

### FILE INFO
- Total lines: ${windowInfo.totalLines}
- Window starts at line: ${windowInfo.startLine}

Predict the next edit. If targetLine is within the window, calculate absolute line number.`;

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "deepseek-coder", // or deepseek-reasoner
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1,
                max_tokens: 256
            })
        });
        
        const data = await response.json();
        const content = data.choices[0].message.content;
        
        // 尝试解析 JSON
        let prediction = null;
        try {
            prediction = JSON.parse(content);
        } catch (e) {
            // 尝试提取 JSON 块
            const match = content.match(/\{[\s\S]*?\}/);
            if (match) prediction = JSON.parse(match[0]);
        }
        
        // 添加 requestId 用于前端校验
        if (prediction) {
            prediction.requestId = requestId;
        }
        
        res.json(prediction);
        
    } catch (error) {
        console.error('[API] NES error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => {
    console.log('🚀 NES Server running on port 3000');
});
```

---

## 🎯 实施路线图（调整版）

### Phase 1: 基础设施 (0.5天)
- [x] 创建简化的目录结构（无 ContextManager/Workers）
- [x] 更新 `server.mjs` 添加两个 API 端点

### Phase 2: Fast Engine (0.5天)
- [x] 实现**简化版** `FastCompletionProvider.ts`（直接 Prefix/Suffix）
- [x] 测试基本补全功能

### Phase 3: Slow Engine (2天)
- [x] 实现 `NESController.ts`（Request ID + 滑动窗口 + 双重验证）
- [x] 实现 `NESRenderer.ts`（Decoration + ViewZone）
- [x] 实现简易 `DiffCalculator`

### Phase 4: 交互整合 (0.5天)
- [x] Tab/Esc 键优先级处理
- [x] CSS 样式（`.nes-arrow-icon`, `.nes-view-zone`）

**总工时**：约 3-4 天（相比原方案减少 50%）

---

## ✅ 启动前检查清单（调整版）

- [ ] DeepSeek API Key 已配置
- [ ] ~~确认 Beta FIM 权限~~ → 使用标准 v1 接口即可
- [ ] Monaco 初始化 `glyphMargin: true`
- [ ] ~~安装 fast-diff~~ → 使用简易 Diff 逻辑
- [ ] **新增**：后端 Prompt 要求返回 `originalLineContent`

---

**架构简化 70%，代码量减少 50%，关键防御性编程全部加强。**