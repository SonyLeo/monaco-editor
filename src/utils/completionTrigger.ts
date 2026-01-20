/**
 * 智能补全触发条件判断（JS/TS 专用）
 */

interface TriggerParams {
  text: string;
  position: { lineNumber: number; column: number };
  triggerType: 'onTyping' | 'onIdle' | 'onDemand';
}

/**
 * 判断是否应该触发代码补全
 * @param params - 触发参数
 * @returns 是否触发补全
 */
export function shouldTriggerCompletion(params: TriggerParams): boolean {
  const { text, position } = params;
  const lines = text.split('\n');
  const currentLine = lines[position.lineNumber - 1] || '';
  const beforeCursor = currentLine.substring(0, position.column - 1);
  const trimmedLine = beforeCursor.trim();

  // 1. 避免在注释中触发
  // if (isInComment(beforeCursor, text)) {
  //   return false;
  // }

  // // 2. 避免在普通字符串中触发（但允许模板字符串）
  // if (isInString(beforeCursor) && !isInTemplateString(beforeCursor)) {
  //   return false;
  // }

  // 3. 代码太短不触发（降低阈值）
  if (text.trim().length < 2) {
    return false;
  }

  // // 4. 完全空行不触发
  // if (trimmedLine.length === 0) {
  //   return false;
  // }

  // 5. 分号后不触发（语句已结束）
  if (isAfterStatementEnd(beforeCursor)) {
    return false;
  }

  // 6. 右花括号后不触发（块已结束）
  if (isAfterBlockEnd(beforeCursor)) {
    return false;
  }

  // 其他情况都允许触发
  return true;
}

/**
 * 检测是否在注释中
 */
function isInComment(beforeCursor: string, fullText: string): boolean {
  const trimmed = beforeCursor.trim();
  
  // 单行注释
  if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
    return true;
  }
  
  // 块注释
  const lastBlockStart = fullText.lastIndexOf('/*', fullText.indexOf(beforeCursor));
  const lastBlockEnd = fullText.lastIndexOf('*/', fullText.indexOf(beforeCursor));
  if (lastBlockStart > lastBlockEnd) {
    return true;
  }
  
  return false;
}

/**
 * 检测是否在字符串中
 */
function isInString(beforeCursor: string): boolean {
  const singleQuotes = (beforeCursor.match(/'/g) || []).length;
  const doubleQuotes = (beforeCursor.match(/"/g) || []).length;
  return singleQuotes % 2 === 1 || doubleQuotes % 2 === 1;
}

/**
 * 检测是否在模板字符串中
 */
function isInTemplateString(beforeCursor: string): boolean {
  const backticks = (beforeCursor.match(/`/g) || []).length;
  return backticks % 2 === 1;
}

/**
 * 检测光标是否在语句结束符后（分号后）
 */
function isAfterStatementEnd(beforeCursor: string): boolean {
  // 检查是否以分号结尾（忽略尾部空格）
  const trimmedEnd = beforeCursor.trimEnd();
  
  if (trimmedEnd.endsWith(';')) {
    // 排除 for 循环中的分号：for (let i = 0; i < 10; i++)
    // 检查是否在括号内
    const openParens = (beforeCursor.match(/\(/g) || []).length;
    const closeParens = (beforeCursor.match(/\)/g) || []).length;
    
    // 如果括号未闭合，说明可能在 for 循环中
    if (openParens > closeParens) {
      return false;
    }
    
    return true;
  }
  
  return false;
}

/**
 * 检测光标是否在代码块结束符后（右花括号后）
 */
function isAfterBlockEnd(beforeCursor: string): boolean {
  const trimmedEnd = beforeCursor.trimEnd();
  
  // 检查是否以右花括号结尾
  if (trimmedEnd.endsWith('}')) {
    // 检查后面是否只有空格（没有其他字符）
    const afterBrace = beforeCursor.substring(trimmedEnd.length);
    return afterBrace.trim().length === 0;
  }
  
  return false;
}
