/**
 * DiffCalculator - 自动计算代码差异和坐标
 * 用于从 originalLineContent 和 suggestionText 中自动提取变更信息
 */

import type { WordReplaceInfo, InlineInsertInfo } from '../types/index';

export class DiffCalculator {
  /**
   * 计算 REPLACE_WORD 的信息
   */
  static calculateWordReplace(original: string, suggested: string): WordReplaceInfo | null {
    // 找到第一个不同的字符位置
    let startIndex = 0;
    while (startIndex < Math.min(original.length, suggested.length) && 
           original[startIndex] === suggested[startIndex]) {
      startIndex++;
    }

    // 如果完全相同，返回 null
    if (startIndex === original.length && startIndex === suggested.length) {
      return null;
    }

    // 从后往前找到第一个不同的字符位置
    let endIndexOriginal = original.length - 1;
    let endIndexSuggested = suggested.length - 1;
    
    while (endIndexOriginal >= startIndex && 
           endIndexSuggested >= startIndex &&
           original[endIndexOriginal] === suggested[endIndexSuggested]) {
      endIndexOriginal--;
      endIndexSuggested--;
    }

    // 提取被替换的单词和替换后的单词
    const word = original.substring(startIndex, endIndexOriginal + 1);
    const replacement = suggested.substring(startIndex, endIndexSuggested + 1);

    return {
      word,
      replacement,
      startColumn: startIndex + 1, // 转换为 1-based
      endColumn: endIndexOriginal + 2 // 转换为 1-based，指向最后一个字符之后
    };
  }

  /**
   * 计算 INLINE_INSERT 的信息
   */
  static calculateInlineInsert(original: string, suggested: string): InlineInsertInfo | null {
    // 找到第一个不同的字符位置
    let startIndex = 0;
    while (startIndex < Math.min(original.length, suggested.length) && 
           original[startIndex] === suggested[startIndex]) {
      startIndex++;
    }

    // 从后往前找到第一个不同的字符位置
    let endIndexOriginal = original.length - 1;
    let endIndexSuggested = suggested.length - 1;
    
    while (endIndexOriginal >= startIndex && 
           endIndexSuggested >= startIndex &&
           original[endIndexOriginal] === suggested[endIndexSuggested]) {
      endIndexOriginal--;
      endIndexSuggested--;
    }

    // 检查是否是纯插入（原始内容没有被删除）
    if (endIndexOriginal < startIndex) {
      // 纯插入
      const content = suggested.substring(startIndex, endIndexSuggested + 1);
      return {
        content,
        insertColumn: startIndex + 1 // 转换为 1-based
      };
    }

    return null;
  }

  /**
   * 自动检测变更类型并计算相关信息
   */
  static detectChangeType(original: string, suggested: string): {
    changeType: 'REPLACE_WORD' | 'INLINE_INSERT' | 'REPLACE_LINE';
    wordReplaceInfo?: WordReplaceInfo;
    inlineInsertInfo?: InlineInsertInfo;
  } {
    // 尝试检测 INLINE_INSERT
    const inlineInsert = this.calculateInlineInsert(original, suggested);
    if (inlineInsert) {
      return {
        changeType: 'INLINE_INSERT',
        inlineInsertInfo: inlineInsert
      };
    }

    // 尝试检测 REPLACE_WORD
    const wordReplace = this.calculateWordReplace(original, suggested);
    if (wordReplace) {
      // 检查是否只有一个连续的 token 改变
      const hasSpaceInWord = wordReplace.word.includes(' ') || wordReplace.replacement.includes(' ');
      const hasMultipleTokens = wordReplace.word.split(/\s+/).length > 1 || 
                                wordReplace.replacement.split(/\s+/).length > 1;
      
      if (!hasSpaceInWord && !hasMultipleTokens) {
        return {
          changeType: 'REPLACE_WORD',
          wordReplaceInfo: wordReplace
        };
      }
    }

    // 默认为 REPLACE_LINE
    return {
      changeType: 'REPLACE_LINE'
    };
  }
}
