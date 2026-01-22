/**
 * NES 专用格式化工具
 * 用于格式化编辑历史、用户反馈等 NES 特定数据
 */

/**
 * 格式化编辑历史为 NES 格式（包含语义信息）
 * @param {Array} history - 编辑历史数组
 * @returns {string} 格式化后的历史文本
 */
export function formatEditHistory(history) {
  if (!history || history.length === 0) {
    return 'No edit history available (first edit or history cleared)';
  }

  return history.map((edit, index) => {
    const time = new Date(edit.timestamp).toLocaleTimeString();
    const truncate = (text, max = 50) => {
      if (!text) return '';
      return text.length > max ? text.substring(0, max) + '...' : text;
    };

    // 添加语义信息
    let semanticInfo = '';
    if (edit.context && edit.context.semanticType && edit.context.semanticType !== 'other') {
      semanticInfo = `\n   Context: ${edit.context.semanticType}`;
    }

    // 显示完整行内容（帮助 AI 理解上下文）
    let lineInfo = '';
    if (edit.context && edit.context.lineContent) {
      lineInfo = `\n   Line: ${truncate(edit.context.lineContent, 80)}`;
    }

    return `[${index + 1}] ${time} | Line ${edit.lineNumber}:${edit.column}
   Action: ${edit.type}
   Old: "${truncate(edit.oldText)}"
   New: "${truncate(edit.newText)}"${semanticInfo}${lineInfo}`;
  }).join('\n\n');
}

/**
 * 格式化用户反馈
 * @param {Array} feedback - 用户反馈数组
 * @returns {string} 格式化后的反馈文本
 */
export function formatUserFeedback(feedback) {
  if (!feedback || feedback.length === 0) {
    return 'No user feedback available';
  }

  return feedback.map((fb, index) => {
    const time = new Date(fb.timestamp).toLocaleTimeString();
    const actionEmoji = fb.action === 'accepted' ? '✅' : fb.action === 'skipped' ? '⏭️' : '❌';
    return `[${index + 1}] ${time} | Line ${fb.targetLine}
   Action: ${actionEmoji} ${fb.action}
   Suggestion: "${fb.suggestionText.substring(0, 60)}..."`;
  }).join('\n\n');
}

/**
 * 智能增强 recent change 描述
 * @param {string} diffSummary - 差异摘要
 * @param {Array} editHistory - 编辑历史
 * @returns {string} 增强后的描述
 */
export function enhanceRecentChange(diffSummary, editHistory) {
  if (!editHistory || editHistory.length === 0) {
    return `${diffSummary}\n\nNote: This is the first edit or edit history is unavailable. Analyze the code window carefully to find inconsistencies.`;
  }
  
  if (editHistory.length === 1) {
    const edit = editHistory[0];
    if (edit.context && edit.context.semanticType) {
      return `${diffSummary}\n\nContext: User modified a ${edit.context.semanticType} from "${edit.oldText}" to "${edit.newText}"`;
    }
  }
  
  return diffSummary;
}

/**
 * 格式化代码窗口（添加行号）
 * @param {string} codeWindow - 代码窗口内容
 * @param {Object} windowInfo - 窗口信息
 * @returns {string} 带行号的代码
 */
export function formatCodeWindow(codeWindow, windowInfo) {
  return codeWindow
    .split('\n')
    .map((line, i) => `${windowInfo.startLine + i}: ${line}`)
    .join('\n');
}
