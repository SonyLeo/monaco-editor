/**
 * PositionFinder 测试
 */

import { describe, it, expect } from 'vitest';
import { PositionFinder, type Context } from '../utils/PositionFinder';

describe('PositionFinder', () => {
  describe('findByContext', () => {
    it('should find simple replacement', () => {
      const line = 'const name = "john";';
      const context: Context = {
        before: 'const ',
        target: 'name',
        after: ' = "john"',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(7);  // 'name' starts at column 7
      expect(result?.endColumn).toBe(11);   // 'name' ends at column 11
    });

    it('should handle multiple occurrences with unique context', () => {
      const line = 'const name = "name";';
      const context: Context = {
        before: 'const ',
        target: 'name',
        after: ' = "',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(7);  // First 'name' (variable)
      expect(result?.endColumn).toBe(11);
    });

    it('should handle nested same text', () => {
      const line = 'function test(name, age) { return name; }';
      const context: Context = {
        before: 'return ',
        target: 'name',
        after: '; }',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(35);  // Second 'name' in return statement
      expect(result?.endColumn).toBe(39);
    });

    it('should handle leading spaces', () => {
      const line = '  const x = 1;';
      const context: Context = {
        before: '  ',
        target: 'const',
        after: ' x = 1',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(3);
      expect(result?.endColumn).toBe(8);
    });

    it('should handle line start', () => {
      const line = 'const x = 1;';
      const context: Context = {
        before: '',
        target: 'const',
        after: ' x = 1',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(1);
      expect(result?.endColumn).toBe(6);
    });

    it('should handle line end', () => {
      const line = 'const x = 1';
      const context: Context = {
        before: 'x = ',
        target: '1',
        after: '',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(11);
      expect(result?.endColumn).toBe(12);
    });

    it('should fallback to target-only search when pattern not found', () => {
      const line = 'const name = "john";';
      const context: Context = {
        before: 'wrong ',
        target: 'name',
        after: ' wrong',
      };

      const result = PositionFinder.findByContext(line, context);

      // Should still find 'name' using fallback
      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(7);
      expect(result?.endColumn).toBe(11);
    });

    it('should return null when target not found', () => {
      const line = 'const name = "john";';
      const context: Context = {
        before: '',
        target: 'notfound',
        after: '',
      };

      const result = PositionFinder.findByContext(line, context);

      expect(result).toBeNull();
    });
  });

  describe('findAllByContext', () => {
    it('should find all occurrences', () => {
      const line = 'const name = "name" + name;';
      const context: Context = {
        before: '',
        target: 'name',
        after: '',
      };

      const results = PositionFinder.findAllByContext(line, context);

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('validate', () => {
    it('should validate correct position', () => {
      const line = 'const name = "john";';
      const position = { startColumn: 7, endColumn: 11 };

      const isValid = PositionFinder.validate(line, position, 'name');

      expect(isValid).toBe(true);
    });

    it('should reject incorrect position', () => {
      const line = 'const name = "john";';
      const position = { startColumn: 7, endColumn: 11 };

      const isValid = PositionFinder.validate(line, position, 'wrong');

      expect(isValid).toBe(false);
    });
  });

  describe('extractContext', () => {
    it('should extract context from line', () => {
      const originalLine = 'const name = "john";';
      const suggestionText = 'const username = "john";';
      const target = 'name';

      const context = PositionFinder.extractContext(originalLine, suggestionText, target);

      expect(context).not.toBeNull();
      expect(context?.target).toBe('name');
      expect(context?.before).toContain('const');
      expect(context?.after).toContain('=');
    });

    it('should return null when target not found', () => {
      const originalLine = 'const name = "john";';
      const suggestionText = 'const username = "john";';
      const target = 'notfound';

      const context = PositionFinder.extractContext(originalLine, suggestionText, target);

      expect(context).toBeNull();
    });
  });
});
