/**
 * SVG Loader: 加载和处理 SVG 资源
 */

import arrowRightSvg from '../../svgs/arrow-right.svg?raw';
import arrowDownSvg from '../../svgs/arrow-down.svg?raw';
import arrowUpSvg from '../../svgs/arrow-up.svg?raw';

export class SvgLoader {
  /**
   * 获取箭头 SVG（右）
   */
  static getArrowRight(color: string = 'currentColor'): string {
    return this.colorize(arrowRightSvg, color);
  }

  /**
   * 获取箭头 SVG（下）
   */
  static getArrowDown(color: string = 'currentColor'): string {
    return this.colorize(arrowDownSvg, color);
  }

  /**
   * 获取箭头 SVG（上）
   */
  static getArrowUp(color: string = 'currentColor'): string {
    return this.colorize(arrowUpSvg, color);
  }

  /**
   * 替换 SVG 颜色
   */
  private static colorize(svg: string, color: string): string {
    return svg.replace(/stroke="currentColor"/g, `stroke="${color}"`);
  }

  /**
   * 将 SVG 转换为 Data URL
   */
  static toDataUrl(svg: string): string {
    const encoded = encodeURIComponent(svg)
      .replace(/'/g, '%27')
      .replace(/"/g, '%22');
    return `data:image/svg+xml,${encoded}`;
  }

  /**
   * 获取 Glyph 图标 SVG（带背景色的箭头，更明显）
   */
  static getGlyphIcon(color: string = '#667eea'): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
      <rect x="2" y="2" width="16" height="16" rx="3" fill="${color}" opacity="0.25"/>
      <path d="M5 10h10M12 7l3 3-3 3" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`;
  }
}
