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
    /**
     * 生成 SVG Data URI
     */
    private generateSVG(groups: GroupInfo[]): vscode.Uri {
        if (groups.length === 1) {
            return this.createSingleIcon(groups[0]);
        } else {
            // 多个书签时，显示聚合图标（显示总数）
            return this.createStackedIcon(groups);
        }
    }

    /**
     * 创建单个圆圈图标
     */
    private createSingleIcon(group: GroupInfo): vscode.Uri {
        const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
        const fillColor = this.getColorValue(group.color);
        const stroke = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)';
        const textColor = this.getTextColor(group.color);

        // 字体大小微调：一位数大一点，两位数小一点
        const fontSize = group.number >= 10 ? '10' : '11';

        // 增加对比度，使用更粗的描边
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="7" fill="${fillColor}" stroke="${stroke}" stroke-width="1" />
                <text x="8" y="11.5" font-family="Segoe UI, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${textColor}" text-anchor="middle">${group.number}</text>
            </svg>
        `;

        return this.svgToDataUri(svg);
    }

    /**
     * 创建聚合图标（显示数量）
     */
    private createStackedIcon(groups: GroupInfo[]): vscode.Uri {
        const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
        // 使用第一个分组的颜色作为主色，或者使用特殊的“堆叠色”（如灰色或紫色）
        // 这里使用第一个分组颜色，保持相关性
        const fillColor = this.getColorValue(groups[0].color);
        const stroke = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.3)';
        const count = groups.length;

        // 聚合图标：一个带双层边框的圆，中间显示总数
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
                <!-- 底层阴影/堆叠效果 -->
                <circle cx="9.5" cy="9.5" r="6" fill="${fillColor}" opacity="0.5" />
                <!-- 主圆 -->
                <circle cx="7.5" cy="7.5" r="6.5" fill="${fillColor}" stroke="${stroke}" stroke-width="1.5" />
                <!-- 数量文字（覆盖在主圆上） -->
                <text x="7.5" y="11" font-family="Segoe UI, sans-serif" font-size="9" font-weight="900" fill="white" text-anchor="middle">${count}</text>
            </svg>
        `;

        return this.svgToDataUri(svg);
    }

    /**
     * 根据背景色自适应文本颜色
     */
    private getTextColor(color: GroupColor): string {
        // 深色背景用白色字，浅色背景（如 Yellow）用黑色字
        if (color === GroupColor.Yellow || color === GroupColor.Green) {
            if (color === GroupColor.Yellow) return '#333333';
        }
        return '#FFFFFF';
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
