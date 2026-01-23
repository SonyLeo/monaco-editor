import { MODEL_COMMON_CONFIG, LOG_CONFIG } from '../constants.mjs';

/**
 * 模型客户端基类
 * 提供通用的方法和抽象接口
 */
export class BaseModelClient {
  constructor(config, modelType) {
    this.config = config;
    this.modelType = modelType; // 'chat' | 'fim'
    this.retryConfig = {
      maxRetries: 2,
      retryDelay: 1000,
    };
  }

  /**
   * 统一的 API 调用方法（模板方法模式）
   * @param {Object} prompt - Prompt 对象
   * @param {string} apiKey - API 密钥
   * @param {string} modelName - 模型名称
   * @returns {Promise<{ text: string | null }>} 补全结果
   */
  async callAPI(prompt, apiKey, modelName) {
    try {
      // 1. 记录请求日志
      this.logRequest(prompt, modelName);
      
      // 2. 计算 tokens 和获取停止符
      const maxTokens = this.calculateTokens();
      const stopSequences = this.getStopSequences();
      
      // 3. 构建请求体
      const requestBody = this.buildRequestBody(prompt, maxTokens, stopSequences);
      
      console.log('🛑 停止符数量:', stopSequences.length);
      
      // 4. 调用 API（带重试）
      const data = await this.fetchWithRetry(requestBody, apiKey);
      
      // 5. 解析响应
      let completionText = this.parseResponse(data);
      
      // 6. 清理补全文本
      if (completionText) {
        completionText = this.cleanCompletion(completionText);
      }
      
      // 7. 记录成功日志
      this.logSuccess(completionText, data, maxTokens);

      return { text: completionText };
    } catch (error) {
      return this.handleError(error, modelName);
    }
  }

  /**
   * 带重试的 API 请求
   * @param {Object} requestBody - 请求体
   * @param {string} apiKey - API 密钥
   * @returns {Promise<Object>} API 响应数据
   */
  async fetchWithRetry(requestBody, apiKey) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`🔄 重试第 ${attempt} 次...`);
          await this.sleep(this.retryConfig.retryDelay * attempt);
        }
        
        const response = await fetch(this.config.API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`API error: ${response.status}`);
          error.status = response.status;
          error.response = errorText;
          throw error;
        }

        return await response.json();
      } catch (error) {
        lastError = error;
        
        // 不重试的错误类型
        if (error.status === 401 || error.status === 403) {
          throw error; // 认证错误不重试
        }
        
        // 最后一次尝试失败
        if (attempt === this.retryConfig.maxRetries) {
          throw error;
        }
      }
    }
    
    throw lastError;
  }

  /**
   * 延迟函数
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 统一的日志输出
   * @param {Object} prompt - Prompt 对象
   * @param {string} modelName - 模型名称
   */
  logRequest(prompt, modelName) {
    console.log(`📝 收到 ${modelName} 补全请求`);
    
    // FIM 模式
    if (prompt.prefix !== undefined) {
      console.log('📍 Prefix length:', prompt.prefix?.length || 0);
      console.log('📍 Suffix length:', prompt.suffix?.length || 0);
    }
    // Chat 模式
    else if (prompt.systemPrompt !== undefined) {
      console.log('📍 System prompt length:', prompt.systemPrompt?.length || 0);
      console.log('📍 User prompt length:', prompt.userPrompt?.length || 0);
    }
    // 旧版兼容
    else if (prompt.context !== undefined) {
      console.log('📍 Context:', this.truncate(prompt.context, LOG_CONFIG.MAX_CONTEXT_PREVIEW));
      console.log('📄 File content length:', prompt.fileContent?.length || 0);
    }
  }

  /**
   * 统一的 Token 计算
   * 子类可以重写此方法以实现动态 token 计算
   * @returns {number} 最优 token 数
   */
  calculateTokens() {
    // Chat 模式使用配置的 MAX_TOKENS
    if (this.modelType === 'chat') {
      return this.config.MAX_TOKENS || MODEL_COMMON_CONFIG.TOKEN_LIMITS.DEFAULT;
    }
    
    // FIM 模式使用默认值（可被子类重写）
    return MODEL_COMMON_CONFIG.TOKEN_LIMITS.DEFAULT;
  }

  /**
   * 统一的基础清理
   * @param {string} text - 原始文本
   * @returns {string} 清理后的文本
   */
  cleanCompletionBase(text) {
    if (!text) return text;
    
    const patterns = MODEL_COMMON_CONFIG.CLEANUP_PATTERNS;
    let cleaned = text;
    
    // 移除 markdown 代码块
    cleaned = cleaned.replace(patterns.MARKDOWN_CODE_BLOCK, '');
    
    // 移除前后空行
    cleaned = cleaned.replace(patterns.LEADING_EMPTY_LINES, '');
    cleaned = cleaned.replace(patterns.TRAILING_EMPTY_LINES, '');
    
    return cleaned;
  }

  /**
   * 从嵌套路径获取值
   * @param {Object} obj - 对象
   * @param {string} path - 路径（如 'choices.0.message.content'）
   * @returns {*} 值
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      if (current === null || current === undefined) return null;
      return current[key];
    }, obj);
  }

  /**
   * 截断文本
   * @param {string} text - 文本
   * @param {number} maxLength - 最大长度
   * @returns {string} 截断后的文本
   */
  truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
  }

  /**
   * 统一的错误处理
   * @param {Error} error - 错误对象
   * @param {string} modelName - 模型名称
   * @returns {{ text: null }} 错误响应
   */
  handleError(error, modelName) {
    // 根据错误类型提供更详细的信息
    if (error.status === 401 || error.status === 403) {
      console.error(`❌ ${modelName} 认证失败: API Key 无效或已过期`);
    } else if (error.status === 429) {
      console.error(`❌ ${modelName} 请求过于频繁: 已达到速率限制`);
    } else if (error.status >= 500) {
      console.error(`❌ ${modelName} 服务器错误: ${error.message}`);
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error(`❌ ${modelName} 网络错误: 无法连接到 API 服务器`);
    } else {
      console.error(`❌ ${modelName} 补全请求失败:`, error.message);
    }
    
    // 如果有响应体，也记录下来
    if (error.response) {
      console.error('📄 错误详情:', error.response.substring(0, 200));
    }
    
    return { text: null };
  }

  /**
   * 记录成功日志
   * @param {string} completionText - 补全文本
   * @param {Object} data - API 响应数据
   * @param {number} maxTokens - 配置的最大 tokens
   */
  logSuccess(completionText, data, maxTokens) {
    console.log('✅ 生成的补全:', this.truncate(completionText, LOG_CONFIG.MAX_PREVIEW_LENGTH) || 'null');
    
    // 详细的 token 统计
    const usage = data.usage;
    if (usage) {
      console.log('📊 Token 统计:');
      console.log('   - Input tokens:', usage.prompt_tokens || 'N/A');
      console.log('   - Output tokens:', usage.completion_tokens || 'N/A');
      console.log('   - Total tokens:', usage.total_tokens || 'N/A');
      console.log('🎯 Max tokens 配置:', maxTokens, '(仅限制 output)');
      
      // 检查是否超出限制
      if (usage.completion_tokens && usage.completion_tokens > maxTokens) {
        console.warn('⚠️  Output tokens 超出配置:', usage.completion_tokens, '>', maxTokens);
      }
    } else {
      console.log('📊 使用的 tokens:', this.getNestedValue(data, 'usage.total_tokens') || 'unknown');
      console.log('🎯 Max tokens 配置:', maxTokens);
    }
  }

  // ==================== 抽象方法 ====================
  // 子类必须实现以下方法

  /**
   * 构建请求体
   * @param {Object} _prompt - Prompt 对象
   * @param {number} _maxTokens - 最大 tokens
   * @param {string[]} _stopSequences - 停止符
   * @returns {Object} 请求体
   */
  buildRequestBody(_prompt, _maxTokens, _stopSequences) {
    throw new Error('buildRequestBody must be implemented by subclass');
  }

  /**
   * 解析 API 响应
   * @param {Object} _data - API 响应数据
   * @returns {string|null} 补全文本
   */
  parseResponse(_data) {
    throw new Error('parseResponse must be implemented by subclass');
  }

  /**
   * 清理补全文本
   * @param {string} _text - 原始补全文本
   * @returns {string} 清理后的文本
   */
  cleanCompletion(_text) {
    throw new Error('cleanCompletion must be implemented by subclass');
  }

  /**
   * 获取停止符
   * @returns {string[]} 停止符数组
   */
  getStopSequences() {
    throw new Error('getStopSequences must be implemented by subclass');
  }
}
