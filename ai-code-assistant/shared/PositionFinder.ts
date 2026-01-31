/**
 * Position Finder - 基于上下文的精确位置查找
 * 用于解决 fast-diff 的二义性问题
 */

export interface Context {
  before: string;  // 目标前面的文本（3-10 字符）
  target: string;  // 要修改的文本
  after: string;   // 目标后面的文本（3-10 字符）
}

export interface Position {
  startColumn: number;  // 1-based
  endColumn: number;    // 1-based
}

export class PositionFinder {
  /**
   * 基于上下文查找目标位置
   * @param line 要搜索的行
   * @param context 上下文信息（before + target + after）
   * @returns 位置信息，如果找不到返回 null
   */
  static findByContext(line: string, context: Context): Position | null {
    // 1. 构造搜索模式
    const pattern = context.before + context.target + context.after;
    
    // 2. 在行中查找
    const index = line.indexOf(pattern);
    
    if (index === -1) {
      console.warn('[PositionFinder] Pattern not found, trying target only', {
        pattern,
        line,
        context,
      });
      
      // 降级：只用 target 查找
      return this.findByTargetOnly(line, context.target);
    }
    
    // 3. 计算精确位置
    const startColumn = index + context.before.length + 1; // Monaco 列号从 1 开始
    const endColumn = startColumn + context.target.length;
    
    // 4. 验证
    const extracted = line.substring(startColumn - 1, endColumn - 1);
    if (extracted !== context.target) {
      console.error('[PositionFinder] Validation failed', {
        extracted,
        expected: context.target,
        line,
        context,
        startColumn,
        endColumn,
      });
      return null;
    }
    
    console.log('[PositionFinder] Found by context', {
      startColumn,
      endColumn,
      target: context.target,
      extracted,
    });
    
    return { startColumn, endColumn };
  }
  
  /**
   * 降级方案：只用 target 查找
   * 注意：当有多个相同 target 时，总是返回第一个
   */
  private static findByTargetOnly(line: string, target: string): Position | null {
    const index = line.indexOf(target);
    
    if (index === -1) {
      console.error('[PositionFinder] Target not found in line', {
        target,
        line,
      });
      return null;
    }
    
    const startColumn = index + 1;
    const endColumn = startColumn + target.length;
    
    console.warn('[PositionFinder] Found by target only (may be inaccurate)', {
      startColumn,
      endColumn,
      target,
    });
    
    return { startColumn, endColumn };
  }
  
  /**
   * 查找所有匹配位置（用于多处修改）
   */
  static findAllByContext(line: string, context: Context): Position[] {
    const positions: Position[] = [];
    const pattern = context.before + context.target + context.after;
    
    let searchStart = 0;
    
    while (true) {
      const index = line.indexOf(pattern, searchStart);
      
      if (index === -1) break;
      
      const startColumn = index + context.before.length + 1;
      const endColumn = startColumn + context.target.length;
      
      positions.push({ startColumn, endColumn });
      
      // 移动搜索起点
      searchStart = index + 1;
    }
    
    return positions;
  }
}
