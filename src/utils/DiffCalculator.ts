/**
 * DiffCalculator - 自动计算代码差异和坐标
 * 用于从 originalLineContent 和 suggestionText 中自动提取变更信息
 * 使用 fast-diff 库进行精确的 diff 计算
 */


import diff from 'fast-diff';
import type { WordReplaceInfo, InlineInsertInfo } from '@/types';

export class DiffCalculator {
  /**
   * 计算 REPLACE_WORD 的信息
   * 使用 fast-diff 进行精确的差异计算
   */
  static calculateWordReplace(original: string, suggested: string): WordReplaceInfo | null {
    const diffs = diff(original, suggested);
    
    // 如果完全相同，返回 null
    if (diffs.length === 1 && diffs[0]![0] === 0) {
      return null;
    }

    let currentIndex = 0;
    let startColumn = -1;
    let word = '';
    let replacement = '';
    let hasMultipleChanges = false;

    let hasFinishedChange = false;

    for (const [operation, text] of diffs) {
      if (operation === 0) {
        // 遇到 EQUAL
        if (startColumn !== -1) {
          // 如果已经开始记录变更，说明变更块结束了
          hasFinishedChange = true;
        }
        currentIndex += text.length;
      } else if (operation === -1) {
        // 遇到 DELETE
        if (hasFinishedChange) { 
           // 之前已经结束过一次变更，现在又来了，说明有多处
           return null;
        }
        if (startColumn === -1) {
          startColumn = currentIndex;
        }
        word += text;
        currentIndex += text.length;
      } else if (operation === 1) {
        // 遇到 INSERT
        if (hasFinishedChange) {
           return null;
        }
        if (startColumn === -1) {
          startColumn = currentIndex;
        }
        replacement += text;
      }
    }

    // 如果没有找到差异，返回 null
    if (startColumn === -1 || (!word && !replacement)) {
      return null;
    }
    
    // 如果有多处变更，返回 null（应该用 REPLACE_LINE）
    if (hasMultipleChanges) {
      return null;
    }

    const endColumn = startColumn + word.length;

    return {
      word: word || '',
      replacement: replacement || '',
      startColumn: startColumn + 1, // 转换为 1-based
      endColumn: endColumn + 1 // 转换为 1-based
    };
  }

  /**
   * 计算 INLINE_INSERT 的信息
   * 使用 fast-diff 检测纯插入操作
   */
  static calculateInlineInsert(original: string, suggested: string): InlineInsertInfo | null {
    const diffs = diff(original, suggested);
    
    // 检查是否只有插入操作（没有删除）
    let hasDelete = false;
    let insertContent = '';
    let insertPosition = -1;
    let currentIndex = 0;
    
    let hasInsertionBlock = false;
    let hasFinishedInsertion = false;

    for (const [operation, text] of diffs) {
      if (operation === -1) {
        hasDelete = true;
        break;
      } else if (operation === 0) {
        if (hasInsertionBlock) {
           hasFinishedInsertion = true;
        }
        currentIndex += text.length;
      } else if (operation === 1) {
        if (hasFinishedInsertion) {
           // 多处插入，不符合单次 INLINE_INSERT
           return null;
        }
        if (!hasInsertionBlock) {
          insertPosition = currentIndex;
          hasInsertionBlock = true;
        }
        insertContent += text;
      }
    }

    // 如果有删除操作，不是纯插入；如果没有插入内容，也不能叫插入
    if (hasDelete || !insertContent) {
      return null;
    }

    return {
      content: insertContent,
      insertColumn: insertPosition + 1 // 转换为 1-based
    };
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
