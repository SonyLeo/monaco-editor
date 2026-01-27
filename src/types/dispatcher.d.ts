/**
 * EditDispatcher 类型定义
 */

import type { EditRecord } from './nes';

/**
 * 症状类型
 */
export type SymptomType =
  | 'ADD_PARAMETER'      // 函数签名增加参数
  | 'REMOVE_PARAMETER'   // 函数签名删除参数
  | 'RENAME_FUNCTION'    // 函数重命名
  | 'RENAME_VARIABLE'    // 变量重命名
  | 'CHANGE_TYPE'        // 类型改变
  | 'LOGIC_ERROR'        // 逻辑错误（三元运算符等）
  | 'WORD_FIX';          // 单词拼写错误

/**
 * 症状信息
 */
export interface Symptom {
  type: SymptomType;
  confidence: number;      // 0.0 - 1.0
  description: string;     // 症状描述
  affectedLine?: number;   // 受影响的行号
  context?: {
    oldValue?: string;     // 旧值
    newValue?: string;     // 新值
    functionName?: string; // 函数名
    variableName?: string; // 变量名
  };
}

/**
 * 分发目标
 */
export type DispatchTarget = 'FIM' | 'NES';

/**
 * 分发结果
 */
export interface DispatchResult {
  target: DispatchTarget;
  reason: string;
  symptom?: Symptom;
}

/**
 * NES 状态
 */
export type NESState = 'SLEEPING' | 'DIAGNOSING' | 'SUGGESTING' | 'TREATING';

/**
 * Dispatcher 状态
 */
export interface DispatcherState {
  nesState: NESState;
  fimLocked: boolean;
  lockUntil: number;
  lastSymptom: Symptom | null;
}
