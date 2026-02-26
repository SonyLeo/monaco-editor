import express from 'express';
import cors from 'cors';
import { getConfig } from './server/config.mjs';
import { API_ENDPOINTS, PROVIDERS, FAST_TRACK_CONFIG, SLOW_TRACK_CONFIG } from './server/constants.mjs';
import { NES_SYSTEM_PROMPT, buildNESUserPrompt } from './server/prompts/index.mjs';
import { parseAIResponse, formatPredictionResponse } from './server/utils/jsonParser.mjs';
import { callDeepSeekFIM, callDeepSeekChat } from './server/clients/deepseekClient.mjs';
import { callQwenFIM, callQwenChat } from './server/clients/qwenClient.mjs';

// 获取并验证配置
const config = getConfig();

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

/**
 * Provider 客户端映射
 */
const FIM_CLIENTS = {
  [PROVIDERS.DEEPSEEK]: callDeepSeekFIM,
  [PROVIDERS.QWEN]: callQwenFIM,
};

const CHAT_CLIENTS = {
  [PROVIDERS.DEEPSEEK]: callDeepSeekChat,
  [PROVIDERS.QWEN]: callQwenChat,
};

/**
 * 调用 FIM API（Fast Track）
 * @param {string} provider - PROVIDERS.DEEPSEEK | PROVIDERS.QWEN
 * @param {string} prefix - 前缀代码
 * @param {string} suffix - 后缀代码
 * @param {string} apiKey - API 密钥
 * @returns {Promise<string>} 补全结果
 */
async function callFIMAPI(provider, prefix, suffix, apiKey) {
  const clientFn = FIM_CLIENTS[provider];
  const providerConfig = FAST_TRACK_CONFIG[provider];
  
  if (!clientFn || !providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  const prompt = { prefix, suffix };
  const result = await clientFn(prompt, apiKey);
  return result.text || '';
}

/**
 * 调用 Chat API（Slow Track）
 * @param {string} provider - PROVIDERS.DEEPSEEK | PROVIDERS.QWEN
 * @param {string} systemPrompt - 系统提示词
 * @param {string} userPrompt - 用户提示词
 * @param {string} apiKey - API 密钥
 * @returns {Promise<string>} 响应结果
 */
async function callChatAPI(provider, systemPrompt, userPrompt, apiKey) {
  const clientFn = CHAT_CLIENTS[provider];
  const providerConfig = SLOW_TRACK_CONFIG[provider];
  
  if (!clientFn || !providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  const prompt = { systemPrompt, userPrompt };
  const result = await clientFn(prompt, apiKey);
  return result.text || '';
}

import { logPromptInteraction, clearLogs } from './server/utils/promptLogger.mjs';

// ⚡ Fast Track: 代码补全
app.post('/api/completion', async (req, res) => {
  try {
    const { prefix, suffix } = req.body;

    const completion = await callFIMAPI(config.provider, prefix, suffix, config.apiKey);

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
app.get(API_ENDPOINTS.HEALTH, (_req, res) => {
  res.json({
    status: 'ok',
    message: `NES Dual Engine Server`,
    provider: config.provider,
    mode: 'Fast + Slow Engine'
  });
});

// 🧠 Slow Track: NES 预测
app.post('/api/next-edit-prediction', async (req, res) => {
  const startTime = Date.now();
  const { codeWindow, windowInfo, diffSummary, editHistory, userFeedback, requestId } = req.body;
  const currentRequestId = requestId || `req_${Date.now()}`;

  try {
    if (!codeWindow || !diffSummary) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 使用格式化工具构建 User Prompt
    const userPrompt = buildNESUserPrompt(codeWindow, windowInfo, diffSummary, editHistory, userFeedback);

    const content = await callChatAPI(config.provider, NES_SYSTEM_PROMPT, userPrompt, config.apiKey);

    // 解析 JSON（使用容错工具）
    const parsedResult = parseAIResponse(content);
    
    // 格式化响应
    const finalResponse = formatPredictionResponse(parsedResult, currentRequestId);

    // 记录 NES 日志
    logPromptInteraction('nes', currentRequestId, {
      model: config.provider,
      input: {
        codeWindowLines: codeWindow.split('\n').length,
        diffSummary,
        editHistoryCount: editHistory?.length || 0
      },
      systemPrompt: NES_SYSTEM_PROMPT,
      userPrompt: userPrompt,
      rawResponse: content,
      parsedResponse: finalResponse,
      durationMs: Date.now() - startTime
    });

    res.json(finalResponse);
  } catch (error) {
    console.error('❌ [Slow] Error:', error.message);
    
    // 记录错误日志
    logPromptInteraction('nes', currentRequestId, {
      model: config.provider,
      input: { diffSummary, editHistory },
      error: error.message,
      durationMs: Date.now() - startTime
    });

    res.status(500).json({ error: error.message });
  }
});

// 启动前清理旧日志
clearLogs().then(() => {
  app.listen(config.port, () => {
    console.log('\n🚀 NES Dual Engine Server Started!');
    console.log(`📡 Port: ${config.port}`);
    console.log(`🔗 Health: http://localhost:${config.port}${API_ENDPOINTS.HEALTH}`);
    console.log(`⚡ Fast Engine: http://localhost:${config.port}/api/completion`);
    console.log(`🧠 Slow Engine: http://localhost:${config.port}/api/next-edit-prediction`);
    console.log(`🤖 Provider: ${config.provider}`);
    console.log('\n✨ Ready for Next Edit Suggestions!\n');
  });
});
