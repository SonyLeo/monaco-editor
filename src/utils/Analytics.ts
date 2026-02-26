/**
 * 日志收集系统
 * 用于收集和分析触发事件数据
 */

import { getFeatureFlags } from '@/config/features';

export interface TriggerEvent {
  timestamp: number;
  engine: 'fim' | 'nes';
  action: 'trigger' | 'accept' | 'reject' | 'timeout' | 'skip';
  context: {
    lineLength?: number;
    isAtLineEnd?: boolean;
    isInComment?: boolean;
    isInString?: boolean;
    afterPunctuation?: boolean;
    timeSinceLastEdit?: number;
    debounceMs?: number;
    pattern?: string;
    confidence?: number;
  };
}

export class Analytics {
  private events: TriggerEvent[] = [];
  private readonly MAX_EVENTS = 1000;
  private readonly STORAGE_KEY = 'ai-assistant-analytics';

  constructor() {
    this.loadFromStorage();
  }

  /**
   * 记录事件
   */
  logEvent(event: Omit<TriggerEvent, 'timestamp'>): void {
    const fullEvent: TriggerEvent = {
      ...event,
      timestamp: Date.now(),
    };

    this.events.push(fullEvent);

    // 限制数量
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }

    // 定期保存
    if (this.events.length % 10 === 0) {
      this.saveToStorage();
    }

    // 控制台输出（开发模式）
    if (getFeatureFlags().enableTriggerLogging) {
      console.log('[Analytics]', fullEvent);
    }
  }

  /**
   * 获取统计数据
   */
  getStats(): {
    fim: { triggers: number; accepts: number; rejects: number; acceptRate: number };
    nes: { triggers: number; accepts: number; rejects: number; acceptRate: number };
    totalEvents: number;
  } {
    const fimEvents = this.events.filter((e) => e.engine === 'fim');
    const nesEvents = this.events.filter((e) => e.engine === 'nes');

    const calcStats = (events: TriggerEvent[]) => {
      const triggers = events.filter((e) => e.action === 'trigger').length;
      const accepts = events.filter((e) => e.action === 'accept').length;
      const rejects = events.filter((e) => e.action === 'reject').length;
      const acceptRate = triggers > 0 ? accepts / triggers : 0;

      return { triggers, accepts, rejects, acceptRate };
    };

    return {
      fim: calcStats(fimEvents),
      nes: calcStats(nesEvents),
      totalEvents: this.events.length,
    };
  }

  /**
   * 导出数据（用于分析）
   */
  exportData(): string {
    return JSON.stringify(this.events, null, 2);
  }

  /**
   * 清空数据
   */
  clear(): void {
    this.events = [];
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.events = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[Analytics] Load error:', e);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.events));
    } catch (e) {
      console.warn('[Analytics] Save error:', e);
    }
  }
}

// 全局实例
export const analytics = new Analytics();

// 全局方法（方便调试）
declare global {
  interface Window {
    getAnalytics: () => ReturnType<Analytics['getStats']>;
    exportAnalytics: () => void;
    clearAnalytics: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.getAnalytics = () => {
    const stats = analytics.getStats();
    console.table(stats);
    return stats;
  };

  window.exportAnalytics = () => {
    const data = analytics.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${Date.now()}.json`;
    a.click();
  };

  window.clearAnalytics = () => {
    analytics.clear();
    console.log('[Analytics] Cleared');
  };
}
