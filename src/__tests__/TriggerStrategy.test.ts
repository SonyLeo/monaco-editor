import { describe, it, expect } from 'vitest';
import { SmartTriggerStrategy } from '@/engines/TriggerStrategy';
import { createTriggerContext } from './helpers/testUtils';

describe('SmartTriggerStrategy', () => {
  const strategy = new SmartTriggerStrategy();

  describe('shouldTriggerFIM', () => {
    it('应该在有效场景触发', () => {
      const context = createTriggerContext({
        lineContent: 'const user = ',
        lineLength: 13,
        isAtLineEnd: true,
        isInComment: false,
        isInString: false,
        timeSinceLastEdit: 300,
        timeSinceRejection: 10000,
      });

      expect(strategy.shouldTriggerFIM(context)).toBe(true);
    });

    it('不应该在注释中触发', () => {
      const context = createTriggerContext({
        lineContent: '// This is a ',
        isInComment: true,
      });

      expect(strategy.shouldTriggerFIM(context)).toBe(false);
    });

    it('不应该在字符串中触发', () => {
      const context = createTriggerContext({
        lineContent: 'const msg = "Hello ',
        isInString: true,
      });

      expect(strategy.shouldTriggerFIM(context)).toBe(false);
    });

    it('不应该在短行触发', () => {
      const context = createTriggerContext({
        lineContent: 'x = ',
        lineLength: 4,
      });

      expect(strategy.shouldTriggerFIM(context)).toBe(false);
    });

    it('不应该在刚拒绝后触发', () => {
      const context = createTriggerContext({
        timeSinceRejection: 2000, // 2 秒前刚拒绝
      });

      expect(strategy.shouldTriggerFIM(context)).toBe(false);
    });

    it('不应该在编辑太快时触发', () => {
      const context = createTriggerContext({
        timeSinceLastEdit: 100, // 100ms 前编辑
      });

      expect(strategy.shouldTriggerFIM(context)).toBe(false);
    });

    it('应该在标点符号后触发', () => {
      const context = createTriggerContext({
        lineContent: 'const user = { name: "Alice", ',
        afterPunctuation: true,
        isAtLineEnd: false,
        timeSinceLastEdit: 300,
        timeSinceRejection: 10000,
      });

      expect(strategy.shouldTriggerFIM(context)).toBe(true);
    });
  });

  describe('shouldTriggerNES', () => {
    it('应该在函数声明后触发', () => {
      const context = createTriggerContext({
        lineContent: 'function hello() {',
        isAtLineEnd: true,
        timeSinceLastEdit: 1500,
      });

      expect(strategy.shouldTriggerNES(context)).toBe(true);
    });

    it('应该在对象字面量后触发', () => {
      const context = createTriggerContext({
        lineContent: 'const user = {',
        isAtLineEnd: true,
        timeSinceLastEdit: 1500,
      });

      expect(strategy.shouldTriggerNES(context)).toBe(true);
    });

    it('应该在 if 语句后触发', () => {
      const context = createTriggerContext({
        lineContent: 'if (x > 0) {',
        isAtLineEnd: true,
        timeSinceLastEdit: 1500,
      });

      expect(strategy.shouldTriggerNES(context)).toBe(true);
    });

    it('应该在箭头函数后触发', () => {
      const context = createTriggerContext({
        lineContent: 'const fn = () => {',
        isAtLineEnd: true,
        timeSinceLastEdit: 1500,
      });

      expect(strategy.shouldTriggerNES(context)).toBe(true);
    });

    it('不应该在普通行触发', () => {
      const context = createTriggerContext({
        lineContent: 'const x = 1;',
        isAtLineEnd: true,
        timeSinceLastEdit: 1500,
      });

      expect(strategy.shouldTriggerNES(context)).toBe(false);
    });

    it('不应该在行中触发', () => {
      const context = createTriggerContext({
        lineContent: 'function hello() {',
        isAtLineEnd: false,
        timeSinceLastEdit: 1500,
      });

      expect(strategy.shouldTriggerNES(context)).toBe(false);
    });

    it('不应该在注释中触发', () => {
      const context = createTriggerContext({
        lineContent: '// function hello() {',
        isInComment: true,
        isAtLineEnd: true,
        timeSinceLastEdit: 1500,
      });

      expect(strategy.shouldTriggerNES(context)).toBe(false);
    });

    it('不应该在编辑太快时触发', () => {
      const context = createTriggerContext({
        lineContent: 'function hello() {',
        isAtLineEnd: true,
        timeSinceLastEdit: 500, // 500ms 前编辑
      });

      expect(strategy.shouldTriggerNES(context)).toBe(false);
    });
  });

  describe('calculateDebounce', () => {
    it('FIM 应该在标点符号后返回 200ms', () => {
      const context = createTriggerContext({ afterPunctuation: true });
      expect(strategy.calculateDebounce(context, 'fim')).toBe(200);
    });

    it('FIM 应该在行尾返回 300ms', () => {
      const context = createTriggerContext({ 
        isAtLineEnd: true,
        afterPunctuation: false,
      });
      expect(strategy.calculateDebounce(context, 'fim')).toBe(300);
    });

    it('FIM 应该在其他情况返回 500ms', () => {
      const context = createTriggerContext({ 
        isAtLineEnd: false,
        afterPunctuation: false,
      });
      expect(strategy.calculateDebounce(context, 'fim')).toBe(500);
    });

    it('NES 应该在长行返回 1000ms', () => {
      const context = createTriggerContext({ lineLength: 50 });
      expect(strategy.calculateDebounce(context, 'nes')).toBe(1000);
    });

    it('NES 应该在短行返回 1500ms', () => {
      const context = createTriggerContext({ lineLength: 10 });
      expect(strategy.calculateDebounce(context, 'nes')).toBe(1500);
    });
  });
});
