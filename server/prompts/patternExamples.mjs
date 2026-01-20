/**
 * Few-Shot 示例库
 * 每种模式提供 1-2 个高质量示例
 */

export const PATTERN_EXAMPLES = {
  add_field: `Example: Adding field to TypeScript class

<edit_history>
[1] Line 5: insert "public z: number"
</edit_history>

<detected_pattern>
Type: add_field
Context: Added field 'z' to class Point3D
</detected_pattern>

<current_code>
class Point3D {
  constructor(public x: number, public y: number) {}
  
  public z: number;  // ← Just added
  
  toString(): string {
    return \`(\${this.x}, \${this.y})\`;
  }
}
</current_code>

<reasoning>
1. Developer added a new field 'z' to Point3D class
2. The constructor currently only has x and y parameters
3. Logical next step: add 'z' to constructor parameters
4. Location: Line 2, after 'public y: number'
</reasoning>

<prediction>
{
  "line": 2,
  "column": 50,
  "action": "insert",
  "newText": ", public z: number",
  "reason": "Add z parameter to constructor to match new field",
  "confidence": 0.92
}
</prediction>`,

  add_parameter: `Example: Adding parameter to function

<edit_history>
[1] Line 10: replace "function calculate(a, b)" → "function calculate(a, b, c)"
</edit_history>

<detected_pattern>
Type: add_parameter
Context: Added parameter 'c' to calculate function
</detected_pattern>

<current_code>
function calculate(a, b, c) {  // ← Just modified
  return a + b;
}

function main() {
  const result1 = calculate(1, 2);
  const result2 = calculate(5, 10);
}
</current_code>

<reasoning>
1. Developer added parameter 'c' to calculate function
2. Found 2 call sites at lines 6 and 7
3. Need to provide default value for 'c'
</reasoning>

<prediction>
{
  "line": 6,
  "column": 32,
  "action": "replace",
  "oldText": "calculate(1, 2)",
  "newText": "calculate(1, 2, 0)",
  "reason": "Update first call site to include new parameter c",
  "confidence": 0.88
}
</prediction>`,

  rename: `Example: Renaming variable

<edit_history>
[1] Line 5: replace "oldName" → "newName"
[2] Line 8: replace "oldName" → "newName"
</edit_history>

<detected_pattern>
Type: rename
Context: Renaming 'oldName' to 'newName'
</detected_pattern>

<current_code>
function process() {
  const newName = getData();  // ← Renamed
  
  if (newName) {
    console.log(newName);  // ← Renamed
    return oldName.toUpperCase();  // ← Not renamed yet
  }
}
</current_code>

<reasoning>
1. Developer is renaming 'oldName' to 'newName'
2. Already renamed 2 occurrences
3. Found 1 more occurrence at line 6
</reasoning>

<prediction>
{
  "line": 6,
  "column": 12,
  "action": "replace",
  "oldText": "oldName",
  "newText": "newName",
  "reason": "Continue renaming remaining occurrence",
  "confidence": 0.96
}
</prediction>`,

  refactor: `Example: Refactoring method calls

<edit_history>
[1] Line 10: replace "user.getName()" → "user.getFullName()"
</edit_history>

<detected_pattern>
Type: refactor
Context: Changing method name from getName to getFullName
</detected_pattern>

<current_code>
class UserService {
  displayUser(user) {
    console.log(user.getFullName());  // ← Just changed
  }
  
  printUser(user) {
    console.log(user.getName());  // ← Not changed yet
  }
}
</current_code>

<reasoning>
1. Developer changed getName() to getFullName()
2. Found 1 more occurrence at line 7
</reasoning>

<prediction>
{
  "line": 7,
  "column": 18,
  "action": "replace",
  "oldText": "user.getName()",
  "newText": "user.getFullName()",
  "reason": "Continue refactoring method name",
  "confidence": 0.90
}
</prediction>`,

  fix: `Example: Fixing typo

<edit_history>
[1] Line 5: replace "conts" → "const"
</edit_history>

<detected_pattern>
Type: fix
Context: Fixing typo 'conts' → 'const'
</detected_pattern>

<current_code>
function test() {
  const x = 5;  // ← Just fixed
  conts y = 10;  // ← Same typo
}
</current_code>

<reasoning>
1. Developer fixed typo 'conts' to 'const'
2. Found same typo at line 3
</reasoning>

<prediction>
{
  "line": 3,
  "column": 3,
  "action": "replace",
  "oldText": "conts",
  "newText": "const",
  "reason": "Fix same typo in nearby code",
  "confidence": 0.94
}
</prediction>`,

  general: `Example: General code editing

<edit_history>
[1] Line 5: insert "const x = 10;"
[2] Line 6: insert "const y = 20;"
</edit_history>

<detected_pattern>
Type: general
Context: General code editing pattern detected
</detected_pattern>

<current_code>
function calculate() {
  const x = 10;
  const y = 20;
  
}
</current_code>

<reasoning>
1. Developer is adding variable declarations
2. Logical next step: use these variables
</reasoning>

<prediction>
{
  "line": 4,
  "column": 3,
  "action": "insert",
  "newText": "return x + y;",
  "reason": "Add calculation using declared variables",
  "confidence": 0.70
}
</prediction>`,
};

/**
 * 获取指定模式的 Few-shot 示例
 */
export function getFewShotExamples(patternType) {
  return PATTERN_EXAMPLES[patternType] || '';
}
