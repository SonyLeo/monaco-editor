/**
 * SymptomDetector V2
 * 基于 Monaco 语义分析的症状检测器
 * 
 * 改进：
 * 1. 使用 TypeScript Language Service 进行语义分析
 * 2. 精准区分函数定义、调用、对象、数组等上下文
 * 3. 利用符号引用关系提高检测准确率
 * 4. 减少误判和漏检
 */

import * as monaco from 'monaco-editor';
import type { EditRecord } from '../../types/nes';
import type { Symptom } from '../../types/dispatcher';
import { CodeParser } from '../utils/CodeParser';
import { SemanticAnalyzer } from '../utils/SemanticAnalyzer';

export class SymptomDetector {
  private semanticAnalyzer: SemanticAnalyzer | null = null;

  /**
   * 设置 Monaco Model（用于语义分析）
   */
  setModel(model: monaco.editor.ITextModel): void {
    this.semanticAnalyzer = new SemanticAnalyzer(model);
  }

  /**
   * 检测症状
   * @param editHistory 最近的编辑历史
   * @returns 检测到的症状，如果没有则返回 null
   */
  async detect(editHistory: EditRecord[]): Promise<Symptom | null> {
    if (editHistory.length === 0) {
      return null;
    }

    // 如果没有语义分析器，回退到简单检测
    if (!this.semanticAnalyzer) {
      console.warn('[SymptomDetector] No semantic analyzer, using simple detection');
      return this.detectSimple(editHistory);
    }

    // 按优先级检测症状（使用语义分析）
    
    // 1. 函数签名改变（高优先级）
    const functionSignature = await this.detectFunctionSignatureChange(editHistory);
    if (functionSignature) return functionSignature;

    // 2. 变量/函数重命名（高优先级）
    const rename = await this.detectRename(editHistory);
    if (rename) return rename;

    // 3. 类型改变（中优先级）
    const typeChange = await this.detectTypeChange(editHistory);
    if (typeChange) return typeChange;

    // 4. 逻辑错误（高优先级）
    const logicError = this.detectLogicError(editHistory);
    if (logicError) return logicError;

    // 5. 单词拼写错误（中优先级）
    const wordFix = this.detectWordFix(editHistory);
    if (wordFix) return wordFix;

    return null;
  }

  /**
   * 检测函数签名改变（使用语义分析 + 多层防护）
   */
  private async detectFunctionSignatureChange(edits: EditRecord[]): Promise<Symptom | null> {
    if (!this.semanticAnalyzer) return null;

    const latestEdit = edits[edits.length - 1];
    if (!latestEdit) return null;

    // ✅ 优化 1：检查编辑稳定性
    // 如果最近 300ms 内有多次编辑，说明用户还在快速输入
    const recentEdits = edits.filter(e => 
      Date.now() - e.timestamp < 300 &&
      e.lineNumber === latestEdit.lineNumber
    );
    
    if (recentEdits.length > 2) {
      console.log('[SymptomDetector] User is still typing, skip signature detection');
      return null;
    }

    const position = new monaco.Position(
      latestEdit.lineNumber,
      latestEdit.column
    );

    // 1. 检查是否在函数定义中
    const contextType = this.semanticAnalyzer.getContextType(position);
    if (contextType !== 'function-definition') {
      return null;
    }

    // 2. 获取函数信息
    const functionInfo = await this.semanticAnalyzer.getFunctionInfo(position);
    if (!functionInfo) return null;

    // ✅ 优化 2：检查函数名是否合理
    if (functionInfo.name.length < 3) {
      console.log('[SymptomDetector] Function name too short, skip signature detection');
      return null;
    }

    // 3. 检测参数增加
    if (this.hasParameterAddition(latestEdit, contextType)) {
      console.log('[SymptomDetector] ✅ Detected parameter addition (semantic)');
      
      return {
        type: 'ADD_PARAMETER',
        confidence: 0.95, // 语义分析提高信心度
        description: `Function '${functionInfo.name}' parameter added`,
        affectedLine: latestEdit.lineNumber,
        context: {
          functionName: functionInfo.name,
          newValue: latestEdit.newText,
        }
      };
    }

    // 4. 检测参数删除
    if (this.hasParameterRemoval(latestEdit, contextType)) {
      console.log('[SymptomDetector] ✅ Detected parameter removal (semantic)');
      
      return {
        type: 'REMOVE_PARAMETER',
        confidence: 0.9,
        description: `Function '${functionInfo.name}' parameter removed`,
        affectedLine: latestEdit.lineNumber,
        context: {
          functionName: functionInfo.name,
          oldValue: latestEdit.oldText,
        }
      };
    }

    return null;
  }

  /**
   * 检测重命名（使用语义分析 + 多层防护）
   */
  private async detectRename(edits: EditRecord[]): Promise<Symptom | null> {
    if (!this.semanticAnalyzer) return null;

    const latestEdit = edits[edits.length - 1];
    if (!latestEdit) return null;

    // ✅ 优化 1：检查新名称是否合理（防止误触发）
    if (latestEdit.newText) {
      // 不是有效的标识符
      const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(latestEdit.newText);
      if (!isValidIdentifier) {
        console.log('[SymptomDetector] Invalid identifier, skip rename detection');
        return null;
      }
    }

    // ✅ 优化 2：检查编辑稳定性（防止快速输入时触发）
    // 如果最近 300ms 内有多次编辑，说明用户还在快速输入
    const recentEdits = edits.filter(e => 
      Date.now() - e.timestamp < 300 &&
      e.lineNumber === latestEdit.lineNumber
    );
    
    if (recentEdits.length > 2) {
      console.log('[SymptomDetector] User is still typing, skip rename detection');
      return null;
    }

    // ✅ 优化 3：检查是否是完整替换（真正的重命名）
    const isCompleteReplace = 
      latestEdit.type === 'replace' && 
      latestEdit.oldText && 
      latestEdit.newText &&
      latestEdit.oldText.length >= 3 &&  // 旧名称也要合理
      latestEdit.oldText !== latestEdit.newText;

    if (!isCompleteReplace) {
      // 不是完整替换，检查是否是连续编辑
      const identifierEdits = edits.filter(edit => 
        edit.context?.semanticType === 'variableName' ||
        edit.context?.semanticType === 'parameter' ||
        edit.context?.semanticType === 'functionName'
      );

      // 连续编辑次数太少，可能还在输入
      if (identifierEdits.length < 3) {
        console.log('[SymptomDetector] Not enough edits, skip rename detection');
        return null;
      }
    }

    // 继续原有的语义分析
    const position = new monaco.Position(
      latestEdit.lineNumber,
      latestEdit.column
    );

    // 1. 获取符号信息
    const symbolInfo = await this.semanticAnalyzer.getSymbolAtPosition(position);
    if (!symbolInfo) return null;

    // 2. 查找所有引用
    const references = await this.semanticAnalyzer.findReferences(position);
    
    if (references.length === 0) {
      // 没有引用，可能是局部变量
      return null;
    }

    console.log(`[SymptomDetector] ✅ Detected rename with ${references.length} references (semantic)`);

    // 3. 根据符号类型返回症状
    if (symbolInfo.kind === 'function') {
      return {
        type: 'RENAME_FUNCTION',
        confidence: 0.95,
        description: `Function '${latestEdit.oldText}' renamed to '${latestEdit.newText}' (${references.length} references)`,
        affectedLine: latestEdit.lineNumber,
        context: {
          oldValue: latestEdit.oldText,
          newValue: latestEdit.newText,
          functionName: latestEdit.newText,
        }
      };
    }

    if (symbolInfo.kind === 'variable' || symbolInfo.kind === 'parameter') {
      return {
        type: 'RENAME_VARIABLE',
        confidence: 0.95,
        description: `Variable '${latestEdit.oldText}' renamed to '${latestEdit.newText}' (${references.length} references)`,
        affectedLine: latestEdit.lineNumber,
        context: {
          oldValue: latestEdit.oldText,
          newValue: latestEdit.newText,
          variableName: latestEdit.newText,
        }
      };
    }

    return null;
  }

  /**
   * 检测类型改变（使用语义分析）
   */
  private async detectTypeChange(edits: EditRecord[]): Promise<Symptom | null> {
    if (!this.semanticAnalyzer) return null;

    const latestEdit = edits[edits.length - 1];
    if (!latestEdit) return null;

    const position = new monaco.Position(
      latestEdit.lineNumber,
      latestEdit.column
    );

    // 1. 检查是否是类型注解变化
    const isTypeChange = this.semanticAnalyzer.isTypeAnnotationChange(
      position,
      latestEdit.oldText,
      latestEdit.newText
    );

    if (!isTypeChange) return null;

    // 2. 提取类型信息
    const oldType = CodeParser.extractType(latestEdit.oldText);
    const newType = CodeParser.extractType(latestEdit.newText);

    if (!oldType || !newType || oldType === newType) {
      return null;
    }

    console.log('[SymptomDetector] ✅ Detected type change (semantic)');

    return {
      type: 'CHANGE_TYPE',
      confidence: 0.9,
      description: `Type changed from ${oldType} to ${newType}`,
      affectedLine: latestEdit.lineNumber,
      context: {
        oldValue: oldType,
        newValue: newType,
      }
    };
  }

  /**
   * 检测逻辑错误
   */
  private detectLogicError(edits: EditRecord[]): Symptom | null {
    const latestEdit = edits[edits.length - 1];
    if (!latestEdit) return null;
    
    const line = latestEdit.context?.lineContent || '';

    // 检测三元运算符可能的错误
    const ternaryMatch = line.match(/(\w+)\s*([><=!]+)\s*(\w+)\s*\?\s*(\w+)\s*:\s*(\w+)/);
    if (ternaryMatch) {
      const [, left, op, right, trueVal, falseVal] = ternaryMatch;
      
      if (op && op.includes('>') && trueVal === right && falseVal === left) {
        return {
          type: 'LOGIC_ERROR',
          confidence: 0.8,
          description: 'Possible ternary operator logic error',
          affectedLine: latestEdit.lineNumber
        };
      }
    }

    return null;
  }

  /**
   * 检测单词拼写错误
   */
  private detectWordFix(edits: EditRecord[]): Symptom | null {
    const latestEdit = edits[edits.length - 1];
    if (!latestEdit) return null;
    
    const line = latestEdit.context?.lineContent || '';

    const typo = CodeParser.hasKeywordTypo(line);
    if (typo) {
      return {
        type: 'WORD_FIX',
        confidence: 0.95,
        description: `Typo detected: "${typo.wrong}" should be "${typo.correct}"`,
        affectedLine: latestEdit.lineNumber,
        context: {
          oldValue: typo.wrong,
          newValue: typo.correct
        }
      };
    }

    return null;
  }

  /**
   * 检测参数增加（使用上下文类型）
   */
  private hasParameterAddition(
    edit: EditRecord,
    contextType: string
  ): boolean {
    // 必须在函数定义中
    if (contextType !== 'function-definition') {
      return false;
    }

    // 检查是否插入了逗号或参数模式
    return edit.type === 'insert' && 
           (edit.newText.includes(',') || /\w+\s*:\s*\w+/.test(edit.newText));
  }

  /**
   * 检测参数删除（使用上下文类型）
   */
  private hasParameterRemoval(
    edit: EditRecord,
    contextType: string
  ): boolean {
    // 必须在函数定义中
    if (contextType !== 'function-definition') {
      return false;
    }

    // 检查是否删除了逗号或参数模式
    return edit.type === 'delete' && 
           (edit.oldText.includes(',') || /\w+\s*:\s*\w+/.test(edit.oldText));
  }

  /**
   * 简单检测（回退方案，不使用语义分析）
   */
  private detectSimple(editHistory: EditRecord[]): Symptom | null {
    const latestEdit = editHistory[editHistory.length - 1];
    if (!latestEdit) return null;

    const line = latestEdit.context?.lineContent || '';

    // 简单的函数签名检测
    if (CodeParser.isFunctionDefinition(line)) {
      if (latestEdit.type === 'insert' && latestEdit.newText.includes(',')) {
        return {
          type: 'ADD_PARAMETER',
          confidence: 0.7,
          description: 'Function signature changed: parameter added',
          affectedLine: latestEdit.lineNumber,
          context: {
            functionName: CodeParser.extractFunctionName(line)
          }
        };
      }
    }

    // 简单的拼写检测
    const typo = CodeParser.hasKeywordTypo(line);
    if (typo) {
      return {
        type: 'WORD_FIX',
        confidence: 0.95,
        description: `Typo detected: "${typo.wrong}" should be "${typo.correct}"`,
        affectedLine: latestEdit.lineNumber,
        context: {
          oldValue: typo.wrong,
          newValue: typo.correct
        }
      };
    }

    return null;
  }
}
