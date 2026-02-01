/**
 * NES Prompt Builder - Optimized Version
 * 
 * Best Practices Applied:
 * 1. Structured Input Sections - Clear XML-like delimiters
 * 2. Chain-of-Thought Prompting - Guide reasoning process
 * 3. Context Enrichment - Enhanced edit history formatting
 * 4. Dynamic Example Selection - Pattern-based few-shot
 */

import { CHANGE_TYPE_EXAMPLES } from './examples.mjs';
import {
  formatEditHistory,
  formatUserFeedback,
  enhanceRecentChange,
  formatCodeWindow,
} from './formatters.mjs';
import { ALL_PATTERNS_SUMMARY } from './patterns.mjs';

/**
 * Build NES User Prompt
 * Creates a structured prompt for the NES system
 * 
 * @param {string} codeWindow - Code window content
 * @param {Object} windowInfo - Window info {startLine, totalLines}
 * @param {string} diffSummary - Diff summary
 * @param {Array} editHistory - Edit history
 * @param {Array} userFeedback - User feedback (optional)
 * @returns {string} Complete user prompt
 */
export function buildNESUserPrompt(codeWindow, windowInfo, diffSummary, editHistory, userFeedback) {
  const formattedHistory = formatEditHistory(editHistory);
  const formattedFeedback = formatUserFeedback(userFeedback);
  const enhancedChange = enhanceRecentChange(diffSummary, editHistory);
  const formattedCode = formatCodeWindow(codeWindow, windowInfo);

  return `<edit_context>
<edit_history>
${formattedHistory}
</edit_history>

<recent_change>
${enhancedChange}
</recent_change>

<user_feedback>
${formattedFeedback}
</user_feedback>
</edit_context>

<file_context>
<file_info>
Total Lines: ${windowInfo.totalLines}
Window Start Line: ${windowInfo.startLine}
Window End Line: ${windowInfo.startLine + codeWindow.split('\n').length - 1}
</file_info>

<code_window>
${formattedCode}
</code_window>
</file_context>

${ALL_PATTERNS_SUMMARY}

<task>
1. ANALYZE the <edit_history> and <recent_change>
2. IDENTIFY the applicable pattern from the <pattern_library> (Rename, Add Parameter, etc.)
3. EXPLAIN the detected pattern in the "reasoning.pattern_detected" field
4. SCAN the <code_window> for locations that need updates according to that pattern's rules
5. PREDICT the most logical next edits (max 5)

Remember:
- Choose the correct changeType based on the decision tree in system prompt
- For REPLACE_WORD and INLINE_INSERT, always provide context
- Ensure originalLineContent is the COMPLETE line - never truncate
- NO VALIDATION ERRORS: suggestionText must not equal originalLineContent
</task>`;
}

/**
 * Build compact NES prompt for faster inference
 * @param {string} codeWindow - Code window
 * @param {Object} windowInfo - Window info
 * @param {string} diffSummary - Diff summary
 * @param {Array} editHistory - Edit history
 * @returns {string} Compact prompt
 */
export function buildNESCompactPrompt(codeWindow, windowInfo, diffSummary, editHistory) {
  const formattedCode = formatCodeWindow(codeWindow, windowInfo);
  const latestEdit = editHistory?.[editHistory.length - 1];
  
  let editSummary = diffSummary;
  if (latestEdit) {
    editSummary = `Line ${latestEdit.lineNumber}: "${latestEdit.oldText}" → "${latestEdit.newText}"`;
  }

  return `Recent edit: ${editSummary}

Code:
${formattedCode}

Predict next edits. Return JSON: { reasoning: {...}, predictions: [...] }`;
}
