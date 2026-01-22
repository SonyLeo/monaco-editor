import { BaseModelClient } from './baseModelClient.mjs';
import { DEEPSEEK_CONFIG, API_RESPONSE_PATHS, STOP_SEQUENCES } from '../constants.mjs';
import { FIM_SYSTEM_PROMPT, createCodeInstruction, createUserPrompt } from '../prompts/index.mjs';

/**
 * DeepSeek 模型客户端
 * 使用 Chat Completions API
 */
class DeepSeekClient extends BaseModelClient {
  constructor() {
    super(DEEPSEEK_CONFIG, 'chat');
  }

  /**
   * 构建 DeepSeek 请求体
   */
  buildRequestBody(prompt, maxTokens, stopSequences) {
    // 构建 system 和 user prompt
    const systemPrompt = `${prompt.context}\n\n${FIM_SYSTEM_PROMPT}`;
    const instruction = createCodeInstruction(prompt.language || 'javascript');
    const userPrompt = createUserPrompt(instruction, prompt.fileContent);

    return {
      model: this.config.MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: this.config.DEFAULT_TEMPERATURE,
      max_tokens: maxTokens,
      stream: false,
      stop: stopSequences,
      frequency_penalty: this.config.FREQUENCY_PENALTY,
      presence_penalty: this.config.PRESENCE_PENALTY,
    };
  }

  /**
   * 解析 DeepSeek API 响应
   */
  parseResponse(data) {
    return this.getNestedValue(data, API_RESPONSE_PATHS.CHAT);
  }

  /**
   * 清理 DeepSeek 补全文本
   */
  cleanCompletion(text) {
    // 使用基类的清理方法，然后 trim
    let cleaned = this.cleanCompletionBase(text);
    return cleaned ? cleaned.trim() : cleaned;
  }

  /**
   * 获取 DeepSeek 停止符
   */
  getStopSequences() {
    // 使用通用的 JS/TS 停止符
    return STOP_SEQUENCES;
  }
}

/**
 * 调用 DeepSeek API 进行代码补全
 * @param {Object} prompt - Prompt 对象
 * @param {string} apiKey - API 密钥
 * @returns {Promise<{ text: string | null }>} 补全结果
 */
export async function callDeepSeekAPI(prompt, apiKey) {
  const client = new DeepSeekClient();
  return await client.callAPI(prompt, apiKey, 'DeepSeek');
}
