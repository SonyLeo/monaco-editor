/**
 * 调试面板
 * 快捷键：Ctrl+Shift+V 打开
 */

import { getFeatureFlags, setFeatureFlag, type FeatureFlags } from '@/config/features';

export class DebugPanel {
  private panel: HTMLElement | null = null;

  show(): void {
    if (this.panel) return;

    this.panel = document.createElement('div');
    this.panel.id = 'ai-assistant-debug-panel';
    this.panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: monospace;
      font-size: 12px;
      max-width: 300px;
      max-height: 80vh;
      overflow-y: auto;
    `;

    const flags = getFeatureFlags();
    const html = `
      <h3 style="margin: 0 0 12px 0; color: #4ec9b0;">AI Assistant Debug Panel</h3>
      <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #444;">
        ${Object.entries(flags)
          .map(
            ([key, value]) => `
          <label style="display: block; margin: 8px 0; cursor: pointer;">
            <input type="checkbox" ${value ? 'checked' : ''} 
                   onchange="window.__debugPanel__.toggleFeature('${key}', this.checked)"
                   style="margin-right: 8px;">
            <span style="color: ${value ? '#4ec9b0' : '#858585'}">${key}</span>
          </label>
        `
          )
          .join('')}
      </div>
      <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #444;">
        <button onclick="window.__debugPanel__.showStats()" 
                style="width: 100%; padding: 6px; margin-bottom: 6px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Show Stats
        </button>
        <button onclick="window.__debugPanel__.exportData()" 
                style="width: 100%; padding: 6px; margin-bottom: 6px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Export Data
        </button>
        <button onclick="window.__debugPanel__.clearData()" 
                style="width: 100%; padding: 6px; margin-bottom: 6px; background: #d16969; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Clear Data
        </button>
      </div>
      <button onclick="window.__debugPanel__.hide()" 
              style="width: 100%; padding: 6px; background: #444; color: white; border: none; border-radius: 4px; cursor: pointer;">
        Close
      </button>
    `;

    this.panel.innerHTML = html;
    document.body.appendChild(this.panel);

    // 全局引用
    (window as any).__debugPanel__ = this;
  }

  hide(): void {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }

  toggleFeature(key: string, value: boolean): void {
    setFeatureFlag(key as keyof FeatureFlags, value);
    location.reload();
  }

  showStats(): void {
    const stats = (window as any).getAnalytics?.();
    if (stats) {
      console.log('📊 Analytics Stats:', stats);
    }
  }

  exportData(): void {
    (window as any).exportAnalytics?.();
  }

  clearData(): void {
    if (confirm('Are you sure you want to clear all analytics data?')) {
      (window as any).clearAnalytics?.();
      alert('Analytics data cleared!');
    }
  }
}

// 快捷键：Ctrl+Shift+V 打开调试面板
if (typeof window !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'V') {
      e.preventDefault();
      const panel = new DebugPanel();
      panel.show();
    }
  });
}
