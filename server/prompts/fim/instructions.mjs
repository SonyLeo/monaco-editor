/**
 * FIM 代码补全指令模板
 */

/**
 * 代码补全指令模板
 * @param {string} language - 编程语言
 * @returns {string} 指令文本
 */
export function createCodeInstruction(language) {
  return `Complete the code after the cursor position.

Rules:
1. Follow ${language} best practices and modern ES6+ syntax
2. Match the existing code style exactly (indentation, quotes, semicolons)
3. Generate only the necessary code to complete the current statement or block
4. Ensure proper indentation and formatting
5. DO NOT include explanatory comments unless they were already in the pattern
6. If completing a function, include the full implementation
7. For TypeScript, include proper type annotations
8. Return ONLY the completion code, no additional text
9. CRITICAL: Only complete code within the current function/scope
10. DO NOT generate variables or code from other functions in the file`;
}

/**
 * 块注释补全指令（JSDoc）
 */
export const BLOCK_COMMENT_INSTRUCTION = `You are writing a JSDoc documentation comment. Complete the comment with clear, concise explanation.

Focus on:
- Describing what the code does
- Explaining parameters with @param tags
- Documenting return values with @returns tag
- Adding usage examples with @example if appropriate
- Including type information for TypeScript

DO NOT generate code. Only complete the comment text.`;

/**
 * 行注释补全指令
 */
export const LINE_COMMENT_INSTRUCTION = `You are writing an inline comment. Complete the comment with a brief, clear explanation.

Focus on:
- Explaining WHY this code exists, not WHAT it does
- Keep it concise and on a single line
- Use clear, professional language

DO NOT generate code. Only complete the comment text.`;

/**
 * 用户 Prompt 模板
 * @param {string} instruction - 指令文本
 * @param {string} fileContent - 文件内容（包含 [CURSOR] 标记）
 * @returns {string} 完整的用户 Prompt
 */
export function createUserPrompt(instruction, fileContent) {
  return `${instruction}

File content (cursor position marked with [CURSOR]):
${fileContent}

Complete the code/text at the [CURSOR] position. Return ONLY the completion text.`;
}
