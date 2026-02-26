/**
 * AcornAnalyzer 单元测试
 */

import { describe, it, expect } from 'vitest';
import { AcornAnalyzer } from '@/analysis/AcornAnalyzer';

describe('AcornAnalyzer', () => {
  const analyzer = new AcornAnalyzer();

  describe('parse', () => {
    it('应该解析简单的 JavaScript', () => {
      const code = 'const x = 1;';
      const ast = analyzer.parse(code);
      expect(ast.type).toBe('Program');
    });

    it('应该解析函数声明', () => {
      const code = 'function hello() { return "world"; }';
      const ast = analyzer.parse(code);
      const functions = analyzer.findNodesByType(ast, 'FunctionDeclaration');
      expect(functions).toHaveLength(1);
    });

    it('应该解析对象字面量', () => {
      const code = 'const user = { name: "Alice", age: 30 };';
      const ast = analyzer.parse(code);
      const objects = analyzer.findNodesByType(ast, 'ObjectExpression');
      expect(objects).toHaveLength(1);
    });

    it('应该处理解析错误', () => {
      const code = 'const x = ';
      expect(() => analyzer.parse(code)).toThrow();
    });
  });

  describe('findNodeAtPosition', () => {
    it('应该找到指定位置的节点', () => {
      const code = 'const user = { name: "Alice" };';
      const ast = analyzer.parse(code);

      // 查找 "user" 标识符（列号从 0 开始）
      const node = analyzer.findNodeAtPosition(ast, 1, 7);
      expect(node?.type).toBe('Identifier');
    });

    it('应该找到嵌套节点', () => {
      const code = 'const user = { name: "Alice" };';
      const ast = analyzer.parse(code);

      // 查找 "name" 属性（列号从 0 开始）
      const node = analyzer.findNodeAtPosition(ast, 1, 16);
      expect(node?.type).toBe('Property');
    });

    it('应该返回 null 当位置无效时', () => {
      const code = 'const x = 1;';
      const ast = analyzer.parse(code);

      const node = analyzer.findNodeAtPosition(ast, 100, 100);
      expect(node).toBeNull();
    });
  });

  describe('getParent', () => {
    it('应该获取父节点', () => {
      const code = 'const user = { name: "Alice" };';
      const ast = analyzer.parse(code);

      const node = analyzer.findNodeAtPosition(ast, 1, 16);
      const parent = analyzer.getParent(ast, node!);
      expect(parent?.type).toBe('ObjectExpression');
    });

    it('应该返回 null 当节点没有父节点时', () => {
      const code = 'const x = 1;';
      const ast = analyzer.parse(code);

      const parent = analyzer.getParent(ast, ast as any);
      expect(parent).toBeNull();
    });
  });

  describe('isNodeType', () => {
    it('应该正确判断节点类型', () => {
      const code = 'const x = 1;';
      const ast = analyzer.parse(code);
      const node = analyzer.findNodeAtPosition(ast, 1, 7);

      expect(analyzer.isNodeType(node, ['Identifier'])).toBe(true);
      expect(analyzer.isNodeType(node, ['Literal'])).toBe(false);
    });

    it('应该处理 null 节点', () => {
      expect(analyzer.isNodeType(null, ['Identifier'])).toBe(false);
    });
  });

  describe('getNodeText', () => {
    it('应该获取节点的文本内容', () => {
      const code = 'const user = { name: "Alice" };';
      const ast = analyzer.parse(code);

      const node = analyzer.findNodeAtPosition(ast, 1, 7);
      if (node) {
        const text = analyzer.getNodeText(code, node);
        expect(text).toBe('user');
      }
    });
  });

  describe('findNodesByType', () => {
    it('应该找到所有指定类型的节点', () => {
      const code = `
        const a = 1;
        const b = 2;
        const c = 3;
      `;
      const ast = analyzer.parse(code);
      const variables = analyzer.findNodesByType(ast, 'VariableDeclarator');
      expect(variables.length).toBeGreaterThanOrEqual(3);
    });

    it('应该返回空数组当没有匹配节点时', () => {
      const code = 'const x = 1;';
      const ast = analyzer.parse(code);
      const functions = analyzer.findNodesByType(ast, 'FunctionDeclaration');
      expect(functions).toHaveLength(0);
    });
  });
});
