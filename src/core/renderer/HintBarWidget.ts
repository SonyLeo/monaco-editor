/**
 * HintBar Widget: 浮动提示条
 * 显示 Tab 按钮和操作指引（增强版）
 */

import * as monaco from 'monaco-editor';
import { SvgLoader } from '../utils/svgLoader';

export class HintBarWidget implements monaco.editor.IContentWidget {
  private domNode: HTMLElement | null = null;
  private readonly id = 'nes.hintbar.widget';
  
  constructor(
    _editor: monaco.editor.IStandaloneCodeEditor,
    private targetLine: number,
    private targetColumn: number, // 🆕 添加列号参数
    private mode: 'navigate' | 'accept',
    private direction: 'up' | 'down' | 'current' = 'current'
  ) {
    this.injectStyles();
  }

  getId(): string {
    return this.id;
  }

  getDomNode(): HTMLElement {
    if (!this.domNode) {
      this.domNode = document.createElement('div');
      this.domNode.className = 'nes-hint-bar-enhanced';
      
      // Tab 按钮
      const tabButton = document.createElement('div');
      tabButton.className = 'nes-hint-tab-key';
      tabButton.textContent = 'Tab';
      this.domNode.appendChild(tabButton);
      
      if (this.mode === 'navigate') {
        // 场景 1：显示方向箭头（使用 svgs 文件夹中的箭头）
        const directionArrow = document.createElement('span');
        directionArrow.className = 'nes-hint-direction-arrow';
        
        // 🆕 使用紫色箭头，与 Glyph 图标一致
        const arrowSvg = this.direction === 'down' 
          ? SvgLoader.getArrowDown('#667eea')
          : SvgLoader.getArrowUp('#667eea');
        
        directionArrow.innerHTML = arrowSvg;
        this.domNode.appendChild(directionArrow);
      } else {
        // 场景 2：显示 "to Accept" 文字
        const actionText = document.createElement('span');
        actionText.className = 'nes-hint-action-text';
        actionText.textContent = 'to Accept';
        this.domNode.appendChild(actionText);
      }
    }
    
    return this.domNode;
  }

  getPosition(): monaco.editor.IContentWidgetPosition {
    // 显示在目标位置（光标处）
    return {
      position: {
        lineNumber: this.targetLine,
        column: this.targetColumn // 🆕 使用传入的列号
      },
      preference: [
        monaco.editor.ContentWidgetPositionPreference.ABOVE,
        monaco.editor.ContentWidgetPositionPreference.BELOW
      ]
    };
  }

  /**
   * 注入增强样式
   */
  private injectStyles(): void {
    const styleId = 'nes-hint-bar-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* 浮动提示条容器 - 与 Glyph 图标风格一致 */
      .nes-hint-bar-enhanced {
        display: flex !important;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: rgba(102, 126, 234, 0.25); 
        border: 1px solid rgba(102, 126, 234, 0.4);
        border-radius: 6px;
        box-shadow: 0 3px 12px rgba(102, 126, 234, 0.3);
        backdrop-filter: blur(10px); 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: white;
        animation: slideInFromTop 0.2s ease-out;
        z-index: 1000;
      }

      /* Tab 按钮样式 */
      .nes-hint-tab-key {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 38px;
        height: 24px;
        padding: 0 10px;
        background: rgba(255, 255, 255, 0.95);
        color: #667eea;
        font-weight: 600;
        font-size: 13px;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.08);
        letter-spacing: 0.5px;
      }

      /* 操作文字 */
      .nes-hint-action-text {
        font-weight: 400;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.9);
        white-space: nowrap;
      }

      /* 方向箭头 */
      .nes-hint-direction-arrow {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: #2f344e;
        border-radius: 4px;
        animation: bounce 1s infinite;
      }

      .nes-hint-direction-arrow svg {
        width: 16px;
        height: 16px;
        filter: none;
      }
        filter: drop-shadow(0 0 1px rgba(255, 215, 0, 0.5));
      }

      /* 动画 */
      @keyframes slideInFromTop {
        from {
          transform: translateY(-10px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      @keyframes bounce {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-3px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    if (this.domNode && this.domNode.parentNode) {
      this.domNode.parentNode.removeChild(this.domNode);
    }
    this.domNode = null;
  }
}
