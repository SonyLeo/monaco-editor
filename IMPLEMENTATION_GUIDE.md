# Monaco AI Assistant 优化实施指南

> 本文档提供完整的分阶段实施方案，用于指导项目优化改造
> 
> 最后更新：2026-02-01

---

## 📋 目录

- [总体规划](#总体规划)
- [阶段 0：准备工作](#阶段-0准备工作)
- [阶段 1：Parser 替换（问题 2）](#阶段-1parser-替换问题-2)
- [阶段 2：触发时机优化验证（问题 1）](#阶段-2触发时机优化验证问题-1)
- [阶段 3：触发时机优化实施（问题 1）](#阶段-3触发时机优化实施问题-1)
- [阶段 4：自适应优化](#阶段-4自适应优化)
- [验收标准](#验收标准)
- [回滚方案](#回滚方案)

---

## 总体规划

### 实施顺序

```
阶段 0: 准备工作 (1 天)
  ↓
阶段 1: Parser 替换 (1-2 周) ← 优先，风险低
  ↓
阶段 2: 触发时机验证 (1 周) ← 并行进行
  ↓
阶段 3: 触发时机实施 (1 周)
  ↓
阶段 4: 自适应优化 (1-2 周) ← 可选
```

### 时间规划

| 阶段 | 工作量 | 风险 | 优先级 |
|------|--------|------|--------|
| 阶段 0 | 1 天 | 低 | P0 |
| 阶段 1 | 1-2 周 | 中低 | P0 |
| 阶段 2 | 1 周 | 中 | P1 |
| 阶段 3 | 1 周 | 中高 | P1 |
| 阶段 4 | 1-2 周 | 低 | P2 |

### 人员分工建议

**单人团队**：按顺序执行（4-6 周）
**双人团队**：阶段 1 和阶段 2 并行（3-4 周）
**三人团队**：阶段 1、2、4 并行（2-3 周）

---

## 阶段 0：准备工作

**目标**：建立基础设施，为后续优化做准备

**时间**：1 天

### 任务清单

#### 0.1 创建功能开关系统（2 小时）

**目的**：支持 A/B 测试和快速回滚

**实施步骤**：

1. 创建配置文件

```typescript
// src/config/features.ts

export interface FeatureFlags {
  // Parser 相关
  useAcornParser: boolean;
  useTreeSitterFallback: boolean;
  
  // 触发策略相关
  useSmartTrigger: boolean;
  useDynamicDebounce: boolean;
  useAdaptiveStrategy: boolean;
  
  // 调试相关
  enableTriggerLogging: boolean;
  enablePerformanceLogging: boolean;
  enableComparisonMode: boolean;
}

export const DEFAULT_FEATURES: FeatureFlags = {
  useAcornParser: false,
  useTreeSitterFallback: true,
  useSmartTrigger: false,
  useDynamicDebounce: false,
  useAdaptiveStrategy: false,
  enableTriggerLogging: false,
  enablePerformanceLogging: false,
  enableComparisonMode: false,
};

// 从 localStorage 读取配置（支持运行时切换）
export function getFeatureFlags(): FeatureFlags {
  const stored = localStorage.getItem('ai-assistant-features');
  if (stored) {
    try {
      return { ...DEFAULT_FEATURES, ...JSON.parse(stored) };
    } catch (e) {
      console.warn('[FeatureFlags] Parse error:', e);
    }
  }
  return DEFAULT_FEATURES;
}

export function setFeatureFlag(key: keyof FeatureFlags, value: boolean): void {
  const flags = getFeatureFlags();
  flags[key] = value;
  localStorage.setItem('ai-assistant-features', JSON.stringify(flags));
  console.log(`[FeatureFlags] ${key} = ${value}`);
}
```

2. 创建调试面板（可选）

```typescript
// src/utils/DebugPanel.ts

export class DebugPanel {
  private panel: HTMLElement | null = null;
  
  show(): void {
    if (this.panel) return;
    
    this.panel = document.createElement('div');
    this.panel.id = 'ai-assistant-debug-panel';
    this.panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: monospace;
      font-size: 12px;
      max-width: 300px;
    `;
    
    const flags = getFeatureFlags();
    const html = `
      <h3 style="margin: 0 0 12px 0;">AI Assistant Debug</h3>
      ${Object.entries(flags).map(([key, value]) => `
        <label style="display: block; margin: 8px 0;">
          <input type="checkbox" ${value ? 'checked' : ''} 
                 onchange="window.toggleFeature('${key}', this.checked)">
          ${key}
        </label>
      `).join('')}
      <button onclick="window.closeDebugPanel()" 
              style="margin-top: 12px; padding: 4px 8px;">
        Close
      </button>
    `;
    
    this.panel.innerHTML = html;
    document.body.appendChild(this.panel);
    
    // 全局方法
    (window as any).toggleFeature = (key: string, value: boolean) => {
      setFeatureFlag(key as keyof FeatureFlags, value);
      location.reload();
    };
    
    (window as any).closeDebugPanel = () => {
      this.hide();
    };
  }
  
  hide(): void {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }
}

// 快捷键：Ctrl+Shift+D 打开调试面板
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    const panel = new DebugPanel();
    panel.show();
  }
});
```

#### 0.2 添加日志收集系统（2 小时）

**目的**：收集数据用于验证优化效果

**实施步骤**：

1. 创建日志收集器

```typescript
// src/utils/Analytics.ts

export interface TriggerEvent {
  timestamp: number;
  engine: 'fim' | 'nes';
  action: 'trigger' | 'accept' | 'reject' | 'timeout';
  context: {
    lineLength?: number;
    isAtLineEnd?: boolean;
    isInComment?: boolean;
    isInString?: boolean;
    afterPunctuation?: boolean;
    timeSinceLastEdit?: number;
    debounceMs?: number;
    pattern?: string;
    confidence?: number;
  };
}

export class Analytics {
  private events: TriggerEvent[] = [];
  private readonly MAX_EVENTS = 1000;
  private readonly STORAGE_KEY = 'ai-assistant-analytics';
  
  constructor() {
    this.loadFromStorage();
  }
  
  /**
   * 记录事件
   */
  logEvent(event: Omit<TriggerEvent, 'timestamp'>): void {
    const fullEvent: TriggerEvent = {
      ...event,
      timestamp: Date.now()
    };
    
    this.events.push(fullEvent);
    
    // 限制数量
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }
    
    // 定期保存
    if (this.events.length % 10 === 0) {
      this.saveToStorage();
    }
    
    // 控制台输出（开发模式）
    if (getFeatureFlags().enableTriggerLogging) {
      console.log('[Analytics]', fullEvent);
    }
  }
  
  /**
   * 获取统计数据
   */
  getStats(): {
    fim: { triggers: number; accepts: number; rejects: number; acceptRate: number };
    nes: { triggers: number; accepts: number; rejects: number; acceptRate: number };
    totalEvents: number;
  } {
    const fimEvents = this.events.filter(e => e.engine === 'fim');
    const nesEvents = this.events.filter(e => e.engine === 'nes');
    
    const calcStats = (events: TriggerEvent[]) => {
      const triggers = events.filter(e => e.action === 'trigger').length;
      const accepts = events.filter(e => e.action === 'accept').length;
      const rejects = events.filter(e => e.action === 'reject').length;
      const acceptRate = triggers > 0 ? accepts / triggers : 0;
      
      return { triggers, accepts, rejects, acceptRate };
    };
    
    return {
      fim: calcStats(fimEvents),
      nes: calcStats(nesEvents),
      totalEvents: this.events.length
    };
  }
  
  /**
   * 导出数据（用于分析）
   */
  exportData(): string {
    return JSON.stringify(this.events, null, 2);
  }
  
  /**
   * 清空数据
   */
  clear(): void {
    this.events = [];
    this.saveToStorage();
  }
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.events = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[Analytics] Load error:', e);
    }
  }
  
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.events));
    } catch (e) {
      console.warn('[Analytics] Save error:', e);
    }
  }
}

// 全局实例
export const analytics = new Analytics();

// 全局方法（方便调试）
(window as any).getAnalytics = () => {
  const stats = analytics.getStats();
  console.table(stats);
  return stats;
};

(window as any).exportAnalytics = () => {
  const data = analytics.exportData();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analytics-${Date.now()}.json`;
  a.click();
};

(window as any).clearAnalytics = () => {
  analytics.clear();
  console.log('[Analytics] Cleared');
};
```

2. 集成到现有代码

```typescript
// src/engines/FIMEngine.ts

import { analytics } from '@/utils/Analytics';

class FIMEngine {
  provideInlineCompletions: async (model, position, context, token) => {
    // 记录触发
    analytics.logEvent({
      engine: 'fim',
      action: 'trigger',
      context: {
        lineLength: model.getLineContent(position.lineNumber).length,
        isAtLineEnd: position.column === model.getLineMaxColumn(position.lineNumber),
        // ... 其他上下文
      }
    });
    
    // ... 现有逻辑
  }
}
```

#### 0.3 定义核心类型（30 分钟）

**目的**：定义项目中使用的核心类型接口

**实施步骤**：

1. 创建类型定义文件

```typescript
// src/types/index.ts

/**
 * 位置信息
 */
export interface Position {
  lineNumber: number;
  column: number;
}

/**
 * 触发上下文
 */
export interface TriggerContext {
  lineContent: string;
  lineLength: number;
  isAtLineEnd: boolean;
  isInComment: boolean;
  isInString: boolean;
  afterPunctuation: boolean;
  afterWhitespace: boolean;
  timeSinceLastEdit: number;
  timeSinceRejection: number;
}

/**
 * 编辑记录
 */
export interface EditRecord {
  timestamp: number;
  lineNumber: number;
  column: number;
  type: 'insert' | 'delete' | 'replace';
  oldText: string;
  newText: string;
  rangeLength: number;
  source: 'user' | 'ai';
  context: {
    lineContent: string;
  };
}

/**
 * 功能开关
 */
export interface FeatureFlags {
  useAcornParser: boolean;
  useTreeSitterFallback: boolean;
  useSmartTrigger: boolean;
  useDynamicDebounce: boolean;
  useAdaptiveStrategy: boolean;
  enableTriggerLogging: boolean;
  enablePerformanceLogging: boolean;
  enableComparisonMode: boolean;
}
```

**验收标准**：
- 类型文件创建完成
- 所有接口都有注释说明
- 导出所有必要的类型

---

#### 0.4 创建测试基础设施（2 小时）

**目的**：支持单元测试和集成测试

**实施步骤**：

1. 配置 Vitest

```typescript
// vitest.config.ts (确认配置)

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**']
    }
  }
});
```

2. 创建测试工具

```typescript
// src/__tests__/helpers/testUtils.ts

import type { TriggerContext } from '@/types';

/**
 * 创建测试用的触发上下文
 */
export function createTriggerContext(
  overrides?: Partial<TriggerContext>
): TriggerContext {
  return {
    lineContent: 'const user = ',
    lineLength: 13,
    isAtLineEnd: true,
    isInComment: false,
    isInString: false,
    afterPunctuation: false,
    afterWhitespace: true,
    timeSinceLastEdit: 300,
    timeSinceRejection: 10000,
    ...overrides
  };
}

/**
 * 模拟编辑序列
 */
export function simulateEditSequence(edits: Array<{
  text: string;
  delay: number;
}>): EditRecord[] {
  let timestamp = Date.now();
  const records: EditRecord[] = [];
  
  edits.forEach((edit, index) => {
    timestamp += edit.delay;
    records.push({
      timestamp,
      lineNumber: 1,
      column: index + 1,
      type: 'insert',
      oldText: '',
      newText: edit.text,
      rangeLength: 0,
      source: 'user',
      context: {
        lineContent: edits.slice(0, index + 1).map(e => e.text).join('')
      }
    });
  });
  
  return records;
}
```

#### 0.5 文档准备（2 小时）

**目的**：记录当前状态，便于对比

**实施步骤**：

1. 记录当前性能基线

```markdown
# 性能基线 (Baseline)

记录时间：2026-02-01

## 体积

- 总体积：~2.5MB
- Tree-sitter WASM：~2MB
- 核心代码：~500KB

## 性能

- FIM 初始化：< 5ms
- FIM 触发延迟：300ms
- NES 初始化：100-200ms (Tree-sitter)
- NES 触发延迟：3000ms
- 坐标计算：< 10ms

## 用户体验

- FIM 触发频率：每分钟 ~20 次
- FIM 接受率：~40%
- NES 触发频率：每分钟 ~2 次
- NES 接受率：~60%

## 问题

- FIM 过于激进，干扰编码
- NES 延迟过长，响应迟钝
- Tree-sitter 体积大，加载慢
```

2. 创建变更日志模板

```markdown
# 变更日志

## [Unreleased]

### 阶段 1: Parser 替换
- [ ] 添加 Acorn 依赖
- [ ] 实现 AcornAnalyzer
- [ ] 替换 CoordinateFixer Layer 2
- [ ] 移除 Tree-sitter 依赖

### 阶段 2: 触发时机验证
- [ ] 收集用户行为数据
- [ ] 分析触发模式
- [ ] 设计新触发策略

### 阶段 3: 触发时机实施
- [ ] 实现智能触发条件
- [ ] 实现动态防抖
- [ ] 实现职责分离

### 阶段 4: 自适应优化
- [ ] 实现用户行为追踪
- [ ] 实现自适应策略
```

### 验收标准

- [x] 功能开关系统可用
- [x] 日志收集系统可用
- [x] 核心类型定义完成
- [x] 测试基础设施就绪
- [x] 文档准备完成
- [x] 可以通过 Ctrl+Shift+D 打开调试面板
- [x] 可以通过 `window.getAnalytics()` 查看统计

### 预期产出

```
src/
├── config/
│   └── features.ts          (新建)
├── types/
│   └── index.ts             (新建)
├── utils/
│   ├── Analytics.ts         (新建)
│   └── DebugPanel.ts        (新建)
└── __tests__/
    └── helpers/
        └── testUtils.ts     (新建)

docs/
└── BASELINE.md              (新建)
```

---

## 阶段 1：Parser 替换（问题 2）

**目标**：用 Acorn 替换 Tree-sitter，减少体积和提升性能

**时间**：1-2 周

**风险**：中低

### 为什么先做这个？

1. ✅ **风险低**：只影响 Layer 2（使用率 < 5%）
2. ✅ **收益明确**：体积减少 97.5%，性能提升 20-40x
3. ✅ **易于验证**：可以单元测试，不需要真实用户数据
4. ✅ **易于回滚**：功能开关即可切换

5. ✅ **可并行**：不影响阶段 2 的数据收集

### 任务清单

#### 1.1 快速验证（半天）

**目的**：确认 Acorn 可以满足需求

**实施步骤**：

1. 安装依赖

```bash
pnpm add acorn acorn-walk
pnpm add -D @types/acorn
```

2. 创建最小原型

```typescript
// src/__tests__/prototypes/acorn-test.ts

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const code = `
function hello() {
  const user = { name: "Alice" };
  return user.name;
}
`;

// 解析
const ast = acorn.parse(code, {
  ecmaVersion: 'latest',
  sourceType: 'module',
  locations: true
});

// 遍历
walk.simple(ast, {
  VariableDeclarator(node) {
    console.log('Variable:', node.id.name, 'at', node.loc);
  },
  FunctionDeclaration(node) {
    console.log('Function:', node.id.name, 'at', node.loc);
  }
});
```

3. 性能对比测试

```typescript
// src/__tests__/prototypes/parser-benchmark.ts

import * as acorn from 'acorn';
import { TreeSitterAnalyzer } from '@/analysis/TreeSitterAnalyzer';

const testCode = `
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
`.repeat(100); // 模拟大文件

async function benchmark() {
  // Acorn
  const acornStart = performance.now();
  for (let i = 0; i < 100; i++) {
    acorn.parse(testCode, { ecmaVersion: 'latest' });
  }
  const acornTime = performance.now() - acornStart;
  
  // Tree-sitter
  const analyzer = new TreeSitterAnalyzer();
  await analyzer.initialize();
  const tsStart = performance.now();
  for (let i = 0; i < 100; i++) {
    await analyzer.parse(testCode, 'typescript');
  }
  const tsTime = performance.now() - tsStart;
  
  console.log('Acorn:', acornTime.toFixed(2), 'ms');
  console.log('Tree-sitter:', tsTime.toFixed(2), 'ms');
  console.log('Speedup:', (tsTime / acornTime).toFixed(2), 'x');
}

benchmark();
```

**验收标准**：
- Acorn 可以正确解析 TypeScript/JavaScript
- 性能提升 > 20x
- 体积减少 > 95%

---

#### 1.2 实现 AcornAnalyzer（2-3 小时）

**目的**：创建 Acorn 分析器，替代 Tree-sitter

**实施步骤**：

1. 创建核心类

```typescript
// src/analysis/AcornAnalyzer.ts

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import type { Node } from 'acorn';

export interface AcornPosition {
  line: number;
  column: number;
}

export interface AcornNode {
  type: string;
  start: number;
  end: number;
  loc?: {
    start: AcornPosition;
    end: AcornPosition;
  };
}

export class AcornAnalyzer {
  /**
   * 解析代码
   */
  parse(code: string): Node {
    try {
      return acorn.parse(code, {
        ecmaVersion: 'latest', // 使用最新的 ECMAScript 版本
        sourceType: 'module',
        locations: true,
        ranges: true
      });
    } catch (error) {
      // 降级：尝试作为脚本解析
      try {
        return acorn.parse(code, {
          ecmaVersion: 'latest',
          sourceType: 'script',
          locations: true,
          ranges: true
        });
      } catch (fallbackError) {
        throw new Error(`Acorn parse failed: ${error}`);
      }
    }
  }
  
  /**
   * 查找指定位置的节点
   */
  findNodeAtPosition(
    ast: Node,
    line: number,
    column: number
  ): AcornNode | null {
    let targetNode: AcornNode | null = null;
    
    walk.ancestor(ast, {
      enter(node: any) {
        if (!node.loc) return;
        
        const { start, end } = node.loc;
        
        // 检查位置是否在节点范围内
        if (
          (line > start.line || (line === start.line && column >= start.column)) &&
          (line < end.line || (line === end.line && column <= end.column))
        ) {
          // 选择最小的包含节点
          if (!targetNode || node.start > targetNode.start) {
            targetNode = node;
          }
        }
      }
    });
    
    return targetNode;
  }
  
  /**
   * 获取节点的父节点
   */
  getParent(ast: Node, targetNode: AcornNode): AcornNode | null {
    let parent: AcornNode | null = null;
    
    walk.ancestor(ast, {
      enter(node: any, ancestors: any[]) {
        if (node === targetNode && ancestors.length > 0) {
          parent = ancestors[ancestors.length - 1];
        }
      }
    });
    
    return parent;
  }
  
  /**
   * 检查节点类型
   */
  isNodeType(node: AcornNode | null, types: string[]): boolean {
    return node !== null && types.includes(node.type);
  }
  
  /**
   * 获取节点的文本内容
   */
  getNodeText(code: string, node: AcornNode): string {
    return code.substring(node.start, node.end);
  }
  
  /**
   * 查找所有指定类型的节点
   */
  findNodesByType(ast: Node, type: string): AcornNode[] {
    const nodes: AcornNode[] = [];
    
    walk.simple(ast, {
      [type](node: any) {
        nodes.push(node);
      }
    });
    
    return nodes;
  }
}
```

2. 添加单元测试

```typescript
// src/__tests__/AcornAnalyzer.test.ts

import { describe, it, expect } from 'vitest';
import { AcornAnalyzer } from '@/analysis/AcornAnalyzer';

describe('AcornAnalyzer', () => {
  const analyzer = new AcornAnalyzer();
  
  describe('parse', () => {
    it('应该解析简单的 JavaScript', () => {
      const code = 'const x = 1;';
      const ast = analyzer.parse(code);
      expect(ast.type).toBe('Program');
    });
    
    it('应该解析函数声明', () => {
      const code = 'function hello() { return "world"; }';
      const ast = analyzer.parse(code);
      const functions = analyzer.findNodesByType(ast, 'FunctionDeclaration');
      expect(functions).toHaveLength(1);
    });
    
    it('应该解析对象字面量', () => {
      const code = 'const user = { name: "Alice", age: 30 };';
      const ast = analyzer.parse(code);
      const objects = analyzer.findNodesByType(ast, 'ObjectExpression');
      expect(objects).toHaveLength(1);
    });
  });
  
  describe('findNodeAtPosition', () => {
    it('应该找到指定位置的节点', () => {
      const code = 'const user = { name: "Alice" };';
      const ast = analyzer.parse(code);
      
      // 查找 "user" 标识符
      const node = analyzer.findNodeAtPosition(ast, 1, 6);
      expect(node?.type).toBe('Identifier');
    });
    
    it('应该找到嵌套节点', () => {
      const code = 'const user = { name: "Alice" };';
      const ast = analyzer.parse(code);
      
      // 查找 "name" 属性
      const node = analyzer.findNodeAtPosition(ast, 1, 15);
      expect(node?.type).toBe('Property');
    });
  });
  
  describe('getParent', () => {
    it('应该获取父节点', () => {
      const code = 'const user = { name: "Alice" };';
      const ast = analyzer.parse(code);
      
      const node = analyzer.findNodeAtPosition(ast, 1, 15);
      const parent = analyzer.getParent(ast, node!);
      expect(parent?.type).toBe('ObjectExpression');
    });
  });
  
  describe('isNodeType', () => {
    it('应该正确判断节点类型', () => {
      const code = 'const x = 1;';
      const ast = analyzer.parse(code);
      const node = analyzer.findNodeAtPosition(ast, 1, 6);
      
      expect(analyzer.isNodeType(node, ['Identifier'])).toBe(true);
      expect(analyzer.isNodeType(node, ['Literal'])).toBe(false);
    });
  });
});
```

**验收标准**：
- 所有测试通过
- 代码覆盖率 > 80%
- 支持 JavaScript 和 TypeScript 语法

---

#### 1.3 修改 CoordinateFixer（1 小时）

**目的**：集成 AcornAnalyzer 到 Layer 2

**实施步骤**：

1. 修改 CoordinateFixer

```typescript
// src/utils/CoordinateFixer.ts

import { AcornAnalyzer, type AcornNode } from '@/analysis/AcornAnalyzer';
import { TreeSitterAnalyzer } from '@/analysis/TreeSitterAnalyzer';
import { getFeatureFlags } from '@/config/features';

export class CoordinateFixer {
  private acornAnalyzer: AcornAnalyzer;
  private treeSitterAnalyzer: TreeSitterAnalyzer | null = null;
  
  constructor() {
    this.acornAnalyzer = new AcornAnalyzer();
    
    // 根据功能开关决定是否初始化 Tree-sitter
    const flags = getFeatureFlags();
    if (flags.useTreeSitterFallback) {
      this.treeSitterAnalyzer = new TreeSitterAnalyzer();
    }
  }
  
  async fixCoordinates(
    originalCode: string,
    modifiedCode: string,
    originalPosition: Position
  ): Promise<Position> {
    // Layer 1: 简单字符串匹配（快速路径）
    const layer1Result = this.tryLayer1(originalCode, modifiedCode, originalPosition);
    if (layer1Result) {
      return layer1Result;
    }
    
    // Layer 2: AST 分析
    const flags = getFeatureFlags();
    
    if (flags.useAcornParser) {
      // 使用 Acorn
      const layer2Result = this.tryLayer2Acorn(originalCode, modifiedCode, originalPosition);
      if (layer2Result) {
        return layer2Result;
      }
    } else if (flags.useTreeSitterFallback && this.treeSitterAnalyzer) {
      // 使用 Tree-sitter（回退）
      const layer2Result = await this.tryLayer2TreeSitter(
        originalCode,
        modifiedCode,
        originalPosition
      );
      if (layer2Result) {
        return layer2Result;
      }
    }
    
    // Layer 3: 启发式算法（兜底）
    return this.tryLayer3(originalCode, modifiedCode, originalPosition);
  }
  
  private tryLayer2Acorn(
    originalCode: string,
    modifiedCode: string,
    originalPosition: Position
  ): Position | null {
    try {
      // 解析原始代码
      const originalAst = this.acornAnalyzer.parse(originalCode);
      const originalNode = this.acornAnalyzer.findNodeAtPosition(
        originalAst,
        originalPosition.lineNumber,
        originalPosition.column
      );
      
      if (!originalNode) return null;
      
      // 解析修改后的代码
      const modifiedAst = this.acornAnalyzer.parse(modifiedCode);
      
      // 查找相同类型的节点
      const candidates = this.acornAnalyzer.findNodesByType(
        modifiedAst,
        originalNode.type
      );
      
      // 选择最佳匹配节点
      const bestMatch = this.findBestMatch(originalNode, candidates);
      
      if (bestMatch && bestMatch.loc) {
        return {
          lineNumber: bestMatch.loc.start.line,
          column: bestMatch.loc.start.column
        };
      }
      
      return null;
    } catch (error) {
      console.warn('[CoordinateFixer] Layer 2 (Acorn) failed:', error);
      return null;
    }
  }
  
  /**
   * 查找最佳匹配节点
   * 策略：优先匹配位置最接近的节点（适合代码编辑场景）
   */
  private findBestMatch(
    originalNode: AcornNode,
    candidates: AcornNode[]
  ): AcornNode | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    
    const originalLine = originalNode.loc?.start.line || 0;
    const originalColumn = originalNode.loc?.start.column || 0;
    
    let bestMatch = candidates[0];
    let minDistance = this.calculatePositionDistance(
      originalLine,
      originalColumn,
      bestMatch.loc?.start.line || 0,
      bestMatch.loc?.start.column || 0
    );
    
    // 遍历所有候选节点，找到位置最接近的
    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      const candidateLine = candidate.loc?.start.line || 0;
      const candidateColumn = candidate.loc?.start.column || 0;
      
      const distance = this.calculatePositionDistance(
        originalLine,
        originalColumn,
        candidateLine,
        candidateColumn
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = candidate;
      }
    }
    
    return bestMatch;
  }
  
  /**
   * 计算两个位置之间的距离
   * 使用曼哈顿距离，行权重更高（因为行变化通常更重要）
   */
  private calculatePositionDistance(
    line1: number,
    col1: number,
    line2: number,
    col2: number
  ): number {
    const lineDiff = Math.abs(line1 - line2);
    const colDiff = Math.abs(col1 - col2);
    
    // 行差异权重为 100，列差异权重为 1
    // 这样可以优先匹配同一行或相邻行的节点
    return lineDiff * 100 + colDiff;
  }
  
  // ... 保留其他 Layer 方法
}
```

**验收标准**：
- 功能开关可以切换 Acorn/Tree-sitter
- Acorn 模式下坐标修正准确率 > 95%
- 性能提升明显（< 5ms）

---
#### 1.4 单元测试（2 小时）

**目的**：确保 CoordinateFixer 在 Acorn 模式下正常工作

**实施步骤**：

1. 添加测试用例

```typescript
// src/__tests__/CoordinateFixer.test.ts (新增)

import { describe, it, expect, beforeEach } from 'vitest';
import { CoordinateFixer } from '@/utils/CoordinateFixer';
import { setFeatureFlag } from '@/config/features';

describe('CoordinateFixer with Acorn', () => {
  let fixer: CoordinateFixer;
  
  beforeEach(() => {
    // 启用 Acorn 模式
    setFeatureFlag('useAcornParser', true);
    fixer = new CoordinateFixer();
  });
  
  it('应该修正简单的变量声明位置', async () => {
    const original = 'const user = { name: "Alice" };';
    const modified = 'const user = {\n  name: "Alice",\n  age: 30\n};';
    const originalPos = { lineNumber: 1, column: 7 }; // "user"
    
    const result = await fixer.fixCoordinates(original, modified, originalPos);
    
    expect(result.lineNumber).toBe(1);
    expect(result.column).toBe(7);
  });
  
  it('应该修正函数内部的位置', async () => {
    const original = 'function hello() { return "world"; }';
    const modified = 'function hello() {\n  const msg = "world";\n  return msg;\n}';
    const originalPos = { lineNumber: 1, column: 27 }; // "world"
    
    const result = await fixer.fixCoordinates(original, modified, originalPos);
    
    expect(result.lineNumber).toBe(2);
    expect(result.column).toBeGreaterThan(0);
  });
  
  it('应该处理对象属性的位置', async () => {
    const original = 'const obj = { a: 1, b: 2 };';
    const modified = 'const obj = {\n  a: 1,\n  b: 2,\n  c: 3\n};';
    const originalPos = { lineNumber: 1, column: 20 }; // "b"
    
    const result = await fixer.fixCoordinates(original, modified, originalPos);
    
    expect(result.lineNumber).toBe(3);
  });
  
  it('应该在解析失败时回退到 Layer 3', async () => {
    const original = 'const x = ';
    const modified = 'const x = 1;';
    const originalPos = { lineNumber: 1, column: 7 };
    
    const result = await fixer.fixCoordinates(original, modified, originalPos);
    
    // 应该返回一个合理的位置
    expect(result.lineNumber).toBeGreaterThan(0);
    expect(result.column).toBeGreaterThan(0);
  });
});
```

**验收标准**：
- 所有测试通过
- 覆盖率 > 85%
- 边界情况处理正确

---

#### 1.5 集成测试（1 小时）

**目的**：在真实场景中验证功能

**实施步骤**：

1. 创建集成测试

```typescript
// src/__tests__/integration/parser-integration.test.ts

import { describe, it, expect } from 'vitest';
import { CoordinateFixer } from '@/utils/CoordinateFixer';
import { setFeatureFlag } from '@/config/features';

describe('Parser Integration Tests', () => {
  it('应该在真实编辑场景中正确工作', async () => {
    setFeatureFlag('useAcornParser', true);
    const fixer = new CoordinateFixer();
    
    // 模拟真实的编辑序列
    const edits = [
      {
        original: 'const user = { name: "Alice" };',
        modified: 'const user = {\n  name: "Alice"\n};',
        position: { lineNumber: 1, column: 15 }
      },
      {
        original: 'const user = {\n  name: "Alice"\n};',
        modified: 'const user = {\n  name: "Alice",\n  age: 30\n};',
        position: { lineNumber: 2, column: 9 }
      }
    ];
    
    for (const edit of edits) {
      const result = await fixer.fixCoordinates(
        edit.original,
        edit.modified,
        edit.position
      );
      
      expect(result.lineNumber).toBeGreaterThan(0);
      expect(result.column).toBeGreaterThan(0);
    }
  });
  
  it('应该处理大文件', async () => {
    setFeatureFlag('useAcornParser', true);
    const fixer = new CoordinateFixer();
    
    // 生成大文件
    const lines = Array.from({ length: 1000 }, (_, i) => 
      `const var${i} = { value: ${i} };`
    );
    const original = lines.join('\n');
    const modified = lines.slice(0, 500).join('\n') + 
                     '\n// New code\n' + 
                     lines.slice(500).join('\n');
    
    const start = performance.now();
    const result = await fixer.fixCoordinates(
      original,
      modified,
      { lineNumber: 600, column: 7 }
    );
    const duration = performance.now() - start;
    
    expect(result.lineNumber).toBeGreaterThan(0);
    expect(duration).toBeLessThan(50); // 应该很快
  });
});
```

**验收标准**：
- 集成测试通过
- 性能满足要求（< 50ms）
- 无内存泄漏

---

#### 1.6 性能测试（1 小时）

**目的**：对比 Acorn 和 Tree-sitter 的性能

**实施步骤**：

1. 创建性能测试

```typescript
// src/__tests__/performance/parser-benchmark.test.ts

import { describe, it, expect } from 'vitest';
import { CoordinateFixer } from '@/utils/CoordinateFixer';
import { setFeatureFlag } from '@/config/features';

describe('Parser Performance', () => {
  const testCode = `
function calculateTotal(items) {
  return items.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);
}

const cart = {
  items: [
    { name: "Apple", price: 1.5, quantity: 3 },
    { name: "Banana", price: 0.8, quantity: 5 }
  ]
};

const total = calculateTotal(cart.items);
console.log("Total:", total);
  `.repeat(50); // 模拟中等大小的文件
  
  it('Acorn 性能测试', async () => {
    setFeatureFlag('useAcornParser', true);
    setFeatureFlag('useTreeSitterFallback', false);
    
    const fixer = new CoordinateFixer();
    const iterations = 100;
    
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await fixer.fixCoordinates(
        testCode,
        testCode + '\n// New line',
        { lineNumber: 10, column: 5 }
      );
    }
    const duration = performance.now() - start;
    const avgTime = duration / iterations;
    
    console.log(`Acorn 平均时间: ${avgTime.toFixed(2)}ms`);
    expect(avgTime).toBeLessThan(10);
  });
  
  it('Tree-sitter 性能测试', async () => {
    setFeatureFlag('useAcornParser', false);
    setFeatureFlag('useTreeSitterFallback', true);
    
    const fixer = new CoordinateFixer();
    const iterations = 100;
    
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await fixer.fixCoordinates(
        testCode,
        testCode + '\n// New line',
        { lineNumber: 10, column: 5 }
      );
    }
    const duration = performance.now() - start;
    const avgTime = duration / iterations;
    
    console.log(`Tree-sitter 平均时间: ${avgTime.toFixed(2)}ms`);
    expect(avgTime).toBeLessThan(50);
  });
  
  it('性能对比', async () => {
    // Acorn
    setFeatureFlag('useAcornParser', true);
    const acornFixer = new CoordinateFixer();
    const acornStart = performance.now();
    await acornFixer.fixCoordinates(testCode, testCode, { lineNumber: 1, column: 1 });
    const acornTime = performance.now() - acornStart;
    
    // Tree-sitter
    setFeatureFlag('useAcornParser', false);
    setFeatureFlag('useTreeSitterFallback', true);
    const tsFixer = new CoordinateFixer();
    const tsStart = performance.now();
    await tsFixer.fixCoordinates(testCode, testCode, { lineNumber: 1, column: 1 });
    const tsTime = performance.now() - tsStart;
    
    const speedup = tsTime / acornTime;
    console.log(`性能提升: ${speedup.toFixed(2)}x`);
    
    expect(speedup).toBeGreaterThan(5); // 至少快 5 倍
  });
});
```

2. 运行性能测试

```bash
pnpm test:performance
```

**验收标准**：
- Acorn 平均时间 < 10ms
- 性能提升 > 5x
- 内存使用减少 > 50%

---

#### 1.7 清理 Tree-sitter（1 小时）

**目的**：移除 Tree-sitter 依赖，减少体积

**实施步骤**：

1. 更新 package.json

```bash
# 移除依赖
pnpm remove web-tree-sitter

# 验证
pnpm install
```

2. 删除相关文件

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force public/tree-sitter/
Remove-Item public/tree-sitter.wasm

Remove-Item src/analysis/TreeSitterAnalyzer.ts
Remove-Item src/analysis/TreeSitterInstance.ts
Remove-Item src/__tests__/TreeSitterAnalyzer.test.ts
Remove-Item src/__tests__/TreeSitterInstance.test.ts
```

或使用跨平台的 Node.js 脚本：

```javascript
// scripts/cleanup-tree-sitter.js
const fs = require('fs');
const path = require('path');

// 删除目录
fs.rmSync(path.join(__dirname, '../public/tree-sitter'), { 
  recursive: true, 
  force: true 
});

// 删除文件
const filesToDelete = [
  '../public/tree-sitter.wasm',
  '../src/analysis/TreeSitterAnalyzer.ts',
  '../src/analysis/TreeSitterInstance.ts',
  '../src/__tests__/TreeSitterAnalyzer.test.ts',
  '../src/__tests__/TreeSitterInstance.test.ts'
];

filesToDelete.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`Deleted: ${file}`);
  }
});

console.log('Tree-sitter cleanup completed!');
```

运行清理脚本：

```bash
node scripts/cleanup-tree-sitter.js
```

3. 更新构建脚本

```javascript
// scripts/copy-wasm.js (删除或注释掉 Tree-sitter 相关代码)

// 不再需要复制 Tree-sitter WASM 文件
```

4. 更新文档

```markdown
# 更新 README.md

## 依赖

- ~~Tree-sitter~~ → Acorn (轻量级 JavaScript 解析器)
- Monaco Editor
- Vue 3
```

**验收标准**：
- 构建成功
- 体积减少 > 2MB
- 所有测试通过
- 文档更新完成

---

### 阶段 1 验收标准

- [ ] Acorn 依赖已安装
- [ ] AcornAnalyzer 实现完成
- [ ] CoordinateFixer 集成 Acorn
- [ ] 所有单元测试通过
- [ ] 集成测试通过
- [ ] 性能测试通过（提升 > 5x）
- [ ] Tree-sitter 依赖已移除
- [ ] 体积减少 > 2MB
- [ ] 文档更新完成

### 预期产出

```
src/
├── analysis/
│   ├── AcornAnalyzer.ts         (新建)
│   ├── SymptomDetector.ts       (保留)
│   ├── TreeSitterAnalyzer.ts    (删除)
│   └── TreeSitterInstance.ts    (删除)
├── utils/
│   └── CoordinateFixer.ts       (修改)
└── __tests__/
    ├── AcornAnalyzer.test.ts    (新建)
    ├── CoordinateFixer.test.ts  (修改)
    └── integration/
        └── parser-integration.test.ts (新建)

public/
├── tree-sitter/                 (删除)
└── tree-sitter.wasm             (删除)

package.json                     (修改)
```

---

## 阶段 2：触发时机优化验证（问题 1）

**目标**：收集数据，验证新触发策略的可行性

**时间**：1 周

**风险**：中

### 为什么要先验证？

1. ⚠️ **风险高**：触发策略直接影响用户体验
2. 📊 **需要数据**：不能凭感觉设计，要用真实数据
3. 🔄 **可迭代**：先验证，再实施，避免返工
4. 🎯 **目标明确**：触发次数减少 > 30%，接受率提升 > 20%

### 任务清单

#### 2.1 数据收集（1 天）

**目的**：收集真实的用户行为数据

**实施步骤**：

1. 启用日志收集

```typescript
// 在 src/index.ts 中启用
import { analytics } from '@/utils/Analytics';
import { setFeatureFlag } from '@/config/features';

// 启用日志
setFeatureFlag('enableTriggerLogging', true);
setFeatureFlag('enablePerformanceLogging', true);
```

2. 集成到引擎

```typescript
// src/engines/FIMEngine.ts

import { analytics } from '@/utils/Analytics';

class FIMEngine {
  async provideInlineCompletions(model, position, context, token) {
    const lineContent = model.getLineContent(position.lineNumber);
    const timeSinceLastEdit = Date.now() - this.lastEditTime;
    
    // 记录触发
    analytics.logEvent({
      engine: 'fim',
      action: 'trigger',
      context: {
        lineLength: lineContent.length,
        isAtLineEnd: position.column === model.getLineMaxColumn(position.lineNumber),
        isInComment: this.isInComment(model, position),
        isInString: this.isInString(model, position),
        afterPunctuation: /[.,;:!?]$/.test(lineContent.trim()),
        timeSinceLastEdit,
        debounceMs: 300
      }
    });
    
    // ... 现有逻辑
    
    // 记录接受/拒绝
    if (accepted) {
      analytics.logEvent({
        engine: 'fim',
        action: 'accept',
        context: { /* ... */ }
      });
    } else {
      analytics.logEvent({
        engine: 'fim',
        action: 'reject',
        context: { /* ... */ }
      });
    }
  }
}
```

3. 使用 1-2 天

```
正常使用编辑器，让系统收集数据
```

4. 导出数据

```javascript
// 在浏览器控制台
window.exportAnalytics();
```

**验收标准**：
- 收集 > 500 个触发事件
- 数据包含完整的上下文信息
- 可以导出为 JSON 文件

---

#### 2.2 数据分析（半天）

**目的**：分析数据，找出触发模式

**实施步骤**：

1. 创建分析脚本

```typescript
// scripts/analyze-triggers.ts

import fs from 'fs';

interface TriggerEvent {
  timestamp: number;
  engine: 'fim' | 'nes';
  action: 'trigger' | 'accept' | 'reject';
  context: any;
}

const data: TriggerEvent[] = JSON.parse(
  fs.readFileSync('analytics.json', 'utf-8')
);

// 分析 FIM 触发
const fimTriggers = data.filter(e => e.engine === 'fim' && e.action === 'trigger');
const fimAccepts = data.filter(e => e.engine === 'fim' && e.action === 'accept');
const fimRejects = data.filter(e => e.engine === 'fim' && e.action === 'reject');

console.log('=== FIM 统计 ===');
console.log('触发次数:', fimTriggers.length);
console.log('接受次数:', fimAccepts.length);
console.log('拒绝次数:', fimRejects.length);
console.log('接受率:', (fimAccepts.length / fimTriggers.length * 100).toFixed(2) + '%');

// 分析触发条件
const triggerPatterns = {
  atLineEnd: 0,
  inComment: 0,
  inString: 0,
  afterPunctuation: 0,
  shortLine: 0,
  longLine: 0
};

fimTriggers.forEach(event => {
  const ctx = event.context;
  if (ctx.isAtLineEnd) triggerPatterns.atLineEnd++;
  if (ctx.isInComment) triggerPatterns.inComment++;
  if (ctx.isInString) triggerPatterns.inString++;
  if (ctx.afterPunctuation) triggerPatterns.afterPunctuation++;
  if (ctx.lineLength < 10) triggerPatterns.shortLine++;
  if (ctx.lineLength > 50) triggerPatterns.longLine++;
});

console.log('\n=== 触发模式 ===');
console.log(triggerPatterns);

// 分析接受率 vs 触发条件
const acceptRateByCondition = {
  atLineEnd: { triggers: 0, accepts: 0 },
  notAtLineEnd: { triggers: 0, accepts: 0 },
  inComment: { triggers: 0, accepts: 0 },
  notInComment: { triggers: 0, accepts: 0 }
};

// ... 计算逻辑

console.log('\n=== 接受率分析 ===');
console.log('行尾触发接受率:', 
  (acceptRateByCondition.atLineEnd.accepts / acceptRateByCondition.atLineEnd.triggers * 100).toFixed(2) + '%'
);
console.log('非行尾触发接受率:', 
  (acceptRateByCondition.notAtLineEnd.accepts / acceptRateByCondition.notAtLineEnd.triggers * 100).toFixed(2) + '%'
);
```

2. 运行分析

```bash
npx tsx scripts/analyze-triggers.ts
```

3. 生成报告

```markdown
# 触发数据分析报告

## 数据概览

- 收集时间：2026-02-03 ~ 2026-02-04
- 总触发次数：1,234
- FIM 触发：1,100 次
- NES 触发：134 次

## FIM 分析

- 接受率：38%
- 主要触发场景：
  - 行尾输入：65%（接受率 45%）
  - 行中输入：35%（接受率 25%）
- 问题场景：
  - 注释中触发：12%（接受率 5%）
  - 字符串中触发：8%（接受率 10%）
  - 短行触发（< 5 字符）：15%（接受率 15%）

## NES 分析

- 接受率：58%
- 主要触发场景：
  - 函数声明后：40%（接受率 70%）
  - 对象字面量：30%（接受率 60%）
  - 条件语句：20%（接受率 45%）

## 结论

1. FIM 在注释和字符串中触发价值低
2. FIM 在短行触发价值低
3. NES 在函数声明后效果最好
4. 建议：FIM 只在"有意义的时刻"触发
```

**验收标准**：
- 数据分析完成
- 识别出低价值触发场景
- 生成分析报告

---
#### 2.3 设计新策略（半天）

**目的**：基于数据设计新的触发策略

**实施步骤**：

1. 定义智能触发条件

```typescript
// src/engines/TriggerStrategy.ts

export interface TriggerContext {
  lineContent: string;
  lineLength: number;
  isAtLineEnd: boolean;
  isInComment: boolean;
  isInString: boolean;
  afterPunctuation: boolean;
  afterWhitespace: boolean;
  timeSinceLastEdit: number;
  timeSinceRejection: number;
}

export class SmartTriggerStrategy {
  /**
   * 判断是否应该触发 FIM
   */
  shouldTriggerFIM(context: TriggerContext): boolean {
    // 规则 1: 不在注释或字符串中
    if (context.isInComment || context.isInString) {
      return false;
    }
    
    // 规则 2: 行长度 > 5
    if (context.lineLength < 5) {
      return false;
    }
    
    // 规则 3: 在行尾或标点符号后
    if (!context.isAtLineEnd && !context.afterPunctuation) {
      return false;
    }
    
    // 规则 4: 距离上次拒绝 > 5 秒
    if (context.timeSinceRejection < 5000) {
      return false;
    }
    
    // 规则 5: 距离上次编辑 > 200ms（防抖）
    if (context.timeSinceLastEdit < 200) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 判断是否应该触发 NES
   */
  shouldTriggerNES(context: TriggerContext): boolean {
    // 规则 1: 只在行尾
    if (!context.isAtLineEnd) {
      return false;
    }
    
    // 规则 2: 不在注释或字符串中
    if (context.isInComment || context.isInString) {
      return false;
    }
    
    // 规则 3: 在"有意义的时刻"
    const meaningfulPatterns = [
      /function\s+\w+\s*\([^)]*\)\s*\{?\s*$/,  // 函数声明
      /const\s+\w+\s*=\s*\{?\s*$/,             // 对象字面量
      /if\s*\([^)]+\)\s*\{?\s*$/,              // if 语句
      /for\s*\([^)]+\)\s*\{?\s*$/,             // for 循环
      /\{\s*$/,                                 // 块开始
      /=>\s*\{?\s*$/                            // 箭头函数
    ];
    
    const matches = meaningfulPatterns.some(pattern => 
      pattern.test(context.lineContent)
    );
    
    if (!matches) {
      return false;
    }
    
    // 规则 4: 距离上次编辑 > 1 秒（给用户思考时间）
    if (context.timeSinceLastEdit < 1000) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 计算动态防抖时间
   */
  calculateDebounce(context: TriggerContext, engine: 'fim' | 'nes'): number {
    if (engine === 'fim') {
      // FIM: 200-500ms
      if (context.afterPunctuation) return 200;
      if (context.isAtLineEnd) return 300;
      return 500;
    } else {
      // NES: 1000-2000ms
      if (context.lineLength > 30) return 1000;
      return 1500;
    }
  }
}
```

2. 创建测试用例

```typescript
// src/__tests__/TriggerStrategy.test.ts

import { describe, it, expect } from 'vitest';
import { SmartTriggerStrategy } from '@/engines/TriggerStrategy';
import { createTriggerContext } from './helpers/testUtils';

describe('SmartTriggerStrategy', () => {
  const strategy = new SmartTriggerStrategy();
  
  describe('shouldTriggerFIM', () => {
    it('应该在有效场景触发', () => {
      const context = createTriggerContext({
        lineContent: 'const user = ',
        lineLength: 13,
        isAtLineEnd: true,
        isInComment: false,
        isInString: false,
        timeSinceLastEdit: 300,
        timeSinceRejection: 10000
      });
      
      expect(strategy.shouldTriggerFIM(context)).toBe(true);
    });
    
    it('不应该在注释中触发', () => {
      const context = createTriggerContext({
        lineContent: '// This is a ',
        isInComment: true
      });
      
      expect(strategy.shouldTriggerFIM(context)).toBe(false);
    });
    
    it('不应该在短行触发', () => {
      const context = createTriggerContext({
        lineContent: 'x = ',
        lineLength: 4
      });
      
      expect(strategy.shouldTriggerFIM(context)).toBe(false);
    });
    
    it('不应该在刚拒绝后触发', () => {
      const context = createTriggerContext({
        timeSinceRejection: 2000 // 2 秒前刚拒绝
      });
      
      expect(strategy.shouldTriggerFIM(context)).toBe(false);
    });
  });
  
  describe('shouldTriggerNES', () => {
    it('应该在函数声明后触发', () => {
      const context = createTriggerContext({
        lineContent: 'function hello() {',
        isAtLineEnd: true,
        timeSinceLastEdit: 1500
      });
      
      expect(strategy.shouldTriggerNES(context)).toBe(true);
    });
    
    it('应该在对象字面量后触发', () => {
      const context = createTriggerContext({
        lineContent: 'const user = {',
        isAtLineEnd: true,
        timeSinceLastEdit: 1500
      });
      
      expect(strategy.shouldTriggerNES(context)).toBe(true);
    });
    
    it('不应该在普通行触发', () => {
      const context = createTriggerContext({
        lineContent: 'const x = 1;',
        isAtLineEnd: true,
        timeSinceLastEdit: 1500
      });
      
      expect(strategy.shouldTriggerNES(context)).toBe(false);
    });
  });
  
  describe('calculateDebounce', () => {
    it('FIM 应该返回 200-500ms', () => {
      const context1 = createTriggerContext({ afterPunctuation: true });
      expect(strategy.calculateDebounce(context1, 'fim')).toBe(200);
      
      const context2 = createTriggerContext({ isAtLineEnd: true });
      expect(strategy.calculateDebounce(context2, 'fim')).toBe(300);
    });
    
    it('NES 应该返回 1000-2000ms', () => {
      const context1 = createTriggerContext({ lineLength: 50 });
      expect(strategy.calculateDebounce(context1, 'nes')).toBe(1000);
      
      const context2 = createTriggerContext({ lineLength: 10 });
      expect(strategy.calculateDebounce(context2, 'nes')).toBe(1500);
    });
  });
});
```

**验收标准**：
- 策略设计完成
- 单元测试通过
- 逻辑清晰，易于调整

---

### 阶段 2 验收标准

- [ ] 日志收集系统已集成
- [ ] 收集 > 500 个触发事件
- [ ] 数据分析完成
- [ ] 识别出低价值触发场景
- [ ] 新触发策略设计完成
- [ ] 策略单元测试通过
- [ ] 生成分析报告

### 预期产出

```
src/
├── engines/
│   └── TriggerStrategy.ts       (新建)
└── __tests__/
    └── TriggerStrategy.test.ts  (新建)

scripts/
└── analyze-triggers.ts          (新建)

docs/
└── TRIGGER_ANALYSIS.md          (新建)
```

---

## 阶段 3：触发时机优化实施（问题 1）

**目标**：实施新的触发策略

**时间**：1 周

**风险**：中高

### 任务清单

#### 3.1 实现智能触发条件（2 天）

**目的**：集成新的触发策略到引擎

**实施步骤**：

1. 修改 FIMEngine

```typescript
// src/engines/FIMEngine.ts

import { SmartTriggerStrategy } from './TriggerStrategy';
import { getFeatureFlags } from '@/config/features';
import { analytics } from '@/utils/Analytics';

export class FIMEngine {
  private strategy: SmartTriggerStrategy;
  private lastEditTime: number = 0;
  private lastRejectionTime: number = 0;
  
  constructor() {
    this.strategy = new SmartTriggerStrategy();
  }
  
  async provideInlineCompletions(model, position, context, token) {
    const flags = getFeatureFlags();
    
    // 构建触发上下文
    const lineContent = model.getLineContent(position.lineNumber);
    const triggerContext = {
      lineContent,
      lineLength: lineContent.length,
      isAtLineEnd: position.column === model.getLineMaxColumn(position.lineNumber),
      isInComment: this.isInComment(model, position),
      isInString: this.isInString(model, position),
      afterPunctuation: /[.,;:!?]\s*$/.test(lineContent.substring(0, position.column - 1)),
      afterWhitespace: /\s$/.test(lineContent.substring(0, position.column - 1)),
      timeSinceLastEdit: Date.now() - this.lastEditTime,
      timeSinceRejection: Date.now() - this.lastRejectionTime
    };
    
    // 智能触发判断
    if (flags.useSmartTrigger) {
      if (!this.strategy.shouldTriggerFIM(triggerContext)) {
        analytics.logEvent({
          engine: 'fim',
          action: 'skip',
          context: triggerContext
        });
        return { items: [] };
      }
    }
    
    // 记录触发
    analytics.logEvent({
      engine: 'fim',
      action: 'trigger',
      context: triggerContext
    });
    
    // 动态防抖
    const debounceMs = flags.useDynamicDebounce
      ? this.strategy.calculateDebounce(triggerContext, 'fim')
      : 300;
    
    // ... 现有的补全逻辑
    
    return { items: completions };
  }
  
  onAccept() {
    analytics.logEvent({
      engine: 'fim',
      action: 'accept',
      context: { /* ... */ }
    });
  }
  
  onReject() {
    this.lastRejectionTime = Date.now();
    analytics.logEvent({
      engine: 'fim',
      action: 'reject',
      context: { /* ... */ }
    });
  }
  
  private isInComment(model: any, position: any): boolean {
    const lineContent = model.getLineContent(position.lineNumber);
    const beforeCursor = lineContent.substring(0, position.column - 1);
    
    // 简单检测（可以用 Monaco 的 tokenization API 更准确）
    return beforeCursor.includes('//') || 
           beforeCursor.includes('/*') ||
           beforeCursor.includes('*');
  }
  
  private isInString(model: any, position: any): boolean {
    const lineContent = model.getLineContent(position.lineNumber);
    const beforeCursor = lineContent.substring(0, position.column - 1);
    
    // 简单检测
    const singleQuotes = (beforeCursor.match(/'/g) || []).length;
    const doubleQuotes = (beforeCursor.match(/"/g) || []).length;
    const backticks = (beforeCursor.match(/`/g) || []).length;
    
    return singleQuotes % 2 === 1 || 
           doubleQuotes % 2 === 1 || 
           backticks % 2 === 1;
  }
}
```

2. 修改 NESEngine

```typescript
// src/engines/NESEngine.ts

import { SmartTriggerStrategy } from './TriggerStrategy';
import { getFeatureFlags } from '@/config/features';
import { analytics } from '@/utils/Analytics';

export class NESEngine {
  private strategy: SmartTriggerStrategy;
  private lastEditTime: number = 0;
  
  constructor() {
    this.strategy = new SmartTriggerStrategy();
  }
  
  async provideInlineCompletions(model, position, context, token) {
    const flags = getFeatureFlags();
    
    // 构建触发上下文
    const lineContent = model.getLineContent(position.lineNumber);
    const triggerContext = {
      lineContent,
      lineLength: lineContent.length,
      isAtLineEnd: position.column === model.getLineMaxColumn(position.lineNumber),
      isInComment: this.isInComment(model, position),
      isInString: this.isInString(model, position),
      afterPunctuation: false,
      afterWhitespace: false,
      timeSinceLastEdit: Date.now() - this.lastEditTime,
      timeSinceRejection: 0
    };
    
    // 智能触发判断
    if (flags.useSmartTrigger) {
      if (!this.strategy.shouldTriggerNES(triggerContext)) {
        analytics.logEvent({
          engine: 'nes',
          action: 'skip',
          context: triggerContext
        });
        return { items: [] };
      }
    }
    
    // 记录触发
    analytics.logEvent({
      engine: 'nes',
      action: 'trigger',
      context: triggerContext
    });
    
    // 动态防抖
    const debounceMs = flags.useDynamicDebounce
      ? this.strategy.calculateDebounce(triggerContext, 'nes')
      : 3000;
    
    // ... 现有的补全逻辑
    
    return { items: completions };
  }
}
```

**验收标准**：
- 智能触发条件已集成
- 功能开关可以切换新旧策略
- 日志记录完整

---

#### 3.2 实现动态防抖（1 天）

**目的**：根据上下文动态调整防抖时间

**实施步骤**：

1. 修改 EngineDispatcher

```typescript
// src/services/EngineDispatcher.ts

import { SmartTriggerStrategy } from '@/engines/TriggerStrategy';
import { getFeatureFlags } from '@/config/features';

export class EngineDispatcher {
  private strategy: SmartTriggerStrategy;
  private fimDebounceTimer: number | null = null;
  private nesDebounceTimer: number | null = null;
  
  constructor() {
    this.strategy = new SmartTriggerStrategy();
  }
  
  async dispatch(model, position, context, token) {
    const flags = getFeatureFlags();
    
    // 构建触发上下文
    const triggerContext = this.buildTriggerContext(model, position);
    
    // 清除旧的定时器
    if (this.fimDebounceTimer) {
      clearTimeout(this.fimDebounceTimer);
    }
    if (this.nesDebounceTimer) {
      clearTimeout(this.nesDebounceTimer);
    }
    
    // 计算防抖时间
    const fimDebounce = flags.useDynamicDebounce
      ? this.strategy.calculateDebounce(triggerContext, 'fim')
      : 300;
    
    const nesDebounce = flags.useDynamicDebounce
      ? this.strategy.calculateDebounce(triggerContext, 'nes')
      : 3000;
    
    // FIM 防抖
    this.fimDebounceTimer = setTimeout(() => {
      this.fimEngine.provideInlineCompletions(model, position, context, token);
    }, fimDebounce);
    
    // NES 防抖
    this.nesDebounceTimer = setTimeout(() => {
      this.nesEngine.provideInlineCompletions(model, position, context, token);
    }, nesDebounce);
  }
  
  private buildTriggerContext(model: any, position: any) {
    // ... 构建上下文逻辑
  }
}
```

**验收标准**：
- 动态防抖已实现
- 防抖时间根据上下文调整
- 性能无明显下降

---

#### 3.3 实现职责分离（1 天）

**目的**：明确 FIM 和 NES 的职责边界

**实施步骤**：

1. 更新策略

```typescript
// src/engines/TriggerStrategy.ts

export class SmartTriggerStrategy {
  /**
   * FIM 职责：单行补全
   * - 变量名、属性名
   * - 函数参数
   * - 简单表达式
   */
  shouldTriggerFIM(context: TriggerContext): boolean {
    // ... 现有逻辑
    
    // 新增：如果是多行场景，不触发 FIM
    if (this.isMultiLineContext(context)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * NES 职责：多行预测
   * - 函数体
   * - 对象字面量
   * - 条件语句块
   */
  shouldTriggerNES(context: TriggerContext): boolean {
    // ... 现有逻辑
    
    // 新增：只在多行场景触发
    if (!this.isMultiLineContext(context)) {
      return false;
    }
    
    return true;
  }
  
  private isMultiLineContext(context: TriggerContext): boolean {
    const multiLinePatterns = [
      /function\s+\w+\s*\([^)]*\)\s*\{?\s*$/,
      /const\s+\w+\s*=\s*\{?\s*$/,
      /if\s*\([^)]+\)\s*\{?\s*$/,
      /for\s*\([^)]+\)\s*\{?\s*$/,
      /\{\s*$/,
      /=>\s*\{?\s*$/
    ];
    
    return multiLinePatterns.some(pattern => 
      pattern.test(context.lineContent)
    );
  }
}
```

**验收标准**：
- FIM 只在单行场景触发
- NES 只在多行场景触发
- 职责边界清晰

---

#### 3.4 集成测试（1 天）

**目的**：验证新策略在真实场景中的效果

**实施步骤**：

1. 创建 A/B 测试

```typescript
// src/__tests__/integration/trigger-ab-test.ts

import { describe, it, expect } from 'vitest';
import { setFeatureFlag } from '@/config/features';
import { analytics } from '@/utils/Analytics';

describe('Trigger Strategy A/B Test', () => {
  it('新策略应该减少触发次数', async () => {
    // A 组：旧策略
    setFeatureFlag('useSmartTrigger', false);
    analytics.clear();
    
    // 模拟编辑序列
    await simulateEditingSession();
    
    const oldStats = analytics.getStats();
    const oldTriggers = oldStats.fim.triggers + oldStats.nes.triggers;
    
    // B 组：新策略
    setFeatureFlag('useSmartTrigger', true);
    analytics.clear();
    
    await simulateEditingSession();
    
    const newStats = analytics.getStats();
    const newTriggers = newStats.fim.triggers + newStats.nes.triggers;
    
    // 验证：触发次数减少 > 30%
    const reduction = (oldTriggers - newTriggers) / oldTriggers;
    expect(reduction).toBeGreaterThan(0.3);
  });
  
  it('新策略应该提升接受率', async () => {
    // ... 类似逻辑
    
    // 验证：接受率提升 > 20%
    const improvement = (newAcceptRate - oldAcceptRate) / oldAcceptRate;
    expect(improvement).toBeGreaterThan(0.2);
  });
});
```

2. 手动测试

```
1. 启用新策略：setFeatureFlag('useSmartTrigger', true)
2. 正常编码 30 分钟
3. 导出数据：window.exportAnalytics()
4. 对比新旧策略的效果
```

**验收标准**：
- 触发次数减少 > 30%
- 接受率提升 > 20%
- 无漏触发（重要场景都能触发）
- 主观体验明显更好

---

### 阶段 3 验收标准

- [ ] 智能触发条件已实现
- [ ] 动态防抖已实现
- [ ] 职责分离已实现
- [ ] 集成测试通过
- [ ] A/B 测试通过
- [ ] 触发次数减少 > 30%
- [ ] 接受率提升 > 20%
- [ ] 用户体验改善

### 预期产出

```
src/
├── engines/
│   ├── FIMEngine.ts             (修改)
│   ├── NESEngine.ts             (修改)
│   └── TriggerStrategy.ts       (修改)
├── services/
│   └── EngineDispatcher.ts      (修改)
└── __tests__/
    └── integration/
        └── trigger-ab-test.ts   (新建)
```

---
## 阶段 4：自适应优化（可选）

**目标**：根据用户行为自动调整触发策略

**时间**：1-2 周

**风险**：低

**优先级**：P2（可选）

### 为什么是可选？

1. ✅ **前置阶段已解决主要问题**：阶段 1-3 已经大幅改善体验
2. ⚠️ **复杂度高**：需要机器学习或复杂的启发式算法
3. 📊 **需要更多数据**：需要长期收集用户行为数据
4. 🎯 **边际收益递减**：投入产出比不如前面阶段

### 任务清单

#### 4.1 用户行为追踪（3 天）

**目的**：收集用户的个性化行为模式

**实施步骤**：

1. 创建行为追踪器

```typescript
// src/utils/BehaviorTracker.ts

export interface UserBehavior {
  // 编码习惯
  avgLineLength: number;
  avgEditInterval: number;
  preferredLanguages: string[];
  
  // 接受模式
  acceptRateByTime: Map<number, number>; // 时间段 -> 接受率
  acceptRateByContext: Map<string, number>; // 上下文 -> 接受率
  
  // 拒绝模式
  rejectReasons: Map<string, number>; // 原因 -> 次数
  
  // 触发偏好
  preferredDebounce: number;
  preferredTriggerFrequency: number;
}

export class BehaviorTracker {
  private behavior: UserBehavior;
  private readonly STORAGE_KEY = 'ai-assistant-behavior';
  
  constructor() {
    this.behavior = this.loadBehavior();
  }
  
  /**
   * 更新行为数据
   */
  updateBehavior(event: TriggerEvent): void {
    // 更新平均行长度
    if (event.context.lineLength) {
      this.behavior.avgLineLength = 
        (this.behavior.avgLineLength * 0.9) + 
        (event.context.lineLength * 0.1);
    }
    
    // 更新接受率
    if (event.action === 'accept' || event.action === 'reject') {
      const hour = new Date().getHours();
      const currentRate = this.behavior.acceptRateByTime.get(hour) || 0.5;
      const newRate = event.action === 'accept' ? 1 : 0;
      this.behavior.acceptRateByTime.set(
        hour,
        currentRate * 0.9 + newRate * 0.1
      );
    }
    
    // 定期保存
    this.saveBehavior();
  }
  
  /**
   * 获取推荐的防抖时间
   */
  getRecommendedDebounce(engine: 'fim' | 'nes'): number {
    // 基于用户的编辑速度调整
    if (this.behavior.avgEditInterval < 100) {
      // 快速打字者：更长的防抖
      return engine === 'fim' ? 400 : 2000;
    } else if (this.behavior.avgEditInterval > 500) {
      // 慢速打字者：更短的防抖
      return engine === 'fim' ? 200 : 1000;
    } else {
      // 默认
      return engine === 'fim' ? 300 : 1500;
    }
  }
  
  /**
   * 获取推荐的触发阈值
   */
  getRecommendedThreshold(context: TriggerContext): number {
    const hour = new Date().getHours();
    const acceptRate = this.behavior.acceptRateByTime.get(hour) || 0.5;
    
    // 如果这个时间段接受率低，提高阈值（减少触发）
    if (acceptRate < 0.3) {
      return 0.7; // 高阈值
    } else if (acceptRate > 0.6) {
      return 0.3; // 低阈值
    } else {
      return 0.5; // 中等阈值
    }
  }
  
  private loadBehavior(): UserBehavior {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[BehaviorTracker] Load error:', e);
    }
    
    return this.getDefaultBehavior();
  }
  
  private saveBehavior(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.behavior));
    } catch (e) {
      console.warn('[BehaviorTracker] Save error:', e);
    }
  }
  
  private getDefaultBehavior(): UserBehavior {
    return {
      avgLineLength: 30,
      avgEditInterval: 200,
      preferredLanguages: ['typescript', 'javascript'],
      acceptRateByTime: new Map(),
      acceptRateByContext: new Map(),
      rejectReasons: new Map(),
      preferredDebounce: 300,
      preferredTriggerFrequency: 20
    };
  }
}

// 全局实例
export const behaviorTracker = new BehaviorTracker();
```

2. 集成到 Analytics

```typescript
// src/utils/Analytics.ts

import { behaviorTracker } from './BehaviorTracker';

export class Analytics {
  logEvent(event: Omit<TriggerEvent, 'timestamp'>): void {
    const fullEvent: TriggerEvent = {
      ...event,
      timestamp: Date.now()
    };
    
    this.events.push(fullEvent);
    
    // 更新行为追踪
    behaviorTracker.updateBehavior(fullEvent);
    
    // ... 其他逻辑
  }
}
```

**验收标准**：
- 行为追踪器已实现
- 可以收集用户行为数据
- 数据持久化到 localStorage

---

#### 4.2 自适应策略实现（4 天）

**目的**：根据用户行为动态调整触发策略

**实施步骤**：

1. 创建自适应策略

```typescript
// src/engines/AdaptiveStrategy.ts

import { SmartTriggerStrategy } from './TriggerStrategy';
import { behaviorTracker } from '@/utils/BehaviorTracker';

export class AdaptiveStrategy extends SmartTriggerStrategy {
  /**
   * 自适应触发判断
   */
  shouldTriggerFIM(context: TriggerContext): boolean {
    // 先用基础规则过滤
    if (!super.shouldTriggerFIM(context)) {
      return false;
    }
    
    // 获取推荐阈值
    const threshold = behaviorTracker.getRecommendedThreshold(context);
    
    // 计算触发置信度
    const confidence = this.calculateConfidence(context, 'fim');
    
    // 只有置信度超过阈值才触发
    return confidence >= threshold;
  }
  
  /**
   * 自适应 NES 触发
   */
  shouldTriggerNES(context: TriggerContext): boolean {
    if (!super.shouldTriggerNES(context)) {
      return false;
    }
    
    const threshold = behaviorTracker.getRecommendedThreshold(context);
    const confidence = this.calculateConfidence(context, 'nes');
    
    return confidence >= threshold;
  }
  
  /**
   * 计算触发置信度
   */
  private calculateConfidence(
    context: TriggerContext,
    engine: 'fim' | 'nes'
  ): number {
    let confidence = 0.5; // 基础置信度
    
    // 因素 1: 行长度
    if (context.lineLength > 10) {
      confidence += 0.1;
    }
    
    // 因素 2: 位置
    if (context.isAtLineEnd) {
      confidence += 0.15;
    }
    
    // 因素 3: 标点符号
    if (context.afterPunctuation) {
      confidence += 0.1;
    }
    
    // 因素 4: 时间间隔
    if (context.timeSinceLastEdit > 500) {
      confidence += 0.1;
    }
    
    // 因素 5: 历史接受率
    const hour = new Date().getHours();
    const historicalRate = behaviorTracker.behavior.acceptRateByTime.get(hour);
    if (historicalRate) {
      confidence = confidence * 0.7 + historicalRate * 0.3;
    }
    
    return Math.min(1, Math.max(0, confidence));
  }
  
  /**
   * 自适应防抖
   */
  calculateDebounce(context: TriggerContext, engine: 'fim' | 'nes'): number {
    // 使用用户行为推荐的防抖时间
    const recommended = behaviorTracker.getRecommendedDebounce(engine);
    
    // 根据上下文微调
    if (context.afterPunctuation) {
      return recommended * 0.8;
    }
    
    if (context.timeSinceLastEdit < 200) {
      return recommended * 1.2;
    }
    
    return recommended;
  }
}
```

2. 集成到引擎

```typescript
// src/engines/FIMEngine.ts

import { AdaptiveStrategy } from './AdaptiveStrategy';
import { getFeatureFlags } from '@/config/features';

export class FIMEngine {
  private strategy: SmartTriggerStrategy | AdaptiveStrategy;
  
  constructor() {
    const flags = getFeatureFlags();
    this.strategy = flags.useAdaptiveStrategy
      ? new AdaptiveStrategy()
      : new SmartTriggerStrategy();
  }
  
  // ... 其他逻辑保持不变
}
```

**验收标准**：
- 自适应策略已实现
- 可以根据用户行为调整
- 功能开关可以切换

---

#### 4.3 长期验证（1 周）

**目的**：验证自适应策略的长期效果

**实施步骤**：

1. 启用自适应策略

```typescript
setFeatureFlag('useAdaptiveStrategy', true);
```

2. 使用 1 周

```
正常使用编辑器，让系统学习你的习惯
```

3. 对比效果

```typescript
// 查看统计
window.getAnalytics();

// 查看行为数据
console.log(behaviorTracker.behavior);
```

**验收标准**：
- 系统能够学习用户习惯
- 触发策略随时间优化
- 接受率持续提升
- 用户体验更加个性化

---

### 阶段 4 验收标准

- [ ] 行为追踪器已实现
- [ ] 自适应策略已实现
- [ ] 长期验证完成
- [ ] 接受率持续提升
- [ ] 用户体验个性化
- [ ] 系统稳定性良好

### 预期产出

```
src/
├── engines/
│   └── AdaptiveStrategy.ts      (新建)
├── utils/
│   └── BehaviorTracker.ts       (新建)
└── __tests__/
    ├── AdaptiveStrategy.test.ts (新建)
    └── BehaviorTracker.test.ts  (新建)
```

---

## 验收标准

### 阶段 0：准备工作

- [ ] 功能开关系统可用
- [ ] 日志收集系统可用
- [ ] 测试基础设施就绪
- [ ] 文档准备完成

### 阶段 1：Parser 替换

- [ ] Acorn 依赖已安装
- [ ] AcornAnalyzer 实现完成
- [ ] CoordinateFixer 集成 Acorn
- [ ] 所有单元测试通过
- [ ] 性能提升 > 5x
- [ ] 体积减少 > 2MB
- [ ] Tree-sitter 依赖已移除

### 阶段 2：触发时机验证

- [ ] 收集 > 500 个触发事件
- [ ] 数据分析完成
- [ ] 新触发策略设计完成
- [ ] 策略单元测试通过

### 阶段 3：触发时机实施

- [ ] 智能触发条件已实现
- [ ] 动态防抖已实现
- [ ] 职责分离已实现
- [ ] 触发次数减少 > 30%
- [ ] 接受率提升 > 20%
- [ ] 用户体验改善

### 阶段 4：自适应优化（可选）

- [ ] 行为追踪器已实现
- [ ] 自适应策略已实现
- [ ] 长期验证完成
- [ ] 接受率持续提升

---

## 回滚方案

### 快速回滚

如果发现问题，可以通过功能开关快速回滚：

```typescript
// 回滚到旧的 Parser
setFeatureFlag('useAcornParser', false);
setFeatureFlag('useTreeSitterFallback', true);

// 回滚到旧的触发策略
setFeatureFlag('useSmartTrigger', false);
setFeatureFlag('useDynamicDebounce', false);

// 回滚自适应策略
setFeatureFlag('useAdaptiveStrategy', false);

// 刷新页面
location.reload();
```

### 代码回滚

如果需要完全回滚代码：

```bash
# 查看提交历史
git log --oneline

# 回滚到指定提交
git revert <commit-hash>

# 或者硬回滚（慎用）
git reset --hard <commit-hash>
```

### 分阶段回滚

如果只想回滚某个阶段：

1. **回滚阶段 4**：删除 AdaptiveStrategy 和 BehaviorTracker
2. **回滚阶段 3**：删除 SmartTriggerStrategy 的集成
3. **回滚阶段 2**：删除数据收集代码
4. **回滚阶段 1**：恢复 Tree-sitter，删除 Acorn

### 数据备份

在每个阶段开始前，备份重要数据：

```bash
# 备份代码
git branch backup-before-stage-1
```

```powershell
# Windows PowerShell - 备份配置
Copy-Item -Recurse .kiro .kiro.backup
```

```javascript
// 浏览器控制台 - 备份数据
window.exportAnalytics(); // 保存到文件
```

---

## 总结

### 实施路径

```
准备工作 (1天)
  ↓
Parser 替换 (1-2周) ← 优先，风险低，收益明确
  ↓
触发验证 (1周) ← 数据驱动
  ↓
触发实施 (1周) ← 基于验证结果
  ↓
自适应优化 (1-2周) ← 可选，锦上添花
```

### 关键原则

1. **小步快跑**：每个阶段独立，可验证，可回滚
2. **数据驱动**：用真实数据验证，不凭感觉
3. **风险控制**：功能开关 + 回滚方案
4. **持续优化**：收集反馈，迭代改进

### 预期收益

- **体积**：减少 ~2MB（97.5%）
- **性能**：提升 5-20x
- **触发次数**：减少 30-50%
- **接受率**：提升 20-40%
- **用户体验**：显著改善

### 风险提示

1. ⚠️ **Parser 替换**：可能影响坐标计算准确性（通过测试覆盖）
2. ⚠️ **触发优化**：可能导致漏触发（通过数据验证）
3. ⚠️ **自适应策略**：可能过度优化（通过阈值控制）

### 依赖版本建议

实施时建议安装以下版本：

```json
{
  "dependencies": {
    "acorn": "^8.15.0",      // 最新版本，支持 ES2024
    "acorn-walk": "^8.3.4"   // 最新版本，支持最新 AST 遍历
  },
  "devDependencies": {
    "vitest": "^4.0.17",              // 已安装
    "@vitest/coverage-v8": "^4.0.17", // 已安装
    "@types/acorn": "^4.0.6"          // Acorn 类型定义
  }
}
```

安装命令：

```bash
pnpm add acorn acorn-walk
pnpm add -D @types/acorn
```

### 下一步

1. 阅读本文档，理解整体方案
2. 执行阶段 0，搭建基础设施（包括类型定义）
3. 执行阶段 1，替换 Parser
4. 根据实际情况决定是否继续后续阶段

### 注意事项

- **Windows 用户**：文档中的命令已适配 PowerShell，也可使用提供的 Node.js 脚本
- **类型安全**：所有核心接口都已在 `src/types/index.ts` 中定义
- **测试优先**：每个阶段都有完整的测试用例，确保代码质量
- **可回滚**：通过功能开关可以快速回滚到旧版本

---

**祝实施顺利！** 🚀

如有问题，请参考：
- `OPTIMIZATION_PROPOSAL.md` - 优化方案详细设计
- `claude.md` - 项目技术文档
- `docs/` - 其他相关文档
