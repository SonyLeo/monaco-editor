/**
 * Coordinate Fixer - 坐标修复工具
 */

import type { Prediction } from '../types/index';

export class CoordinateFixer {
  /**
   * 修复预测结果的坐标
   */
  fix(prediction: Prediction): Prediction {
    // 确保 targetLine 是有效的正整数
    if (!prediction.targetLine || prediction.targetLine < 1) {
      console.warn('[CoordinateFixer] Invalid targetLine:', prediction.targetLine);
      prediction.targetLine = 1;
    }

    return prediction;
  }

  /**
   * 验证坐标范围
   */
  validateRange(line: number, totalLines: number): boolean {
    return line >= 1 && line <= totalLines;
  }

  /**
   * 计算相对位置
   */
  calculateRelativePosition(
    currentLine: number,
    targetLine: number
  ): 'above' | 'below' | 'current' {
    if (targetLine < currentLine) return 'above';
    if (targetLine > currentLine) return 'below';
    return 'current';
  }
}
