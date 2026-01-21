import { describe, it, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { SuggestionArbiter } from './SuggestionArbiter';
import { createMockEditor } from '../../test/utils';

describe('SuggestionArbiter Property Tests', () => {
  let arbiter: SuggestionArbiter;

  beforeEach(() => {
    arbiter = SuggestionArbiter.getInstance();
    arbiter.reset();
    arbiter.setEditor(createMockEditor() as any);
  });

  // Property 8: 优先级一致性
  it('should maintain priority consistency', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('FIM', 'NES', 'WORD_FIX'),
        fc.constantFrom('FIM', 'NES', 'WORD_FIX'),
        (type1, type2) => {
          arbiter.reset();

          // 提交第一个建议
          if (type1 === 'FIM') {
            arbiter.submitFimSuggestion({ text: 'test', position: { lineNumber: 1, column: 1 } });
          } else if (type1 === 'NES') {
            arbiter.submitNesSuggestion({ targetLine: 1, suggestion: 'test', changeType: 'FIX' });
          } else {
            arbiter.submitWordFix({
              targetLine: 1,
              range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
              oldWord: 'old',
              newWord: 'new'
            });
          }

          const firstType = arbiter.getCurrentSuggestion()?.type;

          // 提交第二个建议
          if (type2 === 'FIM') {
            arbiter.submitFimSuggestion({ text: 'test2', position: { lineNumber: 2, column: 1 } });
          } else if (type2 === 'NES') {
            arbiter.submitNesSuggestion({ targetLine: 2, suggestion: 'test2', changeType: 'FIX' });
          } else {
            arbiter.submitWordFix({
              targetLine: 2,
              range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 5 },
              oldWord: 'old2',
              newWord: 'new2'
            });
          }

          const finalType = arbiter.getCurrentSuggestion()?.type;

          // WORD_FIX 总是最高优先级
          if (type2 === 'WORD_FIX') {
            return finalType === 'WORD_FIX';
          }

          // 如果第一个是 WORD_FIX，应该保持
          if (firstType === 'WORD_FIX') {
            return finalType === 'WORD_FIX';
          }

          // FIM 和 NES 同级，先到先得
          return finalType === firstType;
        }
      ),
      { numRuns: 50 }
    );
  });
});
