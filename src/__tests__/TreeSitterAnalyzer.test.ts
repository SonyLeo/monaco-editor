/**
 * Tree-sitter Analyzer 完整测试套件
 * 目标覆盖率：90%+ Statements, 85%+ Branches, 95%+ Functions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TreeSitterAnalyzer } from '@/analysis/TreeSitterAnalyzer';

describe('TreeSitterAnalyzer - Complete Coverage', () => {
  let analyzer: TreeSitterAnalyzer;

  beforeEach(() => {
    analyzer = new TreeSitterAnalyzer();
  });

  // ============================================================================
  // 初始化测试
  // ============================================================================
  describe('Initialization', () => {
    it('should create analyzer instance', () => {
      expect(analyzer).toBeDefined();
      expect(analyzer.isInitialized()).toBe(false);
    });

    it('should handle init() when already initialized', async () => {
      // Mock Parser.init 和 Language.load
      const mockParser = {
        setLanguage: vi.fn(),
        parse: vi.fn().mockReturnValue(null),
      };

      vi.spyOn(analyzer as any, 'parser', 'get').mockReturnValue(mockParser);
      (analyzer as any).initialized = true;

      // 第二次调用应该直接返回
      await analyzer.init();
      expect(analyzer.isInitialized()).toBe(true);
    });

    it('should return false when not initialized', () => {
      expect(analyzer.isInitialized()).toBe(false);
    });
  });

  // ============================================================================
  // 代码分析测试
  // ============================================================================
  describe('Code Analysis', () => {
    it('should return null when parser not initialized', () => {
      const result = analyzer.analyzeEdit('const x = 1;', 1, 7);
      expect(result).toBeNull();
    });

    it('should return null when tree is null', () => {
      // Mock 初始化状态
      const mockParser = {
        parse: vi.fn().mockReturnValue(null),
      };
      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.analyzeEdit('const x = 1;', 1, 7);
      expect(result).toBeNull();
    });

    it('should return null when node not found at position', () => {
      const mockTree = {
        rootNode: {
          descendantForPosition: vi.fn().mockReturnValue(null),
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.analyzeEdit('const x = 1;', 1, 7);
      expect(result).toBeNull();
    });

    it('should extract node info successfully', () => {
      const mockNode = {
        type: 'identifier',
        text: 'myVar',
        startPosition: { row: 0, column: 6 },
        endPosition: { row: 0, column: 11 },
        parent: {
          type: 'variable_declarator',
          text: 'myVar = 1',
          children: [],
        },
        children: [],
      };

      const mockTree = {
        rootNode: {
          descendantForPosition: vi.fn().mockReturnValue(mockNode),
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.analyzeEdit('const myVar = 1;', 1, 7);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('identifier');
      expect(result?.text).toBe('myVar');
      expect(result?.startPosition).toEqual({ row: 0, column: 6 });
    });

    it('should handle parse errors gracefully', () => {
      const mockParser = {
        parse: vi.fn().mockImplementation(() => {
          throw new Error('Parse error');
        }),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.analyzeEdit('invalid code }{', 1, 1);
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // 符号推断测试
  // ============================================================================
  describe('Symbol Inference', () => {
    it('should infer function symbol', () => {
      const mockNode = {
        type: 'function_declaration',
        text: 'function hello() {}',
        children: [
          { type: 'identifier', text: 'hello' },
        ],
        parent: null,
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe('function');
      expect(result?.scope).toBe('global');
    });

    it('should infer class symbol', () => {
      const mockNode = {
        type: 'class_declaration',
        text: 'class MyClass {}',
        children: [
          { type: 'identifier', text: 'MyClass' },
        ],
        parent: null,
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.kind).toBe('class');
    });

    it('should infer variable symbol', () => {
      const mockNode = {
        type: 'variable_declarator',
        text: 'myVar = 1',
        children: [
          { type: 'identifier', text: 'myVar' },
        ],
        parent: null,
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.kind).toBe('variable');
    });

    it('should infer parameter symbol', () => {
      const mockNode = {
        type: 'formal_parameter',
        text: 'name',
        children: [
          { type: 'identifier', text: 'name' },
        ],
        parent: null,
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.kind).toBe('parameter');
    });

    it('should infer method symbol', () => {
      const mockNode = {
        type: 'method_definition',
        text: 'myMethod() {}',
        children: [
          { type: 'identifier', text: 'myMethod' },
        ],
        parent: null,
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.kind).toBe('method');
    });

    it('should infer interface symbol', () => {
      const mockNode = {
        type: 'interface_declaration',
        text: 'interface IFoo {}',
        children: [
          { type: 'identifier', text: 'IFoo' },
        ],
        parent: null,
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.kind).toBe('interface');
    });

    it('should infer type symbol', () => {
      const mockNode = {
        type: 'type_alias_declaration',
        text: 'type MyType = string;',
        children: [
          { type: 'identifier', text: 'MyType' },
        ],
        parent: null,
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.kind).toBe('type');
    });

    it('should return null for unknown symbol type', () => {
      const mockNode = {
        type: 'unknown_type',
        text: 'unknown',
        children: [],
        parent: null,
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result).toBeNull();
    });

    it('should extract symbol name from identifier child', () => {
      const mockNode = {
        type: 'function_declaration',
        text: 'function myFunc() {}',
        children: [
          { type: 'identifier', text: 'myFunc' },
        ],
        parent: null,
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.name).toBe('myFunc');
    });

    it('should fallback to first word when no identifier found', () => {
      const mockNode = {
        type: 'function_declaration',
        text: 'function myFunc() {}',
        children: [],
        parent: null,
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.name).toBe('function');
    });
  });

  // ============================================================================
  // 作用域分析测试
  // ============================================================================
  describe('Scope Analysis', () => {
    it('should detect local scope inside function', () => {
      const mockNode = {
        type: 'variable_declarator',
        text: 'x = 1',
        children: [
          { type: 'identifier', text: 'x' },
        ],
        parent: {
          type: 'lexical_declaration',
          text: 'const x = 1',
          parent: {
            type: 'function_declaration',
            text: 'function foo() {}',
            parent: null,
          },
        },
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.scope).toBe('local');
    });

    it('should detect class scope inside class', () => {
      const mockNode = {
        type: 'property_identifier',
        text: 'prop',
        children: [],
        parent: {
          type: 'class_body',
          text: '{ prop = 1; }',
          parent: {
            type: 'class_declaration',
            text: 'class MyClass {}',
            children: [
              { type: 'identifier', text: 'MyClass' },
            ],
            parent: null,
          },
        },
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.scope).toBe('class');
    });

    it('should detect module scope in export', () => {
      const mockNode = {
        type: 'function_declaration',
        text: 'function myFunc() {}',
        children: [
          { type: 'identifier', text: 'myFunc' },
        ],
        parent: {
          type: 'export_statement',
          text: 'export function myFunc() {}',
          parent: null,
        },
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.scope).toBe('module');
    });

    it('should detect global scope at top level', () => {
      const mockNode = {
        type: 'variable_declarator',
        text: 'globalVar = 1',
        children: [
          { type: 'identifier', text: 'globalVar' },
        ],
        parent: {
          type: 'lexical_declaration',
          text: 'const globalVar = 1',
          parent: null,
        },
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.scope).toBe('global');
    });

    it('should detect exported symbol', () => {
      const mockNode = {
        type: 'function_declaration',
        text: 'function foo() {}',
        children: [
          { type: 'identifier', text: 'foo' },
        ],
        parent: {
          type: 'export_statement',
          text: 'export function foo() {}',
          parent: null,
        },
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.isExported).toBe(true);
    });

    it('should detect async function', () => {
      const mockNode = {
        type: 'function_declaration',
        text: 'async function foo() {}',
        children: [
          { type: 'identifier', text: 'foo' },
        ],
        parent: null,
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.isAsync).toBe(true);
    });

    it('should detect async arrow function', () => {
      const mockNode = {
        type: 'arrow_function',
        text: 'async () => {}',
        children: [],
        parent: {
          type: 'variable_declarator',
          text: 'async () => {}',
          parent: null,
        },
      } as any;

      const result = analyzer.inferSymbolInfo(mockNode);
      expect(result?.isAsync).toBe(true);
    });
  });

  // ============================================================================
  // 语法上下文测试
  // ============================================================================
  describe('Syntax Context', () => {
    it('should detect function context', () => {
      const mockNode = {
        type: 'identifier',
        text: 'x',
        children: [],
        parent: {
          type: 'variable_declarator',
          parent: {
            type: 'function_declaration',
            text: 'function foo() {}',
            children: [
              { type: 'identifier', text: 'foo' },
            ],
            parent: null,
          },
        },
      } as any;

      const result = analyzer.buildSyntaxContext(mockNode);
      expect(result.inFunctionDeclaration).toBe(true);
      expect(result.nearestFunction).toBe('foo');
    });

    it('should detect class context', () => {
      const mockNode = {
        type: 'identifier',
        text: 'prop',
        children: [],
        parent: {
          type: 'property_identifier',
          parent: {
            type: 'class_body',
            parent: {
              type: 'class_declaration',
              text: 'class MyClass {}',
              children: [
                { type: 'identifier', text: 'MyClass' },
              ],
              parent: null,
            },
          },
        },
      } as any;

      const result = analyzer.buildSyntaxContext(mockNode);
      expect(result.inClassDeclaration).toBe(true);
      expect(result.nearestClass).toBe('MyClass');
    });

    it('should detect object literal context', () => {
      const mockNode = {
        type: 'identifier',
        text: 'key',
        children: [],
        parent: {
          type: 'object',
          parent: null,
        },
      } as any;

      const result = analyzer.buildSyntaxContext(mockNode);
      expect(result.inObjectLiteral).toBe(true);
    });

    it('should detect array literal context', () => {
      const mockNode = {
        type: 'identifier',
        text: 'item',
        children: [],
        parent: {
          type: 'array',
          parent: null,
        },
      } as any;

      const result = analyzer.buildSyntaxContext(mockNode);
      expect(result.inArrayLiteral).toBe(true);
    });

    it('should detect conditional context', () => {
      const mockNode = {
        type: 'identifier',
        text: 'x',
        children: [],
        parent: {
          type: 'if_statement',
          parent: null,
        },
      } as any;

      const result = analyzer.buildSyntaxContext(mockNode);
      expect(result.inConditional).toBe(true);
    });

    it('should detect loop context', () => {
      const mockNode = {
        type: 'identifier',
        text: 'i',
        children: [],
        parent: {
          type: 'for_statement',
          parent: null,
        },
      } as any;

      const result = analyzer.buildSyntaxContext(mockNode);
      expect(result.inLoop).toBe(true);
    });

    it('should detect while loop context', () => {
      const mockNode = {
        type: 'identifier',
        text: 'x',
        children: [],
        parent: {
          type: 'while_statement',
          parent: null,
        },
      } as any;

      const result = analyzer.buildSyntaxContext(mockNode);
      expect(result.inLoop).toBe(true);
    });

    it('should detect ternary expression context', () => {
      const mockNode = {
        type: 'identifier',
        text: 'x',
        children: [],
        parent: {
          type: 'ternary_expression',
          parent: null,
        },
      } as any;

      const result = analyzer.buildSyntaxContext(mockNode);
      expect(result.inConditional).toBe(true);
    });
  });

  // ============================================================================
  // 位置查找测试
  // ============================================================================
  describe('Position Finding', () => {
    it('should find target position by text match', () => {
      const mockNode = {
        type: 'identifier',
        text: 'myVar',
        startPosition: { row: 0, column: 6 },
        endPosition: { row: 0, column: 11 },
        parent: null,
        children: [],
      };

      const mockTree = {
        rootNode: {
          type: 'program',
          text: 'const myVar = 1;',
          startPosition: { row: 0, column: 0 },
          endPosition: { row: 0, column: 16 },
          parent: null,
          children: [mockNode],
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.findTargetPosition('const myVar = 1;', 1, 'myVar');
      expect(result).not.toBeNull();
      expect(result?.startColumn).toBe(7); // 1-based
      expect(result?.endColumn).toBe(12);
    });

    it('should return null when target not found', () => {
      const mockTree = {
        rootNode: {
          descendantForPosition: vi.fn(),
          children: [],
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.findTargetPosition('const x = 1;', 1, 'notFound');
      expect(result).toBeNull();
    });

    it('should find by query with node type filter', () => {
      const mockNode = {
        type: 'identifier',
        text: 'myVar',
        startPosition: { row: 0, column: 6 },
        endPosition: { row: 0, column: 11 },
        parent: null,
        children: [],
      };

      const mockTree = {
        rootNode: {
          type: 'program',
          text: 'const myVar = 1;',
          startPosition: { row: 0, column: 0 },
          endPosition: { row: 0, column: 16 },
          parent: null,
          children: [mockNode],
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.findByQuery('const myVar = 1;', {
        lineNumber: 1,
        nodeType: 'identifier',
        value: 'myVar',
      });

      expect(result).not.toBeNull();
    });

    it('should return null when query not matched', () => {
      const mockTree = {
        rootNode: {
          descendantForPosition: vi.fn(),
          children: [],
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.findByQuery('const x = 1;', {
        lineNumber: 1,
        nodeType: 'identifier',
        value: 'notFound',
      });

      expect(result).toBeNull();
    });

    it('should handle index out of range in query', () => {
      const mockNode = {
        type: 'identifier',
        text: 'x',
        startPosition: { row: 0, column: 6 },
        endPosition: { row: 0, column: 7 },
        parent: null,
        children: [],
      };

      const mockTree = {
        rootNode: {
          descendantForPosition: vi.fn(),
          children: [mockNode],
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.findByQuery('const x = 1;', {
        lineNumber: 1,
        nodeType: 'identifier',
        value: 'x',
        index: 999, // 超出范围
      });

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // 缓存管理测试
  // ============================================================================
  describe('Cache Management', () => {
    it('should cache parsed trees', () => {
      const mockTree = {
        rootNode: {
          descendantForPosition: vi.fn().mockReturnValue(null),
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const code = 'const x = 1;';
      analyzer.analyzeEdit(code, 1, 1);
      analyzer.analyzeEdit(code, 1, 2); // 相同代码，应该使用缓存

      expect(mockParser.parse).toHaveBeenCalledTimes(1); // 只调用一次
    });

    it('should clear cache', () => {
      const cache = (analyzer as any).parseCache;
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.size).toBe(2);

      analyzer.clearCache();

      expect(cache.size).toBe(0);
    });

    it('should limit cache size to CACHE_MAX_SIZE', () => {
      const mockParser = {
        parse: vi.fn().mockReturnValue({
          rootNode: {
            descendantForPosition: vi.fn().mockReturnValue(null),
          },
        }),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      // 添加超过 CACHE_MAX_SIZE 的条目
      for (let i = 0; i < 15; i++) {
        analyzer.analyzeEdit(`const x${i} = ${i};`, 1, 1);
      }

      const cache = (analyzer as any).parseCache;
      expect(cache.size).toBeLessThanOrEqual(10); // CACHE_MAX_SIZE = 10
    });
  });

  // ============================================================================
  // 错误处理测试
  // ============================================================================
  describe('Error Handling', () => {
    it('should handle null tree gracefully', () => {
      const mockParser = {
        parse: vi.fn().mockReturnValue(null),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.analyzeEdit('const x = 1;', 1, 1);
      expect(result).toBeNull();
    });

    it('should handle parse exception', () => {
      const mockParser = {
        parse: vi.fn().mockImplementation(() => {
          throw new Error('Parse failed');
        }),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.analyzeEdit('invalid }{', 1, 1);
      expect(result).toBeNull();
    });

    it('should handle findTargetPosition when not initialized', () => {
      const result = analyzer.findTargetPosition('const x = 1;', 1, 'x');
      expect(result).toBeNull();
    });

    it('should handle findByQuery when not initialized', () => {
      const result = analyzer.findByQuery('const x = 1;', {
        lineNumber: 1,
        nodeType: 'identifier',
      });
      expect(result).toBeNull();
    });

    it('should handle findTargetPosition with null tree', () => {
      const mockParser = {
        parse: vi.fn().mockReturnValue(null),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.findTargetPosition('const x = 1;', 1, 'x');
      expect(result).toBeNull();
    });

    it('should handle findByQuery with null tree', () => {
      const mockParser = {
        parse: vi.fn().mockReturnValue(null),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.findByQuery('const x = 1;', {
        lineNumber: 1,
        nodeType: 'identifier',
      });
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // 边界情况测试
  // ============================================================================
  describe('Edge Cases', () => {
    it('should handle very long text truncation', () => {
      const longText = 'a'.repeat(150);
      const mockNode = {
        type: 'identifier',
        text: longText,
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 0, column: 150 },
        parent: null,
        children: [],
      };

      const mockTree = {
        rootNode: {
          descendantForPosition: vi.fn().mockReturnValue(mockNode),
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.analyzeEdit(longText, 1, 1);
      expect(result?.text.length).toBeLessThanOrEqual(103); // 100 + '...'
    });

    it('should handle empty code', () => {
      const mockTree = {
        rootNode: {
          descendantForPosition: vi.fn().mockReturnValue(null),
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.analyzeEdit('', 1, 1);
      expect(result).toBeNull();
    });

    it('should handle node without parent', () => {
      const mockNode = {
        type: 'program',
        text: 'const x = 1;',
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 0, column: 12 },
        parent: null,
        children: [],
      };

      const mockTree = {
        rootNode: {
          descendantForPosition: vi.fn().mockReturnValue(mockNode),
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.analyzeEdit('const x = 1;', 1, 1);
      expect(result).not.toBeNull();
      expect(result?.parent).toBeUndefined();
    });

    it('should handle node with many children', () => {
      const children = Array.from({ length: 10 }, (_, i) => ({
        type: 'identifier',
        text: `child${i}`,
        startPosition: { row: 0, column: i },
        endPosition: { row: 0, column: i + 1 },
      }));

      const mockNode = {
        type: 'program',
        text: 'code',
        startPosition: { row: 0, column: 0 },
        endPosition: { row: 0, column: 4 },
        parent: null,
        children,
      };

      const mockTree = {
        rootNode: {
          descendantForPosition: vi.fn().mockReturnValue(mockNode),
        },
      };

      const mockParser = {
        parse: vi.fn().mockReturnValue(mockTree),
      };

      (analyzer as any).parser = mockParser;
      (analyzer as any).initialized = true;

      const result = analyzer.analyzeEdit('code', 1, 1);
      expect(result?.children?.length).toBeLessThanOrEqual(5); // 只取前 5 个
    });
  });
});
