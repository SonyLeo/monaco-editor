// 测试后端 API 是否正常工作
import fetch from 'node-fetch';

async function testFIM() {
  console.log('Testing FIM API...');
  try {
    const response = await fetch('http://localhost:3000/api/completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefix: 'function test() {\n  ',
        suffix: '\n}',
        max_tokens: 64
      })
    });

    const data = await response.json();
    console.log('✅ FIM Response:', data);
  } catch (error) {
    console.error('❌ FIM Error:', error.message);
  }
}

async function testNES() {
  console.log('\nTesting NES API...');
  try {
    const response = await fetch('http://localhost:3000/api/next-edit-prediction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codeWindow: `function test() {
  return 1;
}

function test2() {
  return 2;
}`,
        windowInfo: {
          startLine: 1,
          totalLines: 7
        },
        diffSummary: 'Changed function test() to return 42 instead of 1',
        requestId: 1
      })
    });

    const data = await response.json();
    console.log('✅ NES Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ NES Error:', error.message);
  }
}

async function testHealth() {
  console.log('Testing Health endpoint...');
  try {
    const response = await fetch('http://localhost:3000/health');
    const data = await response.json();
    console.log('✅ Health:', data);
  } catch (error) {
    console.error('❌ Health Error:', error.message);
  }
}

// 运行测试
await testHealth();
await testFIM();
await testNES();
