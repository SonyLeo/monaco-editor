/**
 * 功能开关系统
 * 支持 A/B 测试和快速回滚
 */

export interface FeatureFlags {
  // Parser 相关
  useAcornParser: boolean;
  useTreeSitterFallback: boolean;

  // 触发策略相关
  useSmartTrigger: boolean;
  useDynamicDebounce: boolean;
  useAdaptiveStrategy: boolean;

  // 调试相关
  enableTriggerLogging: boolean;
  enablePerformanceLogging: boolean;
  enableComparisonMode: boolean;
}

export const DEFAULT_FEATURES: FeatureFlags = {
  useAcornParser: false,
  useTreeSitterFallback: true,
  useSmartTrigger: false,
  useDynamicDebounce: false,
  useAdaptiveStrategy: false,
  enableTriggerLogging: false,
  enablePerformanceLogging: false,
  enableComparisonMode: false,
};

/**
 * 从 localStorage 读取配置（支持运行时切换）
 */
export function getFeatureFlags(): FeatureFlags {
  const stored = localStorage.getItem('ai-assistant-features');
  if (stored) {
    try {
      return { ...DEFAULT_FEATURES, ...JSON.parse(stored) };
    } catch (e) {
      console.warn('[FeatureFlags] Parse error:', e);
    }
  }
  return DEFAULT_FEATURES;
}

/**
 * 设置功能开关
 */
export function setFeatureFlag(key: keyof FeatureFlags, value: boolean): void {
  const flags = getFeatureFlags();
  flags[key] = value;
  localStorage.setItem('ai-assistant-features', JSON.stringify(flags));
  console.log(`[FeatureFlags] ${key} = ${value}`);
}
