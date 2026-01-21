import { describe, it } from 'vitest';
import * as fc from 'fast-check';

describe('Property-Based Testing Example', () => {
  it('should verify string concatenation is associative', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        (a, b, c) => {
          return (a + b) + c === a + (b + c);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should verify array length after push', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer()),
        fc.integer(),
        (arr, item) => {
          const originalLength = arr.length;
          arr.push(item);
          return arr.length === originalLength + 1;
        }
      ),
      { numRuns: 100 }
    );
  });
});
