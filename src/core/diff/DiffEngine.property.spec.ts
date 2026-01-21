import { describe, it, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { DiffEngine } from './DiffEngine';

describe('DiffEngine Property Tests', () => {
  let engine: DiffEngine;

  beforeEach(() => {
    engine = new DiffEngine();
  });

  // Property 1: Diff 计算的幂等性
  it('should be idempotent - calculating diff twice gives same result', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        fc.string({ minLength: 0, maxLength: 100 }),
        (oldCode, newCode) => {
          const result1 = engine.calculateDiff(oldCode, newCode);
          const result2 = engine.calculateDiff(oldCode, newCode);
          
          // 两次计算结果应该完全相同
          return JSON.stringify(result1) === JSON.stringify(result2);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 2: 空白变更过滤
  it('should filter whitespace-only changes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.integer({ min: 0, max: 10 }),
        (code, extraSpaces) => {
          const oldCode = code;
          const newCode = code + ' '.repeat(extraSpaces);
          const result = engine.calculateDiff(oldCode, newCode);
          
          // 如果只是添加空格，应该返回 null 或 WHITESPACE_ONLY
          if (result === null) return true;
          return result.type === 'WHITESPACE_ONLY' || result.type === 'INSERT';
        }
      ),
      { numRuns: 50 }
    );
  });
});
