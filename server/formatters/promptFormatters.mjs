/**
 * 编辑历史和用户反馈格式化工具
 */

/**
 * 格式化编辑历史为易读格式
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
 * 构建用户 Prompt
 */
export function buildUserPrompt(codeWindow, windowInfo, diffSummary, editHistory, userFeedback) {
  const formattedHistory = formatEditHistory(editHistory);
  const formattedFeedback = formatUserFeedback(userFeedback);
  const enhancedChange = enhanceRecentChange(diffSummary, editHistory);

  return `<edit_history>
${formattedHistory}
</edit_history>

<user_feedback>
${formattedFeedback}
</user_feedback>

<recent_change>
${enhancedChange}
</recent_change>

<file_info>
Total Lines: ${windowInfo.totalLines}
Window Start: ${windowInfo.startLine}
</file_info>

<code_window>
${codeWindow.split('\n').map((line, i) => `${windowInfo.startLine + i}: ${line}`).join('\n')}
</code_window>

Analyze the <edit_history> and <user_feedback> to understand user intent, then predict the next logical edit in <code_window>.`;
}
