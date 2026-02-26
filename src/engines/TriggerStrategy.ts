/**
 * 智能触发策略
 * 用于判断何时应该触发 FIM 和 NES
 */

export interface TriggerContext {
  lineContent: string;
  lineLength: number;
  isAtLineEnd: boolean;
  isInComment: boolean;
  isInString: boolean;
  afterPunctuation: boolean;
  afterWhitespace: boolean;
  timeSinceLastEdit: number;
  timeSinceRejection: number;
}

export class SmartTriggerStrategy {
  /**
   * 判断是否应该触发 FIM
   */
  shouldTriggerFIM(context: TriggerContext): boolean {
    // 规则 1: 不在注释或字符串中
    if (context.isInComment || context.isInString) {
      return false;
    }

    // 规则 2: 行长度 > 5
    if (context.lineLength < 5) {
      return false;
    }

    // 规则 3: 在行尾或标点符号后
    if (!context.isAtLineEnd && !context.afterPunctuation) {
      return false;
    }

    // 规则 4: 距离上次拒绝 > 5 秒
    if (context.timeSinceRejection < 5000) {
      return false;
    }

    // 规则 5: 距离上次编辑 > 200ms（防抖）
    if (context.timeSinceLastEdit < 200) {
      return false;
    }

    return true;
  }

  /**
   * 判断是否应该触发 NES
   */
  shouldTriggerNES(context: TriggerContext): boolean {
    // 规则 1: 只在行尾
    if (!context.isAtLineEnd) {
      return false;
    }

    // 规则 2: 不在注释或字符串中
    if (context.isInComment || context.isInString) {
      return false;
    }

    // 规则 3: 在"有意义的时刻"
    const meaningfulPatterns = [
      /function\s+\w+\s*\([^)]*\)\s*\{?\s*$/,  // 函数声明
      /const\s+\w+\s*=\s*\{?\s*$/,             // 对象字面量
      /if\s*\([^)]+\)\s*\{?\s*$/,              // if 语句
      /for\s*\([^)]+\)\s*\{?\s*$/,             // for 循环
      /\{\s*$/,                                 // 块开始
      /=>\s*\{?\s*$/,                           // 箭头函数
    ];

    const matches = meaningfulPatterns.some((pattern) =>
      pattern.test(context.lineContent)
    );

    if (!matches) {
      return false;
    }

    // 规则 4: 距离上次编辑 > 1 秒（给用户思考时间）
    if (context.timeSinceLastEdit < 1000) {
      return false;
    }

    return true;
  }

  /**
   * 计算动态防抖时间
   */
  calculateDebounce(context: TriggerContext, engine: 'fim' | 'nes'): number {
    if (engine === 'fim') {
      // FIM: 200-500ms
      if (context.afterPunctuation) return 200;
      if (context.isAtLineEnd) return 300;
      return 500;
    } else {
      // NES: 1000-2000ms
      if (context.lineLength > 30) return 1000;
      return 1500;
    }
  }
}
