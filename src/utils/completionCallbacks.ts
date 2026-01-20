/**
 * 补全回调函数集合
 */

import type { Ref } from 'vue';

interface FetchCompletionItemParams {
  body: {
    completionMetadata: unknown;
  };
}

interface FetchCompletionItemReturn {
  completion: string | null;
  error?: string;
}

/**
 * 创建补全回调函数集合
 * @param isAIThinking - AI 思考状态的响应式引用
 * @returns 回调函数对象
 */
export function createCompletionCallbacks(isAIThinking: Ref<boolean>) {
  return {
    onCompletionRequested: () => {
      isAIThinking.value = true;
    },

    onCompletionRequestFinished: (
      _params: FetchCompletionItemParams,
      response: FetchCompletionItemReturn
    ) => {
      isAIThinking.value = false;
      if (response.error) {
        console.error('❌ 补全失败:', response.error);
      }
    },

    onError: (_error: Error) => {
      isAIThinking.value = false;
    },
  };
}
