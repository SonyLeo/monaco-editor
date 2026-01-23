<template>
    <div class="nes-editor-container">
        <div class="nes-header">
            <div class="title">
                <span class="icon">🤖</span>
                <span>NES Editor</span>
                <span class="badge">UI Demo</span>
            </div>
            <div class="status-bar">
                <div class="status-item">
                    <span class="label">Fast:</span>
                    <span class="value">Ready</span>
                </div>
                <div class="status-item">
                    <span class="label">Slow:</span>
                    <span class="value">{{ nesStatus }}</span>
                </div>
            </div>
        </div>
        
        <!-- UI 演示控制面板 -->
        <div class="demo-controls">
            <div class="demo-section">
                <span class="demo-label">📋 场景演示：</span>
                <button @click="showScenario1" class="demo-btn">场景1: 三元表达式错误</button>
                <button @click="showScenario2" class="demo-btn">场景2: 插入属性</button>
                <button @click="showScenario3" class="demo-btn">场景3: 关键字拼写</button>
                <button @click="showScenario3b" class="demo-btn">场景3B: 运算符错误</button>
            </div>
            <div class="demo-section">
                <span class="demo-label">🎨 状态切换：</span>
                <button @click="showState1" class="demo-btn state-btn">状态1: 建议出现</button>
                <button @click="showState2" class="demo-btn state-btn">状态2: 显示预览</button>
                <button @click="clearDemo" class="demo-btn clear-btn">清除演示</button>
            </div>
            <div class="demo-info">
                <span class="info-label">当前场景：</span>
                <span class="info-value">{{ currentScenario }}</span>
                <span class="info-label">｜ 当前状态：</span>
                <span class="info-value">{{ currentState }}</span>
            </div>
        </div>
        
        <div ref="editorContainer" class="monaco-container"></div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue';
import * as monaco from 'monaco-editor';
import { FastCompletionProvider } from '../core/engines/FastCompletionProvider';
import { NESController } from '../core/engines/NESController';
import { TabKeyHandler } from '../core/utils/TabKeyHandler';
import { SuggestionArbiter } from '../core/arbiter/SuggestionArbiter';
import ArrowTurnDownRightIcon from '../svgs/arrow-turn-down-right.svg?raw';

const editorContainer = ref<HTMLElement | null>(null);
const nesStatus = ref('Idle');
const editorRef = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);

// UI 演示状态
const currentScenario = ref('无');
const currentState = ref('无');

let fastProvider: FastCompletionProvider | null = null;
let nesController: NESController | null = null;
let tabKeyHandler: TabKeyHandler | null = null;

// 装饰器 ID 存储
let glyphDecorations: string[] = [];
let highlightDecorations: string[] = [];
let ghostTextDecorations: string[] = [];
let inlineArrowDecorations: string[] = [];  // 行内箭头装饰
let currentViewZoneId: string | null = null;  // ViewZone ID

onMounted(() => {
    if (!editorContainer.value) return;

    // 初始化 Monaco Editor
    const editor = monaco.editor.create(editorContainer.value, {
        value: `// Welcome to NES Editor (Next Edit Suggestions)
// Powered by DeepSeek Dual Engine

// Try editing this code:
function createUser(name: string) {
  console.log("Creating user:", name);
  return { name };
}

// Usage examples - try changing the function signature above
const user1 = createUser("Alice");
const user2 = createUser("Bob");
const user3 = createUser("Charlie");

// Tips:
// - Edit the function to add a new parameter
// - Wait 1.5 seconds after editing
// - NES will predict where else you need to update
// - Press Alt+Enter to navigate to suggestions
// - Press Tab to accept suggestions
`,
        language: 'typescript',
        theme: 'vs-dark',
        fontSize: 14,
        glyphMargin: true,
        automaticLayout: true,
        minimap: { enabled: false },
        suggestOnTriggerCharacters: true,
        quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
        },
    });

    editorRef.value = editor;

    // 初始化 Arbiter 并设置编辑器实例
    const arbiter = SuggestionArbiter.getInstance();
    arbiter.setEditor(editor);

    // 启动 Fast Engine (代码补全)
    fastProvider = new FastCompletionProvider();
    fastProvider.register();

    // 启动 Slow Engine (NES 预测)
    nesController = new NESController(editor);
    
    // 将 NESController 注册到 Arbiter
    arbiter.setNESController(nesController);

    // 初始化 Tab 键处理器
    tabKeyHandler = new TabKeyHandler(editor);

    // Tab 键：使用 addCommand 覆盖默认行为
    editor.addCommand(monaco.KeyCode.Tab, () => {
        const handled = tabKeyHandler?.handleTab();
        if (!handled) {
            // 优先级 5: 默认 Tab（缩进）
            editor.trigger('keyboard', 'tab', {});
        }
    }, '');

    // Esc 键处理
    editor.addCommand(monaco.KeyCode.Escape, () => {
        if (nesController?.hasActivePreview()) {
            // 优先关闭 NES 预览
            nesController.closePreview();
        } else {
            // 默认 Esc 行为
            editor.trigger('keyboard', 'cancelSelection', null);
        }
    });

    // Alt+Enter 键处理（跳转到 NES 建议）
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => {
        if (nesController?.hasActiveSuggestion()) {
            nesController.applySuggestion();
        }
    });

    // 🆕 Alt+N 键：跳过当前建议，跳到下一个
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyN, () => {
        if (nesController?.hasActiveSuggestion()) {
            nesController.skipSuggestion();
        }
    });

    // 🆕 Shift+Esc 键：拒绝所有剩余建议
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Escape, () => {
        if (nesController?.hasActiveSuggestion()) {
            nesController.rejectAllSuggestions();
        }
    });

    // 🆕 监听 Glyph Margin 点击事件
    editor.onMouseDown((e) => {
        // 检查是否点击了 Glyph Margin 区域
        if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
            const lineNumber = e.target.position?.lineNumber;
            if (!lineNumber) return;

            // 检查该行是否有 NES 建议
            const currentSuggestion = arbiter.getCurrentSuggestion();
            if (currentSuggestion?.type === 'NES' && currentSuggestion.targetLine === lineNumber) {
                console.log(`[NesEditor] Glyph Icon clicked at line ${lineNumber}`);
                
                // 右键点击：显示菜单
                if (e.event.rightButton) {
                    e.event.preventDefault();
                    const x = e.event.posx;
                    const y = e.event.posy;
                    
                    nesController?.showContextMenu(x, y, {
                        onNavigate: () => {
                            console.log('[NesEditor] Navigate to suggestion');
                            nesController?.jumpToSuggestion();
                        },
                        onAccept: () => {
                            console.log('[NesEditor] Accept suggestion');
                            nesController?.acceptSuggestion();
                        },
                        onDismiss: () => {
                            console.log('[NesEditor] Dismiss suggestion');
                            nesController?.skipSuggestion();
                        }
                    });
                } else {
                    // 左键点击：展开预览或接受建议
                    if (nesController?.hasActivePreview()) {
                        nesController.acceptSuggestion();
                    } else {
                        nesController?.applySuggestion();
                    }
                }
            }
        }
    });

    console.log('✅ NES Editor initialized');
});

// ==================== UI 演示函数 ====================

/**
 * 场景 1：三元表达式错误 (REPLACE - 整行替换)
 * UI 特征：整行红色背景 + 整行绿色预览
 * 对应截图：image-1.png
 */
function showScenario1() {
    if (!editorRef.value) return;
    
    currentScenario.value = '场景1: 三元表达式错误';
    currentState.value = '状态1: 建议出现';
    
    // 设置演示代码
    editorRef.value.setValue(`// 场景 1：三元表达式错误 (REPLACE - 整行替换)
// 这个函数应该返回较大值，但逻辑错误

function findMax(a: number, b: number): number {
  return a > b ? b : a;  // ❌ 错误：应该返回 a，但返回了 b
}

// 测试
console.log(findMax(10, 5));  // 期望 10，实际返回 5
`);
    
    // 显示状态 1：箭头指向第 4 行，错误标记在第 5 行
    showState1Internal(4, 5, '⚡', '修正逻辑错误：应该返回 a 而不是 b');
}

/**
 * 场景 2：插入属性 (INSERT)
 * UI 特征：整行蓝色背景 + 整行绿色预览（插入新行）
 * 对应截图：image-3.png（第一个建议，黄色灯泡）
 */
function showScenario2() {
    if (!editorRef.value) return;
    
    currentScenario.value = '场景2: 插入属性';
    currentState.value = '状态1: 建议出现';
    
    // 设置演示代码
    editorRef.value.setValue(`// 场景 2：插入属性 (INSERT)
// 用户将 Point 改为 Point3D，需要添加 z 属性

class Point3D {
  x: number;
  y: number;
  // 缺少 z 属性
}

// 使用
const point = new Point3D();
`);
    
    // 箭头指向第 5 行（x 属性），但预览应该在第 7 行（注释）之后
    showState1Internal(5, 5, '💡', '添加 z 属性以匹配 Point3D 类名');
}

/**
 * 场景 3：变量重命名 (REPLACE - 单词/部分替换)
 * 
 * UI 特征：
 * - 只高亮错误的单词/部分（不是整行）
 * - 使用行内箭头（↳）指向预览单词
 * - 预览单词显示在错误单词下方，带绿色背景
 * 
 * 适用场景：
 * - 关键字拼写错误：funct ion → function
 * - 变量重命名：name → userName
 * - 字符串值修正：'Hello' → 'Goodbye'
 * - 逻辑运算符错误：|| → &&
 * 
 * 对应截图：image-2.png（运算符）、image-4.png（变量重命名）
 */
function showScenario3() {
    if (!editorRef.value) return;
    
    currentScenario.value = '场景3: 关键字拼写';
    currentState.value = '状态1: 建议出现';
    
    // 设置演示代码（关键字拼写错误场景）
    editorRef.value.setValue(`// 场景 3：关键字拼写错误 (REPLACE - 单词替换)

funct ion farewell(name: string, message?: string): string {
  return \`\${message ?? 'Hello'}, \${name}!\`;
}
`);
    
    // 动态查找包含 'funct ion' 的行
    const model = editorRef.value.getModel();
    if (!model) return;
    
    const totalLines = model.getLineCount();
    let targetLine = 4;  // 默认第 4 行
    
    for (let i = 1; i <= totalLines; i++) {
        const lineContent = model.getLineContent(i);
        if (lineContent.includes('funct ion')) {
            targetLine = i;
            break;
        }
    }
    
    // 显示状态 1：行内箭头 + 红色高亮（动态定位到包含错误的行）
    showState1Internal(targetLine, targetLine, '⚡', "关键字拼写错误：'funct ion' → 'function'");
}

/**
 * 场景 3B：逻辑运算符错误 (REPLACE - 单词/部分替换)
 * 
 * UI 特征：只高亮运算符部分（|| 或 &&），不是整行
 * 对应截图：image-2.png
 */
function showScenario3b() {
    if (!editorRef.value) return;
    
    currentScenario.value = '场景3B: 运算符错误';
    currentState.value = '状态1: 建议出现';
    
    // 设置演示代码（逻辑运算符错误场景）
    editorRef.value.setValue(`// 场景 3B：逻辑运算符错误 (REPLACE - 部分替换)
// 条件判断错误：应该用 && 而不是 ||

function isValid(value: string): boolean {
  if (value !== null || value !== undefined) {
    return true;
  }
  return false;
}
`);
    
    // 动态查找包含 '||' 的行
    const model = editorRef.value.getModel();
    if (!model) return;
    
    const totalLines = model.getLineCount();
    let targetLine = 5;  // 默认第 5 行
    
    for (let i = 1; i <= totalLines; i++) {
        const lineContent = model.getLineContent(i);
        if (lineContent.includes('value !== null || value !== undefined')) {
            targetLine = i;
            break;
        }
    }
    
    // 显示状态 1：行内箭头 + 红色高亮（动态定位到包含错误的行）
    showState1Internal(targetLine, targetLine, '⚡', "逻辑运算符错误：'||' → '&&'");
}

/**
 * 状态 1：显示箭头 + 高亮
 */
function showState1() {
    if (currentScenario.value === '无') {
        alert('请先选择一个场景！');
        return;
    }
    
    currentState.value = '状态1: 建议出现';
    
    // 根据当前场景显示对应的状态 1
    if (currentScenario.value.includes('场景1')) {
        // 场景1：三元表达式错误（整行高亮）
        showState1Internal(4, 5, '⚡', '修正逻辑错误：应该返回 a 而不是 b');
    } else if (currentScenario.value.includes('场景2')) {
        // 场景2：插入属性（整行高亮）
        showState1Internal(5, 5, '💡', '添加 z 属性以匹配 Point3D 类名');
    } else if (currentScenario.value.includes('场景3')) {
        // 场景3：单词/部分替换（只在 showState2 中处理）
        // 这里只显示红色高亮
        if (!editorRef.value) return;
        const model = editorRef.value.getModel();
        if (!model) return;
        
        // 动态查找错误行
        const totalLines = model.getLineCount();
        let targetLine = 4;
        
        if (currentScenario.value.includes('3B')) {
            // 场景3B：运算符错误
            for (let i = 1; i <= totalLines; i++) {
                const lineContent = model.getLineContent(i);
                if (lineContent.includes('||')) {
                    targetLine = i;
                    break;
                }
            }
        } else {
            // 场景3：关键字拼写
            for (let i = 1; i <= totalLines; i++) {
                const lineContent = model.getLineContent(i);
                if (lineContent.includes('funct ion')) {
                    targetLine = i;
                    break;
                }
            }
        }
        
        clearDecorations();
        
        highlightDecorations = editorRef.value.deltaDecorations([], [{
            range: new monaco.Range(targetLine, 1, targetLine, model.getLineMaxColumn(targetLine)),
            options: {
                className: 'nes-demo-error-highlight',
                isWholeLine: true
            }
        }]);
        
        editorRef.value.revealLineInCenter(targetLine);
    }
}

/**
 * 状态 1 内部实现
 * @param arrowLine 箭头所在行
 * @param errorLine 错误标记所在行
 */
function showState1Internal(arrowLine: number, errorLine: number, icon: string, hoverMessage: string) {
    if (!editorRef.value) return;
    
    clearDecorations();
    
    const model = editorRef.value.getModel();
    if (!model) return;
    
    // 1. Glyph Icon（紫色箭头图标）- 指向箭头行
    glyphDecorations = editorRef.value.deltaDecorations([], [{
        range: new monaco.Range(arrowLine, 1, arrowLine, 1),
        options: {
            glyphMarginClassName: `nes-demo-glyph ${icon === '⚡' ? 'replace' : 'insert'}`,
            glyphMarginHoverMessage: { value: `**NES 建议**\n\n${hoverMessage}` }
        }
    }]);
    
    // 2. 错误标记 - 整行背景
    if (icon === '⚡') {
        // REPLACE 模式：红色高亮（整行背景）
        highlightDecorations = editorRef.value.deltaDecorations([], [{
            range: new monaco.Range(errorLine, 1, errorLine, model.getLineMaxColumn(errorLine)),
            options: {
                className: 'nes-demo-error-highlight',
                isWholeLine: true
            }
        }]);
    } else {
        // INSERT 模式：蓝色高亮（整行背景）
        highlightDecorations = editorRef.value.deltaDecorations([], [{
            range: new monaco.Range(errorLine, 1, errorLine, model.getLineMaxColumn(errorLine)),
            options: {
                className: 'nes-demo-insert-highlight',
                isWholeLine: true
            }
        }]);
    }
    
    // 跳转到箭头行
    editorRef.value.revealLineInCenter(arrowLine);
}

/**
 * 状态 2：显示灰色文本预览
 */
function showState2() {
    if (currentScenario.value === '无') {
        alert('请先选择一个场景！');
        return;
    }
    
    currentState.value = '状态2: 显示预览';
    
    if (!editorRef.value) return;
    
    const model = editorRef.value.getModel();
    if (!model) return;
    
    // 根据当前场景显示对应的预览
    if (currentScenario.value.includes('场景1')) {
        // 场景1：三元表达式错误 - REPLACE 模式（整行替换）
        const arrowLine = 4;
        const errorLine = 5;
        
        // 获取错误行的完整内容（包括缩进）
        const errorLineContent = model.getLineContent(errorLine);
        const leadingSpaces = errorLineContent.match(/^\s*/)?.[0] || '';
        
        // 构建建议文本（保持相同的缩进）
        const suggestionText = `${leadingSpaces}return a > b ? a : b;`;
        
        // 保持状态 1 的装饰（箭头 + 红色高亮）
        showState1Internal(arrowLine, errorLine, '⚡', '修正逻辑错误：应该返回 a 而不是 b');
        
        // 使用 ViewZone 在错误行下方插入预览行
        editorRef.value.changeViewZones((changeAccessor) => {
            const domNode = document.createElement('div');
            domNode.className = 'nes-demo-preview-zone';
            domNode.textContent = suggestionText;
            
            currentViewZoneId = changeAccessor.addZone({
                afterLineNumber: errorLine,  // 在错误行之后插入（即第 5 行下方）
                heightInLines: 1,
                domNode: domNode
            });
        });
        
    } else if (currentScenario.value.includes('场景2')) {
        // 场景2：插入属性 - INSERT 模式
        const arrowLine = 7;  // 箭头指向第 5 行
        const insertAfterLine = 7;  // 预览插入在第 7 行之后
        
        // 获取第 6 行（y: number;）的缩进作为参考
        const referenceLineContent = model.getLineContent(6);
        const leadingSpaces = referenceLineContent.match(/^\s*/)?.[0] || '';
        const suggestionText = `${leadingSpaces}z: number;`;
        
        // 保持状态 1 的装饰（箭头指向第 5 行）
        showState1Internal(arrowLine, arrowLine, '💡', '添加 z 属性以匹配 Point3D 类名');
        
        // 使用 ViewZone 在第 7 行之后插入预览行
        editorRef.value.changeViewZones((changeAccessor) => {
            const domNode = document.createElement('div');
            domNode.className = 'nes-demo-preview-zone-insert';
            domNode.textContent = suggestionText;
            
            currentViewZoneId = changeAccessor.addZone({
                afterLineNumber: insertAfterLine,  // 在第 7 行（注释）之后插入
                heightInLines: 1,
                domNode: domNode
            });
        });
        
    } else if (currentScenario.value.includes('场景3')) {
        // 场景3：单词/部分替换 - REPLACE 模式（使用行内箭头）
        // 动态查找错误行
        const totalLines = model.getLineCount();
        let errorLine = 4;
        let errorWord = '';
        let correctWord = '';
        let searchPattern = '';
        
        if (currentScenario.value.includes('3B')) {
            // 场景3B：运算符错误
            searchPattern = '||';
            errorWord = '||';
            correctWord = '&&';
            
            for (let i = 1; i <= totalLines; i++) {
                const lineContent = model.getLineContent(i);
                if (lineContent.includes('value !== null || value !== undefined')) {
                    errorLine = i;
                    break;
                }
            }
        } else {
            // 场景3：关键字拼写
            searchPattern = 'funct ion';
            errorWord = 'funct ion';
            correctWord = 'function';
            
            for (let i = 1; i <= totalLines; i++) {
                const lineContent = model.getLineContent(i);
                if (lineContent.includes('funct ion')) {
                    errorLine = i;
                    break;
                }
            }
        }
        
        const errorLineContent = model.getLineContent(errorLine);
        
        // 计算错误单词在行中的位置
        const wordStartIndex = errorLineContent.indexOf(errorWord);
        const wordEndIndex = wordStartIndex + errorWord.length;
        const wordStartColumn = wordStartIndex + 1;  // Monaco 列从 1 开始
        const wordEndColumn = wordEndIndex + 1;
        
        // 清除装饰
        clearDecorations();
        
        // 只高亮错误的单词/部分
        highlightDecorations = editorRef.value.deltaDecorations([], [{
            range: new monaco.Range(errorLine, wordStartColumn, errorLine, wordEndColumn),
            options: {
                inlineClassName: 'nes-demo-error-word-highlight'  // 只高亮单词
            }
        }]);
        
        // 使用 ViewZone 插入预览行（包含箭头和预览单词）
        editorRef.value.changeViewZones((changeAccessor) => {
            const domNode = document.createElement('div');
            domNode.className = 'nes-demo-preview-zone-word-only';
            
            // 计算箭头和预览单词的位置（与错误单词对齐）
            const leadingSpaces = ' '.repeat(wordStartIndex);
            
            // 创建前导空格
            const spacingSpan = document.createElement('span');
            spacingSpan.textContent = leadingSpaces;
            
            // 创建箭头（使用 SVG）
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'nes-demo-arrow';
            arrowSpan.innerHTML = ArrowTurnDownRightIcon;
            
            // 创建预览单词（带背景）
            const previewSpan = document.createElement('span');
            previewSpan.className = 'nes-demo-preview-word-with-bg';
            previewSpan.textContent = correctWord;
            
            domNode.appendChild(spacingSpan);
            domNode.appendChild(arrowSpan);
            domNode.appendChild(previewSpan);
            
            currentViewZoneId = changeAccessor.addZone({
                afterLineNumber: errorLine,
                heightInLines: 1,
                domNode: domNode
            });
        });
        
        // 跳转到该行
        editorRef.value.revealLineInCenter(errorLine);
    }
}

/**
 * 清除所有装饰
 */
function clearDecorations() {
    if (!editorRef.value) return;
    
    if (glyphDecorations.length > 0) {
        editorRef.value.deltaDecorations(glyphDecorations, []);
        glyphDecorations = [];
    }
    
    if (highlightDecorations.length > 0) {
        editorRef.value.deltaDecorations(highlightDecorations, []);
        highlightDecorations = [];
    }
    
    if (ghostTextDecorations.length > 0) {
        editorRef.value.deltaDecorations(ghostTextDecorations, []);
        ghostTextDecorations = [];
    }
    
    if (inlineArrowDecorations.length > 0) {
        editorRef.value.deltaDecorations(inlineArrowDecorations, []);
        inlineArrowDecorations = [];
    }
    
    // 清除 ViewZone
    if (currentViewZoneId) {
        editorRef.value.changeViewZones((changeAccessor) => {
            if (currentViewZoneId) {
                changeAccessor.removeZone(currentViewZoneId);
                currentViewZoneId = null;
            }
        });
    }
}

/**
 * 清除演示
 */
function clearDemo() {
    clearDecorations();
    currentScenario.value = '无';
    currentState.value = '无';
    
    if (editorRef.value) {
        editorRef.value.setValue(`// NES UI 演示
// 点击上方按钮查看不同场景的 UI 效果

// 提示：
// 1. 选择一个场景（逻辑错误、插入属性、变量重命名）
// 2. 点击"状态1"查看箭头 + 蓝色高亮
// 3. 点击"状态2"查看灰色文本预览
// 4. 点击"清除演示"重置
`);
    }
}

onBeforeUnmount(() => {
    fastProvider?.dispose();
    nesController?.dispose();
    editorRef.value?.dispose();
});
</script>

<style scoped>
.nes-editor-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background-color: #1e1e1e;
    color: #d4d4d4;
}

.nes-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-bottom: 1px solid #3e3e3e;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
}

.icon {
    font-size: 1.5rem;
}

.badge {
    font-size: 0.7rem;
    background: rgba(255, 255, 255, 0.2);
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
}

.status-bar {
    display: flex;
    gap: 1.5rem;
    font-size: 0.85rem;
}

.status-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
}

.label {
    color: rgba(255, 255, 255, 0.7);
}

.value {
    color: #4fc3f7;
    font-weight: 500;
}

.monaco-container {
    flex: 1;
    overflow: hidden;
}

/* ==================== UI 演示控制面板样式 ==================== */
.demo-controls {
    background: #252526;
    border-bottom: 1px solid #3e3e3e;
    padding: 0.75rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.demo-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.demo-label {
    font-size: 0.9rem;
    color: #cccccc;
    font-weight: 500;
    min-width: 100px;
}

.demo-btn {
    padding: 0.4rem 1rem;
    font-size: 0.85rem;
    border: 1px solid #3e3e3e;
    background: #3c3c3c;
    color: #cccccc;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
}

.demo-btn:hover {
    background: #505050;
    border-color: #007acc;
    color: #ffffff;
}

.demo-btn.state-btn {
    background: #0e639c;
    border-color: #007acc;
    color: #ffffff;
}

.demo-btn.state-btn:hover {
    background: #1177bb;
}

.demo-btn.clear-btn {
    background: #5a1d1d;
    border-color: #8b3a3a;
    color: #ffffff;
}

.demo-btn.clear-btn:hover {
    background: #7a2d2d;
}

.demo-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    padding: 0.5rem 1rem;
    background: #1e1e1e;
    border-radius: 4px;
    border: 1px solid #3e3e3e;
}

.info-label {
    color: #858585;
}

.info-value {
    color: #4fc3f7;
    font-weight: 500;
}

/* ==================== NES UI 演示装饰样式 ==================== */

/* Glyph Icon（紫色箭头图标 - 对齐 GitHub Copilot） */
:deep(.nes-demo-glyph.replace::before) {
    content: '→';
    font-size: 18px;
    font-weight: bold;
    color: #c586c0;  /* 紫色箭头 */
    cursor: pointer;
}

:deep(.nes-demo-glyph.insert::before) {
    content: '→';
    font-size: 18px;
    font-weight: bold;
    color: #4ec9b0;  /* 青色箭头（INSERT 模式） */
    cursor: pointer;
}

/* 红色高亮（REPLACE 模式 - 错误标记，整行背景） */
:deep(.nes-demo-error-highlight) {
    background-color: rgba(255, 0, 0, 0.15) !important;  /* 红色背景 */
}

/* 红色高亮（只高亮单词，变量重命名场景） */
:deep(.nes-demo-error-word-highlight) {
    background-color: rgba(255, 0, 0, 0.25) !important;  /* 红色背景 */
    border-radius: 3px;
    padding: 2px 4px;
    border: 1px solid rgba(255, 0, 0, 0.3);  /* 红色边框 */
}

/* 蓝色高亮（INSERT 模式 - 插入位置，整行背景） */
:deep(.nes-demo-insert-highlight) {
    background-color: rgba(0, 122, 204, 0.1) !important;  /* 蓝色背景 */
}

/* 行内箭头（变量重命名场景） */
:deep(.nes-demo-inline-arrow) {
    color: #c586c0 !important;  /* 紫色箭头 */
    font-size: 14px;
    font-weight: bold;
    margin-left: 4px;
}

/* ViewZone 预览行（带箭头，变量重命名场景） */
:deep(.nes-demo-preview-zone-with-arrow) {
    background-color: rgba(0, 255, 0, 0.08) !important;  /* 浅绿色背景 */
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 14px;
    line-height: 19px;
    padding-left: 0;
    margin-left: 28px;  /* 对齐代码内容 */
    white-space: pre;
}

/* 箭头样式（SVG） */
:deep(.nes-demo-arrow) {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
}

:deep(.nes-demo-arrow svg) {
    color: #ffffff;  
    width: 16px;
    height: 16px;
    vertical-align: middle;
}

/* 预览单词样式 */
:deep(.nes-demo-preview-word) {
    color: #858585 !important;  /* 灰色文本 */
    font-style: italic;
}

/* 预览单词样式（带背景，变量重命名场景） */
:deep(.nes-demo-preview-word-with-bg) {
    background-color: rgba(0, 255, 0, 0.15); 
    color: #667de8;
    font-style: italic;
    border-radius: 3px;
    padding: 2px 4px;
    margin-left: 4px;
    border: 1px solid rgba(0, 255, 0, 0.25);  
}

/* ViewZone 预览行（只显示单词，变量重命名场景） */
:deep(.nes-demo-preview-zone-word-only) {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 14px;
    line-height: 19px;
    padding-left: 0;
    margin-top: 4px;
    margin-left: 20px;
    white-space: pre;
}

/* ViewZone 预览行（REPLACE 模式 - 灰色文本，整行背景） */
:deep(.nes-demo-preview-zone) {
    background-color: rgba(0, 255, 0, 0.08) !important;  /* 浅绿色背景 */
    color: #858585 !important;  /* 灰色文本 */
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 14px;
    line-height: 19px;
    padding-left: 0;  
    margin-left: 0; 
    font-style: italic;
    white-space: pre;  /* 保留空白字符（缩进） */
}

/* ViewZone 预览行（INSERT 模式 - 灰色文本，整行背景） */
:deep(.nes-demo-preview-zone-insert) {
    background-color: rgba(0, 255, 0, 0.08) !important;  /* 浅绿色背景 */
    color: #858585 !important;  /* 灰色文本 */
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 14px;
    line-height: 19px;
    padding-left: 0; 
    margin-left: 0;  
    font-style: italic;
    white-space: pre;  /* 保留空白字符（缩进） */
}

/* 灰色文本预览（备用 - 如果不使用 ViewZone） */
:deep(.nes-demo-ghost-text) {
    color: #858585 !important;  /* 灰色文本 */
    opacity: 0.8 !important;
    font-style: italic !important;
    white-space: pre !important;
}

/* 灰色文本预览（INSERT 模式 - 备用） */
:deep(.nes-demo-ghost-text-insert) {
    color: #858585 !important;  /* 灰色文本 */
    opacity: 0.8 !important;
    font-style: italic !important;
    white-space: pre !important;
}

/* NES 内嵌 DiffEditor 容器样式 - 由 NESRenderer 统一管理 */

/* 增强的箭头图标样式 - 由 NESRenderer 统一管理 */
</style>
