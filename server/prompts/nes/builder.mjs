/**
 * NES Prompt 构建器
 */
import { NEXT_EDIT_SYSTEM_PROMPT } from './systemPrompt.mjs';
import { PATTERN_SPECIFIC_INSTRUCTIONS } from './patterns.mjs';
import { getFewShotExamples } from './examples.mjs';
import {
  formatEditHistory,
  formatUserFeedback,
  enhanceRecentChange,
  formatCodeWindow,
} from './formatters.mjs';

/**
 * 截断文本
 */
function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength) + '...';
}

/**
 * 截断代码（保留关键上下文）
 */
function truncateCode(code, maxLines) {
  const lines = code.split('\n');
  if (lines.length <= maxLines) return code;
  
  // 保留前 300 行和后 200 行
  const keepStart = 300;
  const keepEnd = 200;
  
  return [
    ...lines.slice(0, keepStart),
    `\n... (${lines.length - keepStart - keepEnd} lines omitted) ...\n`,
    ...lines.slice(-keepEnd)
  ].join('\n');
}

/**
 * 构建 Next Edit Prediction Prompt
 * @param {Array} editHistory - 编辑历史
 * @param {string} currentCode - 当前代码
 * @param {Object} pattern - 编辑模式
 * @param {string} language - 编程语言
 * @returns {Object} Prompt 对象
 */
export function buildNextEditPrompt(editHistory, currentCode, pattern, language = 'typescript') {
  // 1. 格式化编辑历史
  const formattedHistory = formatEditHistory(editHistory);
  
  // 2. 获取相关的 Few-shot 示例
  const examples = getFewShotExamples(pattern.type);
  
  // 3. 获取模式特定指令
  const patternInstruction = PATTERN_SPECIFIC_INSTRUCTIONS[pattern.type] || PATTERN_SPECIFIC_INSTRUCTIONS.unknown;
  
  // 4. 截断代码（保留关键上下文）
  const truncatedCode = truncateCode(currentCode, 500);
  
  // 5. 构建结构化 Prompt
  const userPrompt = `${NEXT_EDIT_SYSTEM_PROMPT}

<edit_history>
${formattedHistory}
</edit_history>

<detected_pattern>
Type: ${pattern.type}
Confidence: ${pattern.confidence}
Context: ${pattern.context}
Related Symbols: ${pattern.relatedSymbols.join(', ')}
</detected_pattern>

<pattern_guidelines>
${patternInstruction}
</pattern_guidelines>

<current_code language="${language}">
${truncatedCode}
</current_code>

<examples>
${examples}
</examples>

<task>
Based on the edit history and detected pattern, predict the NEXT edit.

Output ONLY valid JSON in this exact format (no markdown, no explanation, no code blocks):
{
  "line": <line_number>,
  "column": <column_number>,
  "action": "insert",
  "newText": "<suggested_text>",
  "reason": "<brief_explanation>",
  "confidence": <0.0_to_1.0>
}

CRITICAL: Return ONLY the JSON object above. Do not include any other text, markdown formatting, or code blocks.
</task>`;

  return {
    context: NEXT_EDIT_SYSTEM_PROMPT,
    fileContent: userPrompt,
    language,
  };
}

/**
 * 构建 NES User Prompt（用于 server.mjs）
 * @param {string} codeWindow - 代码窗口
 * @param {Object} windowInfo - 窗口信息
 * @param {string} diffSummary - 差异摘要
 * @param {Array} editHistory - 编辑历史
 * @param {Array} userFeedback - 用户反馈
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

Analyze the <edit_history> and <user_feedback> to understand user intent, then predict the next logical edit in <code_window>.`;
}
