/**
 * 系统 Prompt 模板
 * 基于 DeepSeek 最佳实践
 */

/**
 * Next Edit Prediction 系统 Prompt
 */
export const NEXT_EDIT_SYSTEM_PROMPT = `You are an expert code editing assistant specialized in predicting the next logical edit in a codebase.

Your task:
1. Analyze the recent edit history
2. Identify the editing pattern (rename, refactor, add field, etc.)
3. Predict the NEXT edit location and content
4. Provide reasoning for your prediction

Output format: JSON only, no markdown code blocks.`;

/**
 * 针对不同编辑模式的专用指令
 */
export const PATTERN_SPECIFIC_INSTRUCTIONS = {
  add_field: `When a new field is added to a class:
- Check if constructor needs the field as parameter
- Check if toString/toJSON methods need updating
- Check if initialization logic needs updating`,

  add_parameter: `When a parameter is added to a function:
- Find all call sites of this function
- Suggest appropriate default values for the new parameter
- Consider if function body needs to use the new parameter`,

  rename: `When a symbol is renamed:
- Find all other occurrences of the old name
- Prioritize renaming in the same scope first
- Consider related symbols that might need renaming`,

  refactor: `When code is being refactored:
- Look for similar patterns in nearby code
- Suggest consistent changes across the codebase
- Maintain code style and conventions`,

  fix: `When fixing an error:
- Look for similar errors in nearby code
- Suggest preventive fixes
- Consider edge cases`,

  unknown: `Analyze the code changes and suggest the most logical next edit.`,

  general: `When editing code generally:
- Look for patterns in recent edits
- Suggest logical next steps
- Consider code completion and consistency
- Predict common follow-up actions`,
};
