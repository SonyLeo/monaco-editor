
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoordinateFixer } from '../utils/CoordinateFixer';
import { TreeSitterAnalyzer } from '../analysis/TreeSitterAnalyzer';
import { PositionFinder } from '../utils/PositionFinder';
import { DiffCalculator } from '../utils/DiffCalculator';
import { logger } from '../utils/logger';
import type { Prediction } from '../types/index';

describe('CoordinateFixer - Layer Mastery', () => {
    let fixer: CoordinateFixer;

    const createPred = (overrides: Partial<Prediction>): Prediction => ({
        targetLine: 1,
        suggestionText: '',
        explanation: 'test',
        ...overrides
    });

    const setupTS = async (f: CoordinateFixer) => {
        vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockResolvedValue(undefined);
        vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized').mockReturnValue(true);
        await f.initTreeSitter();
        f.setFullCode('const x = 1;');
    };

    beforeEach(() => {
        fixer = new CoordinateFixer();
        vi.restoreAllMocks();
        vi.spyOn(logger, 'warn').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});
    });

    it('Initialization', async () => {
        const spy = vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockResolvedValue(undefined);
        const p1 = fixer.initTreeSitter();
        const p2 = fixer.initTreeSitter();
        await Promise.all([p1, p2]);
        expect(spy).toHaveBeenCalledTimes(1);
        
        vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockRejectedValue(new Error('fail'));
        const f2 = new CoordinateFixer();
        await f2.initTreeSitter();
        expect(f2.isTreeSitterAvailable()).toBe(false);
    });

    it('Basic Validation', () => {
        const pred = createPred({ targetLine: -1 });
        fixer.fix(pred, ''); // Missing content
        expect(pred.targetLine).toBe(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No lineContent'));
    });

    it('Early return if coordinates already exist', () => {
         const pred1 = createPred({ changeType: 'REPLACE_WORD', wordReplaceInfo: { word: 'w', replacement: 'r', startColumn: 1, endColumn: 2 } });
         fixer.fix(pred1, 'content');
         // Should NOT call fixReplaceWordCoordinates (internal log check or spy would verify, but coverage will show it hit return)
         expect(pred1.wordReplaceInfo?.startColumn).toBe(1);

         const pred2 = createPred({ changeType: 'INLINE_INSERT', inlineInsertInfo: { content: 'c', insertColumn: 1 } });
         fixer.fix(pred2, 'content');
         expect(pred2.inlineInsertInfo?.insertColumn).toBe(1);
    });

    describe('REPLACE_WORD Layers', () => {
        it('Layer 1 Success', () => {
             const pred = createPred({ changeType: 'REPLACE_WORD', context: { before: '', target: 'old', after: '' }, suggestionText: 'new' });
             vi.spyOn(PositionFinder, 'findByContext').mockReturnValue({ startColumn: 1, endColumn: 4 });
             fixer.fix(pred, 'old');
             expect(pred.wordReplaceInfo?.startColumn).toBe(1);
        });

        it('Layer 2 Success (Query)', async () => {
            await setupTS(fixer);
            const pred = createPred({ changeType: 'REPLACE_WORD', query: { nodeType: 'n', value: 'v' } as any });
            vi.spyOn(PositionFinder, 'findByContext').mockReturnValue(null);
            // @ts-ignore
            vi.spyOn(fixer.treeSitterAnalyzer!, 'findByQuery').mockReturnValue({ startColumn: 5, endColumn: 10 });
            fixer.fix(pred, 'code');
            expect(pred.wordReplaceInfo?.startColumn).toBe(5);
        });

        it('Layer 3 Fallback (Diff)', () => {
            const pred = createPred({ changeType: 'REPLACE_WORD', suggestionText: 'createUserAsync', context: { before: 'X', target: 'X', after: 'X' } });
            // Layer 1 fails
            vi.spyOn(PositionFinder, 'findByContext').mockReturnValue(null);
            // Mock diff calculator
            vi.spyOn(DiffCalculator, 'calculateWordReplace').mockReturnValue({ word: '', replacement: 'Async', startColumn: 1, endColumn: 1 });
            
            fixer.fix(pred, 'createUser');
            expect(pred.wordReplaceInfo?.replacement).toBe('Async'); // logic 157
        });
        
        it('Layer 3 Diff Append (Line 155)', () => {
             const pred = createPred({ changeType: 'REPLACE_WORD', suggestionText: 'createUserAsync', context: { before: 'MISS', target: 'createUser', after: 'MISS' } });
             vi.spyOn(PositionFinder, 'findByContext').mockReturnValue(null);
             // First call (Line 149) - finds append. default (subsequent) calls return null
             vi.spyOn(DiffCalculator, 'calculateWordReplace')
                .mockReturnValue(null)
                .mockReturnValueOnce({ word: '', replacement: 'Async', startColumn: 1, endColumn:1 });
             
             fixer.fix(pred, 'createUser');
             expect(pred.wordReplaceInfo?.replacement).toBe('createUserAsync');
        });

        it('Ultimate Fallback', () => {
            const pred = createPred({ changeType: 'REPLACE_WORD', suggestionText: 'fallback' });
            vi.spyOn(PositionFinder, 'findByContext').mockReturnValue(null);
            vi.spyOn(DiffCalculator, 'calculateWordReplace').mockReturnValue(null);
            fixer.fix(pred, 'code');
            expect(pred.wordReplaceInfo?.replacement).toBe('fallback');
        });
    });

    describe('INLINE_INSERT Layers', () => {
        it('Layer 1 Success', () => {
            const pred = createPred({ changeType: 'INLINE_INSERT', context: { before: '', target: 't', after: '' }, suggestionText: 'result' });
            vi.spyOn(PositionFinder, 'findByContext').mockReturnValue({ startColumn: 1, endColumn: 2 });
            fixer.fix(pred, 't');
            expect(pred.inlineInsertInfo?.insertColumn).toBe(2);
        });

        it('Layer 2 Failure -> Layer 3', async () => {
            await setupTS(fixer);
            const pred = createPred({ changeType: 'INLINE_INSERT', suggestionText: 'ins', context: { before: 'M', target: 'M', after: 'M' } });
            vi.spyOn(PositionFinder, 'findByContext').mockReturnValue(null);
            // TreeSitter fails
            // Diff succeeds
            vi.spyOn(DiffCalculator, 'calculateInlineInsert').mockReturnValue({ content: 'ins', insertColumn: 5 });
            
            fixer.fix(pred, 'code');
            expect(pred.inlineInsertInfo?.insertColumn).toBe(5);
            expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Layer 2 failed'));
        });
    });
    describe('Coverage Boost', () => {
        it('should return early if TreeSitter already initialized (Line 27)', async () => {
             const spy = vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockResolvedValue(undefined);
             vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized').mockReturnValue(true);
             await fixer.initTreeSitter();
             await fixer.initTreeSitter(); // Second call
             expect(spy).toHaveBeenCalledTimes(1); 
        });

        it('fixInlineInsertCoordinates Layer 2 Query (Line 305-322)', async () => {
             await setupTS(fixer);
             const pred = createPred({ 
                 changeType: 'INLINE_INSERT', 
                 query: { nodeType: 'func', value: 'foo' } as any,
                 suggestionText: 'insertion'
             });
             // @ts-ignore
             vi.spyOn(fixer.treeSitterAnalyzer!, 'findByQuery').mockReturnValue({ startColumn: 1, endColumn: 5 });
             
             fixer.fix(pred, 'full code');
             expect(pred.inlineInsertInfo?.insertColumn).toBe(5);
             expect(pred.inlineInsertInfo?.content).toBe('insertion');
        });

        it('fixInlineInsertCoordinates Layer 3 Fail (Line 359)', () => {
             const pred = createPred({ changeType: 'INLINE_INSERT', suggestionText: 'ins' });
             vi.spyOn(DiffCalculator, 'calculateInlineInsert').mockReturnValue(null);
             
             fixer.fix(pred, 'line');
             expect(pred.inlineInsertInfo).toBeUndefined();
             expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('All layers failed for INLINE_INSERT'));
        });

        it('extractTargetFromDiff usage (Line 366)', async () => {
             await setupTS(fixer);
             const predReplace = createPred({
                 changeType: 'REPLACE_WORD',
                 context: { before: '', target: '', after: '' }, // empty target
                 suggestionText: 'newVal'
             });
             
             // Mock extractTargetFromDiff inner call (DiffCalculator)
             vi.spyOn(DiffCalculator, 'calculateWordReplace').mockReturnValue({ word: 'oldVal', replacement: 'newVal', startColumn: 1, endColumn: 2 });
             // TS need to find it
             // @ts-ignore
             vi.spyOn(fixer.treeSitterAnalyzer!, 'findTargetPosition').mockReturnValue({ startColumn: 10, endColumn: 16 });
             
             // Ensure Layer 1 fails so we reach Layer 2 fallback
             vi.spyOn(PositionFinder, 'findByContext').mockReturnValue(null);

             fixer.fix(predReplace, 'content');
             expect(predReplace.wordReplaceInfo?.startColumn).toBe(10);
        });

        it('fixInlineInsertCoordinates Layer 2 Target Fallback (Line 330-345)', async () => {
             await setupTS(fixer);
             const pred = createPred({ 
                 changeType: 'INLINE_INSERT',
                 targetLine: 1,
                 suggestionText: 'const x = 1, y = 2',
                 context: { before: '', target: 'const x = 1', after: '' }
             });
             
             // Ensure Layer 1 fails
             vi.spyOn(PositionFinder, 'findByContext').mockReturnValue(null);
             
             // TS finds target
             // @ts-ignore
             const tsSpy = vi.spyOn(fixer.treeSitterAnalyzer!, 'findTargetPosition').mockReturnValue({ startColumn: 1, endColumn: 12 }); // matches "const x = 1"
             
             // Diff calc for insertion
             vi.spyOn(DiffCalculator, 'calculateInlineInsert').mockReturnValue({ content: ', y = 2', insertColumn: 12 });
             
             fixer.fix(pred, 'const x = 1');
             
             expect(tsSpy).toHaveBeenCalled();
             expect(pred.inlineInsertInfo?.insertColumn).toBe(12);
             expect(pred.inlineInsertInfo?.content).toBe(', y = 2');
        });
    });
});
