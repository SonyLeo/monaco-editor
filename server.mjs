import express from 'express';
import cors from 'cors';
import { CompletionCopilot } from 'monacopilot';
import { getConfig } from './server/config.mjs';
import { API_ENDPOINTS, PROVIDER_INFO } from './server/constants.mjs';
import { createSmartPrompt } from './server/utils/promptBuilder.mjs';
import { callDeepSeekAPI } from './server/clients/deepseekClient.mjs';
import { callQwenAPI } from './server/clients/qwenClient.mjs';

// 获取并验证配置
const config = getConfig();

// 选择 API 调用函数
const apiClient = config.provider === 'deepseek' ? callDeepSeekAPI : callQwenAPI;

// Provider 信息（用于健康检查和日志）
const providerInfo = PROVIDER_INFO[config.provider];

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 创建自定义模型配置
const copilot = new CompletionCopilot(undefined, {
  model: async (prompt) => {
    return await apiClient(prompt, config.apiKey);
  },
});

// API 端点
app.post(API_ENDPOINTS.COMPLETION, async (req, res) => {
  try {
    console.log('\n🚀 处理代码补全请求...');
    
    // 使用自定义 Prompt
    const completion = await copilot.complete({ 
      body: req.body,
      options: {
        customPrompt: createSmartPrompt
      }
    });
    
    res.json(completion);
  } catch (error) {
    console.error('❌ 服务器错误:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// 健康检查端点
app.get(API_ENDPOINTS.HEALTH, (req, res) => {
  res.json({ 
    status: 'ok', 
    message: `Monacopilot ${providerInfo.name} server is running`,
    provider: providerInfo.name,
    model: providerInfo.model
  });
});

app.listen(config.port, () => {
  console.log('🎉 Monacopilot AI 服务器启动成功!');
  console.log(`📡 服务器监听端口: ${config.port}`);
  console.log(`🔗 健康检查: http://localhost:${config.port}${API_ENDPOINTS.HEALTH}`);
  console.log(`🤖 补全端点: http://localhost:${config.port}${API_ENDPOINTS.COMPLETION}`);
  console.log(`💡 AI Provider: ${providerInfo.name}`);
  console.log(`🔧 Model: ${providerInfo.model}`);
});
