import express from 'express';
import cors from 'cors';
import { getConfig } from './server/config.mjs';
import { API_ENDPOINTS } from './server/constants.mjs';

// 获取并验证配置
const config = getConfig();

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// ⚡ Fast Track: 代码补全
app.post('/api/completion', async (req, res) => {
  try {
    const { prefix, suffix, max_tokens = 64 } = req.body;
    
    console.log(`⚡ [Fast] Completion request (${prefix?.length || 0} chars prefix)`);

    // 直接调用 DeepSeek API (简化版 - 不使用 Beta FIM，使用标准接口)
    const isDeepSeek = config.provider === 'deepseek';
    const apiUrl = isDeepSeek
      ? 'https://api.deepseek.com/v1/chat/completions'
      : 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: isDeepSeek ? 'deepseek-coder' : 'qwen2.5-coder-7b-instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a code completion assistant. Complete the code at the cursor position. Return ONLY the completion text, no explanations.'
          },
          {
            role: 'user',
            content: `Complete the following code:\n\n${prefix}[CURSOR]${suffix}\n\nComplete at [CURSOR]. Return only the code to insert.`
          }
        ],
        max_tokens,
        temperature: 0,
        stop: ['\n\n', '\n\n\n']
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const completion = data.choices?.[0]?.message?.content || '';

    res.json({ completion: completion.trim() });
  } catch (error) {
    console.error('❌ [Fast] Error:', error.message);
    res.status(500).json({
      error: 'Completion failed',
      message: error.message
    });
  }
});

// 健康检查端点
app.get(API_ENDPOINTS.HEALTH, (req, res) => {
  res.json({
    status: 'ok',
    message: `NES Dual Engine Server`,
    provider: config.provider,
    mode: 'Fast + Slow Engine'
  });
});

// 🧠 Slow Track: NES 预测
app.post('/api/next-edit-prediction', async (req, res) => {
  try {
    const { codeWindow, windowInfo, diffSummary, editHistory, userFeedback, requestId } = req.body;

    console.log(`🧠 [Slow] NES Prediction (Request ID: ${requestId})`);
    
    // 🆕 详细日志：显示发送给 AI 的完整数据
    console.log('📦 [Request Data]');
    console.log('  diffSummary:', diffSummary);
    console.log('  editHistory:', editHistory ? `${editHistory.length} edits` : 'none');
    console.log('  userFeedback:', userFeedback ? `${userFeedback.length} feedback(s)` : 'none');
    if (editHistory && editHistory.length > 0) {
      console.log('  Latest edit:', JSON.stringify(editHistory[editHistory.length - 1], null, 2));
    }
    if (userFeedback && userFeedback.length > 0) {
      console.log('  Recent feedback:', userFeedback.map(f => `${f.action} at line ${f.targetLine}`).join(', '));
    }
    console.log('  codeWindow lines:', codeWindow.split('\n').length);

    if (!codeWindow || !diffSummary) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 🔧 优化后的 System Prompt (Zod + Continue 风格)
    const systemPrompt = `You are an intelligent code refactoring assistant.

### INSTRUCTIONS
Your task is to predict **ALL necessary edits** based on recent code changes and editing patterns.
You must analyze the "EDIT HISTORY" to identify patterns, then find **ALL locations** in the "CODE WINDOW" that need to be updated.

### STRICT OUTPUT SCHEMA (TypeScript Interface)
You must output a single valid JSON object satisfying this interface. Do not include markdown or comments.

\`\`\`typescript
interface Response {
  // Step 1: Analyze the change (Chain of Thought)
  analysis: {
    change_type: "addParameter" | "renameFunction" | "renameVariable" | "changeType" | "refactorPattern" | "other";
    summary: string; // e.g. "Function 'createUser' renamed to 'createUser123' across 3 edits"
    impact: string;  // e.g. "Need to update all calls to 'createUser123' with the new name"
    pattern: string; // e.g. "Sequential rename pattern detected" or "Parameter addition pattern"
  };

  // Step 2: ALL predictions (or null if no edits needed)
  // Return null if no edits are needed
  // Return array of predictions if multiple edits are needed (MAX 5)
  predictions: Array<{
    targetLine: number;           // 1-based line number in CODE WINDOW
    originalLineContent: string;  // MUST match character-for-character, otherwise REJECTED
    suggestionText: string;       // The complete new line content
    explanation: string;          // Short rationale for user
    confidence: number;           // 0.0 to 1.0
    priority: number;             // 1 (highest) to 5 (lowest) - order of importance
  }> | null;
}
\`\`\`

### RULES
1. **Exact Match**: \`originalLineContent\` must be an exact substring of the provided code window. Even a single space difference will cause validation failure.
2. **Pattern Recognition**: Use edit history to identify patterns (e.g., renaming multiple occurrences, adding parameters to multiple functions).
3. **Find ALL**: Return ALL locations that need to be updated, not just one. Maximum 5 predictions.
4. **Prioritize**: Assign priority based on importance (1=most critical, 5=least critical).
5. **Safety**: If no edits are needed, return \`predictions: null\`.

### EXAMPLES

user:
<edit_history>
[1] 10:30:15 | Line 5:10
   Action: replace
   Old: "createUser"
   New: "createUser123"
   Context: functionName
   Line: function createUser123(name: string) {
</edit_history>
<recent_change>
Renamed function 'createUser' to 'createUser123'
</recent_change>
<code_window>
5: function createUser123(name: string) {
6:   return { name };
7: }
8:
9: const user1 = createUser("Alice");
10: const user2 = createUser("Bob");
11: const user3 = createUser("Charlie");
</code_window>

assistant:
{
  "analysis": {
    "change_type": "renameFunction",
    "summary": "Function 'createUser' renamed to 'createUser123'",
    "impact": "Need to update all 3 function calls to use the new name",
    "pattern": "Function rename - all usages must be updated"
  },
  "predictions": [
    {
      "targetLine": 9,
      "originalLineContent": "const user1 = createUser(\\"Alice\\");",
      "suggestionText": "const user1 = createUser123(\\"Alice\\");",
      "explanation": "Update function call to match renamed function",
      "confidence": 0.95,
      "priority": 1
    },
    {
      "targetLine": 10,
      "originalLineContent": "const user2 = createUser(\\"Bob\\");",
      "suggestionText": "const user2 = createUser123(\\"Bob\\");",
      "explanation": "Update function call to match renamed function",
      "confidence": 0.95,
      "priority": 1
    },
    {
      "targetLine": 11,
      "originalLineContent": "const user3 = createUser(\\"Charlie\\");",
      "suggestionText": "const user3 = createUser123(\\"Charlie\\");",
      "explanation": "Update function call to match renamed function",
      "confidence": 0.95,
      "priority": 1
    }
  ]
}`;

    // 🔧 格式化编辑历史（增强版：显示语义信息）
    const formatEditHistory = (history) => {
      if (!history || history.length === 0) {
        return 'No edit history available (first edit or history cleared)';
      }

      return history.map((edit, index) => {
        const time = new Date(edit.timestamp).toLocaleTimeString();
        const truncate = (text, max = 50) => {
          if (!text) return '';
          return text.length > max ? text.substring(0, max) + '...' : text;
        };

        // 🆕 添加语义信息
        let semanticInfo = '';
        if (edit.context && edit.context.semanticType && edit.context.semanticType !== 'other') {
          semanticInfo = `\n   Context: ${edit.context.semanticType}`;
        }

        // 🆕 显示完整行内容（帮助 AI 理解上下文）
        let lineInfo = '';
        if (edit.context && edit.context.lineContent) {
          lineInfo = `\n   Line: ${truncate(edit.context.lineContent, 80)}`;
        }

        return `[${index + 1}] ${time} | Line ${edit.lineNumber}:${edit.column}
   Action: ${edit.type}
   Old: "${truncate(edit.oldText)}"
   New: "${truncate(edit.newText)}"${semanticInfo}${lineInfo}`;
      }).join('\n\n');
    };

    // 🆕 智能降级：如果编辑历史为空或太少，增强 recent_change 的描述
    let enhancedRecentChange = diffSummary;
    if (!editHistory || editHistory.length === 0) {
      // 尝试从 diffSummary 中提取更多信息
      enhancedRecentChange = `${diffSummary}\n\nNote: This is the first edit or edit history is unavailable. Analyze the code window carefully to find inconsistencies.`;
    } else if (editHistory.length === 1) {
      // 只有一次编辑，添加更多上下文
      const edit = editHistory[0];
      if (edit.context && edit.context.semanticType) {
        enhancedRecentChange = `${diffSummary}\n\nContext: User modified a ${edit.context.semanticType} from "${edit.oldText}" to "${edit.newText}"`;
      }
    }

    // 🆕 格式化用户反馈
    const formatUserFeedback = (feedback) => {
      if (!feedback || feedback.length === 0) {
        return 'No user feedback available';
      }

      return feedback.map((fb, index) => {
        const time = new Date(fb.timestamp).toLocaleTimeString();
        const actionEmoji = fb.action === 'accepted' ? '✅' : fb.action === 'skipped' ? '⏭️' : '❌';
        return `[${index + 1}] ${time} | Line ${fb.targetLine}
   Action: ${actionEmoji} ${fb.action}
   Suggestion: "${fb.suggestionText.substring(0, 60)}..."`;
      }).join('\n\n');
    };

    // 🔧 Continue 风格的 User Prompt (XML Tags)
    const userPrompt = `<edit_history>
${formatEditHistory(editHistory)}
</edit_history>

<user_feedback>
${formatUserFeedback(userFeedback)}
</user_feedback>

<recent_change>
${enhancedRecentChange}
</recent_change>

<file_info>
Total Lines: ${windowInfo.totalLines}
Window Start: ${windowInfo.startLine}
</file_info>

<code_window>
${codeWindow.split('\n').map((line, i) => `${windowInfo.startLine + i}: ${line}`).join('\n')}
</code_window>

Analyze the <edit_history> and <user_feedback> to understand user intent, then predict the next logical edit in <code_window>.`;
    
    // 🆕 调试模式：打印完整 prompt（可通过环境变量控制）
    if (process.env.DEBUG_PROMPT === 'true') {
      console.log('\n========== FULL PROMPT ==========');
      console.log('SYSTEM:', systemPrompt.substring(0, 500) + '...');
      console.log('\nUSER:', userPrompt);
      console.log('==================================\n');
    }
    
    // 移除旧的 userPrompt 定义
    /*
    const userPrompt = `###  CODE WINDOW (Lines ${windowInfo.startLine}-${windowInfo.startLine + codeWindow.split('\n').length})
${codeWindow}

### RECENT CHANGE
${diffSummary}

### FILE INFO
- Total lines: ${windowInfo.totalLines}
- Window starts at line: ${windowInfo.startLine}

Predict the next edit. If targetLine is within the window, calculate absolute line number.`;
*/

    const isDeepSeek = config.provider === 'deepseek';
    const apiUrl = isDeepSeek
      ? 'https://api.deepseek.com/v1/chat/completions'
      : 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: isDeepSeek ? 'deepseek-chat' : 'qwen2.5-coder-32b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 1024  
      })
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    // 🆕 检查是否可能被截断
    const finishReason = data.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn('⚠️ [Slow] Response was truncated due to max_tokens limit!');
      console.warn('   Consider increasing max_tokens in the API request');
    }

    // 解析 JSON（增强容错）
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
          
          // 🆕 尝试修复截断的 JSON
          // 如果在数组中间截断，补全数组结束符
          if (jsonStr.includes('"predictions"') && !jsonStr.trim().endsWith('}')) {
            // 找到最后一个完整的对象（以 }, 结尾）
            const lastCompleteObj = jsonStr.lastIndexOf('},');
            if (lastCompleteObj > 0) {
              jsonStr = jsonStr.substring(0, lastCompleteObj + 1) + '\n    ]\n}';
              console.log('🔧 Attempting to fix truncated predictions array');
              
              try {
                parsedResult = JSON.parse(jsonStr);
                console.log('✅ Successfully fixed truncated JSON');
              } catch (e3) {
                console.error('❌ Fix failed:', e3.message);
              }
            }
          }
          
          if (!parsedResult) {
            console.error('❌ JSON extraction failed:', e2.message);
            console.error('Raw content (first 500 chars):', content.substring(0, 500));
          }
        }
      }
    }

    let finalResponse = null;

    if (parsedResult) {
      // 1. 记录分析过程 (Chain of Thought)
      if (parsedResult.analysis) {
        console.log('🤔 [AI Analysis]', JSON.stringify(parsedResult.analysis, null, 2));
      }

      // 2. 提取预测结果（支持多个 predictions）
      if (parsedResult.predictions && Array.isArray(parsedResult.predictions)) {
        // 🆕 多建议模式
        const predictions = parsedResult.predictions.map(pred => ({
          ...pred,
          requestId
        }));
        
        console.log(`✅ [Slow] ${predictions.length} Predictions returned`);
        predictions.forEach((pred, index) => {
          console.log(`  [${index + 1}] Line ${pred.targetLine}: ${pred.explanation} (priority: ${pred.priority || 'N/A'}, confidence: ${pred.confidence})`);
        });
        
        // 🆕 如果有编辑历史，显示模式识别结果
        if (editHistory && editHistory.length > 0 && parsedResult.analysis?.pattern) {
          console.log(`🔍 [Pattern] ${parsedResult.analysis.pattern}`);
        }
        
        finalResponse = {
          predictions,
          totalCount: predictions.length,
          hasMore: false, // 目前一次返回所有
          requestId
        };
      } else if (parsedResult.prediction) {
        // 🔧 兼容旧格式（单个 prediction）
        const prediction = {
          ...parsedResult.prediction,
          requestId,
          priority: 1 // 默认优先级
        };
        
        console.log(`✅ [Slow] Single Prediction: Line ${prediction.targetLine} (${prediction.explanation})`);
        
        if (editHistory && editHistory.length > 0 && parsedResult.analysis?.pattern) {
          console.log(`🔍 [Pattern] ${parsedResult.analysis.pattern}`);
        }
        
        // 包装成数组格式
        finalResponse = {
          predictions: [prediction],
          totalCount: 1,
          hasMore: false,
          requestId
        };
      } else {
        console.log('ℹ️ [Slow] AI decided no edit is needed (predictions is null)');
        finalResponse = {
          predictions: [],
          totalCount: 0,
          hasMore: false,
          requestId
        };
      }
    } else {
      console.log('ℹ️ [Slow] No valid JSON response');
      finalResponse = {
        predictions: [],
        totalCount: 0,
        hasMore: false,
        requestId
      };
    }

    res.json(finalResponse);
  } catch (error) {
    console.error('❌ [Slow] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});


app.listen(config.port, () => {
  console.log('\n🚀 NES Dual Engine Server Started!');
  console.log(`📡 Port: ${config.port}`);
  console.log(`🔗 Health: http://localhost:${config.port}${API_ENDPOINTS.HEALTH}`);
  console.log(`⚡ Fast Engine: http://localhost:${config.port}/api/completion`);
  console.log(`🧠 Slow Engine: http://localhost:${config.port}/api/next-edit-prediction`);
  console.log(`🤖 Provider: ${config.provider}`);
  console.log('\n✨ Ready for Next Edit Suggestions!\n');
});
