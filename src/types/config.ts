/**
 * 配置类型定义
 * 职责：FIM、NES 等功能的配置接口
 */

import type { Prediction } from './prediction';

/**
 * FIM（Fill-In-Middle）配置
 */
export interface FIMConfig {
  enabled?: boolean;
  endpoint: string;
  debounceMs?: number;
  maxTokens?: number;
  temperature?: number;
}

/**
 * NES（Next Edit Suggestion）配置
 */
export interface NESConfig {
  enabled?: boolean;
  endpoint: string;
  debounceMs?: number;
  symptoms?: SymptomType[];
  windowSize?: number;
}

/**
 * AI Code Assistant 总体配置
 */
export interface AICodeAssistantConfig {
  fim?: FIMConfig;
  nes?: NESConfig;
  language?: string;
  enableSemanticAnalysis?: boolean;
}

/**
 * AI Code Assistant 接口
 */
export interface AICodeAssistant {
  dispose: () => void;
  onSymptomDetected?: (callback: (symptom: Symptom) => void) => void;
  onPrediction?: (callback: (predictions: Prediction[]) => void) => void;
}

/**
 * 症状类型
 */
export type SymptomType =
  | 'RENAME_FUNCTION'
  | 'RENAME_VARIABLE'
  | 'ADD_PARAMETER'
  | 'REMOVE_PARAMETER'
  | 'CHANGE_TYPE'
  | 'LOGIC_ERROR'
  | 'WORD_FIX';

/**
 * 症状信息
 */
export interface Symptom {
  type: SymptomType;
  confidence: number;
  description: string;
  affectedLine?: number;
  context?: Record<string, any>;
}
