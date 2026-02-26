/**
 * 测试工具函数
 */

import type { TriggerContext, EditRecord } from '@/types';

/**
 * 创建测试用的触发上下文
 */
export function createTriggerContext(
  overrides?: Partial<TriggerContext>
): TriggerContext {
  return {
    lineContent: 'const user = ',
    lineLength: 13,
    isAtLineEnd: true,
    isInComment: false,
    isInString: false,
    afterPunctuation: false,
    afterWhitespace: true,
    timeSinceLastEdit: 300,
    timeSinceRejection: 10000,
    ...overrides,
  };
}

/**
 * 模拟编辑序列
 */
export function simulateEditSequence(
  edits: Array<{
    text: string;
    delay: number;
  }>
): EditRecord[] {
  let timestamp = Date.now();
  const records: EditRecord[] = [];

  edits.forEach((edit, index) => {
    timestamp += edit.delay;
    records.push({
      timestamp,
      lineNumber: 1,
      column: index + 1,
      type: 'insert',
      oldText: '',
      newText: edit.text,
      rangeLength: 0,
      source: 'user',
      context: {
        lineContent: edits
          .slice(0, index + 1)
          .map((e) => e.text)
          .join(''),
      },
    });
  });

  return records;
}

/**
 * 创建测试用的代码片段
 */
export function createCodeSnippet(lines: string[]): string {
  return lines.join('\n');
}

/**
 * 等待指定时间
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
