/**
 * PositionFinder 测试
 * 验证上下文匹配的准确率
 */

import { describe, it, expect } from 'vitest';
import { PositionFinder } from '../shared/PositionFinder';

describe('PositionFinder', () => {
  describe('findByContext', () => {
    it('场景 1: 简单替换', () => {
      const line = 'const name = "john";';
      const context = {
        before: 'const ',
        target: 'name',
        after: ' = ',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(7);
      expect(result?.endColumn).toBe(11);
      expect(line.substring(result!.startColumn - 1, result!.endColumn - 1)).toBe('name');
    });

    it('场景 2: 多处相同文本（核心场景）', () => {
      const line = 'const name = "name";';
      const context = {
        before: 'const ',
        target: 'name',
        after: ' = "',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(7);
      expect(result?.endColumn).toBe(11);
      // 验证找到的是第一个 name（变量名），不是第二个（字符串）
      expect(line.substring(result!.startColumn - 1, result!.endColumn - 1)).toBe('name');
    });

    it('场景 3: 嵌套相同文本 - 替换第二个', () => {
      const line = 'function test(name, age) { return name; }';
      const context = {
        before: 'return ',
        target: 'name',
        after: '; }',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(35);
      expect(result?.endColumn).toBe(39);
      expect(line.substring(result!.startColumn - 1, result!.endColumn - 1)).toBe('name');
    });

    it('场景 4: 行首（before 为空）', () => {
      const line = '  const x = 1;';
      const context = {
        before: '',
        target: '  const',
        after: ' x = ',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(1);
      expect(result?.endColumn).toBe(8);
      expect(line.substring(result!.startColumn - 1, result!.endColumn - 1)).toBe('  const');
    });

    it('场景 5: 行尾（after 为空）', () => {
      const line = 'const x = 1';
      const context = {
        before: 'x = ',
        target: '1',
        after: '',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(11);
      expect(result?.endColumn).toBe(12);
      expect(line.substring(result!.startColumn - 1, result!.endColumn - 1)).toBe('1');
    });

    it('场景 6: 多字节字符（中文）', () => {
      const line = 'const 名字 = "张三";';
      const context = {
        before: 'const ',
        target: '名字',
        after: ' = ',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(line.substring(result!.startColumn - 1, result!.endColumn - 1)).toBe('名字');
    });

    it('场景 7: 操作符替换', () => {
      const line = 'if (value || check) {';
      const context = {
        before: 'value ',
        target: '||',
        after: ' check',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(line.substring(result!.startColumn - 1, result!.endColumn - 1)).toBe('||');
    });

    it('降级场景: 上下文不匹配时使用 target-only', () => {
      const line = 'const name = "john";';
      const context = {
        before: 'WRONG ',
        target: 'name',
        after: ' WRONG',
      };

      const result = PositionFinder.findByContext(line, context);

      // 应该降级到 target-only，找到第一个 name
      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(7);
      expect(result?.endColumn).toBe(11);
    });

    it('失败场景: target 不存在', () => {
      const line = 'const name = "john";';
      const context = {
        before: 'const ',
        target: 'NOT_EXIST',
        after: ' = ',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).toBeNull();
    });
  });

  describe('findAllByContext', () => {
    it('查找所有匹配', () => {
      const line = 'const x = x + x * x;';
      const context = {
        before: ' = ',
        target: 'x',
        after: ' +',
      };

      const results = PositionFinder.findAllByContext(line, context);

      expect(results).toHaveLength(1);
      expect(results[0].startColumn).toBe(11);
      expect(results[0].endColumn).toBe(12);
    });
  });
});
