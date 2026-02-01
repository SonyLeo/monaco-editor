/**
 * NES Few-Shot Examples - Optimized Version
 * 
 * Best Practices Applied:
 * 1. High-Quality Examples - Real-world scenarios
 * 2. Complete Input/Output - Full context for each example
 * 3. Diverse ChangeTypes - Coverage of all types
 * 4. Error Avoidance - Examples of common mistakes
 */

/**
 * Complete few-shot example showing full input/output format
 */
export const NES_FULL_EXAMPLE = `
<example_input>
<edit_history>
[1] 10:30:15 | Line 5:10
    Action: 🔄 replace
    Old: "createUser"
    New: "createUserInfo"
    Context: 📦 Function Name
    Full Line: function createUserInfo(name: string) {
</edit_history>

<recent_change>
Function 'createUser' renamed to 'createUserInfo'

Semantic Context: User modified a function name
  From: "createUser"
  To: "createUserInfo"
  
Consider: What other locations might reference this function name?
</recent_change>

<code_window>
 5: function createUserInfo(name: string) {
 6:   return { name };
 7: }
 8:
 9: const user1 = createUser("Alice");
10: const user2 = createUser("Bob");
11: const user3 = createUser("Charlie");
</code_window>
</example_input>

<example_output>
{
  "reasoning": {
    "observed_change": "Function 'createUser' was renamed to 'createUserInfo' at line 5",
    "pattern_detected": "Function rename - requires updating all call sites",
    "impact_analysis": "Found 3 call sites at lines 9, 10, 11 that still use the old name",
    "confidence_rationale": "High confidence (0.95) because these are direct function calls with exact name match"
  },
  "predictions": [
    {
      "targetLine": 9,
      "originalLineContent": "const user1 = createUser(\\"Alice\\");",
      "suggestionText": "const user1 = createUserInfo(\\"Alice\\");",
      "explanation": "Update function call to match renamed function",
      "confidence": 0.95,
      "priority": 1,
      "changeType": "REPLACE_WORD",
      "context": {
        "before": "= ",
        "target": "createUser",
        "after": "(\\"Alice\\")"
      }
    },
    {
      "targetLine": 10,
      "originalLineContent": "const user2 = createUser(\\"Bob\\");",
      "suggestionText": "const user2 = createUserInfo(\\"Bob\\");",
      "explanation": "Update function call to match renamed function",
      "confidence": 0.95,
      "priority": 1,
      "changeType": "REPLACE_WORD",
      "context": {
        "before": "= ",
        "target": "createUser",
        "after": "(\\"Bob\\")"
      }
    },
    {
      "targetLine": 11,
      "originalLineContent": "const user3 = createUser(\\"Charlie\\");",
      "suggestionText": "const user3 = createUserInfo(\\"Charlie\\");",
      "explanation": "Update function call to match renamed function",
      "confidence": 0.95,
      "priority": 1,
      "changeType": "REPLACE_WORD",
      "context": {
        "before": "= ",
        "target": "createUser",
        "after": "(\\"Charlie\\")"
      }
    }
  ]
}
</example_output>
`;

/**
 * ChangeType examples for inline reference in prompts
 * These are concise examples showing correct usage of each changeType
 */
export const CHANGE_TYPE_EXAMPLES = `
### REPLACE_WORD - Single Token Change

Scenario: Fix typo or rename single identifier
\`\`\`
Before: functoin greet() {}
After:  function greet() {}
\`\`\`

Prediction:
{
  "changeType": "REPLACE_WORD",
  "originalLineContent": "functoin greet() {}",
  "suggestionText": "function greet() {}",
  "context": { "before": "", "target": "functoin", "after": " greet()" }
}

---

### REPLACE_WORD - Operator Fix

Scenario: Fix wrong operator
\`\`\`
Before: if (value !== null || value !== undefined)
After:  if (value !== null && value !== undefined)
\`\`\`

Prediction:
{
  "changeType": "REPLACE_WORD",
  "originalLineContent": "  if (value !== null || value !== undefined) {",
  "suggestionText": "  if (value !== null && value !== undefined) {",
  "context": { "before": "null ", "target": "||", "after": " value" }
}

---

### INLINE_INSERT - Add Parameter

Scenario: Add argument to function call
\`\`\`
Before: createUser("Bob")
After:  createUser("Bob", 30)
\`\`\`

Prediction:
{
  "changeType": "INLINE_INSERT",
  "originalLineContent": "const user = createUser(\\"Bob\\");",
  "suggestionText": "const user = createUser(\\"Bob\\", 30);",
  "context": { "before": "(\\"Bob\\"", "target": "", "after": ");" }
}

---

### INLINE_INSERT - Extend Expression

Scenario: Add term to calculation
\`\`\`
Before: Math.sqrt(x**2 + y**2)
After:  Math.sqrt(x**2 + y**2 + z**2)
\`\`\`

Prediction:
{
  "changeType": "INLINE_INSERT",
  "originalLineContent": "    return Math.sqrt(x**2 + y**2);",
  "suggestionText": "    return Math.sqrt(x**2 + y**2 + z**2);",
  "context": { "before": "y**2", "target": "", "after": ");" }
}

---

### REPLACE_LINE - Logic Change

Scenario: Fix conditional logic (multiple changes)
\`\`\`
Before: return a > b ? b : a;
After:  return a > b ? a : b;
\`\`\`

Prediction:
{
  "changeType": "REPLACE_LINE",
  "originalLineContent": "  return a > b ? b : a;",
  "suggestionText": "  return a > b ? a : b;"
}

---

### INSERT - Add New Line

Scenario: Add missing property
\`\`\`
class Point3D {
  x: number;
  y: number;
  // INSERT z here
}
\`\`\`

Prediction:
{
  "changeType": "INSERT",
  "targetLine": 3,  // After y: number;
  "originalLineContent": "  y: number;",
  "suggestionText": "  z: number;"
}

---

### DELETE - Remove Unused Code

Scenario: Remove unused import
\`\`\`
import { ref } from 'vue';
import { computed } from 'vue';  // ← Not used, DELETE
\`\`\`

Prediction:
{
  "changeType": "DELETE",
  "originalLineContent": "import { computed } from 'vue';",
  "suggestionText": ""
}
`;

/**
 * Pattern-specific example library
 * Used for detailed few-shot learning when a specific pattern is detected
 */
export const PATTERN_EXAMPLES = {
  
  add_field: `### Pattern: Adding Field to Class

<input>
User added \`z: number\` property to Point3D class.

class Point3D {
  x: number;
  y: number;
  z: number;  // ← Just added
  
  constructor(public x: number, public y: number) {}
  
  toString(): string {
    return \`(\${this.x}, \${this.y})\`;
  }
}
</input>

<reasoning>
1. New field 'z' added to class
2. Constructor only has x, y - needs z parameter
3. toString() only includes x, y - needs z
4. Priority: constructor (essential) > toString (formatting)
</reasoning>

<predictions>
1. Line with constructor:
   - changeType: INLINE_INSERT
   - Add \`, public z: number\` to constructor params
   
2. Line with toString return:
   - changeType: REPLACE_LINE
   - Update template to include z
</predictions>`,

  add_parameter: `### Pattern: Adding Parameter to Function

<input>
User added parameter 'age' to createUser function.

function createUser(name: string, age: number) {  // ← Added age
  return { name, age };
}

const user1 = createUser("Alice");
const user2 = createUser("Bob");
</input>

<reasoning>
1. Function signature now requires 'age' parameter
2. Found 2 call sites missing the new parameter
3. Need to provide reasonable default (number type → 0 or 18)
</reasoning>

<predictions>
1. Line 5 (first call):
   - changeType: INLINE_INSERT
   - Add \`, 18\` (reasonable default age)
   
2. Line 6 (second call):
   - changeType: INLINE_INSERT  
   - Add \`, 18\`
</predictions>`,

  rename: `### Pattern: Renaming Symbol

<input>
User renamed variable 'data' to 'userData' on line 2.

function process() {
  const userData = fetchData();  // ← Renamed from 'data'
  
  if (data) {
    console.log(data.name);
    return data;
  }
}
</input>

<reasoning>
1. Variable renamed from 'data' to 'userData'
2. Found 3 occurrences of old name 'data' (lines 4, 5, 6)
3. All in same function scope → high confidence
4. Must preserve string literals that aren't identifiers
</reasoning>

<predictions>
1. Line 4 (if condition):
   - changeType: REPLACE_WORD
   - context: { before: "if (", target: "data", after: ") {" }
   
2. Line 5 (property access):
   - changeType: REPLACE_WORD
   - context: { before: "log(", target: "data", after: ".name" }
   
3. Line 6 (return statement):
   - changeType: REPLACE_WORD
   - context: { before: "return ", target: "data", after: ";" }
</predictions>`,

  fix: `### Pattern: Fixing Error

<input>
User fixed typo 'conts' → 'const' on line 2.

function test() {
  const x = 5;  // ← Just fixed
  conts y = 10;
  conts z = 15;
}
</input>

<reasoning>
1. Typo 'conts' was fixed to 'const'
2. Found 2 more instances of same typo (lines 3, 4)
3. Same file, similar context → high confidence
</reasoning>

<predictions>
1. Line 3:
   - changeType: REPLACE_WORD
   - target: "conts" → "const"
   
2. Line 4:
   - changeType: REPLACE_WORD
   - target: "conts" → "const"
</predictions>`,

  refactor: `### Pattern: Code Refactoring

<input>
User changed user.getName() to user.getFullName() on line 3.

class UserService {
  displayUser(user) {
    console.log(user.getFullName());  // ← Changed
  }
  
  printUser(user) {
    console.log(user.getName());  // ← Not changed yet
  }
}
</input>

<reasoning>
1. Method call refactored: getName() → getFullName()
2. Found 1 more occurrence of old method (line 7)
3. Same method pattern in same class
</reasoning>

<predictions>
1. Line 7:
   - changeType: REPLACE_WORD
   - context: { before: "user.", target: "getName", after: "()" }
   - suggestionText: includes "getFullName"
</predictions>`,

  general: `### Pattern: General Editing

<input>
User is adding variable declarations.

function calculate() {
  const x = 10;
  const y = 20;
  // Cursor here
}
</input>

<reasoning>
1. User added two numeric variables x and y
2. Pattern suggests calculation will follow
3. Logical next step: use these variables
</reasoning>

<predictions>
1. After line 3:
   - changeType: INSERT
   - suggestionText: "  return x + y;"
   - Lower confidence (0.75) - pattern is suggestive not definitive
</predictions>`,
};

/**
 * Get few-shot examples for a specific pattern
 * @param {string} patternType - Pattern type
 * @returns {string} Example text
 */
export function getFewShotExamples(patternType) {
  return PATTERN_EXAMPLES[patternType] || PATTERN_EXAMPLES.general;
}

/**
 * Get all available pattern types
 * @returns {string[]} Array of pattern types
 */
export function getAvailablePatterns() {
  return Object.keys(PATTERN_EXAMPLES);
}
