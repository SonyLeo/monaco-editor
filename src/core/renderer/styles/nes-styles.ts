/**
 * NES 样式管理
 * 集中管理所有 NES 相关的 CSS 样式
 */

import { SvgLoader } from '../../utils/svgLoader';

/**
 * 注入 NES 样式到页面
 */
export function injectNESStyles(): void {
  const styleId = 'nes-renderer-enhanced-styles';
  if (document.getElementById(styleId)) return;

  // 获取 Glyph 图标 SVG 并转换为 Data URL
  const glyphIconSvg = SvgLoader.getGlyphIcon('#667eea');
  const glyphIconDataUrl = SvgLoader.toDataUrl(glyphIconSvg);

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = getNESStyles(glyphIconDataUrl);
  document.head.appendChild(style);
}

/**
 * 获取 NES 样式字符串
 */
function getNESStyles(glyphIconDataUrl: string): string {
  return `
    /* 增强的 Glyph 箭头图标 - 使用 SVG */
    .nes-arrow-icon-enhanced {
      background: url('${glyphIconDataUrl}') no-repeat center center;
      background-size: 20px 20px;
      cursor: pointer;
      opacity: 0.95;
      transition: all 0.15s ease;
    }

    .nes-arrow-icon-enhanced:hover {
      opacity: 1;
      filter: drop-shadow(0 0 4px #667eea) brightness(1.15);
      transform: scale(1.08);
    }

    /* 增强的 Diff 样式 */
    .nes-native-diff-container {
      border-left: 3px solid #667eea;
      margin-left: 50px;
      background: transparent;
      display: block;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
    }

    /* Diff 删除行样式 */
    .nes-native-diff-container .monaco-diff-editor .line-delete {
      background: rgba(255, 0, 0, 0.1) !important;
      border: 1px solid rgba(255, 0, 0, 0.3) !important;
    }

    /* Diff 新增行样式 */
    .nes-native-diff-container .monaco-diff-editor .line-insert {
      background: rgba(0, 255, 0, 0.1) !important;
      border: 1px solid rgba(0, 255, 0, 0.3) !important;
    }

    /* 删除的字符高亮 */
    .nes-native-diff-container .monaco-diff-editor .char-delete {
      background: rgba(255, 0, 0, 0.3) !important;
    }

    /* 新增的字符高亮 */
    .nes-native-diff-container .monaco-diff-editor .char-insert {
      background: rgba(0, 255, 0, 0.3) !important;
    }
  `;
}

/**
 * 导出样式常量（可选，用于其他地方引用）
 */
export const NES_COLORS = {
  PRIMARY: '#667eea',
  HOVER_GLOW: 'rgba(102, 126, 234, 0.2)',
  DELETE_BG: 'rgba(255, 0, 0, 0.1)',
  DELETE_BORDER: 'rgba(255, 0, 0, 0.3)',
  INSERT_BG: 'rgba(0, 255, 0, 0.1)',
  INSERT_BORDER: 'rgba(0, 255, 0, 0.3)',
  CHAR_DELETE: 'rgba(255, 0, 0, 0.3)',
  CHAR_INSERT: 'rgba(0, 255, 0, 0.3)'
} as const;
