/**
 * Glyph Context Menu: 右键菜单
 * 提供 Navigate to / Accept / Dismiss 选项
 */

import * as monaco from 'monaco-editor';
import { SvgLoader } from '../utils/svgLoader';

export interface GlyphMenuAction {
  id: 'navigate' | 'accept' | 'dismiss';
  label: string;
  icon: string;
  callback: () => void;
}

export class GlyphContextMenu {
  private menuElement: HTMLElement | null = null;

  constructor(_editor: monaco.editor.IStandaloneCodeEditor) {
    this.injectStyles();
  }

  /**
   * 显示菜单
   */
  public show(x: number, y: number, actions: GlyphMenuAction[]): void {
    this.hide(); // 先隐藏旧菜单

    this.menuElement = document.createElement('div');
    this.menuElement.className = 'nes-glyph-context-menu';
    this.menuElement.style.left = `${x}px`;
    this.menuElement.style.top = `${y}px`;

    actions.forEach(action => {
      const item = document.createElement('div');
      item.className = 'nes-menu-item';
      
      // 根据 action.id 选择合适的 SVG 图标
      let iconHtml = action.icon;
      if (action.id === 'navigate') {
        iconHtml = SvgLoader.getArrowRight('#8ab4f8');
      } else if (action.id === 'accept') {
        iconHtml = '<span style="color: #81c995; font-size: 14px; font-weight: bold;">✓</span>';
      } else if (action.id === 'dismiss') {
        iconHtml = '<span style="color: #f48771; font-size: 14px; font-weight: bold;">✕</span>';
      }
      
      item.innerHTML = `
        <span class="nes-menu-icon">${iconHtml}</span>
        <span class="nes-menu-label">${action.label}</span>
      `;
      
      item.addEventListener('click', () => {
        action.callback();
        this.hide();
      });

      this.menuElement!.appendChild(item);
    });

    document.body.appendChild(this.menuElement);

    // 点击外部关闭菜单
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick);
    }, 0);
  }

  /**
   * 隐藏菜单
   */
  public hide(): void {
    if (this.menuElement && this.menuElement.parentNode) {
      this.menuElement.parentNode.removeChild(this.menuElement);
    }
    this.menuElement = null;
    document.removeEventListener('click', this.handleOutsideClick);
  }

  /**
   * 处理外部点击
   */
  private handleOutsideClick = (e: MouseEvent): void => {
    if (this.menuElement && !this.menuElement.contains(e.target as Node)) {
      this.hide();
    }
  };

  /**
   * 注入样式
   */
  private injectStyles(): void {
    const styleId = 'nes-glyph-menu-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .nes-glyph-context-menu {
        position: fixed;
        background: #2d2d30;
        border: 1px solid #454545;
        border-radius: 4px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
        padding: 2px 0;
        min-width: 140px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: menuFadeIn 0.12s ease-out;
      }

      .nes-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 12px;
        color: #cccccc;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.08s ease;
      }

      .nes-menu-item:hover {
        background: #094771;
        color: white;
      }

      .nes-menu-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
      }

      .nes-menu-icon svg {
        width: 12px;
        height: 12px;
      }

      .nes-menu-label {
        flex: 1;
        font-size: 11px;
      }

      @keyframes menuFadeIn {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.hide();
  }
}
