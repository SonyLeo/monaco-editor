import { describe, it, expect, beforeEach } from 'vitest';
import { DiffEngine } from './DiffEngine';

describe('DiffEngine', () => {
  let engine: DiffEngine;

  beforeEach(() => {
    engine = new DiffEngine();
  });

  // T1.1: 空字符串情况
  it('should return null for empty strings', () => {
    const result = engine.calculateDiff('', '');
    expect(result).toBeNull();
  });

  // T1.2: 仅空白变更
  it('should return null for whitespace-only changes', () => {
    const oldCode = 'function test() {\n  return 1;\n}';
    const newCode = 'function test() {\n    return 1;\n}'; // 只改了缩进
    const result = engine.calculateDiff(oldCode, newCode);
    expect(result).toBeNull();
  });

  // T1.3: 函数重命名
  it('should detect function rename', () => {
    const oldCode = 'function oldName() { return 1; }';
    const newCode = 'function newName() { return 1; }';
    const result = engine.calculateDiff(oldCode, newCode);
    
    expect(result).not.toBeNull();
    expect(result?.type).toBe('REPLACE');
    expect(result?.lines).toContain(1);
  });

  // T1.4: 添加参数
  it('should detect parameter addition', () => {
    const oldCode = 'function test(a) { return a; }';
    const newCode = 'function test(a, b) { return a + b; }';
    const result = engine.calculateDiff(oldCode, newCode);
    
    expect(result).not.toBeNull();
    expect(result?.type).toBe('REPLACE');
  });

  // T1.5: 参数类型变更
  it('should detect parameter type change', () => {
    const oldCode = 'function test(a: string) { return a; }';
    const newCode = 'function test(a: number) { return a; }';
    const result = engine.calculateDiff(oldCode, newCode);
    
    expect(result).not.toBeNull();
    expect(result?.type).toBe('REPLACE');
  });
});
