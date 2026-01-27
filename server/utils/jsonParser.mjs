/**
 * JSON 解析容错工具
 * 处理 AI 返回的各种格式问题
 */

/**
 * 解析 AI 返回的 JSON（增强容错）
 */
export function parseAIResponse(content) {
  let parsedResult = null;
  
  try {
    // 处理可能的 Markdown 代码块
    const cleanContent = content.replace(/```json\n|\n```/g, '').trim();
    parsedResult = JSON.parse(cleanContent);
  } catch (e) {
    console.warn('⚠️ JSON parse failed, trying regex extraction');
    
    // 尝试提取 JSON 块
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      let jsonStr = match[0];
      
      try {
        parsedResult = JSON.parse(jsonStr);
      } catch (e2) {
        console.warn('⚠️ JSON extraction failed, trying to fix truncation');
        
        // 尝试修复截断的 JSON
        parsedResult = tryFixTruncatedJSON(jsonStr);
        
        if (!parsedResult) {
          console.error('❌ JSON extraction failed:', e2.message);
          console.error('Raw content (first 500 chars):', content.substring(0, 500));
        }
      }
    }
  }
  
  return parsedResult;
}

/**
 * 尝试修复截断的 JSON
 */
function tryFixTruncatedJSON(jsonStr) {
  // 如果在数组中间截断，补全数组结束符
  if (jsonStr.includes('"predictions"') && !jsonStr.trim().endsWith('}')) {
    // 找到最后一个完整的对象（以 }, 结尾）
    const lastCompleteObj = jsonStr.lastIndexOf('},');
    if (lastCompleteObj > 0) {
      jsonStr = jsonStr.substring(0, lastCompleteObj + 1) + '\n    ]\n}';
      console.log('🔧 Attempting to fix truncated predictions array');
      
      try {
        const result = JSON.parse(jsonStr);
        console.log('✅ Successfully fixed truncated JSON');
        return result;
      } catch (e3) {
        console.error('❌ Fix failed:', e3.message);
      }
    }
  }
  
  return null;
}

/**
 * 格式化预测结果
 */
export function formatPredictionResponse(parsedResult, requestId) {
  if (!parsedResult) {
    console.log('ℹ️ [Slow] No valid JSON response');
    return {
      predictions: [],
      totalCount: 0,
      hasMore: false,
      requestId
    };
  }

  // 记录分析过程 (Chain of Thought)
  if (parsedResult.analysis) {
    console.log('🤔 [AI Analysis]', JSON.stringify(parsedResult.analysis, null, 2));
  }

  // 构建 symptom 对象（从 analysis 提取）
  let symptom = null;
  if (parsedResult.analysis) {
    const analysis = parsedResult.analysis;
    symptom = {
      type: mapChangeTypeToSymptom(analysis.change_type),
      confidence: 0.9, // 默认置信度
      description: analysis.summary || 'Code change detected',
      context: {
        changeType: analysis.change_type,
        impact: analysis.impact,
        pattern: analysis.pattern,
      }
    };
  }

  // 提取预测结果（支持多个 predictions）
  if (parsedResult.predictions && Array.isArray(parsedResult.predictions)) {
    // 多建议模式
    const predictions = parsedResult.predictions.map(pred => ({
      ...pred,
      requestId
    }));
    
    console.log(`✅ [Slow] ${predictions.length} Predictions returned`);
    predictions.forEach((pred, index) => {
      console.log(`  [${index + 1}] Line ${pred.targetLine}: ${pred.explanation} (priority: ${pred.priority || 'N/A'}, confidence: ${pred.confidence})`);
    });
    
    // 显示模式识别结果
    if (parsedResult.analysis?.pattern) {
      console.log(`🔍 [Pattern] ${parsedResult.analysis.pattern}`);
    }
    
    return {
      symptom,
      predictions,
      totalCount: predictions.length,
      hasMore: false,
      requestId
    };
  }
  
  if (parsedResult.prediction) {
    // 兼容旧格式（单个 prediction）
    const prediction = {
      ...parsedResult.prediction,
      requestId,
      priority: 1
    };
    
    console.log(`✅ [Slow] Single Prediction: Line ${prediction.targetLine} (${prediction.explanation})`);
    
    if (parsedResult.analysis?.pattern) {
      console.log(`🔍 [Pattern] ${parsedResult.analysis.pattern}`);
    }
    
    return {
      symptom,
      predictions: [prediction],
      totalCount: 1,
      hasMore: false,
      requestId
    };
  }
  
  console.log('ℹ️ [Slow] AI decided no edit is needed (predictions is null)');
  return {
    symptom,
    predictions: [],
    totalCount: 0,
    hasMore: false,
    requestId
  };
}

/**
 * 映射 AI 的 change_type 到前端的 SymptomType
 */
function mapChangeTypeToSymptom(changeType) {
  const mapping = {
    'fixTypo': 'WORD_FIX',
    'addParameter': 'ADD_PARAMETER',
    'renameFunction': 'RENAME_FUNCTION',
    'renameVariable': 'RENAME_VARIABLE',
    'changeType': 'CHANGE_TYPE',
    'refactorPattern': 'LOGIC_ERROR',
    'other': 'WORD_FIX'
  };
  
  return mapping[changeType] || 'WORD_FIX';
}
