/**
 * 编辑模式分析器（后端）
 * 分析编辑历史，识别编辑模式
 */

/**
 * 分析编辑历史，识别编辑模式
 * @param {Array} editHistory - 编辑历史数组
 * @returns {Object} 编辑模式分析结果
 */
export function analyzeEditPattern(editHistory) {
  if (!editHistory || editHistory.length === 0) {
    return {
      type: 'unknown',
      confidence: 0,
      context: 'No edit history available',
      relatedSymbols: [],
    };
  }

  console.log('🔍 分析编辑历史:', editHistory.map(e => ({
    type: e.type,
    line: e.lineNumber,
    old: e.oldText?.substring(0, 20),
    new: e.newText?.substring(0, 20),
  })));

  // 按优先级检测模式
  const patterns = [
    detectAddFieldPattern,
    detectAddParameterPattern,
    detectRenamePattern,
    detectRefactorPattern,
    detectFixPattern,
  ];

  for (const detector of patterns) {
    const result = detector(editHistory);
    if (result && result.confidence > 0.6) {
      console.log('✅ 检测到模式:', result.type, result.confidence);
      return result;
    }
  }

  // 如果没有匹配到特定模式，但有足够的编辑历史，返回通用模式
  if (editHistory.length >= 2) {
    console.log('💡 使用通用模式（有足够编辑历史）');
    return {
      type: 'general',
      confidence: 0.75, // 提高置信度到 0.75
      context: 'General code editing pattern detected',
      relatedSymbols: [],
    };
  }

  console.log('❌ 无法识别模式（编辑历史不足）');
  return {
    type: 'unknown',
    confidence: 0.3,
    context: 'Insufficient edit history',
    relatedSymbols: [],
  };
}

/**
 * 检测添加字段模式
 */
function detectAddFieldPattern(history) {
  const lastEdit = history[history.length - 1];
  
  // 检测是否在类中添加了字段
  // 匹配: public/private/protected name: type 或 name: type
  const fieldPattern = /^\s*(public|private|protected)?\s*(\w+)\s*:\s*\w+/;
  const match = lastEdit.newText.match(fieldPattern);
  
  if (match && (lastEdit.type === 'insert' || lastEdit.type === 'replace')) {
    const fieldName = match[2];
    return {
      type: 'add_field',
      confidence: 0.85,
      context: `Added field '${fieldName}' to class`,
      relatedSymbols: [fieldName],
    };
  }
  
  // 降低门槛：检测简单的属性添加
  const simpleFieldPattern = /(\w+)\s*:\s*\w+/;
  const simpleMatch = lastEdit.newText.match(simpleFieldPattern);
  if (simpleMatch && lastEdit.type === 'insert' && lastEdit.newText.length > 5) {
    return {
      type: 'add_field',
      confidence: 0.70,
      context: `Added property '${simpleMatch[1]}'`,
      relatedSymbols: [simpleMatch[1]],
    };
  }
  
  return null;
}

/**
 * 检测添加参数模式
 */
function detectAddParameterPattern(history) {
  const lastEdit = history[history.length - 1];
  
  // 检测函数签名中添加了参数
  // 匹配: function name(..., param) 或 name(..., param)
  const paramPattern = /function\s+\w+\([^)]*,\s*(\w+)\s*\)|(\w+)\s*\([^)]*,\s*(\w+)\s*\)/;
  const match = lastEdit.newText.match(paramPattern);
  
  if (match && lastEdit.type === 'replace') {
    const paramName = match[1] || match[3];
    return {
      type: 'add_parameter',
      confidence: 0.80,
      context: `Added parameter '${paramName}' to function`,
      relatedSymbols: [paramName],
    };
  }
  
  return null;
}

/**
 * 检测重命名模式
 */
function detectRenamePattern(history) {
  if (history.length < 2) return null;
  
  // 检查最近的编辑是否都是替换相同的标识符
  const recentEdits = history.slice(-3);
  const replacements = recentEdits.filter(e => e.type === 'replace');
  
  if (replacements.length >= 2) {
    const oldNames = replacements.map(e => e.oldText.trim());
    const newNames = replacements.map(e => e.newText.trim());
    
    // 检查是否都是相同的替换
    const isSameRename = oldNames.every(n => n === oldNames[0]) &&
                         newNames.every(n => n === newNames[0]);
    
    if (isSameRename) {
      return {
        type: 'rename',
        confidence: 0.92,
        context: `Renaming '${oldNames[0]}' to '${newNames[0]}'`,
        relatedSymbols: [oldNames[0], newNames[0]],
      };
    }
  }
  
  return null;
}

/**
 * 检测重构模式
 */
function detectRefactorPattern(history) {
  const lastEdit = history[history.length - 1];
  
  // 检测方法调用的变化
  const methodPattern = /(\w+)\.(\w+)\(/;
  const oldMatch = lastEdit.oldText.match(methodPattern);
  const newMatch = lastEdit.newText.match(methodPattern);
  
  if (oldMatch && newMatch && oldMatch[1] === newMatch[1] && oldMatch[2] !== newMatch[2]) {
    return {
      type: 'refactor',
      confidence: 0.75,
      context: `Changing method from '${oldMatch[2]}' to '${newMatch[2]}'`,
      relatedSymbols: [oldMatch[2], newMatch[2]],
    };
  }
  
  return null;
}

/**
 * 检测修复模式
 */
function detectFixPattern(history) {
  const lastEdit = history[history.length - 1];
  
  // 检测常见的拼写错误修复
  const typoPatterns = [
    { old: /\bconts\b/, new: /\bconst\b/, name: 'const' },
    { old: /\bcosnt\b/, new: /\bconst\b/, name: 'const' },
    { old: /\bfunciton\b/, new: /\bfunction\b/, name: 'function' },
    { old: /\bretrun\b/, new: /\breturn\b/, name: 'return' },
  ];
  
  for (const pattern of typoPatterns) {
    if (pattern.old.test(lastEdit.oldText) && pattern.new.test(lastEdit.newText)) {
      return {
        type: 'fix',
        confidence: 0.88,
        context: `Fixing typo: '${lastEdit.oldText}' → '${lastEdit.newText}'`,
        relatedSymbols: [pattern.name],
      };
    }
  }
  
  return null;
}
