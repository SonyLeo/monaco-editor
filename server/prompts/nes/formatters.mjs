/**
 * NES Formatters - Optimized Version
 * 
 * Best Practices Applied:
 * 1. Semantic Enrichment - Add context meaning to data
 * 2. Consistent Formatting - Structured, readable output
 * 3. Truncation with Indicators - Handle long content gracefully
 * 4. Empty State Handling - Clear messages for missing data
 */

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncate(text, maxLength = 50) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format timestamp to readable time
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted time
 */
function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return 'unknown';
  }
}

/**
 * Get semantic label for edit context
 * @param {Object} context - Edit context
 * @returns {string} Semantic label
 */
function getSemanticLabel(context) {
  if (!context?.semanticType) return '';
  
  const labels = {
    functionName: '📦 Function Name',
    variableName: '📝 Variable',
    parameter: '📥 Parameter',
    property: '🔧 Property',
    typeName: '📐 Type',
    className: '🏛️ Class',
    methodName: '⚡ Method',
    import: '📦 Import',
    export: '📤 Export',
    other: ''
  };
  
  return labels[context.semanticType] || '';
}

/**
 * Format edit type to action word
 * @param {string} type - Edit type
 * @returns {string} Action word
 */
function formatEditType(type) {
  const actions = {
    insert: '➕ insert',
    delete: '➖ delete',
    replace: '🔄 replace'
  };
  return actions[type] || type;
}

/**
 * Format edit history for NES prompt
 * Includes semantic information and clear structure
 * 
 * @param {Array} history - Edit history array
 * @returns {string} Formatted history text
 */
export function formatEditHistory(history) {
  if (!history || history.length === 0) {
    return `No edit history available.
This may be the first edit or history was cleared.
Analyze the code window for inconsistencies or incomplete patterns.`;
  }

  const entries = history.map((edit, index) => {
    const time = formatTime(edit.timestamp);
    const action = formatEditType(edit.type);
    const semantic = getSemanticLabel(edit.context);
    
    let entry = `[${index + 1}] ${time} | Line ${edit.lineNumber}:${edit.column}
    Action: ${action}
    Old: "${truncate(edit.oldText, 60)}"
    New: "${truncate(edit.newText, 60)}"`;
    
    if (semantic) {
      entry += `\n    Context: ${semantic}`;
    }
    
    if (edit.context?.lineContent) {
      entry += `\n    Full Line: ${truncate(edit.context.lineContent, 80)}`;
    }
    
    return entry;
  });

  return entries.join('\n\n');
}

/**
 * Format user feedback for learning
 * 
 * @param {Array} feedback - User feedback array
 * @returns {string} Formatted feedback text
 */
export function formatUserFeedback(feedback) {
  if (!feedback || feedback.length === 0) {
    return 'No previous feedback available.';
  }

  const entries = feedback.map((fb, index) => {
    const time = formatTime(fb.timestamp);
    const actionEmoji = {
      accepted: '✅ Accepted',
      skipped: '⏭️ Skipped',
      rejected: '❌ Rejected',
      modified: '✏️ Modified'
    }[fb.action] || fb.action;
    
    return `[${index + 1}] ${time} | Line ${fb.targetLine}
    Result: ${actionEmoji}
    Suggestion: "${truncate(fb.suggestionText, 60)}"${
      fb.reason ? `\n    Reason: ${fb.reason}` : ''
    }`;
  });

  return entries.join('\n\n');
}

/**
 * Enhance recent change description with semantic context
 * 
 * @param {string} diffSummary - Diff summary from symptom detector
 * @param {Array} editHistory - Edit history for context
 * @returns {string} Enhanced description
 */
export function enhanceRecentChange(diffSummary, editHistory) {
  // Empty edit history
  if (!editHistory || editHistory.length === 0) {
    return `${diffSummary || 'Code change detected'}

Note: No edit history available. This may be the first edit in this session.
Analyze the code window carefully to identify any inconsistencies or incomplete patterns.`;
  }

  const latestEdit = editHistory[editHistory.length - 1];
  const semantic = latestEdit.context?.semanticType;
  
  // Single edit with semantic context
  if (editHistory.length === 1 && semantic && semantic !== 'other') {
    const semanticLabels = {
      functionName: 'function name',
      variableName: 'variable name',
      parameter: 'function parameter',
      property: 'object/class property',
      typeName: 'type annotation',
      className: 'class name',
      methodName: 'method name'
    };
    
    const label = semanticLabels[semantic] || semantic;
    return `${diffSummary}

Semantic Context: User modified a ${label}
  From: "${latestEdit.oldText}"
  To: "${latestEdit.newText}"
  
Consider: What other locations might reference this ${label}?`;
  }

  // Multiple edits - detect pattern
  if (editHistory.length >= 2) {
    const edits = editHistory.slice(-3); // Last 3 edits
    const sameType = edits.every(e => e.context?.semanticType === semantic);
    
    if (sameType && semantic) {
      return `${diffSummary}

Pattern Detected: Multiple ${semantic} modifications
Recent changes suggest a rename/refactor operation.
User may be manually updating multiple occurrences.`;
    }
  }

  return diffSummary || 'Code change detected';
}

/**
 * Format code window with line numbers
 * 
 * @param {string} codeWindow - Code window content
 * @param {Object} windowInfo - Window information {startLine, totalLines}
 * @returns {string} Formatted code with line numbers
 */
export function formatCodeWindow(codeWindow, windowInfo) {
  if (!codeWindow) return '// Empty code window';
  
  const lines = codeWindow.split('\n');
  const startLine = windowInfo?.startLine || 1;
  
  // Calculate padding for line numbers
  const maxLineNum = startLine + lines.length - 1;
  const padding = String(maxLineNum).length;
  
  return lines
    .map((line, i) => {
      const lineNum = String(startLine + i).padStart(padding, ' ');
      return `${lineNum}: ${line}`;
    })
    .join('\n');
}

/**
 * Format prediction for logging/debugging
 * 
 * @param {Object} prediction - Prediction object
 * @returns {string} Formatted prediction
 */
export function formatPrediction(prediction) {
  if (!prediction) return 'null';
  
  return `Line ${prediction.targetLine} (${prediction.changeType})
  Original: "${truncate(prediction.originalLineContent, 50)}"
  Suggested: "${truncate(prediction.suggestionText, 50)}"
  Confidence: ${(prediction.confidence * 100).toFixed(0)}%
  Explanation: ${prediction.explanation}`;
}
