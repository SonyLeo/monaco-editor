/**
 * FIM User Prompt Instructions - Optimized Version
 * 
 * Best Practices Applied:
 * 1. Template Functions - Reusable prompt generation
 * 2. Context Injection - Dynamic content based on file type
 * 3. Clear Delimiters - Structured input sections
 * 4. Specific Instructions - Task-specific guidance
 */

/**
 * Code completion instruction generator
 * @param {string} language - Programming language
 * @param {Object} options - Additional options
 * @returns {string} Instruction text
 */
export function createCodeInstruction(language, options = {}) {
  const { isTypeScript = false, hasJSDoc = false } = options;
  
  let instruction = `Complete the ${language} code at [CURSOR].

Requirements:
- Follow ${language} best practices and modern syntax${isTypeScript ? ' (ES2020+)' : ' (ES6+)'}
- Match the existing code style exactly
- Generate only the code needed to complete the current statement/block
- Return ONLY the completion, no explanations`;

  if (isTypeScript) {
    instruction += `
- Include proper TypeScript type annotations
- Ensure type safety`;
  }

  if (hasJSDoc) {
    instruction += `
- Preserve and complete any JSDoc comments`;
  }

  return instruction;
}

/**
 * Block comment (JSDoc) completion instruction
 */
export const BLOCK_COMMENT_INSTRUCTION = `Complete the JSDoc documentation comment.

Requirements:
1. Describe WHAT the code does (purpose, not implementation)
2. Document parameters with @param tags including types
3. Document return value with @returns tag
4. Add @throws if the function can throw
5. Include @example if usage isn't obvious

Format:
- Use proper JSDoc syntax
- Keep descriptions concise but complete
- Type annotations should match TypeScript conventions

Output ONLY the comment content. Do NOT generate code.`;

/**
 * Line comment completion instruction
 */
export const LINE_COMMENT_INSTRUCTION = `Complete the inline comment.

Requirements:
1. Explain WHY this code exists, not WHAT it does
2. Keep it concise (single line)
3. Use clear, professional language
4. Add value - don't state the obvious

Output ONLY the comment text. Do NOT generate code.`;

/**
 * User prompt builder
 * @param {string} instruction - Task instruction
 * @param {string} fileContent - File content with [CURSOR] marker
 * @param {Object} metadata - Optional file metadata
 * @returns {string} Complete user prompt
 */
export function createUserPrompt(instruction, fileContent, metadata = {}) {
  const { filename, language, currentScope } = metadata;
  
  let prompt = '';
  
  // Add metadata section if available
  if (filename || language || currentScope) {
    prompt += '<file_metadata>\n';
    if (filename) prompt += `Filename: ${filename}\n`;
    if (language) prompt += `Language: ${language}\n`;
    if (currentScope) prompt += `Current Scope: ${currentScope}\n`;
    prompt += '</file_metadata>\n\n';
  }
  
  prompt += `<instruction>
${instruction}
</instruction>

<file_content>
${fileContent}
</file_content>

Complete at [CURSOR]. Return ONLY the completion.`;
  
  return prompt;
}

/**
 * Context-aware instruction generator
 * Analyzes cursor position and generates appropriate instruction
 * @param {Object} context - Cursor context information
 * @returns {string} Appropriate instruction
 */
export function getContextAwareInstruction(context) {
  const { 
    isInComment, 
    isInJSDoc, 
    isInString, 
    isInFunction,
    language = 'typescript'
  } = context;
  
  if (isInJSDoc) {
    return BLOCK_COMMENT_INSTRUCTION;
  }
  
  if (isInComment) {
    return LINE_COMMENT_INSTRUCTION;
  }
  
  if (isInString) {
    return `Complete the string content naturally. Match the string's purpose and context. Return ONLY the string content.`;
  }
  
  return createCodeInstruction(language, {
    isTypeScript: language === 'typescript',
    hasJSDoc: false
  });
}
