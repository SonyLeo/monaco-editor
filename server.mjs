import express from 'express';
import cors from 'cors';
import { CompletionCopilot } from 'monacopilot';
import { getConfig } from './server/config.mjs';
import { API_ENDPOINTS, PROVIDER_INFO } from './server/constants.mjs';
import { createSmartPrompt } from './server/utils/promptBuilder.mjs';
import { callDeepSeekAPI } from './server/clients/deepseekClient.mjs';
import { callQwenAPI } from './server/clients/qwenClient.mjs';
import { analyzeEditPattern } from './server/utils/editPatternAnalyzer.mjs';
import { buildNextEditPrompt } from './server/prompts/index.mjs';

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

// 🆕 Next Edit Prediction 端点
app.post('/next-edit-prediction', async (req, res) => {
  try {
    console.log('\n🔮 处理 Next Edit 预测请求...');
    
    const { editHistory, currentCode, language = 'typescript' } = req.body;
    
    // 验证输入
    if (!editHistory || !Array.isArray(editHistory) || editHistory.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Edit history is required and must be a non-empty array',
      });
    }
    
    if (!currentCode) {
      return res.status(400).json({
        success: false,
        error: 'Current code is required',
      });
    }
    
    // 1. 分析编辑模式
    const pattern = analyzeEditPattern(editHistory);
    console.log('📊 检测到的模式:', pattern.type, `(置信度: ${pattern.confidence})`);
    
    // 如果置信度太低，不进行预测
    if (pattern.confidence < 0.6) {
      console.log('⚠️ 置信度太低，跳过预测:', pattern.confidence);
      return res.json({
        success: false,
        prediction: null,
        pattern,
        error: `Pattern confidence too low: ${pattern.confidence}`,
      });
    }
    
    // 2. 构建 Prompt
    const prompt = buildNextEditPrompt(editHistory, currentCode, pattern, language);
    
    // 3. 调用 AI 模型
    console.log('🤖 调用 AI 模型进行预测...');
    
    // 为 Next Edit 使用优化的参数（基于 DeepSeek 最佳实践）
    const result = await callNextEditAPI(prompt, config.apiKey, config.provider);
    
    // 4. 解析 JSON 响应
    const prediction = parseNextEditPrediction(result.text);
    
    if (!prediction) {
      return res.json({
        success: false,
        prediction: null,
        pattern,
        error: 'Failed to parse AI response',
      });
    }
    
    console.log('✅ 预测成功:', `Line ${prediction.line}, Action: ${prediction.action}`);
    
    res.json({
      success: true,
      prediction,
      pattern,
    });
  } catch (error) {
    console.error('❌ Next Edit 预测错误:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      prediction: null,
      pattern: { type: 'unknown', confidence: 0, context: '', relatedSymbols: [] },
    });
  }
});

/**
 * 调用 AI 模型进行 Next Edit 预测
 * 使用优化的参数（基于 DeepSeek 最佳实践）
 */
async function callNextEditAPI(prompt, apiKey, provider) {
  const isDeepSeek = provider === 'deepseek';
  const apiUrl = isDeepSeek 
    ? 'https://api.deepseek.com/v1/chat/completions'
    : 'https://dashscope.aliyuncs.com/compatible-mode/v1/completions';
  
  const requestBody = isDeepSeek ? {
    model: 'deepseek-coder',
    messages: [
      { role: 'user', content: prompt.fileContent }
    ],
    temperature: 0.6,  // DeepSeek 推荐
    top_p: 0.95,       // DeepSeek 推荐
    max_tokens: 512,
    stream: false,
  } : {
    model: 'qwen2.5-coder-32b-instruct',
    prompt: prompt.fileContent,
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 512,
    stream: false,
  };
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  
  const data = await response.json();
  const text = isDeepSeek 
    ? data.choices?.[0]?.message?.content
    : data.choices?.[0]?.text;
  
  return { text };
}

/**
 * 解析 Next Edit 预测结果
 */
function parseNextEditPrediction(text) {
  if (!text) return null;
  
  try {
    // 1. 尝试直接解析（如果 AI 返回纯 JSON）
    try {
      const prediction = JSON.parse(text.trim());
      if (isValidPrediction(prediction)) {
        return prediction;
      }
    } catch (e) {
      // 继续尝试其他方法
    }
    
    // 2. 提取 JSON（可能包含在其他文本中）
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const prediction = JSON.parse(jsonMatch[0]);
      if (isValidPrediction(prediction)) {
        return prediction;
      }
    }
    
    // 3. 提取 markdown 代码块中的 JSON
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      const prediction = JSON.parse(codeBlockMatch[1]);
      if (isValidPrediction(prediction)) {
        return prediction;
      }
    }
    
  } catch (error) {
    console.error('JSON 解析失败:', error);
    console.error('原始响应:', text.substring(0, 500));
  }
  
  return null;
}

/**
 * 验证预测结果是否有效
 */
function isValidPrediction(prediction) {
  return prediction &&
         typeof prediction.line === 'number' &&
         typeof prediction.action === 'string' &&
         typeof prediction.newText === 'string';
}

app.listen(config.port, () => {
  console.log('🎉 Monacopilot AI 服务器启动成功!');
  console.log(`📡 服务器监听端口: ${config.port}`);
  console.log(`🔗 健康检查: http://localhost:${config.port}${API_ENDPOINTS.HEALTH}`);
  console.log(`🤖 补全端点: http://localhost:${config.port}${API_ENDPOINTS.COMPLETION}`);
  console.log(`� Next Evdit 端点: http://localhost:${config.port}/next-edit-prediction`);
  console.log(`�  AI Provider: ${providerInfo.name}`);
  console.log(`🔧 Model: ${providerInfo.model}`);
});
