/**
 * 预测服务
 * 负责与后端 API 通信，执行预测请求
 */

import type { NESPayload, Prediction } from '../../types/nes';

export interface PredictionResponse {
  predictions: Prediction[];
  totalCount: number;
  hasMore: boolean;
  requestId: number;
}

export class PredictionService {
  private abortController: AbortController | null = null;
  private lastRequestId = 0;
  private readonly apiUrl: string;

  constructor(apiUrl: string = 'http://localhost:3000/api/next-edit-prediction') {
    this.apiUrl = apiUrl;
  }

  /**
   * 执行预测请求
   */
  async predict(payload: NESPayload): Promise<PredictionResponse> {
    // Abort 旧请求
    this.abort();
    this.abortController = new AbortController();

    // 生成新的 Request ID
    const requestId = ++this.lastRequestId;
    payload.requestId = requestId;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: this.abortController.signal,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const apiResponse: PredictionResponse = await response.json();

      // Request ID 校验
      if (requestId !== this.lastRequestId) {
        throw new Error('Stale response');
      }

      return apiResponse;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Request aborted');
      }
      throw error;
    }
  }

  /**
   * 中止当前请求
   */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * 获取当前 Request ID
   */
  get currentRequestId(): number {
    return this.lastRequestId;
  }

  /**
   * 销毁资源
   */
  dispose(): void {
    this.abort();
  }
}
