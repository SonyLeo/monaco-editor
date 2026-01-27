/**
 * NES 事件处理器
 * 负责处理编辑事件和光标变化
 */

import * as monaco from 'monaco-editor';
import type { Prediction } from '../../types/nes';
import { SuggestionQueue } from './SuggestionQueue';

export class NESEventHandler {
  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    private suggestionQueue: SuggestionQueue
  ) {}

  /**
   * 判断编辑是否来自当前建议
   */
  isEditFromSuggestion(
    e: monaco.editor.IModelContentChangedEvent,
    applyingSuggestionLine: number | null,
    currentPrediction: Prediction | null
  ): boolean {
    // 如果有标记，说明正在应用建议
    if (applyingSuggestionLine !== null) {
      const isMatchingLine = e.changes.some(
        (change) =>
          change.range.startLineNumber === applyingSuggestionLine,
      );

      if (isMatchingLine) {
        console.log(
          '[NESEventHandler] 🎯 Detected edit from suggestion (via marker)',
        );
        return true;
      }
    }

    // 备用检查：检查上一个接受的建议
    if (!currentPrediction) return false;

    return e.changes.some((change) => {
      const isTargetLine =
        change.range.startLineNumber === currentPrediction.targetLine;

      const changeText = change.text.replace(/\s+/g, '');
      const suggestionText = currentPrediction.suggestionText.replace(
        /\s+/g,
        '',
      );
      const containsSuggestion =
        changeText.includes(suggestionText) ||
        suggestionText.includes(changeText);

      return isTargetLine && containsSuggestion;
    });
  }

  /**
   * 判断编辑是否在队列范围内
   */
  isEditInQueueRange(e: monaco.editor.IModelContentChangedEvent): boolean {
    const queueLines = this.suggestionQueue.getAllLines();
    return e.changes.some((change) =>
      queueLines.includes(change.range.startLineNumber),
    );
  }

  /**
   * 处理光标位置变化
   */
  handleCursorChange(
    currentPrediction: Prediction | null,
    onHintBarUpdate: (prediction: Prediction) => void
  ): void {
    if (!currentPrediction) return;

    const position = this.editor.getPosition();
    if (!position) return;

    const isOnLine = position.lineNumber === currentPrediction.targetLine;
    
    if (isOnLine) {
      onHintBarUpdate(currentPrediction);
    }
  }

  /**
   * 跳转到建议位置
   */
  jumpToSuggestion(prediction: Prediction): void {
    const model = this.editor.getModel();
    if (!model) return;

    const targetLine = prediction.targetLine;
    const lineContent = model.getLineContent(targetLine);

    // 智能查找光标位置
    let targetColumn = 1;

    if (prediction.originalLineContent && prediction.suggestionText) {
      const original = prediction.originalLineContent.trim();
      const suggestion = prediction.suggestionText.trim();

      let diffIndex = 0;
      const minLength = Math.min(original.length, suggestion.length);

      for (let i = 0; i < minLength; i++) {
        if (original[i] !== suggestion[i]) {
          diffIndex = i;
          break;
        }
      }

      const trimmedLine = lineContent.trim();
      const leadingSpaces = lineContent.length - trimmedLine.length;
      targetColumn = leadingSpaces + diffIndex + 1;
    } else {
      const match = lineContent.match(/\S/);
      targetColumn = match ? match.index! + 1 : 1;
    }

    this.editor.setPosition({
      lineNumber: targetLine,
      column: targetColumn,
    });

    this.editor.revealLineInCenter(targetLine);
  }
}
