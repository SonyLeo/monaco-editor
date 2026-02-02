/**
 * API 相关类型定义
 * 职责：NES API 的请求/响应接口
 */

import type { Prediction, EditRecord } from './index';
import type { Symptom } from './config';

/**
 * NES API 请求 Payload
 */
export interface NESPayload {
  codeWindow: string;
  windowInfo: {
    startLine: number;
    totalLines: number;
  };
  diffSummary: string;
  editHistory: EditRecord[];
  requestId: number;
}

/**
 * NES API 响应
 */
export interface NESResponse {
  symptom?: Symptom;
  predictions: Prediction[];
  totalCount: number;
  hasMore: boolean;
  requestId: number;
}
