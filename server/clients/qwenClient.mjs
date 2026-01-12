import { BaseModelClient } from './baseModelClient.mjs';
import { QWEN_CONFIG, FIM_CONFIG, API_RESPONSE_PATHS, MODEL_COMMON_CONFIG } from '../constants.mjs';
import { FIMPromptBuilder } from '../utils/fimPromptBuilder.mjs';

/**
 * Qwen Coder 模型客户端
 * 使用 FIM (Fill In the Middle) Completions API
 */
class QwenClient extends BaseModelClient {
  constructor() {
    super(QWEN_CONFIG, 'fim');
    this.fimBuilder = new FIMPromptBuilder(QWEN_CONFIG);
  }

  /**
   * 构建 Qwen 请求体
   */
  buildRequestBody(prompt, maxTokens, stopSequences) {
    const { fimPrompt, cursorContext } = this.fimBuilder.buildOptimizedFIMPrompt(prompt.fileContent);
    console.log('🎯 FIM Prompt 长度:', fimPrompt.length);
    
    // 将 cursorContext 存储到实例，供其他方法使用
    this._cursorContext = cursorContext;
    
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
   * 重写 Token 计算方法，使用 FIM 上下文
   */
  calculateTokens() {
    const limits = MODEL_COMMON_CONFIG.TOKEN_LIMITS;
    const cursorContext = this._cursorContext;
    
    if (!cursorContext) {
      return limits.DEFAULT;
    }
    
    if (cursorContext.needsStatement) {
      return limits.STATEMENT;
    } else if (cursorContext.needsExpression) {
      return limits.EXPRESSION;
    } else if (cursorContext.inFunction) {
      return limits.FUNCTION;
    } else if (cursorContext.inClass) {
      return limits.CLASS;
    }
    
    return limits.DEFAULT;
  }

  /**
   * 解析 Qwen API 响应
   */
  parseResponse(data) {
    return this.getNestedValue(data, API_RESPONSE_PATHS.COMPLETION);
  }

  /**
   * 清理 Qwen 补全文本
   */
  cleanCompletion(text) {
    if (!text) return text;
    
    // 使用基类的清理方法
    let cleaned = this.cleanCompletionBase(text);
    
    // 移除 FIM 标记
    const markers = FIM_CONFIG.MARKERS;
    Object.values(markers).forEach(marker => {
      cleaned = cleaned.replace(new RegExp(marker.replace(/[|<>]/g, '\\$&'), 'g'), '');
    });
    
    // 表达式特殊处理：移除尾部分号
    const cursorContext = this._cursorContext;
    if (cursorContext?.needsExpression) {
      cleaned = cleaned.replace(/;\s*$/, '');
    }
    
    // 移除前导空白行（保留缩进）
    const lines = cleaned.split('\n');
    if (lines.length > 0 && lines[0].trim() === '') {
      lines.shift();
    }
    cleaned = lines.join('\n');
    
    return cleaned;
  }

  /**
   * 获取 FIM 专用停止符
   */
  getStopSequences() {
    // 基础停止符
    const stops = [...FIM_CONFIG.BASE_STOPS];
    
    // 根据上下文添加特定停止符
    const cursorContext = this._cursorContext;
    if (!cursorContext) {
      return stops;
    }
    
    if (cursorContext.needsExpression) {
      stops.push(...FIM_CONFIG.CONTEXT_STOPS.EXPRESSION);
    } else if (cursorContext.needsStatement) {
      stops.push(...FIM_CONFIG.CONTEXT_STOPS.STATEMENT);
    } else if (cursorContext.inObject) {
      stops.push(...FIM_CONFIG.CONTEXT_STOPS.OBJECT);
    }
    
    return stops;
  }
}

/**
 * 调用 Qwen Coder API 进行代码补全
 * @param {Object} prompt - Prompt 对象
 * @param {string} apiKey - API 密钥
 * @returns {Promise<{ text: string | null }>} 补全结果
 */
export async function callQwenAPI(prompt, apiKey) {
  const client = new QwenClient();
  return await client.callAPI(prompt, apiKey, 'Qwen Coder');
}
