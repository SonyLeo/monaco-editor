/**
 * Prediction Service - API 调用服务
 */

import type { NESPayload, Prediction } from '../types/index';

export class PredictionService {
  constructor(
    private fimEndpoint?: string,
    private nesEndpoint?: string
  ) {}

  async callFIM(prefix: string, suffix: string): Promise<string> {
    if (!this.fimEndpoint) {
      throw new Error('FIM endpoint not configured');
    }

    try {
      const response = await fetch(this.fimEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, suffix, max_tokens: 64 }),
      });

      if (!response.ok) {
        throw new Error(`FIM API error: ${response.status}`);
      }

      const data = await response.json();
      return data.completion || '';
    } catch (error) {
      console.error('[PredictionService] FIM error:', error);
      throw error;
    }
  }

  async predict(payload: NESPayload): Promise<Prediction[]> {
    if (!this.nesEndpoint) {
      throw new Error('NES endpoint not configured');
    }

    try {
      const response = await fetch(this.nesEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`NES API error: ${response.status}`);
      }

      const data = await response.json();
      return data.predictions || [];
    } catch (error) {
      console.error('[PredictionService] NES error:', error);
      throw error;
    }
  }
}
