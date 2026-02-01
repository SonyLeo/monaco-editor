/**
 * Coordinate Fixer - 坐标修复工具（增强版）
 * 
 * 实现 3 层降级策略（方案 C）：
 * 1. Context-based matching (PositionFinder) - 90%+ 准确率
 * 2. Tree-sitter AST matching (TreeSitterAnalyzer) - 99%+ 准确率
 * 3. fast-diff fallback (DiffCalculator) - 70%+ 准确率
 */

import type { Prediction, WordReplaceInfo, InlineInsertInfo } from '../types/index';
import { PositionFinder, type Context, type Position } from './PositionFinder';
import { DiffCalculator } from './DiffCalculator';
import { TreeSitterAnalyzer } from './TreeSitterAnalyzer';

export class CoordinateFixer {
  private treeSitterAnalyzer: TreeSitterAnalyzer | null = null;
  private treeSitterInitPromise: Promise<void> | null = null;
  private fullCode: string = '';  // 完整代码（用于 Tree-sitter 分析）

  /**
   * 初始化 Tree-sitter（异步，可选）
   * 调用此方法后，Layer 2 将可用
   */
  async initTreeSitter(languageFile?: string): Promise<void> {
    if (this.treeSitterAnalyzer?.isInitialized()) {
      return;
    }

    if (this.treeSitterInitPromise) {
      return this.treeSitterInitPromise;
    }

    this.treeSitterAnalyzer = new TreeSitterAnalyzer();
    this.treeSitterInitPromise = this.treeSitterAnalyzer.init(languageFile)
      .then(() => {
        console.log('[CoordinateFixer] Tree-sitter initialized, Layer 2 enabled');
      })
      .catch((error) => {
        console.warn('[CoordinateFixer] Tree-sitter init failed, Layer 2 disabled:', error);
        this.treeSitterAnalyzer = null;
      });

    return this.treeSitterInitPromise;
  }

  /**
   * 设置完整代码（用于 Tree-sitter 分析）
   */
  setFullCode(code: string): void {
    this.fullCode = code;
  }

  /**
   * 修复预测结果的坐标（增强版）
   * 
   * 注意：主要的坐标计算已在 NESEngine.handlePredictions() 中完成
   * 此方法主要用于：
   * 1. 验证已有坐标是否正确
   * 2. 如果坐标缺失或无效，使用 3 层降级策略补救
   * 
   * @param prediction - 预测结果
   * @param lineContent - 当前行的完整内容（从编辑器获取）
   * @returns 修复后的预测结果
   */
  fix(prediction: Prediction, lineContent?: string): Prediction {
    // 确保 targetLine 是有效的正整数
    if (!prediction.targetLine || prediction.targetLine < 1) {
      console.warn('[CoordinateFixer] Invalid targetLine:', prediction.targetLine);
      prediction.targetLine = 1;
    }

    // 如果没有提供 lineContent，无法进行坐标修复
    if (!lineContent) {
      console.warn('[CoordinateFixer] No lineContent provided, skipping coordinate fix');
      return prediction;
    }

    const changeType = prediction.changeType || 'REPLACE_LINE';
    
    // 检查是否已有完整的坐标信息
    if (changeType === 'REPLACE_WORD' && prediction.wordReplaceInfo) {
      const info = prediction.wordReplaceInfo;
      // 验证坐标是否有效
      if (info.startColumn > 0 && info.endColumn > 0 && info.replacement) {
        console.log('[CoordinateFixer] REPLACE_WORD already has valid info, skipping');
        return prediction;
      }
    }
    
    if (changeType === 'INLINE_INSERT' && prediction.inlineInsertInfo) {
      const info = prediction.inlineInsertInfo;
      // 验证坐标是否有效
      if (info.insertColumn > 0 && info.content) {
        console.log('[CoordinateFixer] INLINE_INSERT already has valid info, skipping');
        return prediction;
      }
    }
    
    // 坐标缺失或无效，使用降级策略补救
    console.log('[CoordinateFixer] Info missing or invalid, applying fallback fix');
    
    switch (changeType) {
      case 'REPLACE_WORD':
        this.fixReplaceWordCoordinates(prediction, lineContent);
        break;
      case 'INLINE_INSERT':
        this.fixInlineInsertCoordinates(prediction, lineContent);
        break;
      case 'REPLACE_LINE':
      case 'INSERT':
      case 'DELETE':
        // 这些类型不需要列坐标修复
        break;
    }

    return prediction;
  }

  /**
   * 修复 REPLACE_WORD 的坐标
   * 使用 3 层降级策略
   */
  private fixReplaceWordCoordinates(prediction: Prediction, lineContent: string): void {
    // 计算替换词
    const originalLine = prediction.originalLineContent || lineContent;
    
    // 优先从 context 中提取替换词
    let replacementWord = '';
    
    if (prediction.context?.target) {
      // 如果有 context，从 suggestionText 中提取替换词
      // 方法：在 suggestionText 中找到 context.before 和 context.after 之间的内容
      const { before, after } = prediction.context;
      
      if (before !== undefined && after !== undefined) {
        const beforeIndex = prediction.suggestionText.indexOf(before);
        if (beforeIndex !== -1) {
          const startIndex = beforeIndex + before.length;
          const afterIndex = after ? prediction.suggestionText.indexOf(after, startIndex) : -1;
          
          if (afterIndex !== -1) {
            replacementWord = prediction.suggestionText.substring(startIndex, afterIndex);
          } else if (!after) {
            // after 为空，取到行尾
            replacementWord = prediction.suggestionText.substring(startIndex);
          }
        }
      }
      
      // 如果上面的方法失败，尝试用 diff 计算
      if (!replacementWord) {
        const diffResult = DiffCalculator.calculateWordReplace(originalLine, prediction.suggestionText);
        if (diffResult) {
          // 如果 diff 检测到的是纯插入（word 为空），说明是追加场景
          // 例如 createUser → createUserInfo，diff 会返回 word="", replacement="Info"
          // 这种情况下，替换词应该是 target + replacement
          if (!diffResult.word && diffResult.replacement) {
            replacementWord = prediction.context.target + diffResult.replacement;
          } else {
            replacementWord = diffResult.replacement;
          }
        }
      }
    } else {
      // 没有 context，使用 diff 计算
      const diffResult = DiffCalculator.calculateWordReplace(originalLine, prediction.suggestionText);
      replacementWord = diffResult?.replacement || '';
    }
    
    // 如果还是没有替换词，检查 suggestionText 是否就是替换词本身
    if (!replacementWord) {
      const suggestionLooksLikeFullLine = prediction.suggestionText.includes(' ') && 
                                          prediction.suggestionText.length > 20;
      if (!suggestionLooksLikeFullLine) {
        replacementWord = prediction.suggestionText;
      }
    }
    
    console.log('[CoordinateFixer] Calculated replacement word:', replacementWord);

    // Layer 1: Context-based matching (优先级最高)
    if (prediction.context) {
      const position = PositionFinder.findByContext(lineContent, prediction.context);
      
      if (position) {
        prediction.wordReplaceInfo = {
          word: prediction.context.target,
          replacement: replacementWord,  // 只使用替换词，不是整行
          startColumn: position.startColumn,
          endColumn: position.endColumn
        };
        console.log('[CoordinateFixer] ✅ Layer 1: Context-based matching succeeded');
        return;
      }
      
      console.warn('[CoordinateFixer] ⚠️ Layer 1 failed, trying Layer 2...');
    }

    // Layer 2: Tree-sitter AST matching
    if (this.treeSitterAnalyzer?.isInitialized() && this.fullCode) {
      // 优先使用 AI 提供的 query 字段
      if (prediction.query) {
        const position = this.treeSitterAnalyzer.findByQuery(this.fullCode, {
          lineNumber: prediction.targetLine,
          nodeType: prediction.query.nodeType,
          value: prediction.query.value,
          parentType: prediction.query.parentType,
          index: prediction.query.index
        });
        
        if (position) {
          prediction.wordReplaceInfo = {
            word: prediction.query.value,
            replacement: replacementWord,  // 只使用替换词，不是整行
            startColumn: position.startColumn,
            endColumn: position.endColumn
          };
          console.log('[CoordinateFixer] ✅ Layer 2: Tree-sitter AST matching succeeded (using query)');
          return;
        }
      }
      
      // 降级：使用 context.target 作为查找依据
      const targetText = prediction.context?.target || this.extractTargetFromDiff(prediction, lineContent);
      
      if (targetText) {
        const position = this.treeSitterAnalyzer.findTargetPosition(
          this.fullCode,
          prediction.targetLine,
          targetText,
          'identifier'  // 默认查找标识符
        );
        
        if (position) {
          prediction.wordReplaceInfo = {
            word: targetText,
            replacement: replacementWord,  // 只使用替换词，不是整行
            startColumn: position.startColumn,
            endColumn: position.endColumn
          };
          console.log('[CoordinateFixer] ✅ Layer 2: Tree-sitter AST matching succeeded (using target)');
          return;
        }
      }
      
      console.warn('[CoordinateFixer] ⚠️ Layer 2 failed, trying Layer 3...');
    }
    
    // Layer 3: fast-diff fallback
    const fallbackOriginalLine = prediction.originalLineContent || lineContent;
    const fallbackDiffResult = DiffCalculator.calculateWordReplace(fallbackOriginalLine, prediction.suggestionText);
    
    if (fallbackDiffResult) {
      prediction.wordReplaceInfo = fallbackDiffResult;
      console.log('[CoordinateFixer] ⚠️ Layer 3: fast-diff fallback succeeded');
    } else {
      console.error('[CoordinateFixer] ❌ All layers failed for REPLACE_WORD');
    }
  }

  /**
   * 修复 INLINE_INSERT 的坐标
   * 使用 3 层降级策略
   */
  private fixInlineInsertCoordinates(prediction: Prediction, lineContent: string): void {
    const originalLine = prediction.originalLineContent || lineContent;
    
    console.log('[CoordinateFixer] 🔧 fixInlineInsertCoordinates:', {
      targetLine: prediction.targetLine,
      originalLine: JSON.stringify(originalLine),
      suggestionText: JSON.stringify(prediction.suggestionText),
      context: prediction.context
    });
    
    // Layer 1: Context-based matching
    if (prediction.context) {
      console.log('[CoordinateFixer] 🔍 Layer 1: Trying Context-based matching');
      console.log('  Context:', {
        before: JSON.stringify(prediction.context.before),
        target: JSON.stringify(prediction.context.target),
        after: JSON.stringify(prediction.context.after)
      });
      
      const position = PositionFinder.findByContext(lineContent, prediction.context);
      
      if (position) {        
        // INLINE_INSERT: 如果 target 为空，插入在 before 之后
        // 如果 target 不为空，插入在 target 之后
        const insertColumn = prediction.context.target === '' 
          ? position.startColumn  // target 为空时，startColumn 就是插入位置
          : position.endColumn;   // target 不为空时，在 target 之后插入
                
        // ⚡ 使用 fast-diff 计算实际插入内容（而不是整行 suggestionText）
        const diffResult = DiffCalculator.calculateInlineInsert(originalLine, prediction.suggestionText);
        const insertContent = diffResult?.content || prediction.suggestionText;
        
        prediction.inlineInsertInfo = {
          content: insertContent,  // ✅ 只包含插入部分，如 ", 35"
          insertColumn: insertColumn
        };

        return;
      } else {
        console.log('  ❌ Position not found by context');
      }
      
      console.warn('[CoordinateFixer] ⚠️ Layer 1 failed, trying Layer 2...');
    } else {
      console.log('[CoordinateFixer] ⏭️ No context provided, skipping Layer 1');
    }

    // Layer 2: Tree-sitter AST matching
    if (this.treeSitterAnalyzer?.isInitialized() && this.fullCode) {
      // 优先使用 AI 提供的 query 字段
      if (prediction.query) {
        const position = this.treeSitterAnalyzer.findByQuery(this.fullCode, {
          lineNumber: prediction.targetLine,
          nodeType: prediction.query.nodeType,
          value: prediction.query.value,
          parentType: prediction.query.parentType,
          index: prediction.query.index
        });
        
        if (position) {
          // ⚡ 使用 fast-diff 计算实际插入内容
          const diffResult = DiffCalculator.calculateInlineInsert(originalLine, prediction.suggestionText);
          const insertContent = diffResult?.content || prediction.suggestionText;
          
          prediction.inlineInsertInfo = {
            content: insertContent,  // ✅ 只包含插入部分
            insertColumn: position.endColumn  // 在目标之后插入
          };
          console.log('[CoordinateFixer] ✅ Layer 2: Tree-sitter AST matching succeeded (using query)');
          return;
        }
      }
      
      // 降级：使用 context.target 作为查找依据
      const targetText = prediction.context?.target;
      
      if (targetText) {
        const position = this.treeSitterAnalyzer.findTargetPosition(
          this.fullCode,
          prediction.targetLine,
          targetText
        );
        
        if (position) {
          // ⚡ 使用 fast-diff 计算实际插入内容
          const diffResult = DiffCalculator.calculateInlineInsert(originalLine, prediction.suggestionText);
          const insertContent = diffResult?.content || prediction.suggestionText;
          
          prediction.inlineInsertInfo = {
            content: insertContent,  // ✅ 只包含插入部分
            insertColumn: position.endColumn  // 在目标之后插入
          };
          console.log('[CoordinateFixer] ✅ Layer 2: Tree-sitter AST matching succeeded (using target)');
          return;
        }
      }
      
      console.warn('[CoordinateFixer] ⚠️ Layer 2 failed, trying Layer 3...');
    }
    
    // Layer 3: fast-diff fallback
    // originalLine 已在函数开头定义
    const inlineInsertInfo = DiffCalculator.calculateInlineInsert(originalLine, prediction.suggestionText);
    
    if (inlineInsertInfo) {
      prediction.inlineInsertInfo = inlineInsertInfo;
      console.log('[CoordinateFixer] ⚠️ Layer 3: fast-diff fallback succeeded');
    } else {
      console.error('[CoordinateFixer] ❌ All layers failed for INLINE_INSERT');
    }
  }

  /**
   * 从 diff 中提取目标文本（用于 Layer 2）
   */
  private extractTargetFromDiff(prediction: Prediction, lineContent: string): string | null {
    const originalLine = prediction.originalLineContent || lineContent;
    const wordReplaceInfo = DiffCalculator.calculateWordReplace(originalLine, prediction.suggestionText);
    
    if (wordReplaceInfo && wordReplaceInfo.word) {
      return wordReplaceInfo.word;
    }
    
    return null;
  }

  /**
   * 验证坐标范围
   */
  validateRange(line: number, totalLines: number): boolean {
    return line >= 1 && line <= totalLines;
  }

  /**
   * 计算相对位置
   */
  calculateRelativePosition(
    currentLine: number,
    targetLine: number
  ): 'above' | 'below' | 'current' {
    if (targetLine < currentLine) return 'above';
    if (targetLine > currentLine) return 'below';
    return 'current';
  }

  /**
   * 检查 Tree-sitter 是否可用
   */
  isTreeSitterAvailable(): boolean {
    return this.treeSitterAnalyzer?.isInitialized() ?? false;
  }
}
