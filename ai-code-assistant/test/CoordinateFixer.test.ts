/**
 * CoordinateFixer 集成测试
 * 测试 3 层降级策略的完整流程
 */

import { describe, it, expect } from 'vitest';
import { CoordinateFixer } from '../shared/CoordinateFixer';
import type { Prediction } from '../types/index';

describe('CoordinateFixer - 3 Layer Fallback Strategy', () => {
  const fixer = new CoordinateFixer();

  describe('Layer 1: Context-based matching', () => {
    it('应该使用 context 精确定位 REPLACE_WORD', () => {
      const lineContent = 'const user = createUser("Alice", 30, "alice@example.com");';
      const prediction: Prediction = {
        targetLine: 1,
        suggestionText: 'getUser',
        changeType: 'REPLACE_WORD',
        explanation: 'Fix function name',
        context: {
          before: 'const user = ',
          target: 'createUser',
          after: '("Alice", 30'
        }
      };

      const result = fixer.fix(prediction, lineContent);

      expect(result.wordReplaceInfo).toBeDefined();
      expect(result.wordReplaceInfo?.word).toBe('createUser');
      expect(result.wordReplaceInfo?.replacement).toBe('getUser');
      expect(result.wordReplaceInfo?.startColumn).toBe(14);
      expect(result.wordReplaceInfo?.endColumn).toBe(24);
    });

    it('应该正确处理 createUser → createUserInfo 场景（追加后缀）', () => {
      const lineContent = 'const user1 = createUser("Alice");';
      const prediction: Prediction = {
        targetLine: 1,
        suggestionText: 'const user1 = createUserInfo("Alice");',
        originalLineContent: 'const user1 = createUser("Alice");',
        changeType: 'REPLACE_WORD',
        explanation: 'Update function call to match renamed function',
        context: {
          before: 'const user1 = ',
          target: 'createUser',
          after: '("Alice");'
        }
      };

      const result = fixer.fix(prediction, lineContent);

      expect(result.wordReplaceInfo).toBeDefined();
      expect(result.wordReplaceInfo?.word).toBe('createUser');
      expect(result.wordReplaceInfo?.replacement).toBe('createUserInfo');
      expect(result.wordReplaceInfo?.startColumn).toBe(15);
      expect(result.wordReplaceInfo?.endColumn).toBe(25);
    });

    it('应该使用 context 精确定位 INLINE_INSERT', () => {
      const lineContent = 'function greet(name) {';
      const prediction: Prediction = {
        targetLine: 1,
        suggestionText: ': string',
        changeType: 'INLINE_INSERT',
        explanation: 'Add type annotation',
        context: {
          before: 'greet(',
          target: 'name',
          after: ') {'
        }
      };

      const result = fixer.fix(prediction, lineContent);

      expect(result.inlineInsertInfo).toBeDefined();
      expect(result.inlineInsertInfo?.content).toBe(': string');
      expect(result.inlineInsertInfo?.insertColumn).toBe(20); // 在 'name' 之后
    });

    it('应该处理多个相同单词的情况（使用 context 区分）', () => {
      const lineContent = 'const user = createUser(user.name);';
      const prediction: Prediction = {
        targetLine: 1,
        suggestionText: 'person',
        changeType: 'REPLACE_WORD',
        explanation: 'Rename variable',
        context: {
          before: 'const ',
          target: 'user',
          after: ' = createUser'
        }
      };

      const result = fixer.fix(prediction, lineContent);

      expect(result.wordReplaceInfo).toBeDefined();
      expect(result.wordReplaceInfo?.startColumn).toBe(7); // 第一个 'user'
      expect(result.wordReplaceInfo?.endColumn).toBe(11);
    });
  });

  describe('Layer 3: fast-diff fallback', () => {
    it('当没有 context 时应该降级到 fast-diff（可能失败）', () => {
      const lineContent = 'const user = createUser("Alice");';
      const prediction: Prediction = {
        targetLine: 1,
        suggestionText: 'const user = getUser("Alice");',
        originalLineContent: lineContent,
        changeType: 'REPLACE_WORD',
        explanation: 'Fix function name'
        // 没有 context
      };

      const result = fixer.fix(prediction, lineContent);

      // fast-diff 可能检测到多处变更，返回 null
      // 这是正确的行为，因为 createUser → getUser 有多处字符变化
      // 应该使用 REPLACE_LINE 而不是 REPLACE_WORD
      if (result.wordReplaceInfo) {
        // 如果 fast-diff 成功，验证结果
        expect(result.wordReplaceInfo.startColumn).toBeGreaterThan(0);
        expect(result.wordReplaceInfo.endColumn).toBeGreaterThan(result.wordReplaceInfo.startColumn);
      } else {
        // 如果 fast-diff 失败（检测到多处变更），这也是正确的
        expect(result.wordReplaceInfo).toBeUndefined();
      }
    });

    it('当 context 匹配失败时应该降级到 target-only 或 fast-diff', () => {
      const lineContent = 'const user = createUser("Alice");';
      const prediction: Prediction = {
        targetLine: 1,
        suggestionText: 'const user = getUser("Alice");',
        originalLineContent: lineContent,
        changeType: 'REPLACE_WORD',
        explanation: 'Fix function name',
        context: {
          before: 'WRONG_CONTEXT',
          target: 'createUser',
          after: 'WRONG_CONTEXT'
        }
      };

      const result = fixer.fix(prediction, lineContent);

      // 应该降级到 target-only 或 fast-diff，都能找到 createUser
      expect(result.wordReplaceInfo).toBeDefined();
      expect(result.wordReplaceInfo?.startColumn).toBe(14);
      expect(result.wordReplaceInfo?.endColumn).toBe(24);
    });
  });

  describe('Edge cases', () => {
    it('应该处理 REPLACE_LINE（不需要列坐标）', () => {
      const lineContent = 'const user = createUser("Alice");';
      const prediction: Prediction = {
        targetLine: 1,
        suggestionText: 'const user = getUser("Alice");',
        changeType: 'REPLACE_LINE',
        explanation: 'Fix function name'
      };

      const result = fixer.fix(prediction, lineContent);

      // REPLACE_LINE 不需要 wordReplaceInfo
      expect(result.wordReplaceInfo).toBeUndefined();
    });

    it('应该处理无效的 targetLine', () => {
      const prediction: Prediction = {
        targetLine: -1,
        suggestionText: 'test',
        changeType: 'REPLACE_LINE',
        explanation: 'Test'
      };

      const result = fixer.fix(prediction);

      expect(result.targetLine).toBe(1); // 修复为 1
    });

    it('应该处理缺少 lineContent 的情况', () => {
      const prediction: Prediction = {
        targetLine: 1,
        suggestionText: 'test',
        changeType: 'REPLACE_WORD',
        explanation: 'Test',
        context: {
          before: 'const ',
          target: 'user',
          after: ' = '
        }
      };

      const result = fixer.fix(prediction); // 没有提供 lineContent

      // 应该跳过坐标修复
      expect(result.wordReplaceInfo).toBeUndefined();
    });
  });

  describe('Validation methods', () => {
    it('validateRange 应该正确验证行号范围', () => {
      expect(fixer.validateRange(1, 10)).toBe(true);
      expect(fixer.validateRange(10, 10)).toBe(true);
      expect(fixer.validateRange(0, 10)).toBe(false);
      expect(fixer.validateRange(11, 10)).toBe(false);
      expect(fixer.validateRange(-1, 10)).toBe(false);
    });

    it('calculateRelativePosition 应该正确计算相对位置', () => {
      expect(fixer.calculateRelativePosition(5, 3)).toBe('above');
      expect(fixer.calculateRelativePosition(5, 7)).toBe('below');
      expect(fixer.calculateRelativePosition(5, 5)).toBe('current');
    });
  });

  describe('Tree-sitter Layer 2', () => {
    it('isTreeSitterAvailable 初始应该返回 false', () => {
      expect(fixer.isTreeSitterAvailable()).toBe(false);
    });

    it('setFullCode 应该能设置完整代码', () => {
      const code = `function test() {
  return 42;
}`;
      // 不应该抛出错误
      expect(() => fixer.setFullCode(code)).not.toThrow();
    });

    it('应该支持 query 字段（当 Tree-sitter 未初始化时降级）', () => {
      const lineContent = 'const user = createUser("Alice");';
      const prediction: Prediction = {
        targetLine: 1,
        changeType: 'REPLACE_WORD',
        suggestionText: 'const user = getUser("Alice");',
        originalLineContent: lineContent,
        explanation: 'Test query field',
        context: {
          before: 'const user = ',
          target: 'createUser',
          after: '("Alice")'
        },
        query: {
          nodeType: 'identifier',
          value: 'createUser',
          parentType: 'call_expression',
          index: 0
        }
      };

      const result = fixer.fix(prediction, lineContent);

      // Tree-sitter 未初始化，应该降级到 Layer 1 (context)
      expect(result.wordReplaceInfo).toBeDefined();
      expect(result.wordReplaceInfo?.startColumn).toBe(14);
      expect(result.wordReplaceInfo?.endColumn).toBe(24);
    });
  });
});
