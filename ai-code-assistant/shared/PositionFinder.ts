/**
 * Position Finder - 基于上下文的精确位置查找器
 * 
 * 核心策略：
 * 1. 使用 before + target + after 唯一标识位置
 * 2. 避免依赖 AI 计算列号
 * 3. 提供降级方案确保鲁棒性
 */

import { logger } from './logger';

export interface Context {
  before: string;  // 目标前面的文本（3-10 字符）
  target: string;  // 要修改的文本
  after: string;   // 目标后面的文本（3-10 字符）
}

export interface Position {
  startColumn: number;  // Monaco 列号（从 1 开始）
  endColumn: number;    // Monaco 列号（从 1 开始）
}

export class PositionFinder {
  /**
   * 基于上下文查找目标位置（方案 A）
   * 
   * @param line - 完整的行内容
   * @param context - 上下文信息
   * @returns 位置信息，如果找不到返回 null
   */
  static findByContext(line: string, context: Context): Position | null {
    // 1. 构造搜索模式
    const pattern = context.before + context.target + context.after;
    

    
    // ✅ 策略 1：精确匹配
    let index = line.indexOf(pattern);
    
    if (index !== -1) {
      const result = this.buildPosition(line, index, context);
      if (result) {
        return result;
      }
    }
    
    // ✅ 策略 2：忽略空格差异进行匹配
    const normalizedPattern = pattern.replace(/\s+/g, ' ');
    const normalizedLine = line.replace(/\s+/g, ' ');
    const normalizedIndex = normalizedLine.indexOf(normalizedPattern);
    
    if (normalizedIndex !== -1) {
      // 需要映射回原始字符串的位置
      const mappedPosition = this.mapNormalizedToOriginal(line, normalizedLine, normalizedIndex, context);
      if (mappedPosition) {
        return mappedPosition;
      }
    }
    
    // ✅ 策略 3：只用 before 定位（忽略 after）
    if (context.before && context.before.length >= 3) {
      const beforeIndex = line.indexOf(context.before);
      if (beforeIndex !== -1) {
        const targetStart = beforeIndex + context.before.length;
        const startColumn = targetStart + 1;
        const endColumn = startColumn + context.target.length;
        
        // 验证
        if (context.target === '' || line.substring(targetStart, targetStart + context.target.length) === context.target) {
          return { startColumn, endColumn };
        }
      }
    }
    
    // ✅ 策略 4：只用 target 查找（最后降级）
    logger.warn('[PositionFinder] All strategies failed, trying target only', {
      pattern: pattern.substring(0, 50),
      line: line.substring(0, 100) + (line.length > 100 ? '...' : ''),
    });
    
    return this.findByTargetOnly(line, context.target);
  }
  
  /**
   * 根据匹配索引构建位置信息
   */
  private static buildPosition(line: string, index: number, context: Context): Position | null {
    const startColumn = index + context.before.length + 1; // Monaco 列号从 1 开始
    const endColumn = startColumn + context.target.length;
    
    // 验证
    const extracted = line.substring(startColumn - 1, endColumn - 1);
    if (extracted !== context.target) {
      logger.error('[PositionFinder] Validation failed', {
        extracted,
        expected: context.target,
      });
      return null;
    }
    
    return { startColumn, endColumn };
  }
  
  /**
   * 将规范化字符串的位置映射回原始字符串
   */
  private static mapNormalizedToOriginal(
    original: string,
    _normalized: string,
    normalizedIndex: number,
    context: Context
  ): Position | null {
    // 计算规范化字符串到原始字符串的位置映射
    let originalIndex = 0;
    let normalizedPos = 0;
    
    while (normalizedPos < normalizedIndex && originalIndex < original.length) {
      if (/\s/.test(original[originalIndex]!)) {
        // 跳过连续空格（在规范化中只算一个）
        while (originalIndex < original.length - 1 && /\s/.test(original[originalIndex + 1]!)) {
          originalIndex++;
        }
      }
      originalIndex++;
      normalizedPos++;
    }
    
    // 尝试在原始位置构建 position
    const startColumn = originalIndex + context.before.length + 1;
    const endColumn = startColumn + context.target.length;
    
    // 验证（对于空 target 跳过验证）
    if (context.target === '') {
      return { startColumn, endColumn };
    }
    
    const extracted = original.substring(startColumn - 1, endColumn - 1);
    if (extracted === context.target) {
      return { startColumn, endColumn };
    }
    
    return null;
  }
  
  /**
   * 降级方案：只用 target 查找
   * 
   * @param line - 完整的行内容
   * @param target - 目标文本
   * @returns 位置信息，如果找不到返回 null
   */
  private static findByTargetOnly(line: string, target: string): Position | null {
    const index = line.indexOf(target);
    
    if (index === -1) {
      logger.error('[PositionFinder] ❌ Target not found in line', {
        target,
        line: line.substring(0, 100) + (line.length > 100 ? '...' : ''),
      });
      return null;
    }
    
    const startColumn = index + 1;
    const endColumn = startColumn + target.length;
    
    logger.warn('[PositionFinder] ⚠️ Found by target only (may be inaccurate)', {
      startColumn,
      endColumn,
      target,
    });
    
    return { startColumn, endColumn };
  }
  
  /**
   * 查找多个匹配（用于处理同一行有多处相同文本的情况）
   * 
   * @param line - 完整的行内容
   * @param context - 上下文信息
   * @returns 所有匹配的位置数组
   */
  static findAllByContext(line: string, context: Context): Position[] {
    const positions: Position[] = [];
    const pattern = context.before + context.target + context.after;
    
    let searchStart = 0;
    while (searchStart < line.length) {
      const index = line.indexOf(pattern, searchStart);
      
      if (index === -1) break;
      
      const startColumn = index + context.before.length + 1;
      const endColumn = startColumn + context.target.length;
      
      // 验证
      const extracted = line.substring(startColumn - 1, endColumn - 1);
      if (extracted === context.target) {
        positions.push({ startColumn, endColumn });
      }
      
      searchStart = index + 1;
    }
    

    
    return positions;
  }
  
  /**
   * 验证位置是否正确
   * 
   * @param line - 完整的行内容
   * @param position - 位置信息
   * @param expectedText - 期望的文本
   * @returns 是否匹配
   */
  static validate(line: string, position: Position, expectedText: string): boolean {
    const extracted = line.substring(position.startColumn - 1, position.endColumn - 1);
    const isValid = extracted === expectedText;
    
    if (!isValid) {
      logger.error('[PositionFinder] Validation failed', {
        extracted,
        expected: expectedText,
        position,
      });
    }
    
    return isValid;
  }
  
  /**
   * 从 suggestionText 和 originalLine 自动提取 context
   * （用于向后兼容，当 AI 没有返回 context 时）
   * 
   * @param originalLine - 原始行内容
   * @param suggestionText - 建议的新内容
   * @param target - 要修改的目标文本
   * @returns 提取的上下文，如果无法提取返回 null
   */
  static extractContext(
    originalLine: string,
    _suggestionText: string,
    target: string
  ): Context | null {
    const targetIndex = originalLine.indexOf(target);
    
    if (targetIndex === -1) {
      logger.warn('[PositionFinder] Cannot extract context: target not found');
      return null;
    }
    
    // 提取 before（前 3-10 个字符）
    const beforeStart = Math.max(0, targetIndex - 10);
    const before = originalLine.substring(beforeStart, targetIndex);
    
    // 提取 after（后 3-10 个字符）
    const afterEnd = Math.min(originalLine.length, targetIndex + target.length + 10);
    const after = originalLine.substring(targetIndex + target.length, afterEnd);
    
    const context: Context = {
      before: before.length > 3 ? before.substring(before.length - 10) : before,
      target,
      after: after.substring(0, 10),
    };
    
    
    return context;
  }
}
