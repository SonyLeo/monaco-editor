
import { describe, it, expect, beforeEach } from 'vitest';
import { SymptomDetector } from '@/analysis/SymptomDetector';
import type { EditRecord } from '@/types';
import type * as monaco from 'monaco-editor';

describe('SymptomDetector - Ultimate Coverage', () => {
  let detector: SymptomDetector;

  const createMockModel = (content: string) => {
    const lines = content.split('\n');
    return {
      getLineCount: () => lines.length,
      getLineContent: (ln: number) => lines[ln - 1] || '',
      getValue: () => content,
    } as unknown as monaco.editor.ITextModel;
  };

  const createEditRecord = (overrides: Partial<EditRecord>): EditRecord => ({
    timestamp: Date.now(),
    lineNumber: 1,
    column: 1,
    type: 'insert',
    oldText: '',
    newText: '',
    rangeLength: 0,
    source: 'user',
    ...overrides
  });

  beforeEach(() => {
    detector = new SymptomDetector();
  });

  describe('preparePayload', () => {
    it('should return null if no model is set', () => {
      expect(detector.preparePayload([])).toBeNull();
    });

    it('should respect the affectedLine parameter', () => {
      const model = createMockModel('line1\nline2\nline3\nline4\nline5');
      detector.setModel(model);
      const edits = [createEditRecord({ lineNumber: 1 })];
      
      const payload = detector.preparePayload(edits, 3);
      expect(payload?.windowInfo.startLine).toBe(1);
      expect(payload?.codeWindow).toContain('line3');
    });
  });

  describe('generateASTBasedSummary', () => {
    it('should detect class modification', () => {
      detector.setModel(createMockModel('class MyClass {}'));
      const edit = createEditRecord({
        context: { 
          lineContent: 'class MyClass {}', 
          symbolInfo: { kind: 'class', name: 'MyClass', scope: 'global' },
          astNode: { type: 'class_declaration', text: 'class MyClass {}' } as any
        }
      });
      const payload = detector.preparePayload([edit]);
      expect(payload?.diffSummary).toBe("Modifying class 'MyClass'");
    });

    it('should detect parameter editing', () => {
      detector.setModel(createMockModel('function test(p1) {}'));
      const edit = createEditRecord({
        type: 'replace',
        context: { 
          lineContent: 'function test(p1) {}', 
          symbolInfo: { kind: 'parameter', name: 'p1', scope: 'local' },
          syntaxContext: { nearestFunction: 'test' } as any,
          astNode: { type: 'parameter', text: 'p1' } as any
        }
      });
      const payload = detector.preparePayload([edit]);
      expect(payload?.diffSummary).toBe("Editing parameter 'p1' in test");
    });

    it('should detect variable and scope', () => {
      detector.setModel(createMockModel('const x = 1;'));
      const edit = createEditRecord({
        context: { 
          lineContent: 'const x = 1;', 
          symbolInfo: { kind: 'variable', name: 'x', scope: 'local' },
          astNode: { type: 'variable_declarator', text: 'x = 1' } as any
        }
      });
      const payload = detector.preparePayload([edit]);
      expect(payload?.diffSummary).toBe("Editing local variable 'x'");
    });

    it('should detect property and methods', () => {
      detector.setModel(createMockModel('obj.prop = 1;'));
      const editProp = createEditRecord({
        context: { 
          lineContent: 'obj.prop = 1;', 
          symbolInfo: { kind: 'property', name: 'prop', scope: 'global' } as any,
          astNode: { type: 'property', text: 'prop' } as any
        }
      });
      expect(detector.preparePayload([editProp])?.diffSummary).toBe("Editing object property");

      const editMethod = createEditRecord({
        context: { 
          lineContent: 'this.save()', 
          symbolInfo: { kind: 'method', name: 'save', scope: 'global' } as any,
          syntaxContext: { nearestClass: 'User' } as any,
          astNode: { type: 'method_definition', text: 'save()' } as any
        }
      });
      expect(detector.preparePayload([editMethod])?.diffSummary).toBe("Editing method 'save' in User");
    });

    it('should detect loop and conditional', () => {
       detector.setModel(createMockModel('if (x) {}'));
       const editIf = createEditRecord({
         context: { lineContent: 'if (x) {}', syntaxContext: { inConditional: true } as any, astNode: { type: 'if_statement', text: 'if(x)' } as any }
       });
       expect(detector.preparePayload([editIf])?.diffSummary).toBe("Editing conditional logic");

       const editLoop = createEditRecord({
         context: { lineContent: 'for (...) {}', syntaxContext: { inLoop: true } as any, astNode: { type: 'for_statement', text: 'for...' } as any }
       });
       expect(detector.preparePayload([editLoop])?.diffSummary).toBe("Editing loop logic");
    });
  });

  describe('analyzeEditPattern', () => {
    it('should detect adding additional parameter with comma', () => {
        detector.setModel(createMockModel('function greet(name, age) {}'));
        const history = [
          createEditRecord({ lineNumber: 1, type: 'insert', context: { lineContent: 'function greet(name) {}' } }),
          createEditRecord({ lineNumber: 1, type: 'insert', newText: ', age', context: { lineContent: 'function greet(name, age) {}' } })
        ];
        expect(detector.preparePayload(history)?.diffSummary).toBe("Added parameter to function (now has 2 parameters)");
    });

    it('should detect typing parameter name', () => {
        detector.setModel(createMockModel('function greet(name) {}'));
        const history = [
          createEditRecord({ lineNumber: 1, type: 'insert', context: { lineContent: 'function greet(n) {}' } }),
          createEditRecord({ lineNumber: 1, type: 'insert', context: { lineContent: 'function greet(name) {}' } })
        ];
        expect(detector.preparePayload(history)?.diffSummary).toBe("Typing parameter name 'name' in function signature");
    });

    it('should detect first parameter addition', () => {
        detector.setModel(createMockModel('function greet(name) {}'));
        const history = [
          createEditRecord({ lineNumber: 1, context: { lineContent: 'function greet() {}' } }),
          createEditRecord({ lineNumber: 1, type: 'insert', context: { lineContent: 'function greet(name) {}' } })
        ];
        expect(detector.preparePayload(history)?.diffSummary).toBe("Added first parameter 'name' to function");
    });

    it('should detect function renaming (complete)', () => {
        detector.setModel(createMockModel('function newFunc() {}'));
        const history = [
          createEditRecord({ lineNumber: 1, context: { lineContent: 'function oldFunc() {}' } }),
          createEditRecord({ lineNumber: 1, type: 'replace', rangeLength: 7, newText: 'newFunc', context: { lineContent: 'function newFunc() {}' } })
        ];
        expect(detector.preparePayload(history)?.diffSummary).toBe("Renamed function to 'newFunc'");
    });

    it('should detect function renaming (in progress)', () => {
        detector.setModel(createMockModel('function newName() {}'));
        const history = [
          createEditRecord({ lineNumber: 1, context: { lineContent: 'function oldVeryLongName() {}' } }),
          createEditRecord({ lineNumber: 1, type: 'delete', rangeLength: 10, context: { lineContent: 'function newName() {}' } })
        ];
        expect(detector.preparePayload(history)?.diffSummary).toBe("Renaming function to 'newName' (in progress)");
    });

    it('should detect variable renaming', () => {
        detector.setModel(createMockModel('const newVal = 1;'));
        const history = [
          createEditRecord({ lineNumber: 1, context: { lineContent: 'const oldVal = 1;' } }),
          createEditRecord({ lineNumber: 1, type: 'replace', rangeLength: 6, newText: 'newVal', context: { lineContent: 'const newVal = 1;' } })
        ];
        expect(detector.preparePayload(history)?.diffSummary).toBe("Renamed variable to 'newVal'");
    });
  });

  describe('getCodeWindow and Basic Summary', () => {
    it('should handle basic summary fallbacks (delete/replace)', () => {
        detector.setModel(createMockModel('some code'));
        
        const editDelete = createEditRecord({ type: 'delete', oldText: 'badCode', lineNumber: 5 });
        expect(detector.preparePayload([editDelete], 5)?.diffSummary).toBe('Deleted "badCode" at line 5');

        const editReplace = createEditRecord({ type: 'replace', oldText: 'a', newText: 'b', lineNumber: 8 });
        expect(detector.preparePayload([editReplace], 8)?.diffSummary).toBe('Replaced "a" with "b" at line 8');
    });

    it('should correctly slice editHistory', () => {
        detector.setModel(createMockModel('...'));
        const history = Array.from({ length: 10 }, (_, i) => createEditRecord({ lineNumber: i + 1 }));
        const payload = detector.preparePayload(history);
        expect(payload?.editHistory.length).toBe(5);
    });
  });
});
