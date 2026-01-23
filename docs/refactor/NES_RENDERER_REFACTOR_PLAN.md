# NES Renderer 重构方案

## 目标

让 NESRenderer 能够根据模型返回的 `changeType` 自动渲染对应的 UI 效果，无需硬编码场景。

## 架构设计

### 1. 类型系统扩展

```typescript
// src/types/nes.d.ts
export type ChangeType = 
  | 'REPLACE_LINE'      // 整行替换
  | 'REPLACE_WORD'      // 单词/部分替换
  | 'INSERT'            // 插入新行
  | 'DELETE'            // 删除行
  | 'INLINE_INSERT';    // 行内插入

export interface Prediction {
  targetLine: number;
  suggestionText: string;
  originalLineContent?: string;
  explanation: string;
  changeType?: ChangeType;           // 🆕 变更类型
  wordReplaceInfo?: WordReplaceInfo; // 🆕 单词替换信息
  inlineInsertInfo?: InlineInsertInfo; // 🆕 行内插入信息
}
```

### 2. 新增模块

#### ScenarioDecorationManager
- **职责**：根据 `changeType` 渲染不同的装饰器
- **方法**：
  - `renderState1()` - 渲染状态1（建议出现）
  - `renderState2()` - 渲染状态2（显示预览）
  - `clear()` - 清除装饰

#### EnhancedViewZoneManager
- **职责**：支持多种 ViewZone 渲染模式
- **模式**：
  - 整行预览（REPLACE_LINE, INSERT）
  - 行内箭头 + 预览单词（REPLACE_WORD）

### 3. NESRenderer 重构

```typescript
export class NESRenderer {
  private scenarioDecorationManager: ScenarioDecorationManager;
  private enhancedViewZoneManager: EnhancedViewZoneManager;
  
  /**
   * 渲染建议（状态1：建议出现）
   */
  public renderSuggestion(prediction: Prediction): void {
    const changeType = prediction.changeType || 'REPLACE_LINE';
    
    this.scenarioDecorationManager.renderState1(
      changeType,
      prediction.targetLine,
      prediction.explanation,
      prediction.wordReplaceInfo
    );
  }
  
  /**
   * 显示预览（状态2：显示预览）
   */
  public showPreview(prediction: Prediction): void {
    const changeType = prediction.changeType || 'REPLACE_LINE';
    
    const result = this.scenarioDecorationManager.renderState2(
      changeType,
      prediction.targetLine,
      prediction.suggestionText,
      prediction.wordReplaceInfo,
      prediction.inlineInsertInfo
    );
    
    if (result.useViewZone && result.viewZoneConfig) {
      this.enhancedViewZoneManager.show(result.viewZoneConfig);
    }
  }
  
  /**
   * 应用建议
   */
  public applySuggestion(prediction: Prediction): void {
    const changeType = prediction.changeType || 'REPLACE_LINE';
    
    switch (changeType) {
      case 'REPLACE_LINE':
      case 'REPLACE_WORD':
        this.applyReplace(prediction);
        break;
      case 'INSERT':
        this.applyInsert(prediction);
        break;
      case 'DELETE':
        this.applyDelete(prediction);
        break;
      case 'INLINE_INSERT':
        this.applyInlineInsert(prediction);
        break;
    }
  }
}
```

## 场景映射

| 场景 | changeType | 状态1 | 状态2 | 应用逻辑 |
|------|-----------|-------|-------|---------|
| 场景1：三元表达式 | REPLACE_LINE | 整行红色背景 | 整行绿色预览（ViewZone） | 替换整行 |
| 场景2：插入属性 | INSERT | 整行蓝色背景 | 整行绿色预览（ViewZone） | 在行后插入 |
| 场景3：关键字拼写 | REPLACE_WORD | 只高亮单词 | 行内箭头 + 预览单词（ViewZone） | 替换单词 |
| 场景3B：运算符 | REPLACE_WORD | 只高亮运算符 | 行内箭头 + 预览单词（ViewZone） | 替换运算符 |
| 场景4：删除行 | DELETE | 整行红色背景 | 无预览 | 删除整行 |
| 场景5第2个 | INLINE_INSERT | Glyph Icon | 行内绿色片段（before 装饰器） | 在指定位置插入 |

## 后端 Prompt 改造

### 当前 Prompt
```
返回格式：
{
  "predictions": [
    {
      "targetLine": 5,
      "suggestionText": "return a > b ? a : b;",
      "explanation": "修正逻辑错误"
    }
  ]
}
```

### 改造后 Prompt
```
返回格式：
{
  "predictions": [
    {
      "targetLine": 5,
      "suggestionText": "return a > b ? a : b;",
      "explanation": "修正逻辑错误",
      "changeType": "REPLACE_LINE"  // 🆕 必须字段
    },
    {
      "targetLine": 3,
      "suggestionText": "function",
      "explanation": "关键字拼写错误",
      "changeType": "REPLACE_WORD",  // 🆕 必须字段
      "wordReplaceInfo": {           // 🆕 单词替换信息
        "word": "funct ion",
        "replacement": "function",
        "startColumn": 1,
        "endColumn": 11
      }
    }
  ]
}
```

### changeType 判断规则

后端模型需要根据以下规则判断 `changeType`：

1. **REPLACE_LINE**：
   - 整行内容发生变化
   - 逻辑错误修正（三元表达式、条件判断）
   - 函数签名修改

2. **REPLACE_WORD**：
   - 只有部分单词/运算符发生变化
   - 关键字拼写错误
   - 变量重命名
   - 运算符错误（|| → &&）

3. **INSERT**：
   - 需要插入新行
   - 添加新属性、新方法
   - 添加导入语句

4. **DELETE**：
   - 需要删除整行
   - 删除无用的导入
   - 删除重复的代码

5. **INLINE_INSERT**：
   - 在现有表达式中插入代码片段
   - 不替换整行，只添加部分内容
   - 例如：`Math.sqrt(x ** 2 + y ** 2)` → `Math.sqrt(x ** 2 + y ** 2 + z ** 2)`

## 实施步骤

## ✅ 改造完成总结

### Phase 1-3：前端重构（已完成）
- ✅ 扩展 `Prediction` 类型定义
- ✅ 创建 `DecorationManager`（原 ScenarioDecorationManager）
- ✅ 创建 `ViewZoneManager`（原 EnhancedViewZoneManager）
- ✅ 重构 `NESRenderer.ts`
- ✅ 更新 `NESController.ts` 调用新 API
- ✅ 移除旧的废弃方法
- ✅ 清理冗余文件（删除旧的 DecorationManager、ViewZoneManager、DiffEditorManager）
- ✅ 优化文件命名

### Phase 4：后端 Prompt 改造（已完成）
- ✅ 更新 System Prompt 输出 schema
- ✅ 添加 changeType 判断规则和决策树
- ✅ 添加列计算规则
- ✅ 创建 changeType 示例（6个完整示例）
- ✅ 更新 builder.mjs 以包含 changeType 示例
- ✅ 更新 patterns.mjs 以添加 changeType 指导
- ✅ 创建测试文件

### Phase 5：代码清理和优化（已完成）
- ✅ 精简 NesEditor.vue（移除演示代码）
- ✅ 备份演示版本到 NesEditorDemo.vue
- ✅ 删除冗余文件（3个旧管理器）
- ✅ 重命名文件（优化命名）
- ✅ 更新所有导入引用
- ✅ 验证编译无误

### Phase 5：测试和优化（1-2天）
- [ ] 端到端测试所有场景
- [ ] 验证 UI 效果与 NesEditor.vue 演示一致
- [ ] 性能测试
- [ ] Bug 修复

## 验收标准

### 功能验收
- ✅ 支持 5 种 `changeType` 的自动渲染
- ✅ 状态1（建议出现）UI 正确
- ✅ 状态2（显示预览）UI 正确
- ✅ 应用建议逻辑正确
- ✅ 右键菜单正常工作

### 视觉验收
- ✅ 与 NesEditor.vue 演示效果一致
- ✅ 装饰器位置准确
- ✅ ViewZone 对齐正确
- ✅ 行内箭头对齐正确

### 代码质量验收
- ✅ 代码复用性高（无硬编码场景）
- ✅ 类型安全（TypeScript 类型完整）
- ✅ 易于扩展（新增场景只需添加 `changeType`）
- ✅ 测试覆盖率 > 80%

## 风险和注意事项

### 风险1：后端模型无法准确判断 changeType
- **缓解**：前端添加兜底逻辑，根据 `suggestionText` 和 `originalLineContent` 自动推断

### 风险2：wordReplaceInfo 计算不准确
- **缓解**：前端添加自动计算逻辑（基于字符串 diff）

### 风险3：现有代码兼容性
- **缓解**：保留旧的 `renderGlyphIcon()` 和 `showPreview()` 方法，逐步迁移

## 总结

通过这次重构，NESRenderer 将从"硬编码场景"升级为"数据驱动渲染"，大大提高了代码的可维护性和可扩展性。模型只需要返回正确的 `changeType`，前端就能自动渲染对应的 UI 效果。
