/**
 * Test AI Context Generation
 * 测试 AI 是否正确返回 context 字段
 */

import { buildNESUserPrompt } from './server/prompts/nes/builder.mjs';
import { NES_SYSTEM_PROMPT } from './server/prompts/nes/systemPrompt.mjs';

// 测试场景
const testScenarios = [
  {
    name: '场景 1: 简单函数重命名',
    codeWindow: `function createUser(name, age) {
  return { name, age };
}

const user1 = createUser("Alice", 30);
const user2 = createUser("Bob", 25);`,
    editHistory: [
      {
        timestamp: Date.now(),
        lineNumber: 1,
        column: 10,
        type: 'replace',
        oldText: 'createUser',
        newText: 'createUserInfo',
        rangeLength: 10,
        source: 'user',
        context: {
          lineContent: 'function createUser(name, age) {',
          tokenType: 'identifier',
          semanticType: 'functionName'
        }
      }
    ],
    diffSummary: 'Renamed function createUser to createUserInfo',
    expectedContext: {
      before: 'function ',
      target: 'createUser',
      after: '(name, age'
    }
  },
  {
    name: '场景 2: 多处相同变量名',
    codeWindow: `const name = "name";
const user = { name: name };`,
    editHistory: [
      {
        timestamp: Date.now(),
        lineNumber: 1,
        column: 7,
        type: 'replace',
        oldText: 'name',
        newText: 'username',
        rangeLength: 4,
        source: 'user',
        context: {
          lineContent: 'const name = "name";',
          tokenType: 'identifier',
          semanticType: 'variableName'
        }
      }
    ],
    diffSummary: 'Renamed variable name to username (first occurrence)',
    expectedContext: {
      before: 'const ',
      target: 'name',
      after: ' = "'
    }
  },
  {
    name: '场景 3: 添加参数',
    codeWindow: `function greet(name) {
  console.log("Hello, " + name);
}

greet("Alice");
greet("Bob");`,
    editHistory: [
      {
        timestamp: Date.now(),
        lineNumber: 1,
        column: 19,
        type: 'insert',
        oldText: '',
        newText: ', age',
        rangeLength: 0,
        source: 'user',
        context: {
          lineContent: 'function greet(name) {',
          tokenType: 'identifier',
          semanticType: 'parameter'
        }
      }
    ],
    diffSummary: 'Added parameter age to function greet',
    expectedContext: {
      before: 'greet(name',
      target: '',
      after: ') {'
    }
  }
];

console.log('🧪 Testing AI Context Generation\n');
console.log('=' .repeat(80));

console.log('\n📖 System Prompt (first 500 chars):');
console.log('-'.repeat(80));
console.log(NES_SYSTEM_PROMPT.substring(0, 500) + '...\n');

testScenarios.forEach((scenario, index) => {
  console.log(`\n📋 Test ${index + 1}: ${scenario.name}`);
  console.log('-'.repeat(80));
  
  const userPrompt = buildNESUserPrompt(
    scenario.codeWindow,
    {
      startLine: 1,
      totalLines: scenario.codeWindow.split('\n').length
    },
    scenario.diffSummary,
    scenario.editHistory,
    []
  );
  
  console.log('\n📝 User Prompt (first 300 chars):');
  console.log(userPrompt.substring(0, 300) + '...\n');
  
  console.log('✅ Expected Context:');
  console.log(JSON.stringify(scenario.expectedContext, null, 2));
  
  console.log('\n' + '='.repeat(80));
});

console.log('\n\n📊 Summary:');
console.log(`Total scenarios: ${testScenarios.length}`);
console.log('\n🔍 Next Steps:');
console.log('1. Start your NES server: node server.mjs');
console.log('2. Open examples/context-position-test.html in browser');
console.log('3. Test with real AI responses');
console.log('4. Verify context-based positioning works correctly');
console.log('\n✨ If AI returns correct context, accuracy should be 90%+');
console.log('\n💡 Manual Testing:');
console.log('   - Copy System Prompt + User Prompt');
console.log('   - Send to AI (DeepSeek/Qwen)');
console.log('   - Check response includes "context" field');
console.log('   - Verify context values match expected');

