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

    /* ==================== 场景装饰样式 ==================== */
    
    /* 红色高亮（REPLACE 模式 - 错误标记，整行背景） */
    .nes-demo-error-highlight {
      background-color: rgba(255, 0, 0, 0.15) !important;
    }

    /* 红色高亮（DELETE 模式 - 标记需要删除的行，整行背景） */
    .nes-demo-delete-highlight {
      background-color: rgba(255, 0, 0, 0.2) !important;
    }

    /* 红色高亮（只高亮单词，REPLACE_WORD 场景） */
    .nes-demo-error-word-highlight {
      background-color: rgba(255, 0, 0, 0.25) !important;
      border-radius: 3px;
      padding: 2px 4px;
      border: 1px solid rgba(255, 0, 0, 0.3);
    }

    /* 蓝色高亮（INSERT 模式 - 插入位置，整行背景） */
    .nes-demo-insert-highlight {
      background-color: rgba(0, 122, 204, 0.1) !important;
    }

    /* ViewZone 预览行（REPLACE 模式 - 灰色文本，整行背景） */
    .nes-demo-preview-zone {
      background-color: rgba(0, 255, 0, 0.08) !important;
      color: #858585 !important;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 14px;
      line-height: 19px;
      padding-left: 0;
      margin-left: 0;
      font-style: italic;
      white-space: pre;
    }

    /* ViewZone 预览行（INSERT 模式 - 灰色文本，整行背景） */
    .nes-demo-preview-zone-insert {
      background-color: rgba(0, 255, 0, 0.08) !important;
      color: #858585 !important;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 14px;
      line-height: 19px;
      padding-left: 0;
      margin-left: 0;
      font-style: italic;
      white-space: pre;
    }

    /* ViewZone 预览行（只显示单词，REPLACE_WORD 场景） */
    .nes-demo-preview-zone-word-only {
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 14px;
      line-height: 19px;
      padding-left: 0;
      margin-top: 4px;
      margin-left: 10px;
      white-space: pre;
    }

    /* 箭头样式（SVG） */
    .nes-demo-arrow {
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
    }

    .nes-demo-arrow svg {
      color: #ffffff;
      width: 16px;
      height: 16px;
      vertical-align: middle;
    }

    /* 预览单词样式（带背景，REPLACE_WORD 场景） */
    .nes-demo-preview-word-with-bg {
      background-color: rgba(0, 255, 0, 0.15);
      color: #667de8;
      font-style: italic;
      border-radius: 3px;
      padding: 2px 4px;
      margin-left: 4px;
      border: 1px solid rgba(0, 255, 0, 0.25);
    }

    /* 行内插入预览样式（INLINE_INSERT 场景） */
    .nes-demo-inline-insert-preview {
      background-color: rgba(0, 255, 0, 0.15) !important;
      color: #858585 !important;
      font-style: italic !important;
      border-radius: 3px;
      padding: 2px 4px;
      border: 1px solid rgba(0, 255, 0, 0.25);
    }

    /* ==================== Diff 样式 ==================== */

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
