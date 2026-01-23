/**
 * NES 编辑模式定义和指令
 */

/**
 * 针对不同编辑模式的专用指令
 */
export const PATTERN_SPECIFIC_INSTRUCTIONS = {
  add_field: `When a new field is added to a class:
- Check if constructor needs the field as parameter
- Check if toString/toJSON methods need updating
- Check if initialization logic needs updating
- Use changeType: "INSERT" for adding new lines
- Use changeType: "INLINE_INSERT" for adding to existing parameter lists`,

  add_parameter: `When a parameter is added to a function:
- Find all call sites of this function
- Suggest appropriate default values for the new parameter
- Consider if function body needs to use the new parameter
- Use changeType: "INLINE_INSERT" for adding parameters to calls
- Use changeType: "REPLACE_LINE" if entire call needs rewriting`,

  rename: `When a symbol is renamed:
- Find all other occurrences of the old name
- Prioritize renaming in the same scope first
- Consider related symbols that might need renaming
- Use changeType: "REPLACE_WORD" if only the identifier changes
- Use changeType: "REPLACE_LINE" if the entire line changes`,

  refactor: `When code is being refactored:
- Look for similar patterns in nearby code
- Suggest consistent changes across the codebase
- Maintain code style and conventions
- Choose appropriate changeType based on scope of change`,

  fix: `When fixing an error:
- Look for similar errors in nearby code
- Suggest preventive fixes
- Consider edge cases
- Use changeType: "REPLACE_WORD" for typos and operator fixes
- Use changeType: "REPLACE_LINE" for logic errors
- Use changeType: "DELETE" for removing problematic code`,

  unknown: `Analyze the code changes and suggest the most logical next edit.
- Carefully determine the appropriate changeType
- Provide wordReplaceInfo or inlineInsertInfo when needed`,

  general: `When editing code generally:
- Look for patterns in recent edits
- Suggest logical next steps
- Consider code completion and consistency
- Predict common follow-up actions
- Always include the correct changeType in predictions`,
};
