/**
 * Prompt Engineer Logger
 * 用于记录每次 LLM 交互的完整上下文，帮助优化提示词和分析质量。
 * 
 * 日志结构：
 * - logs/prompts/{YYYY-MM-DD}/{type}_{timestamp}_{id}.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_ROOT = path.join(__dirname, '../../logs/prompts');

// 确保日志目录存在
function ensureLogDir() {
  const today = new Date().toISOString().split('T')[0];
  const dayDir = path.join(LOG_ROOT, today);
  
  if (!fs.existsSync(dayDir)) {
    fs.mkdirSync(dayDir, { recursive: true });
  }
  
  return dayDir;
}

/**
 * 记录 Prompt 和 Response 详情
 * @param {string} type - 请求类型 ('fim' | 'nes')
 * @param {string} requestId - 请求 ID
 * @param {Object} data - 日志数据对象
 */
export async function logPromptInteraction(type, requestId, data) {
  try {
    const dir = ensureLogDir();
    const timestamp = new Date().getTime();
    const filename = `${type}_${timestamp}_${requestId}.json`;
    const filePath = path.join(dir, filename);
    
    // 构造标准日志格式
    const logEntry = {
      meta: {
        id: requestId,
        timestamp: new Date().toISOString(),
        type: type,
        model: data.model || 'unknown'
      },
      request: {
        // 原始输入参数
        input: data.input,
        // 实际发送给模型的 Prompts
        prompts: {
          system: data.systemPrompt,
          user: data.userPrompt,
          // FIM 特有
          prefix: data.prefix,
          suffix: data.suffix
        }
      },
      response: {
        // 原始模型返回
        raw: data.rawResponse,
        // 解析后的结构化数据
        parsed: data.parsedResponse,
        // 是否发生错误
        error: data.error
      },
      metrics: {
        // 可以扩展 token 统计、耗时等
        durationMs: data.durationMs
      }
    };

    await fs.promises.writeFile(filePath, JSON.stringify(logEntry, null, 2), 'utf8');
    
    return filePath;
  } catch (err) {
    console.error('❌ Failed to log prompt interaction:', err);
    return null;
  }
}

/**
 * 清理之前的日志文件
 */
export async function clearLogs() {
  try {
    if (fs.existsSync(LOG_ROOT)) {
      await fs.promises.rm(LOG_ROOT, { recursive: true, force: true });
      ensureLogDir();
      console.log('🧹 Logs cleared');
    }
  } catch (err) {
    console.error('❌ Failed to clear logs:', err);
  }
}
