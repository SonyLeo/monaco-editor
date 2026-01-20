import express from 'express';
import cors from 'cors';
import { getConfig } from './server/config.mjs';
import { API_ENDPOINTS } from './server/constants.mjs';

// 获取并验证配置
const config = getConfig();

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// ⚡ Fast Track: 代码补全
app.post('/api/completion', async (req, res) => {
  try {
    const { prefix, suffix, max_tokens = 64 } = req.body;
    
    console.log(`⚡ [Fast] Completion request (${prefix?.length || 0} chars prefix)`);

    // 直接调用 DeepSeek API (简化版 - 不使用 Beta FIM，使用标准接口)
    const isDeepSeek = config.provider === 'deepseek';
    const apiUrl = isDeepSeek
      ? 'https://api.deepseek.com/v1/chat/completions'
      : 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: isDeepSeek ? 'deepseek-coder' : 'qwen2.5-coder-7b-instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a code completion assistant. Complete the code at the cursor position. Return ONLY the completion text, no explanations.'
          },
          {
            role: 'user',
            content: `Complete the following code:\n\n${prefix}[CURSOR]${suffix}\n\nComplete at [CURSOR]. Return only the code to insert.`
          }
        ],
        max_tokens,
        temperature: 0,
        stop: ['\n\n', '\n\n\n']
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const completion = data.choices?.[0]?.message?.content || '';

    res.json({ completion: completion.trim() });
  } catch (error) {
    console.error('❌ [Fast] Error:', error.message);
    res.status(500).json({
      error: 'Completion failed',
      message: error.message
    });
  }
});

// 健康检查端点
app.get(API_ENDPOINTS.HEALTH, (req, res) => {
  res.json({
    status: 'ok',
    message: `NES Dual Engine Server`,
    provider: config.provider,
    mode: 'Fast + Slow Engine'
  });
});

// 🧠 Slow Track: NES 预测
app.post('/api/next-edit-prediction', async (req, res) => {
  try {
    const { codeWindow, windowInfo, diffSummary, requestId } = req.body;

    console.log(`🧠 [Slow] NES Prediction (Request ID: ${requestId})`);

    if (!codeWindow || !diffSummary) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 🔧 优化后的 System Prompt (Zod + Continue 风格)
    const systemPrompt = `You are an intelligent code refactoring assistant.

### INSTRUCTIONS
Your task is to predict the **single next edit** required based on a recent code change.
You must analyze the "RECENT CHANGE" and find where else in the "CODE WINDOW" needs to be updated.

### STRICT OUTPUT SCHEMA (TypeScript Interface)
You must output a single valid JSON object satisfying this interface. Do not include markdown or comments.

\`\`\`typescript
interface Response {
  // Step 1: Analyze the change (Chain of Thought)
  analysis: {
    change_type: "addParameter" | "renameFunction" | "changeType" | "other";
    summary: string; // e.g. "Function 'createUser' added 'age' parameter"
    impact: string;  // e.g. "Need to update all calls to 'createUser' with default age"
  };

  // Step 2: The prediction (or null if no edit needed)
  // Return null if:
  // - No further edits are needed
  // - The next usage is outside the code window
  // - You are unsure
  prediction: {
    targetLine: number;           // 1-based line number in CODE WINDOW
    originalLineContent: string;  // MUST match character-for-character, otherwise REJECTED
    suggestionText: string;       // The complete new line content
    explanation: string;          // Short rationale for user
    confidence: number;           // 0.0 to 1.0
  } | null;
}
\`\`\`

### RULES
1. **Exact Match**: \`originalLineContent\` must be an exact substring of the provided code window. Even a single space difference will cause validation failure.
2. **Context Awareness**: Only suggest edits that logically follow from the recent change.
3. **Safety**: If the line is already correct (e.g. user already updated it), return \`prediction: null\`.

### EXAMPLES

user:
<recent_change>
- function log(msg) {
+ function log(msg, level) {
</recent_change>
<code_window>
10: log("Start");
11: process();
</code_window>

assistant:
{
  "analysis": {
    "change_type": "addParameter",
    "summary": "Added 'level' param to log()",
    "impact": "Update usage at line 10"
  },
  "prediction": {
    "targetLine": 10,
    "originalLineContent": "    log(\"Start\");",
    "suggestionText": "    log(\"Start\", \"INFO\");",
    "explanation": "Add missing 'level' argument",
    "confidence": 0.95
  }
}`;

    // 🔧 Continue 风格的 User Prompt (XML Tags)
    const userPrompt = `<recent_change>
${diffSummary}
</recent_change>

<file_info>
Total Lines: ${windowInfo.totalLines}
Window Start: ${windowInfo.startLine}
</file_info>

<code_window>
${codeWindow.split('\n').map((line, i) => `${windowInfo.startLine + i}: ${line}`).join('\n')}
</code_window>

Analyze the <recent_change> and find the next logical edit in <code_window>.`;
    
    // 移除旧的 userPrompt 定义
    /*
    const userPrompt = `###  CODE WINDOW (Lines ${windowInfo.startLine}-${windowInfo.startLine + codeWindow.split('\n').length})
${codeWindow}

### RECENT CHANGE
${diffSummary}

### FILE INFO
- Total lines: ${windowInfo.totalLines}
- Window starts at line: ${windowInfo.startLine}

Predict the next edit. If targetLine is within the window, calculate absolute line number.`;
*/

    const isDeepSeek = config.provider === 'deepseek';
    const apiUrl = isDeepSeek
      ? 'https://api.deepseek.com/v1/chat/completions'
      : 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: isDeepSeek ? 'deepseek-chat' : 'qwen2.5-coder-32b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 256
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    // 解析 JSON
    let parsedResult = null;
    try {
      // 处理可能的 Markdown 代码块
      const cleanContent = content.replace(/```json\n|\n```/g, '').trim();
      parsedResult = JSON.parse(cleanContent);
    } catch (e) {
      console.warn('⚠️ JSON parse failed, trying regex extraction');
      // 尝试提取 JSON 块
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsedResult = JSON.parse(match[0]);
        } catch (e2) {
          console.error('❌ JSON extraction failed:', e2);
        }
      }
    }

    let finalPrediction = null;

    if (parsedResult) {
      // 1. 记录分析过程 (Chain of Thought)
      if (parsedResult.analysis) {
        console.log('🤔 [AI Analysis]', JSON.stringify(parsedResult.analysis, null, 2));
      }

      // 2. 提取预测结果
      if (parsedResult.prediction) {
        finalPrediction = parsedResult.prediction;
        finalPrediction.requestId = requestId;
        // 把 confidence 也传下去
        if (parsedResult.prediction.confidence) {
            finalPrediction.confidence = parsedResult.prediction.confidence;
        }
        console.log(`✅ [Slow] Prediction: Line ${finalPrediction.targetLine} (${finalPrediction.explanation})`);
      } else {
        console.log('ℹ️ [Slow] AI decided no edit is needed (prediction is null)');
      }
    } else {
      console.log('ℹ️ [Slow] No valid JSON response');
    }

    res.json(finalPrediction);
  } catch (error) {
    console.error('❌ [Slow] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});


app.listen(config.port, () => {
  console.log('\n🚀 NES Dual Engine Server Started!');
  console.log(`📡 Port: ${config.port}`);
  console.log(`🔗 Health: http://localhost:${config.port}${API_ENDPOINTS.HEALTH}`);
  console.log(`⚡ Fast Engine: http://localhost:${config.port}/api/completion`);
  console.log(`🧠 Slow Engine: http://localhost:${config.port}/api/next-edit-prediction`);
  console.log(`🤖 Provider: ${config.provider}`);
  console.log('\n✨ Ready for Next Edit Suggestions!\n');
});
