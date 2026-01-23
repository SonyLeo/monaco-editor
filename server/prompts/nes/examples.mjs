/**
 * NES Few-Shot 示例库
 * 每种模式提供 1-2 个高质量示例
 */

/**
 * NES 完整示例（用于文档和测试）
 */
export const NES_FULL_EXAMPLE = `
user:
<edit_history>
[1] 10:30:15 | Line 5:10
   Action: replace
   Old: "createUser"
   New: "createUser123"
   Context: functionName
   Line: function createUser123(name: string) {
</edit_history>
<recent_change>
Renamed function 'createUser' to 'createUser123'
</recent_change>
<code_window>
5: function createUser123(name: string) {
6:   return { name };
7: }
8:
9: const user1 = createUser("Alice");
10: const user2 = createUser("Bob");
11: const user3 = createUser("Charlie");
</code_window>

assistant:
{
  "analysis": {
    "change_type": "renameFunction",
    "summary": "Function 'createUser' renamed to 'createUser123'",
    "impact": "Need to update all 3 function calls to use the new name",
    "pattern": "Function rename - all usages must be updated"
  },
  "predictions": [
    {
      "targetLine": 9,
      "originalLineContent": "const user1 = createUser(\\"Alice\\");",
      "suggestionText": "const user1 = createUser123(\\"Alice\\");",
      "explanation": "Update function call to match renamed function",
      "confidence": 0.95,
      "priority": 1,
      "changeType": "REPLACE_LINE"
    },
    {
      "targetLine": 10,
      "originalLineContent": "const user2 = createUser(\\"Bob\\");",
      "suggestionText": "const user2 = createUser123(\\"Bob\\");",
      "explanation": "Update function call to match renamed function",
      "confidence": 0.95,
      "priority": 1,
      "changeType": "REPLACE_LINE"
    },
    {
      "targetLine": 11,
      "originalLineContent": "const user3 = createUser(\\"Charlie\\");",
      "suggestionText": "const user3 = createUser123(\\"Charlie\\");",
      "explanation": "Update function call to match renamed function",
      "confidence": 0.95,
      "priority": 1,
      "changeType": "REPLACE_LINE"
    }
  ]
}`;

/**
 * 🆕 changeType 示例（用于训练模型正确分类）
 */
export const CHANGE_TYPE_EXAMPLES = `
### Example 1: REPLACE_LINE (Logic Error)
<code>
function findMax(a: number, b: number): number {
  return a > b ? b : a;  // ❌ Wrong logic
}
</code>

<prediction>
{
  "targetLine": 2,
  "originalLineContent": "  return a > b ? b : a;",
  "suggestionText": "  return a > b ? a : b;",
  "explanation": "Fix logic error: should return a when a > b",
  "confidence": 0.95,
  "priority": 1,
  "changeType": "REPLACE_LINE"
}
</prediction>

---

### Example 2: REPLACE_WORD (Keyword Typo)
<code>
funct ion greet(name: string): string {
  return \`Hello, \${name}!\`;
}
</code>

<prediction>
{
  "targetLine": 1,
  "originalLineContent": "funct ion greet(name: string): string {",
  "suggestionText": "function",
  "explanation": "Fix keyword typo: 'funct ion' → 'function'",
  "confidence": 0.98,
  "priority": 1,
  "changeType": "REPLACE_WORD",
  "wordReplaceInfo": {
    "word": "funct ion",
    "replacement": "function",
    "startColumn": 1,
    "endColumn": 11
  }
}
</prediction>

---

### Example 3: REPLACE_WORD (Operator Error)
<code>
function isValid(value: string): boolean {
  if (value !== null || value !== undefined) {
    return true;
  }
  return false;
}
</code>

<prediction>
{
  "targetLine": 2,
  "originalLineContent": "  if (value !== null || value !== undefined) {",
  "suggestionText": "&&",
  "explanation": "Fix operator: '||' should be '&&'",
  "confidence": 0.92,
  "priority": 1,
  "changeType": "REPLACE_WORD",
  "wordReplaceInfo": {
    "word": "||",
    "replacement": "&&",
    "startColumn": 22,
    "endColumn": 24
  }
}
</prediction>

---

### Example 4: INSERT (Add Property)
<code>
class Point3D {
  x: number;
  y: number;
  // Missing z property
}
</code>

<prediction>
{
  "targetLine": 3,
  "originalLineContent": "  y: number;",
  "suggestionText": "  z: number;",
  "explanation": "Add z property to match Point3D class name",
  "confidence": 0.90,
  "priority": 1,
  "changeType": "INSERT"
}
</prediction>

---

### Example 5: DELETE (Remove Unused Import)
<code>
import { ref } from 'vue';
import { computed } from 'vue';  // ❌ Not used
import { watch } from 'vue';

const count = ref(0);
</code>

<prediction>
{
  "targetLine": 2,
  "originalLineContent": "import { computed } from 'vue';",
  "suggestionText": "",
  "explanation": "Remove unused import: 'computed' is not used",
  "confidence": 0.88,
  "priority": 2,
  "changeType": "DELETE"
}
</prediction>

---

### Example 6: INLINE_INSERT (Extend Expression)
<code>
class Point3D {
  x: number;
  y: number;
  z: number;
  
  getDistance() {
    return Math.sqrt(this.x ** 2 + this.y ** 2);
  }
}
</code>

<prediction>
{
  "targetLine": 7,
  "originalLineContent": "    return Math.sqrt(this.x ** 2 + this.y ** 2);",
  "suggestionText": " + this.z ** 2",
  "explanation": "Add z calculation to match Point3D",
  "confidence": 0.93,
  "priority": 1,
  "changeType": "INLINE_INSERT",
  "inlineInsertInfo": {
    "content": " + this.z ** 2",
    "insertColumn": 50
  }
}
</prediction>
`;

/**
 * 模式示例库
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
 * @param {string} patternType - 模式类型
 * @returns {string} 示例文本
 */
export function getFewShotExamples(patternType) {
  return PATTERN_EXAMPLES[patternType] || '';
}
