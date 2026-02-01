/**
 * NES Edit Pattern Instructions - Optimized Version
 * 
 * Best Practices Applied:
 * 1. Pattern-Specific Guidance - Tailored instructions per pattern
 * 2. Chain-of-Thought Steps - Explicit reasoning process
 * 3. ChangeType Mapping - Clear type recommendations
 * 4. Confidence Guidelines - When to be more/less certain
 */

/**
 * Pattern-specific instructions for NES predictions
 * Each pattern includes: description, steps, changeType guidance, confidence hints
 */
export const PATTERN_SPECIFIC_INSTRUCTIONS = {
  
  add_field: `Pattern: Adding Field/Property to Class or Object

Reasoning Steps:
1. Identify the new field that was added
2. Check if constructor needs the field as a parameter
3. Check if initialization logic needs updating
4. Check if toString/toJSON/serialize methods need updating
5. Check if related computed properties need updating

ChangeType Selection:
- INSERT: Add new lines (new method, new property)
- INLINE_INSERT: Add to existing parameter list \`(x, y)\` → \`(x, y, z)\`
- REPLACE_LINE: Modify existing expressions to include new field

Confidence Guidelines:
- 0.90+: Constructor parameter addition when pattern is clear
- 0.85-0.90: Method updates in same class
- 0.75-0.85: Related code in other parts of file`,

  add_parameter: `Pattern: Adding Parameter to Function

Reasoning Steps:
1. Identify the new parameter added to function signature
2. Find ALL call sites of this function in the code window
3. Determine appropriate default value for new parameter
4. Check if function body uses the new parameter
5. Prioritize call sites by proximity to definition

ChangeType Selection:
- INLINE_INSERT: Add argument to function calls \`func(a)\` → \`func(a, b)\`
- REPLACE_LINE: When call needs restructuring
- INSERT: When adding default parameter handling in function body

CRITICAL RULES:
- DO NOT convert positional arguments to named arguments (e.g., \`func(a: 1)\` is invalid in JS/TS)
- Only add the VALUE for the new argument

Confidence Guidelines:
- 0.92+: Direct call sites in same scope
- 0.85-0.92: Call sites in same file
- 0.70-0.85: Indirect references or complex expressions`,

  rename: `Pattern: Renaming Symbol (Variable, Function, Class)

Reasoning Steps:
1. Identify old name and new name from edit history
2. Find ALL occurrences of old name in code window
3. Distinguish between same-named but different symbols (scope awareness)
4. Prioritize by scope: local > same function > same class > file
5. Skip string literals unless they're identifiers

CRITICAL RULES:
- When renaming a FUNCTION PARAMETER, do NOT update the function calls (call sites) unless using object destructuring
- Standard JS/TS function calls use positional arguments, so parameter names don't matter at the call site
- DO NOT generate "no-op" predictions (where suggestionText === originalLineContent)

ChangeType Selection:
- REPLACE_WORD: Single identifier change (most common)
- REPLACE_LINE: When renaming causes multiple changes on same line

Confidence Guidelines:
- 0.95+: Same symbol in same scope
- 0.90-0.95: Same symbol in related scope
- 0.80-0.90: Symbol in different scope
- Skip: String literals matching the name`,

  refactor: `Pattern: Code Refactoring (Method, Expression, Pattern Change)

Reasoning Steps:
1. Understand the refactoring being applied (method rename, expression change, etc.)
2. Find similar patterns in the code window
3. Apply consistent changes across all instances
4. Maintain code style and conventions
5. Consider edge cases and different contexts

ChangeType Selection:
- REPLACE_WORD: Single method/property name change
- REPLACE_LINE: Expression or pattern change
- INSERT: Adding new abstraction/helper

Confidence Guidelines:
- 0.90+: Exact same pattern
- 0.80-0.90: Similar pattern
- 0.70-0.80: Related but different context`,

  fix: `Pattern: Fixing Error (Typo, Operator, Logic)

Reasoning Steps:
1. Identify the type of fix (typo, operator, logic error)
2. Search for similar errors in nearby code
3. For typos: check for same misspelling elsewhere
4. For operators: check for same logical pattern
5. Suggest preventive fixes when possible

ChangeType Selection:
- REPLACE_WORD: Typos, operator fixes (||→&&, !==→===)
- REPLACE_LINE: Logic errors requiring expression change
- DELETE: Removing problematic or dead code

Confidence Guidelines:
- 0.95+: Exact same typo nearby
- 0.88-0.95: Similar error pattern
- 0.75-0.88: Related but different error type`,

  unknown: `Pattern: Unknown/Mixed

When the pattern isn't clearly identifiable:
1. Analyze the exact change made
2. Look for any related code that might need updating
3. Consider common follow-up actions
4. Be conservative with predictions

ChangeType Selection:
- Carefully determine based on the specific change
- Default to REPLACE_LINE if uncertain about scope
- Only use REPLACE_WORD if truly a single token change

Confidence Guidelines:
- Keep confidence lower (0.70-0.85) when pattern is unclear
- Provide clear explanation for each prediction
- Limit to 2-3 high-confidence predictions`,

  general: `Pattern: General Code Editing

For general edits without a clear pattern:
1. Look for patterns in recent edit sequence
2. Predict logical next steps based on code context
3. Consider common coding workflows
4. Suggest consistency improvements

ChangeType Selection:
- Match the type of change to the scope of modification
- Use decision tree from system prompt
- When in doubt, prefer more specific types (REPLACE_WORD over REPLACE_LINE)

Confidence Guidelines:
- 0.85+: Clear logical next step
- 0.70-0.85: Reasonable suggestion
- Below 0.70: Consider not including the prediction`,
};

/**
 * Get pattern instruction by type
 * @param {string} patternType - Pattern type key
 * @returns {string} Pattern instruction
 */
export function getPatternInstruction(patternType) {
  return PATTERN_SPECIFIC_INSTRUCTIONS[patternType] || 
         PATTERN_SPECIFIC_INSTRUCTIONS.general;
}

/**
 * Consolidated summary of all patterns for model self-selection
 */
export const ALL_PATTERNS_SUMMARY = `
<pattern_library>
You must analyze the <edit_history> and IDENTIFY which of the following patterns best matches the user's intent. Then follow the specific rules for that pattern.

1. RENAME Pattern (Variable/Function/Class)
   - Trigger: User changed an identifier name
   - Action: Find ALL other occurrences of the old name in the same scope
   - Rule: Use REPLACE_WORD. Do NOT update function call arguments when renaming parameters (unless named args).

2. ADD_PARAMETER Pattern
   - Trigger: User added a parameter to a function definition
   - Action: Update ALL call sites of that function
   - Rule: Use INLINE_INSERT to add default values to calls. DO NOT use named arguments (e.g. \`func(a, b)\` not \`func(a, b: 0)\`).

3. ADD_FIELD Pattern
   - Trigger: User added a property to a class/interface
   - Action: Update constructor, toString, toJSON, etc.
   - Rule: Use INLINE_INSERT for constructor params, REPLACE_LINE for methods.

4. FIX Pattern (Typo/Operator)
   - Trigger: User corrected a spelling mistake or fixed an operator
   - Action: Find similar typos nearby and predict preventive fixes
   - Rule: Use REPLACE_WORD.

5. REFACTOR Pattern
   - Trigger: User changed method structure or expression logic
   - Action: Apply consistent structural changes to similar code blocks
   - Rule: Maintain code style.

6. GENERAL Pattern
   - Trigger: No clear pattern matches above
   - Action: Predict logical next steps based on code context
   - Rule: Use decision tree to select changeType.
</pattern_library>`;

/**
 * All supported pattern types
 */
export const PATTERN_TYPES = Object.keys(PATTERN_SPECIFIC_INSTRUCTIONS);
