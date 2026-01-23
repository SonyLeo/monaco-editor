import { BaseModelClient } from './baseModelClient.mjs';
import { DEEPSEEK_FIM_CONFIG, DEEPSEEK_CHAT_CONFIG, FIM_STOP_SEQUENCES, CHAT_STOP_SEQUENCES, API_RESPONSE_PATHS } from '../constants.mjs';

/**
 * DeepSeek FIM 客户端
 * 使用 FIM Completions API (Beta)
 */
class DeepSeekFIMClient extends BaseModelClient {
  constructor() {
    super(DEEPSEEK_FIM_CONFIG, 'fim');
  }

  /**
   * 构建 DeepSeek FIM 请求体
   */
  buildRequestBody(prompt, maxTokens, stopSequences) {
    const { prefix, suffix } = prompt;
    
    return {
      model: this.config.MODEL,
      prompt: prefix,
      suffix: suffix || '',
      max_tokens: maxTokens,
      temperature: this.config.DEFAULT_TEMPERATURE,
      stream: false,
      stop: stopSequences,
      echo: false,
    };
  }

  /**
   * 解析 DeepSeek FIM API 响应
   */
  parseResponse(data) {
    return this.getNestedValue(data, API_RESPONSE_PATHS.COMPLETION);
  }

  /**
   * 清理 DeepSeek FIM 补全文本
   */
  cleanCompletion(text) {
    let cleaned = this.cleanCompletionBase(text);
    return cleaned ? cleaned.trim() : cleaned;
  }

  /**
   * 获取 DeepSeek FIM 停止符
   */
  getStopSequences() {
    return FIM_STOP_SEQUENCES;
  }
}

/**
 * DeepSeek Chat 客户端
 * 使用 Chat Completions API
 */
class DeepSeekChatClient extends BaseModelClient {
  constructor() {
    super(DEEPSEEK_CHAT_CONFIG, 'chat');
  }

  /**
   * 构建 DeepSeek Chat 请求体
   */
  buildRequestBody(prompt, maxTokens, stopSequences) {
    const { systemPrompt, userPrompt } = prompt;

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
      response_format: this.config.RESPONSE_FORMAT,
    };
  }

  /**
   * 解析 DeepSeek Chat API 响应
   */
  parseResponse(data) {
    return this.getNestedValue(data, API_RESPONSE_PATHS.CHAT);
  }

  /**
   * 清理 DeepSeek Chat 补全文本
   */
  cleanCompletion(text) {
    let cleaned = this.cleanCompletionBase(text);
    return cleaned ? cleaned.trim() : cleaned;
  }

  /**
   * 获取 DeepSeek Chat 停止符
   */
  getStopSequences() {
    return CHAT_STOP_SEQUENCES;
  }
}

/**
 * 调用 DeepSeek FIM API 进行代码补全
 * @param {Object} prompt - Prompt 对象 { prefix, suffix }
 * @param {string} apiKey - API 密钥
 * @returns {Promise<{ text: string | null }>} 补全结果
 */
export async function callDeepSeekFIM(prompt, apiKey) {
  const client = new DeepSeekFIMClient();
  return await client.callAPI(prompt, apiKey, 'DeepSeek-FIM');
}

/**
 * 调用 DeepSeek Chat API 进行对话
 * @param {Object} prompt - Prompt 对象 { systemPrompt, userPrompt }
 * @param {string} apiKey - API 密钥
 * @returns {Promise<{ text: string | null }>} 响应结果
 */
export async function callDeepSeekChat(prompt, apiKey) {
  const client = new DeepSeekChatClient();
  return await client.callAPI(prompt, apiKey, 'DeepSeek-Chat');
}
