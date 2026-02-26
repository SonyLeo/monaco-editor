
import { describe, it, expect, beforeEach } from 'vitest';
import { EditHistoryManager } from '@/services/EditHistoryManager';
import type * as monaco from 'monaco-editor';

describe('EditHistoryManager - Ultimate Coverage', () => {
  let manager: EditHistoryManager;
  const initialContent = 'line 1\nline 2\nline 3\nline 4';

  const createChange = (
    text: string, 
    range: { startLine: number, startCol: number, endLine: number, endCol: number },
    rangeLength?: number
  ): monaco.editor.IModelContentChange => ({
    range: {
      startLineNumber: range.startLine,
      startColumn: range.startCol,
      endLineNumber: range.endLine,
      endColumn: range.endCol,
    } as monaco.IRange,
    rangeOffset: 0,
    rangeLength: rangeLength !== undefined ? rangeLength : 0,
    text: text
  });

  const createMockModel = (currentValue: string) => {
    const lines = currentValue.split('\n');
    return {
      getValue: () => currentValue,
      getLineContent: (lineNumber: number) => lines[lineNumber - 1] || '',
      getLineCount: () => lines.length,
    } as unknown as monaco.editor.ITextModel;
  };

  beforeEach(() => {
    manager = new EditHistoryManager(initialContent);
  });

  describe('Content Extraction (getOldTextFromSnapshot)', () => {
    it('should extract old text correctly for multi-line deletion', () => {
      // Original: line 1\nline 2\nline 3\nline 4
      // Delete from line 1 col 5 to line 4 col 2
      // line 1 indices: l(0)i(1)n(2)e(3) (4)1(5)
      // col 5 (1-based) -> index 4 (space)
      // endCol 2 (1-based) -> index 1, substring(0,1) -> index 0 (l)
      const change = createChange('', { startLine: 1, startCol: 5, endLine: 4, endCol: 2 }, 15);
      const oldText = (manager as any).getOldTextFromSnapshot(change);
      expect(oldText).toBe(' 1\nline 2\nline 3\nl');
    });

    it('should handle errors in snapshot extraction gracefully', () => {
      (manager as any).lastSnapshot = null;
      const change = createChange('x', { startLine: 1, startCol: 1, endLine: 1, endCol: 2 }, 1);
      const oldText = (manager as any).getOldTextFromSnapshot(change);
      expect(oldText).toBe('');
    });
  });

  describe('Edit Type Detection', () => {
    it('should detect all three types', () => {
      const model = createMockModel('content');
      
      // Replace
      manager.recordEdit(createChange('new', { startLine: 1, startCol: 1, endLine: 1, endCol: 3 }, 2), model);
      expect(manager.getRecentEdits()[0]!.type).toBe('replace');
      manager.clear();

      // Insert
      manager.recordEdit(createChange('abc', { startLine: 1, startCol: 1, endLine: 1, endCol: 1 }, 0), model);
      expect(manager.getRecentEdits()[0]!.type).toBe('insert');
      manager.clear();

      // Delete
      manager.recordEdit(createChange('', { startLine: 1, startCol: 1, endLine: 1, endCol: 4 }, 3), model);
      expect(manager.getRecentEdits()[0]!.type).toBe('delete');
    });
  });

  describe('Merge Logic (tryMergeEdit)', () => {
    it('should merge delete then insert as replace', () => {
      manager = new EditHistoryManager('old');
      // Delete 'old'
      manager.recordEdit(createChange('', { startLine: 1, startCol: 1, endLine: 1, endCol: 4 }, 3), createMockModel(''));
      // Insert 'new'
      manager.recordEdit(createChange('n', { startLine: 1, startCol: 1, endLine: 1, endCol: 1 }, 0), createMockModel('n'));
      
      const edits = manager.getRecentEdits();
      expect(edits[0]!.type).toBe('replace');
      expect(edits[0]!.newText).toBe('n');
    });

    it('should merge consecutive forward deletes', () => {
      manager = new EditHistoryManager('abcde');
      // Delete 'b'
      manager.recordEdit(createChange('', { startLine: 1, startCol: 2, endLine: 1, endCol: 3 }, 1), createMockModel('acde'));
      // Delete 'c' (from now position col 2)
      manager.recordEdit(createChange('', { startLine: 1, startCol: 2, endLine: 1, endCol: 3 }, 1), createMockModel('ade'));
      expect(manager.getRecentEdits()[0]!.oldText).toBe('bc');
    });

    it('should handle partial insert+delete cancellation', () => {
        manager.recordEdit(createChange('abc', { startLine: 1, startCol: 1, endLine: 1, endCol: 1 }, 0), createMockModel('abc'));
        // Backspace 'c'
        manager.recordEdit(createChange('', { startLine: 1, startCol: 3, endLine: 1, endCol: 4 }, 1), createMockModel('ab'));
        expect(manager.getRecentEdits()[0]!.newText).toBe('ab');
  
        // Delete 'a' -> mismatch suffix -> becomes replace
        manager.recordEdit(createChange('', { startLine: 1, startCol: 1, endLine: 1, endCol: 2 }, 1), createMockModel('b'));
        expect(manager.getRecentEdits()[0]!.type).toBe('replace');
        expect(manager.getRecentEdits()[0]!.oldText).toBe('a');
    });

    it('should NOT merge if conditions fail', () => {
        const model = createMockModel('a');
        manager.recordEdit(createChange('a', { startLine: 1, startCol: 1, endLine: 1, endCol: 1 }, 0), model, 'user');
        
        // Fail: Different source
        manager.recordEdit(createChange('b', { startLine: 1, startCol: 2, endLine: 1, endCol: 2 }, 0), createMockModel('ab'), 'nes');
        expect(manager.getRecentEdits().length).toBe(2);
        manager.clear();

        // Fail: Not small (substitution of >1 chars with >1 chars)
        manager.recordEdit(createChange('abc', { startLine: 1, startCol: 1, endLine: 1, endCol: 1 }, 0), createMockModel('abc'));
        manager.recordEdit(createChange('def', { startLine: 1, startCol: 1, endLine: 1, endCol: 4 }, 3), createMockModel('def'));
        expect(manager.getRecentEdits().length).toBe(2);
        manager.clear();

        // Fail: Different lines
        manager.recordEdit(createChange('a', { startLine: 1, startCol: 1, endLine: 1, endCol: 1 }, 0), createMockModel('a\n'));
        manager.recordEdit(createChange('b', { startLine: 2, startCol: 1, endLine: 2, endCol: 1 }, 0), createMockModel('a\nb'));
        expect(manager.getRecentEdits().length).toBe(2);
    });
  });

  describe('History Management', () => {
    it('should respect MAX_HISTORY_SIZE', () => {
      const model = createMockModel('');
      for (let i = 0; i < 15; i++) {
        manager.recordEdit(createChange('x', { startLine: 1, startCol: i * 5 + 1, endLine: 1, endCol: i * 5 + 1 }, 0), model);
      }
      expect((manager as any).editHistory.length).toBe(10);
    });

    it('should clear and get recent with count', () => {
        manager.recordEdit(createChange('a', { startLine: 1, startCol: 1, endLine: 1, endCol: 1 }, 0), createMockModel('a'));
        manager.recordEdit(createChange('b', { startLine: 1, startCol: 10, endLine: 1, endCol: 10 }, 0), createMockModel('a         b'));
        expect(manager.getRecentEdits(1).length).toBe(1);
        manager.clear();
        expect(manager.getRecentEdits().length).toBe(0);
    });
  });
});
