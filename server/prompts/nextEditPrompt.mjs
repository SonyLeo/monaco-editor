/**
 * Next Edit Prediction Prompt 构建器
 */
import { NEXT_EDIT_SYSTEM_PROMPT, PATTERN_SPECIFIC_INSTRUCTIONS } from './systemPrompts.mjs';
import { getFewShotExamples } from './patternExamples.mjs';

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
 * 格式化编辑历史为易读格式
 */
function formatEditHistory(history) {
  if (!history || history.length === 0) {
    return 'No edit history available';
  }

  return history.map((edit, index) => {
    const timestamp = new Date(edit.timestamp).toLocaleTimeString();
    return `[${index + 1}] ${timestamp} | Line ${edit.lineNumber}:${edit.column}
   Action: ${edit.type}
   Old: "${truncate(edit.oldText, 50)}"
   New: "${truncate(edit.newText, 50)}"`;
  }).join('\n\n');
}

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
