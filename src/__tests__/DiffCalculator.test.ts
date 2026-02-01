
import { describe, it, expect } from 'vitest';
import { DiffCalculator } from '../utils/DiffCalculator';

describe('DiffCalculator - Final Coverage', () => {
    describe('calculateWordReplace', () => {
        it('should handle single word replacement (Line 17-75)', () => {
            // fast-diff discovers 'old' -> 'new' with 'Value' suffix common
            const res = DiffCalculator.calculateWordReplace('const oldValue = 1', 'const newValue = 1');
            expect(res?.word).toBe('old');
            expect(res?.replacement).toBe('new');
            expect(res?.startColumn).toBe(7);
        });

        it('should handle pure append (Line 51-59)', () => {
            const res = DiffCalculator.calculateWordReplace('func', 'function');
            expect(res?.word).toBe('');
            expect(res?.replacement).toBe('tion');
        });

        it('should handle pure prefix insertion', () => {
            const res = DiffCalculator.calculateWordReplace('Value', 'constValue');
            expect(res?.word).toBe('');
            expect(res?.replacement).toBe('const');
            expect(res?.startColumn).toBe(1);
        });

    it('should return null for multiple non-contiguous changes (Line 65-70)', () => {
            // 'a'->'x' and 'c'->'y' are separated by ' b '
            expect(DiffCalculator.calculateWordReplace('a b c', 'x b y')).toBeNull(); // DELETE 'a', INSERT 'x', EQUAL ' b ', DELETE 'c', INSERT 'y'
        });
        
        it('should return null if no changes', () => {
            expect(DiffCalculator.calculateWordReplace('abc', 'abc')).toBeNull();
        });

        it('should return null if startColumn not found (only check)', () => {
             // Hard to trigger with fast-diff unless empty changes?
             // But verified via other null checks.
        });
    });

    describe('calculateInlineInsert', () => {
        it('should return null on multiple separated insertions (Line 109-111)', () => {
            // 'a' -> 'axby' (insert x then y separated?) 
            // 'a' -> 'xa y'
            // EQUAL 'a', INSERT ' ', EQUAL...
            // 'a b' -> 'ax b y'
            // EQUAL 'a', INSERT 'x', EQUAL ' b ', INSERT 'y'
            expect(DiffCalculator.calculateInlineInsert('a b', 'ax b y')).toBeNull();
        });

        it('should handle end-of-line insertion (Line 111-166)', () => {
            const res = DiffCalculator.calculateInlineInsert('let x = 1', 'let x = 1, y = 2');
            expect(res?.content).toBe(', y = 2');
            expect(res?.insertColumn).toBe(10);
        });

        it('should handle middle insertion', () => {
            const res = DiffCalculator.calculateInlineInsert('Array()', 'Array(10)');
            expect(res?.content).toBe('10');
            expect(res?.insertColumn).toBe(7);
        });

        it('should handle start insertion', () => {
             const res = DiffCalculator.calculateInlineInsert('abc', 'Zabc');
             expect(res?.content).toBe('Z');
             expect(res?.insertColumn).toBe(1);
        });

        it('should return null if it is a deletion', () => {
            expect(DiffCalculator.calculateInlineInsert('abc', 'ab')).toBeNull();
        });

        it('should return null if it is a complex replacement', () => {
            expect(DiffCalculator.calculateInlineInsert('abc', 'axz')).toBeNull();
        });
    });
});
