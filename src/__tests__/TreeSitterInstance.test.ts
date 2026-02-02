import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  getTreeSitterInstance, 
  getTreeSitterInstanceSync, 
  resetTreeSitterInstance 
} from '@/analysis/TreeSitterInstance';
import { TreeSitterAnalyzer } from '@/analysis/TreeSitterAnalyzer';
import { logger } from '@/utils/logger';

describe('TreeSitterInstance - Singleton Management', () => {
  beforeEach(() => {
    resetTreeSitterInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTreeSitterInstance();
  });

  describe('getTreeSitterInstance', () => {
    it('should create and initialize instance on first call', async () => {
      const initSpy = vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockResolvedValue(undefined);
      const isInitSpy = vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized').mockReturnValue(true);
      const logSpy = vi.spyOn(logger, 'info');

      const instance = await getTreeSitterInstance();

      expect(instance).toBeInstanceOf(TreeSitterAnalyzer);
      expect(initSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('[TreeSitter] Shared instance initialized');
      
      initSpy.mockRestore();
      isInitSpy.mockRestore();
    });

    it('should return same instance on subsequent calls', async () => {
      vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockResolvedValue(undefined);
      vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized').mockReturnValue(true);

      const instance1 = await getTreeSitterInstance();
      const instance2 = await getTreeSitterInstance();

      expect(instance1).toBe(instance2);
    });

    it('should reuse init promise for concurrent calls', async () => {
      const initSpy = vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockResolvedValue(undefined);
      vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized').mockReturnValue(false);

      // 并发调用
      const [instance1, instance2, instance3] = await Promise.all([
        getTreeSitterInstance(),
        getTreeSitterInstance(),
        getTreeSitterInstance()
      ]);

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
      expect(initSpy).toHaveBeenCalledTimes(1); // 只初始化一次
      
      initSpy.mockRestore();
    });

    it('should handle initialization errors (Line 31-32)', async () => {
      const error = new Error('Init failed');
      vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockRejectedValue(error);
      vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized').mockReturnValue(false);
      const errorSpy = vi.spyOn(logger, 'error');

      await expect(getTreeSitterInstance()).rejects.toThrow('Init failed');
      expect(errorSpy).toHaveBeenCalledWith('[TreeSitter] Shared instance initialization failed:', error);
    });

    it('should return immediately if already initialized', async () => {
      const initSpy = vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockResolvedValue(undefined);
      vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized')
        .mockReturnValueOnce(false) // 第一次调用：未初始化
        .mockReturnValue(true);     // 后续调用：已初始化

      const instance1 = await getTreeSitterInstance();
      
      // 第二次调用应该立即返回，不再调用 init
      const instance2 = await getTreeSitterInstance();

      expect(instance1).toBe(instance2);
      expect(initSpy).toHaveBeenCalledTimes(1);
      
      initSpy.mockRestore();
    });
  });

  describe('getTreeSitterInstanceSync', () => {
    it('should return null when not initialized (Line 45)', () => {
      const instance = getTreeSitterInstanceSync();
      expect(instance).toBeNull();
    });

    it('should return instance after initialization (Line 45)', async () => {
      vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockResolvedValue(undefined);
      vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized').mockReturnValue(true);

      await getTreeSitterInstance();
      const syncInstance = getTreeSitterInstanceSync();

      expect(syncInstance).toBeInstanceOf(TreeSitterAnalyzer);
    });
  });

  describe('resetTreeSitterInstance', () => {
    it('should reset instance and initPromise (Line 52-53)', async () => {
      vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockResolvedValue(undefined);
      vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized').mockReturnValue(true);

      await getTreeSitterInstance();
      expect(getTreeSitterInstanceSync()).not.toBeNull();

      resetTreeSitterInstance();
      expect(getTreeSitterInstanceSync()).toBeNull();
    });

    it('should allow re-initialization after reset (Line 52-53)', async () => {
      const initSpy = vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockResolvedValue(undefined);
      vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized').mockReturnValue(true);

      const instance1 = await getTreeSitterInstance();
      resetTreeSitterInstance();
      const instance2 = await getTreeSitterInstance();

      expect(instance1).not.toBe(instance2);
      expect(initSpy).toHaveBeenCalledTimes(2);
      
      initSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle init promise rejection and allow retry', async () => {
      const initSpy = vi.spyOn(TreeSitterAnalyzer.prototype, 'init')
        .mockRejectedValueOnce(new Error('First fail'))
        .mockResolvedValueOnce(undefined);
      
      vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized').mockReturnValue(false);

      // 第一次失败
      await expect(getTreeSitterInstance()).rejects.toThrow('First fail');

      // 重置后重试
      resetTreeSitterInstance();
      
      // 第二次成功
      const instance = await getTreeSitterInstance();
      expect(instance).toBeInstanceOf(TreeSitterAnalyzer);
      
      initSpy.mockRestore();
    });

    it('should handle isInitialized returning false after init', async () => {
      vi.spyOn(TreeSitterAnalyzer.prototype, 'init').mockResolvedValue(undefined);
      vi.spyOn(TreeSitterAnalyzer.prototype, 'isInitialized').mockReturnValue(false);

      const instance = await getTreeSitterInstance();
      expect(instance).toBeInstanceOf(TreeSitterAnalyzer);
    });
  });
});
