/**
 * CoordinateFixer
 * 负责修复 AI 返回的列坐标，处理 Tab/Space/Unicode 等复杂情况
 * 
 * 策略：
 * 1. 优先使用 Monaco findMatches（最准确）
 * 2. 过滤注释中的匹配（可选）
 * 3. Fallback 到字符索引转换
 */

import * as monaco from 'monaco-editor';
import type { Prediction, WordReplaceInfo, InlineInsertInfo } from '../../types/nes';

export interface CoordinateFixerOptions {
  /**
   * 是否过滤注释中的匹配
   * 默认：false（匹配所有位置）
   */
  filterComments?: boolean;
  
  /**
   * Tab 宽度（用于 fallback 计算）
   * 默认：4
   */
  tabSize?: number;
}

export class CoordinateFixer {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private options: Required<CoordinateFixerOptions>;

  constructor(editor: monaco.editor.IStandaloneCodeEditor, options: CoordinateFixerOptions = {}) {
    this.editor = editor;
    this.options = {
      filterComments: options.filterComments ?? false,
      tabSize: options.tabSize ?? 4
    };
  }

  /**
   * 修复 Prediction 的列坐标
   */
  public fix(pred: Prediction): Prediction {
    const model = this.editor.getModel();
    if (!model) return pred;

    // 修复 wordReplaceInfo
    if (pred.wordReplaceInfo) {
      const fixed = this.fixWordReplace(pred, model);
      if (fixed) {
        pred.wordReplaceInfo = fixed;
      }
    }

    // 修复 inlineInsertInfo
    if (pred.inlineInsertInfo) {
      const fixed = this.fixInlineInsert(pred, model);
      if (fixed) {
        pred.inlineInsertInfo = fixed;
      }
    }

    return pred;
  }

  /**
   * 修复 REPLACE_WORD 的列坐标
   */
  private fixWordReplace(
    pred: Prediction,
    model: monaco.editor.ITextModel
  ): WordReplaceInfo | null {
    const { word, replacement, startColumn } = pred.wordReplaceInfo!;
    const targetLine = pred.targetLine;

    // 策略 1：使用 Monaco findMatches
    try {
      const matches = model.findMatches(
        word,
        new monaco.Range(targetLine, 1, targetLine, model.getLineMaxColumn(targetLine)),
        false,  // isRegex
        true,   // matchCase
        null,   // wordSeparators
        true    // captureMatches
      );

      if (matches.length > 0) {
        // 过滤注释中的匹配（如果启用）
        const filteredMatches = this.options.filterComments
          ? this.filterCommentsMatches(matches, targetLine, model)
          : matches;

        if (filteredMatches.length > 0) {
          // 选择最接近 AI 预测位置的匹配
          const bestMatch = this.findClosestMatch(filteredMatches, startColumn);
          
          console.log(`[CoordinateFixer] 🎯 Found "${word}" at ${bestMatch.range.startColumn}-${bestMatch.range.endColumn}`);
          
          return {
            word,
            replacement,
            startColumn: bestMatch.range.startColumn,
            endColumn: bestMatch.range.endColumn
          };
        }

        console.warn(`[CoordinateFixer] ⚠️ All matches filtered out (comments)`);
      }

      console.warn(`[CoordinateFixer] ⚠️ No matches found for "${word}"`);
    } catch (error) {
      console.error(`[CoordinateFixer] ❌ findMatches error:`, error);
    }

    // 策略 2：Fallback 到字符索引转换
    return this.fallbackCharIndexConversion(pred, model);
  }

  /**
   * 修复 INLINE_INSERT 的列坐标
   * 使用智能搜索策略定位插入位置
   */
  private fixInlineInsert(
    pred: Prediction,
    model: monaco.editor.ITextModel
  ): InlineInsertInfo | null {
    const { content, insertColumn } = pred.inlineInsertInfo!;
    const lineContent = model.getLineContent(pred.targetLine);
    const tabSize = model.getOptions().tabSize || this.options.tabSize;

    // 策略 1：智能锚点搜索（针对 addParameter 场景）
    const smartColumn = this.findInsertPositionByAnchor(lineContent, content, insertColumn, tabSize);
    if (smartColumn !== null) {
      console.log(`[CoordinateFixer] 🎯 Smart anchor: ${insertColumn} → ${smartColumn}`);
      return { content, insertColumn: smartColumn };
    }

    // 策略 2：Fallback 到字符索引转换
    const fixedColumn = this.charIndexToMonacoColumn(lineContent, insertColumn - 1, tabSize);
    console.log(`[CoordinateFixer] 🔧 Fallback INLINE_INSERT: ${insertColumn} → ${fixedColumn}`);
    
    return { content, insertColumn: fixedColumn };
  }

  /**
   * 通过锚点搜索找到插入位置
   * 
   * 场景识别：
   * - addParameter: 在函数调用的 '(' 后插入
   * - templateString: 在模板字符串中插入插值
   * - expressionAppend: 在表达式末尾追加
   * - methodChain: 在方法链中插入
   */
  private findInsertPositionByAnchor(
    line: string,
    content: string,
    hintColumn: number,
    tabSize: number
  ): number | null {
    // 场景 1：addParameter - 在函数调用的 '(' 后插入参数
    // 例如：createUserInfo("Alice") → createUserInfo(25, "Alice")
    if (this.isAddParameterScenario(content)) {
      return this.findParameterInsertPosition(line, hintColumn, tabSize);
    }

    // 场景 2：模板字符串插值 - 在模板字符串中插入 ${...}
    // 例如：`${name} + ${email}` → `${name} + ${age} + ${email}`
    if (this.isTemplateStringScenario(content, line)) {
      return this.findTemplateStringInsertPosition(line, content, hintColumn, tabSize);
    }

    // 场景 3：在表达式末尾插入（如 + z ** 2）
    // 例如：x ** 2 + y ** 2 → x ** 2 + y ** 2 + z ** 2
    if (this.isExpressionAppendScenario(content)) {
      return this.findExpressionAppendPosition(line, hintColumn, tabSize);
    }

    // 场景 4：方法链插入（如 .filter(x => x > 0)）
    // 例如：.map(x => x) → .map(x => x).filter(x => x > 0)
    if (this.isMethodChainScenario(content)) {
      return this.findMethodChainPosition(line, hintColumn, tabSize);
    }

    return null; // 无法识别场景，使用 fallback
  }

  /**
   * 判断是否为模板字符串场景
   */
  private isTemplateStringScenario(content: string, line: string): boolean {
    // 检查 content 是否包含模板字符串插值语法
    // 例如：" + ${age}" 或 "${age} + "
    if (/\$\{[^}]+\}/.test(content)) {
      // 检查行中是否有反引号（模板字符串标记）
      return line.includes('`');
    }
    return false;
  }

  /**
   * 判断是否为 addParameter 场景
   */
  private isAddParameterScenario(content: string): boolean {
    const trimmed = content.trim();
    // 场景 1：以逗号开头 → 在现有参数后追加
    // ", 25" 或 ", age"
    if (/^,/.test(trimmed)) {
      return true;
    }
    // 场景 2：以参数值开头，后面跟逗号 → 在第一个位置插入
    // "25, " 或 "age, "
    if (/^(\d+|"[^"]*"|'[^']*'|[a-zA-Z_]\w*)\s*,/.test(trimmed)) {
      return true;
    }
    return false;
  }

  /**
   * 判断是否为表达式追加场景
   */
  private isExpressionAppendScenario(content: string): boolean {
    const trimmed = content.trim();
    // 以运算符开头（+, -, *, /, &&, ||, 等）
    return /^(\+|-|\*|\/|&&|\|\||&|\||\^|<<|>>)/.test(trimmed);
  }

  /**
   * 判断是否为方法链场景
   */
  private isMethodChainScenario(content: string): boolean {
    const trimmed = content.trim();
    // 以 . 开头，后面跟方法名
    return /^\.[a-zA-Z_]\w*\s*\(/.test(trimmed);
  }

  /**
   * 查找模板字符串插入位置
   * 
   * 策略：
   * 1. 找到所有 ${...} 插值的位置
   * 2. 根据 content 判断是在某个插值前还是后插入
   * 3. 返回精确的插入位置
   */
  private findTemplateStringInsertPosition(
    line: string,
    content: string,
    hintColumn: number,
    tabSize: number
  ): number | null {
    // 查找所有 ${...} 的位置
    const interpolations: Array<{ start: number; end: number }> = [];
    let inInterpolation = false;
    let depth = 0;
    let startIndex = -1;
    
    for (let i = 0; i < line.length - 1; i++) {
      if (line[i] === '$' && line[i + 1] === '{') {
        if (!inInterpolation) {
          inInterpolation = true;
          startIndex = i;
          depth = 1;
          i++; // 跳过 '{'
        }
      } else if (inInterpolation) {
        if (line[i] === '{') {
          depth++;
        } else if (line[i] === '}') {
          depth--;
          if (depth === 0) {
            interpolations.push({ start: startIndex, end: i + 1 });
            inInterpolation = false;
          }
        }
      }
    }
    
    if (interpolations.length === 0) {
      console.warn(`[CoordinateFixer] ⚠️ No template interpolations found`);
      return null;
    }
    
    // 将 hintColumn 转换为字符索引
    const hintCharIndex = this.monacoColumnToCharIndex(line, hintColumn, tabSize);
    
    // 找到最接近 hint 的插值位置
    let insertCharIndex: number;
    
    // 检查 content 的格式来判断插入位置
    const contentTrimmed = content.trim();
    
    if (contentTrimmed.startsWith('${')) {
      // content 以 ${...} 开头 → 在某个插值后插入
      // 例如：`${name}` → `${name} + ${age}`
      const closestInterpolation = interpolations.reduce((closest, interp) => {
        const currentDist = Math.abs(interp.end - hintCharIndex);
        const closestDist = Math.abs(closest.end - hintCharIndex);
        return currentDist < closestDist ? interp : closest;
      });
      
      insertCharIndex = closestInterpolation.end;
      console.log(`[CoordinateFixer] 🔍 Template: Insert after interpolation at char ${insertCharIndex}`);
    } else if (contentTrimmed.endsWith('}')) {
      // content 以 } 结尾 → 在某个插值前插入
      // 例如：`${email}` → `${age} + ${email}`
      const closestInterpolation = interpolations.reduce((closest, interp) => {
        const currentDist = Math.abs(interp.start - hintCharIndex);
        const closestDist = Math.abs(closest.start - hintCharIndex);
        return currentDist < closestDist ? interp : closest;
      });
      
      insertCharIndex = closestInterpolation.start;
      console.log(`[CoordinateFixer] 🔍 Template: Insert before interpolation at char ${insertCharIndex}`);
    } else {
      // 无法判断，使用 hint 位置
      insertCharIndex = hintCharIndex;
      console.log(`[CoordinateFixer] 🔍 Template: Use hint position at char ${insertCharIndex}`);
    }
    
    const insertColumn = this.charIndexToMonacoColumn(line, insertCharIndex, tabSize);
    console.log(`[CoordinateFixer] 🎯 Template string: Insert at column ${insertColumn}`);
    return insertColumn;
  }

  /**
   * 查找参数插入位置（addParameter 场景）
   * 
   * 策略：
   * 1. content 以 ", " 开头 → 在现有参数后插入（追加参数）
   * 2. content 以参数值开头 → 在第一个位置插入（前置参数）
   */
  private findParameterInsertPosition(line: string, hintColumn: number, tabSize: number): number | null {
    // 查找所有左括号的位置
    const openParenPositions: number[] = [];
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '(' && !this.isInString(line.substring(0, i))) {
        openParenPositions.push(i);
      }
    }

    if (openParenPositions.length === 0) return null;

    // 找到最接近 hintColumn 的左括号
    const hintCharIndex = this.monacoColumnToCharIndex(line, hintColumn, tabSize);
    const closestParenIndex = this.findClosestPosition(openParenPositions, hintCharIndex);
    
    // 找到对应的右括号
    const closeParenIndex = this.findMatchingCloseParen(line, closestParenIndex);
    if (closeParenIndex === -1) {
      console.warn(`[CoordinateFixer] ⚠️ No matching ')' found`);
      return null;
    }

    // 提取括号内的内容
    const insideParens = line.substring(closestParenIndex + 1, closeParenIndex).trim();
    
    let insertCharIndex: number;
    
    if (insideParens.length === 0) {
      // 情况 1：空括号 func() → func(25)
      insertCharIndex = closestParenIndex + 1;
      console.log(`[CoordinateFixer] 🔍 Empty params: Insert after '(' at char ${insertCharIndex}`);
    } else {
      // 情况 2：有现有参数 → 在右括号前插入
      // func("Alice") → func("Alice", 25)
      insertCharIndex = closeParenIndex;
      console.log(`[CoordinateFixer] 🔍 Append param: Insert before ')' at char ${insertCharIndex}`);
    }
    
    const insertColumn = this.charIndexToMonacoColumn(line, insertCharIndex, tabSize);
    console.log(`[CoordinateFixer] 🎯 addParameter: Insert at column ${insertColumn}`);
    return insertColumn;
  }

  /**
   * 找到匹配的右括号
   */
  private findMatchingCloseParen(line: string, openIndex: number): number {
    let depth = 1;
    let inString = false;
    let stringChar = '';
    
    for (let i = openIndex + 1; i < line.length; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : '';
      
      // 处理字符串
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }
      
      if (!inString) {
        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
          if (depth === 0) {
            return i;
          }
        }
      }
    }
    
    return -1; // 没找到匹配的右括号
  }

  /**
   * 查找表达式追加位置
   */
  private findExpressionAppendPosition(line: string, hintColumn: number, tabSize: number): number | null {
    // 简化实现：使用 hintColumn 附近的位置
    const hintCharIndex = this.monacoColumnToCharIndex(line, hintColumn, tabSize);
    
    // 向前查找最近的非空白字符
    let insertCharIndex = hintCharIndex;
    while (insertCharIndex > 0 && /\s/.test(line[insertCharIndex - 1] || '')) {
      insertCharIndex--;
    }
    
    const insertColumn = this.charIndexToMonacoColumn(line, insertCharIndex, tabSize);
    console.log(`[CoordinateFixer] 🔍 expressionAppend: Insert at column ${insertColumn}`);
    return insertColumn;
  }

  /**
   * 查找方法链插入位置
   */
  private findMethodChainPosition(line: string, hintColumn: number, tabSize: number): number | null {
    // 查找最后一个右括号或分号之前的位置
    const hintCharIndex = this.monacoColumnToCharIndex(line, hintColumn, tabSize);
    
    // 向后查找右括号
    let insertCharIndex = hintCharIndex;
    while (insertCharIndex < line.length && line[insertCharIndex] !== ')' && line[insertCharIndex] !== ';') {
      insertCharIndex++;
    }
    
    if (insertCharIndex < line.length && line[insertCharIndex] === ')') {
      insertCharIndex++; // 在右括号之后插入
    }
    
    const insertColumn = this.charIndexToMonacoColumn(line, insertCharIndex, tabSize);
    console.log(`[CoordinateFixer] 🔍 methodChain: Insert at column ${insertColumn}`);
    return insertColumn;
  }

  /**
   * 将 Monaco 列坐标转换为字符索引（与 charIndexToMonacoColumn 相反）
   */
  private monacoColumnToCharIndex(line: string, column: number, tabSize: number): number {
    let currentColumn = 1;
    let charIndex = 0;
    
    while (charIndex < line.length && currentColumn < column) {
      if (line[charIndex] === '\t') {
        currentColumn += tabSize - ((currentColumn - 1) % tabSize);
      } else {
        currentColumn++;
      }
      charIndex++;
    }
    
    return charIndex;
  }

  /**
   * 从位置数组中找到最接近目标的位置
   */
  private findClosestPosition(positions: number[], target: number): number {
    return positions.reduce((closest, pos) => {
      const currentDist = Math.abs(pos - target);
      const closestDist = Math.abs(closest - target);
      return currentDist < closestDist ? pos : closest;
    });
  }

  /**
   * 过滤注释中的匹配
   * 使用启发式规则判断是否在注释中
   */
  private filterCommentsMatches(
    matches: monaco.editor.FindMatch[],
    lineNumber: number,
    model: monaco.editor.ITextModel
  ): monaco.editor.FindMatch[] {
    const lineContent = model.getLineContent(lineNumber);
    
    return matches.filter(match => {
      const beforeMatch = lineContent.substring(0, match.range.startColumn - 1);
      
      // 规则 1：检查是否在单行注释中
      const singleLineCommentIndex = beforeMatch.indexOf('//');
      if (singleLineCommentIndex !== -1) {
        // 确保 // 不在字符串中
        const beforeComment = beforeMatch.substring(0, singleLineCommentIndex);
        if (!this.isInString(beforeComment)) {
          console.log(`[CoordinateFixer] 🚫 Filtered match in single-line comment`);
          return false;
        }
      }

      // 规则 2：检查是否在多行注释中（简化版）
      // 注意：完整实现需要解析整个文件的注释块
      if (beforeMatch.includes('/*') && !beforeMatch.includes('*/')) {
        console.log(`[CoordinateFixer] 🚫 Filtered match in multi-line comment`);
        return false;
      }

      return true;
    });
  }

  /**
   * 检查字符串中是否包含未闭合的引号（简化版）
   */
  private isInString(text: string): boolean {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const prevChar = i > 0 ? text[i - 1] : '';

      // 跳过转义字符
      if (prevChar === '\\') continue;

      if (char === "'" && !inDoubleQuote && !inBacktick) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote && !inBacktick) {
        inDoubleQuote = !inDoubleQuote;
      } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
        inBacktick = !inBacktick;
      }
    }

    return inSingleQuote || inDoubleQuote || inBacktick;
  }

  /**
   * 从多个匹配中选择最接近目标列的那个
   */
  private findClosestMatch(
    matches: monaco.editor.FindMatch[],
    targetColumn: number
  ): monaco.editor.FindMatch {
    return matches.reduce((closest, match) => {
      const currentDist = Math.abs(match.range.startColumn - targetColumn);
      const closestDist = Math.abs(closest.range.startColumn - targetColumn);
      return currentDist < closestDist ? match : closest;
    });
  }

  /**
   * Fallback：字符索引转换
   */
  private fallbackCharIndexConversion(
    pred: Prediction,
    model: monaco.editor.ITextModel
  ): WordReplaceInfo | null {
    const { word, replacement, startColumn, endColumn } = pred.wordReplaceInfo!;
    const lineContent = model.getLineContent(pred.targetLine);
    const tabSize = model.getOptions().tabSize || this.options.tabSize;

    const fixedStartColumn = this.charIndexToMonacoColumn(lineContent, startColumn - 1, tabSize);
    const fixedEndColumn = this.charIndexToMonacoColumn(lineContent, endColumn - 1, tabSize);
    
    console.log(`[CoordinateFixer] 🔧 Fallback: ${startColumn}-${endColumn} → ${fixedStartColumn}-${fixedEndColumn}`);
    
    return {
      word,
      replacement,
      startColumn: fixedStartColumn,
      endColumn: fixedEndColumn
    };
  }

  /**
   * 将字符索引转换为 Monaco 列坐标
   * 处理 Tab 字符的视觉宽度
   */
  private charIndexToMonacoColumn(
    line: string,
    charIndex: number,
    tabSize: number
  ): number {
    let column = 1;
    
    for (let i = 0; i < Math.min(charIndex, line.length); i++) {
      if (line[i] === '\t') {
        column += tabSize - ((column - 1) % tabSize);
      } else {
        column++;
      }
    }
    
    return column;
  }
}
