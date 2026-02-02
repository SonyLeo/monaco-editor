/**
 * Tree-sitter 单例实例
 * 避免多次初始化，节省资源
 */

import { TreeSitterAnalyzer } from './TreeSitterAnalyzer';
import { logger } from '@/utils/logger';

let instance: TreeSitterAnalyzer | null = null;
let initPromise: Promise<void> | null = null;

/**
 * 获取 Tree-sitter 单例实例
 * 如果尚未初始化，会自动初始化
 */
export async function getTreeSitterInstance(): Promise<TreeSitterAnalyzer> {
  if (instance?.isInitialized()) {
    return instance;
  }

  if (!instance) {
    instance = new TreeSitterAnalyzer();
  }

  if (!initPromise) {
    initPromise = instance.init()
      .then(() => {
        logger.info('[TreeSitter] Shared instance initialized');
      })
      .catch((error) => {
        logger.error('[TreeSitter] Shared instance initialization failed:', error);
        throw error;
      });
  }

  await initPromise;
  return instance;
}

/**
 * 获取 Tree-sitter 实例（同步，可能未初始化）
 * 用于需要立即访问但可以容忍未初始化的场景
 */
export function getTreeSitterInstanceSync(): TreeSitterAnalyzer | null {
  return instance;
}

/**
 * 重置单例（主要用于测试）
 */
export function resetTreeSitterInstance(): void {
  instance = null;
  initPromise = null;
}
