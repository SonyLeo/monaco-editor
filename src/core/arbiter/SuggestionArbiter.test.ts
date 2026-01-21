import { describe, it, expect, beforeEach } from 'vitest';
import { SuggestionArbiter } from './SuggestionArbiter';
import { createMockEditor } from '../../test/utils';

describe('SuggestionArbiter', () => {
  let arbiter: SuggestionArbiter;

  beforeEach(() => {
    arbiter = SuggestionArbiter.getInstance();
    arbiter.reset();
    arbiter.setEditor(createMockEditor() as any);
  });

  // T2.1: 单例模式
  it('should return same instance', () => {
    const instance1 = SuggestionArbiter.getInstance();
    const instance2 = SuggestionArbiter.getInstance();
    expect(instance1).toBe(instance2);
  });

  // T2.2: WordFix > FIM 优先级
  it('should prioritize WordFix over FIM', () => {
    arbiter.submitFimSuggestion({
      text: 'fim text',
      position: { lineNumber: 1, column: 1 }
    });

    const accepted = arbiter.submitWordFix({
      targetLine: 1,
      range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
      oldWord: 'old',
      newWord: 'new'
    });

    expect(accepted).toBe(true);
    expect(arbiter.getCurrentSuggestion()?.type).toBe('WORD_FIX');
  });

  // T2.3: FIM > NES 优先级（同级，先到先得）
  it('should keep FIM when NES arrives (same priority)', () => {
    arbiter.submitFimSuggestion({
      text: 'fim text',
      position: { lineNumber: 1, column: 1 }
    });

    const accepted = arbiter.submitNesSuggestion({
      targetLine: 2,
      suggestion: 'nes suggestion',
      changeType: 'FIX'
    });

    expect(accepted).toBe(false);
    expect(arbiter.getCurrentSuggestion()?.type).toBe('FIM');
  });

  // T2.4: 冷却锁锁定期间
  it('should reject FIM during cooldown', () => {
    arbiter.lockFim(100);
    
    const accepted = arbiter.submitFimSuggestion({
      text: 'fim text',
      position: { lineNumber: 1, column: 1 }
    });

    expect(accepted).toBe(false);
    expect(arbiter.isFimLocked()).toBe(true);
  });

  // T2.5: 冷却锁自动解锁
  it('should auto-unlock FIM after cooldown', async () => {
    arbiter.lockFim(50);
    expect(arbiter.isFimLocked()).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 60));
    
    expect(arbiter.isFimLocked()).toBe(false);
  });

  // T2.6: Tab 键无建议
  it('should return false when no suggestion on Tab', () => {
    const result = arbiter.handleTabKey();
    expect(result).toBe(false);
  });

  // T2.7: Tab 键有 FIM
  it('should accept FIM on Tab', () => {
    arbiter.submitFimSuggestion({
      text: 'fim text',
      position: { lineNumber: 1, column: 1 }
    });

    const result = arbiter.handleTabKey();
    expect(result).toBe(true);
    expect(arbiter.getCurrentSuggestion()).toBeNull();
  });
});
