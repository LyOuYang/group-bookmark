import * as vscode from 'vscode';
import { GroupColor } from '../models/types';

/**
 * 分组信息（用于 SVG 生成）
 */
export interface GroupInfo {
    color: GroupColor;
    number: number;
}

/**
 * SVG 图标缓存服务
 * 缓存生成的 SVG Data URI，避免重复生成
 */
export class SVGIconCache {
    private cache: Map<string, vscode.Uri> = new Map();

    /**
     * 生成缓存 Key
     * 格式：color1_num1|color2_num2|...
     */
    private getCacheKey(groups: GroupInfo[]): string {
        return groups.map(g => `${g.color}_${g.number}`).join('|');
    }

    /**
     * 获取图标（带缓存）
     */
    getIcon(groups: GroupInfo[]): vscode.Uri {
        const key = this.getCacheKey(groups);

        if (this.cache.has(key)) {
            return this.cache.get(key)!;
        }

        const icon = this.generateSVG(groups);
        this.cache.set(key, icon);
        return icon;
    }

    /**
     * 生成 SVG Data URI
     */
    private generateSVG(groups: GroupInfo[]): vscode.Uri {
        if (groups.length === 1) {
            return this.createSingleIcon(groups[0]);
        } else if (groups.length === 2) {
            return this.createDoubleIcons(groups);
        } else {
            return this.createMultipleIcons(groups);
        }
    }

    /**
     * 创建单个圆圈图标
     */
    private createSingleIcon(group: GroupInfo): vscode.Uri {
        const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
        const fillColor = this.getColorValue(group.color);
        const stroke = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
        const fontSize = group.number >= 10 ? '7' : '9';

        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
                <circle cx="8" cy="8" r="6" fill="${fillColor}" stroke="${stroke}" stroke-width="0.5" />
                <text x="8" y="11" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle">${group.number}</text>
            </svg>
        `;

        return this.svgToDataUri(svg);
    }

    /**
     * 创建双圆圈图标
     */
    private createDoubleIcons(groups: GroupInfo[]): vscode.Uri {
        const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
        const stroke = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
        const color1 = this.getColorValue(groups[0].color);
        const color2 = this.getColorValue(groups[1].color);

        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="16">
                <circle cx="5" cy="8" r="5" fill="${color1}" stroke="${stroke}" stroke-width="0.5" />
                <text x="5" y="11" font-size="8" font-weight="bold" fill="white" text-anchor="middle">${groups[0].number}</text>
                
                <circle cx="14" cy="8" r="5" fill="${color2}" stroke="${stroke}" stroke-width="0.5" />
                <text x="14" y="11" font-size="8" font-weight="bold" fill="white" text-anchor="middle">${groups[1].number}</text>
            </svg>
        `;

        return this.svgToDataUri(svg);
    }

    /**
     * 创建多圆圈图标（3个及以上）
     */
    private createMultipleIcons(groups: GroupInfo[]): vscode.Uri {
        const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
        const stroke = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
        const color1 = this.getColorValue(groups[0].color);
        const color2 = this.getColorValue(groups[1].color);

        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="16">
                <circle cx="4" cy="8" r="4" fill="${color1}" stroke="${stroke}" stroke-width="0.5" />
                <text x="4" y="10" font-size="7" font-weight="bold" fill="white" text-anchor="middle">${groups[0].number}</text>
                
                <circle cx="11" cy="8" r="4" fill="${color2}" stroke="${stroke}" stroke-width="0.5" />
                <text x="11" y="10" font-size="7" font-weight="bold" fill="white" text-anchor="middle">${groups[1].number}</text>
                
                <text x="19" y="11" font-size="9" font-weight="bold" fill="#999">+${groups.length - 2}</text>
            </svg>
        `;

        return this.svgToDataUri(svg);
    }

    /**
     * 获取颜色值
     */
    private getColorValue(color: GroupColor): string {
        // GroupColor 枚举已经是颜色值
        return color;
    }

    /**
     * SVG 转 Data URI
     */
    private svgToDataUri(svg: string): vscode.Uri {
        const base64 = Buffer.from(svg.trim()).toString('base64');
        return vscode.Uri.parse(`data:image/svg+xml;base64,${base64}`);
    }

    /**
     * 清除缓存
     */
    clear(): void {
        this.cache.clear();
    }
}
