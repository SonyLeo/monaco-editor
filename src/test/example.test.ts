import { describe, it, expect } from 'vitest';
import { delay } from './utils';

describe('Test Framework Verification', () => {
  it('should run basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should support async tests', async () => {
    await delay(10);
    expect(true).toBe(true);
  });

  it('should support test utilities', () => {
    const result = delay(10);
    expect(result).toBeInstanceOf(Promise);
  });
});
