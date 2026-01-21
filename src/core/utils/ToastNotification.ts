/**
 * 简单的 Toast 通知系统
 * 用于显示 NES 状态提示
 */

export class ToastNotification {
  private container: HTMLDivElement | null = null;

  constructor() {
    this.createContainer();
  }

  private createContainer(): void {
    this.container = document.createElement('div');
    this.container.className = 'nes-toast-container';
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(this.container);
  }

  public show(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration = 3000): void {
    if (!this.container) return;

    const toast = document.createElement('div');
    toast.className = `nes-toast nes-toast-${type}`;
    
    const colors = {
      info: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444'
    };

    const icons = {
      info: '💡',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };

    toast.style.cssText = `
      background: ${colors[type]};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      max-width: 300px;
      animation: slideIn 0.3s ease-out, fadeOut 0.3s ease-in ${duration - 300}ms;
    `;

    toast.innerHTML = `
      <span style="font-size: 18px;">${icons[type]}</span>
      <span>${message}</span>
    `;

    this.container.appendChild(toast);

    // 自动移除
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease-in';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, duration);
  }

  public dispose(): void {
    this.container?.remove();
  }
}

// CSS 动画（需要添加到全局样式）
export const toastStyles = `
@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
`;
