import { BaseModelClient } from './baseModelClient.mjs';
import { QWEN_FIM_CONFIG, QWEN_CHAT_CONFIG, FIM_CONFIG, FIM_STOP_SEQUENCES, CHAT_STOP_SEQUENCES, API_RESPONSE_PATHS } from '../constants.mjs';

/**
 * Qwen FIM 客户端
 * 使用 FIM Completions API with FIM markers
 */
class QwenFIMClient extends BaseModelClient {
  constructor() {
    super(QWEN_FIM_CONFIG, 'fim');
  }

  /**
   * 构建 Qwen FIM 请求体
   */
  buildRequestBody(prompt, maxTokens, stopSequences) {
    const { prefix, suffix } = prompt;
    
    // 使用 FIM markers 构建 prompt
    const fimPrompt = `${FIM_CONFIG.MARKERS.PREFIX}${prefix}${FIM_CONFIG.MARKERS.SUFFIX}${suffix || ''}${FIM_CONFIG.MARKERS.MIDDLE}`;
    
    console.log('🎯 Qwen FIM Prompt 长度:', fimPrompt.length);
    
    return {
      model: this.config.MODEL,
      prompt: fimPrompt,
      max_tokens: maxTokens,
      temperature: this.config.DEFAULT_TEMPERATURE,
      top_p: this.config.TOP_P,
      stream: false,
      stop: stopSequences,
      presence_penalty: this.config.PRESENCE_PENALTY,
    };
  }

  /**
   * 解析 Qwen FIM API 响应
   */
  parseResponse(data) {
    return this.getNestedValue(data, API_RESPONSE_PATHS.COMPLETION);
  }

  /**
   * 清理 Qwen FIM 补全文本
   */
  cleanCompletion(text) {
    if (!text) return text;
    
    let cleaned = this.cleanCompletionBase(text);
    
    // 移除 FIM 标记
    const markers = FIM_CONFIG.MARKERS;
    Object.values(markers).forEach(marker => {
      cleaned = cleaned.replace(new RegExp(marker.replace(/[|<>]/g, '\\$&'), 'g'), '');
    });
    
    return cleaned.trim();
  }

  /**
   * 获取 Qwen FIM 停止符
   */
  getStopSequences() {
    return FIM_STOP_SEQUENCES;
  }
}

/**
 * Qwen Chat 客户端
 * 使用 Chat Completions API
 */
class QwenChatClient extends BaseModelClient {
  constructor() {
    super(QWEN_CHAT_CONFIG, 'chat');
  }

  /**
   * 构建 Qwen Chat 请求体
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
      top_p: this.config.TOP_P,
      stream: false,
      stop: stopSequences,
      presence_penalty: this.config.PRESENCE_PENALTY,
      response_format: this.config.RESPONSE_FORMAT,
    };
  }

  /**
   * 解析 Qwen Chat API 响应
   */
  parseResponse(data) {
    return this.getNestedValue(data, API_RESPONSE_PATHS.CHAT);
  }

  /**
   * 清理 Qwen Chat 补全文本
   */
  cleanCompletion(text) {
    let cleaned = this.cleanCompletionBase(text);
    return cleaned ? cleaned.trim() : cleaned;
  }

  /**
   * 获取 Qwen Chat 停止符
   */
  getStopSequences() {
    return CHAT_STOP_SEQUENCES;
  }
}

/**
 * 调用 Qwen FIM API 进行代码补全
 * @param {Object} prompt - Prompt 对象 { prefix, suffix }
 * @param {string} apiKey - API 密钥
 * @returns {Promise<{ text: string | null }>} 补全结果
 */
export async function callQwenFIM(prompt, apiKey) {
  const client = new QwenFIMClient();
  return await client.callAPI(prompt, apiKey, 'Qwen-FIM');
}

/**
 * 调用 Qwen Chat API 进行对话
 * @param {Object} prompt - Prompt 对象 { systemPrompt, userPrompt }
 * @param {string} apiKey - API 密钥
 * @returns {Promise<{ text: string | null }>} 响应结果
 */
export async function callQwenChat(prompt, apiKey) {
  const client = new QwenChatClient();
  return await client.callAPI(prompt, apiKey, 'Qwen-Chat');
}
