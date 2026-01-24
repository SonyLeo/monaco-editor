/**
 * NES Prompt 构建器
 */
import { CHANGE_TYPE_EXAMPLES } from './examples.mjs';
import {
  formatEditHistory,
  formatUserFeedback,
  enhanceRecentChange,
  formatCodeWindow,
} from './formatters.mjs';

/**
 * 构建 NES User Prompt（用于 server.mjs）
 * 配合 NES_SYSTEM_PROMPT 使用
 * 
 * @param {string} codeWindow - 代码窗口
 * @param {Object} windowInfo - 窗口信息 {startLine, totalLines}
 * @param {string} diffSummary - 差异摘要
 * @param {Array} editHistory - 编辑历史
 * @param {Array} userFeedback - 用户反馈（可选）
 * @returns {string} 完整的 User Prompt
 */
export function buildNESUserPrompt(codeWindow, windowInfo, diffSummary, editHistory, userFeedback) {
  const formattedHistory = formatEditHistory(editHistory);
  const formattedFeedback = formatUserFeedback(userFeedback);
  const enhancedChange = enhanceRecentChange(diffSummary, editHistory);
  const formattedCode = formatCodeWindow(codeWindow, windowInfo);

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
${formattedCode}
</code_window>

<change_type_examples>
${CHANGE_TYPE_EXAMPLES}
</change_type_examples>

Analyze the <edit_history> and <user_feedback> to understand user intent, then predict the next logical edit in <code_window>.
CRITICAL: You MUST include the correct "changeType" field in each prediction. Review <change_type_examples> to understand how to classify changes.`;
}
