import express from 'express';
import cors from 'cors';
import { getConfig } from './server/config.mjs';
import { API_ENDPOINTS, API_URLS, COMPLETION_CONFIG, NES_PREDICTION_CONFIG } from './server/constants.mjs';
import { NES_SYSTEM_PROMPT, FIM_COMPLETION_PROMPT } from './server/prompts/nesSystemPrompt.mjs';
import { buildUserPrompt } from './server/formatters/promptFormatters.mjs';
import { parseAIResponse, formatPredictionResponse } from './server/utils/jsonParser.mjs';

// 获取并验证配置
const config = getConfig();

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// ⚡ Fast Track: 代码补全
app.post('/api/completion', async (req, res) => {
  try {
    const { prefix, suffix, max_tokens = COMPLETION_CONFIG.MAX_TOKENS } = req.body;
    
    console.log(`⚡ [Fast] Completion request (${prefix?.length || 0} chars prefix)`);

    const apiUrl = API_URLS[config.provider];
    const model = COMPLETION_CONFIG.MODELS[config.provider];

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: FIM_COMPLETION_PROMPT
          },
          {
            role: 'user',
            content: `Complete the following code:\n\n${prefix}[CURSOR]${suffix}\n\nComplete at [CURSOR]. Return only the code to insert.`
          }
        ],
        max_tokens,
        temperature: COMPLETION_CONFIG.TEMPERATURE,
        stop: COMPLETION_CONFIG.STOP_SEQUENCES
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
    const { codeWindow, windowInfo, diffSummary, editHistory, userFeedback, requestId } = req.body;

    console.log(`🧠 [Slow] NES Prediction (Request ID: ${requestId})`);
    
    // 详细日志
    console.log('📦 [Request Data]');
    console.log('  diffSummary:', diffSummary);
    console.log('  editHistory:', editHistory ? `${editHistory.length} edits` : 'none');
    console.log('  userFeedback:', userFeedback ? `${userFeedback.length} feedback(s)` : 'none');
    
    if (editHistory && editHistory.length > 0) {
      console.log('  Latest edit:', JSON.stringify(editHistory[editHistory.length - 1], null, 2));
    }
    if (userFeedback && userFeedback.length > 0) {
      console.log('  Recent feedback:', userFeedback.map(f => `${f.action} at line ${f.targetLine}`).join(', '));
    }
    console.log('  codeWindow lines:', codeWindow.split('\n').length);

    if (!codeWindow || !diffSummary) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 使用格式化工具构建 User Prompt
    const userPrompt = buildUserPrompt(codeWindow, windowInfo, diffSummary, editHistory, userFeedback);
    
    // 调试模式
    if (process.env.DEBUG_PROMPT === 'true') {
      console.log('\n========== FULL PROMPT ==========');
      console.log('SYSTEM:', NES_SYSTEM_PROMPT.substring(0, 500) + '...');
      console.log('\nUSER:', userPrompt);
      console.log('==================================\n');
    }

    const apiUrl = API_URLS[config.provider];
    const model = NES_PREDICTION_CONFIG.MODELS[config.provider];

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: NES_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        response_format: NES_PREDICTION_CONFIG.RESPONSE_FORMAT,
        temperature: NES_PREDICTION_CONFIG.TEMPERATURE,
        max_tokens: NES_PREDICTION_CONFIG.MAX_TOKENS
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    // 检查是否可能被截断
    const finishReason = data.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn('⚠️ [Slow] Response was truncated due to max_tokens limit!');
      console.warn('   Consider increasing max_tokens in the API request');
    }

    // 解析 JSON（使用容错工具）
    const parsedResult = parseAIResponse(content);
    
    // 格式化响应
    const finalResponse = formatPredictionResponse(parsedResult, requestId);

    res.json(finalResponse);
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
