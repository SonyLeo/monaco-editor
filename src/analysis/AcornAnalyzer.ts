/**
 * Acorn 分析器
 * 用于替代 Tree-sitter 的轻量级 AST 分析
 */

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import type { Node } from 'acorn';

export interface AcornPosition {
  line: number;
  column: number;
}

export interface AcornNode {
  type: string;
  start: number;
  end: number;
  loc?: {
    start: AcornPosition;
    end: AcornPosition;
  };
}

export class AcornAnalyzer {
  /**
   * 解析代码
   */
  parse(code: string): Node {
    try {
      return acorn.parse(code, {
        ecmaVersion: 'latest', // 使用最新的 ECMAScript 版本
        sourceType: 'module',
        locations: true,
        ranges: true,
      });
    } catch (error) {
      // 降级：尝试作为脚本解析
      try {
        return acorn.parse(code, {
          ecmaVersion: 'latest',
          sourceType: 'script',
          locations: true,
          ranges: true,
        });
      } catch (fallbackError) {
        throw new Error(`Acorn parse failed: ${error}`);
      }
    }
  }

  /**
   * 查找指定位置的节点
   */
  findNodeAtPosition(ast: Node, line: number, column: number): AcornNode | null {
    let targetNode: AcornNode | null = null;
    let minSize = Infinity;

    walk.full(ast, (node: any) => {
      if (!node.loc) return;

      const { start, end } = node.loc;

      // 检查位置是否在节点范围内
      const isInRange =
        (line > start.line || (line === start.line && column >= start.column)) &&
        (line < end.line || (line === end.line && column <= end.column));

      if (isInRange) {
        // 选择最小的包含节点（更精确）
        const size = node.end - node.start;
        if (size < minSize) {
          minSize = size;
          targetNode = node as AcornNode;
        }
      }
    });

    return targetNode;
  }

  /**
   * 获取节点的父节点
   */
  getParent(ast: Node, targetNode: AcornNode): AcornNode | null {
    let parent: AcornNode | null = null;
    let found = false;

    walk.ancestor(ast, {
      [targetNode.type]: (node: any, ancestors: any[]) => {
        if (found) return;
        if (node === targetNode || (node.start === targetNode.start && node.end === targetNode.end)) {
          if (ancestors.length > 1) {
            // ancestors 包含当前节点，所以父节点是倒数第二个
            parent = ancestors[ancestors.length - 2] as AcornNode;
          }
          found = true;
        }
      },
    } as any);

    return parent;
  }

  /**
   * 检查节点类型
   */
  isNodeType(node: AcornNode | null, types: string[]): boolean {
    return node !== null && types.includes(node.type);
  }

  /**
   * 获取节点的文本内容
   */
  getNodeText(code: string, node: AcornNode): string {
    return code.substring(node.start, node.end);
  }

  /**
   * 查找所有指定类型的节点
   */
  findNodesByType(ast: Node, type: string): AcornNode[] {
    const nodes: AcornNode[] = [];

    walk.simple(ast, {
      [type](node: any) {
        nodes.push(node as AcornNode);
      },
    });

    return nodes;
  }
}
