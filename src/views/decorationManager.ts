import * as vscode from 'vscode';
import { DataManager } from '../data/dataManager';
import { GroupManager } from '../core/groupManager';
import { RelationManager } from '../core/relationManager';
import { SVGIconCache, GroupInfo } from '../services/svgIconCache';

/**
 * Gutter 装饰器管理器
 */
export class DecorationManager {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
    private enabled = true;
    private svgIconCache: SVGIconCache;

    constructor(
        private dataManager: DataManager,
        private groupManager: GroupManager,
        private relationManager: RelationManager
    ) {
        this.svgIconCache = new SVGIconCache();

        // 监听数据变化，刷新装饰
        dataManager.onDidChangeBookmarks(() => this.refreshAll());
        dataManager.onDidChangeGroups(() => this.refreshAll());
        dataManager.onDidChangeRelations(() => this.refreshAll());

        // 监听编辑器变化
        vscode.window.onDidChangeActiveTextEditor(() => this.refreshActiveEditor());
        vscode.workspace.onDidChangeTextDocument(() => this.refreshActiveEditor());
    }

    /**
     * 切换装饰器显示
     */
    toggle(): void {
        this.enabled = !this.enabled;
        if (this.enabled) {
            this.refreshAll();
        } else {
            this.clearAll();
        }
    }

    /**
     * 刷新所有编辑器的装饰
     */
    refreshAll(): void {
        if (!this.enabled) {
            return;
        }

        vscode.window.visibleTextEditors.forEach(editor => {
            this.refreshEditor(editor);
        });
    }

    /**
     * 刷新当前激活的编辑器
     */
    refreshActiveEditor(): void {
        if (!this.enabled) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (editor) {
            this.refreshEditor(editor);
        }
    }

    /**
     * 刷新指定编辑器的装饰
     */
    private refreshEditor(editor: vscode.TextEditor): void {
        // 获取文件的书签
        const relativePath = this.getRelativePath(editor.document.uri);
        const bookmarks = this.dataManager.getBookmarksByFile(relativePath);

        // 如果没有书签，清除所有装饰
        if (bookmarks.length === 0) {
            this.decorationTypes.forEach(decorationType => {
                editor.setDecorations(decorationType, []);
            });
            return;
        }

        // 按行分组书签（一行可能有多个分组）
        const bookmarksByLine = new Map<number, GroupInfo[]>();

        for (const bookmark of bookmarks) {
            const groups = this.relationManager.getGroupsForBookmark(bookmark.id);
            if (groups.length === 0) {
                continue;
            }

            // 收集该行的所有分组信息
            if (!bookmarksByLine.has(bookmark.line)) {
                bookmarksByLine.set(bookmark.line, []);
            }

            for (const group of groups) {
                bookmarksByLine.get(bookmark.line)!.push({
                    color: group.color,
                    number: group.number
                });
            }
        }

        // 按 GroupInfo 数组的签名分组装饰
        const decorationsByIcon = new Map<string, Array<{
            range: vscode.Range;
            hoverMessage: vscode.MarkdownString;
        }>>();

        for (const [line, groupInfos] of bookmarksByLine) {
            const range = new vscode.Range(line - 1, 0, line - 1, 0);
            const hoverMessage = this.getHoverMessage(line, relativePath);

            // 生成图标缓存 Key
            const iconKey = groupInfos.map(g => `${g.color}_${g.number}`).join('|');

            if (!decorationsByIcon.has(iconKey)) {
                decorationsByIcon.set(iconKey, []);
            }
            decorationsByIcon.get(iconKey)!.push({ range, hoverMessage });
        }

        // 批量设置装饰
        const usedDecorationTypes = new Set<vscode.TextEditorDecorationType>();

        decorationsByIcon.forEach((decorations, iconKey) => {
            const groupInfos = this.parseIconKey(iconKey);
            const icon = this.svgIconCache.getIcon(groupInfos);

            const decorationType = this.getOrCreateDecorationTypeForIcon(iconKey, icon);
            editor.setDecorations(decorationType, decorations);
            usedDecorationTypes.add(decorationType);
        });

        // 清除未使用的装饰类型
        this.decorationTypes.forEach((decorationType, key) => {
            if (!usedDecorationTypes.has(decorationType)) {
                editor.setDecorations(decorationType, []);
            }
        });
    }

    /**
     * 解析图标 Key 为 GroupInfo 数组
     */
    private parseIconKey(iconKey: string): GroupInfo[] {
        return iconKey.split('|').map(part => {
            const [color, numberStr] = part.split('_');
            return {
                color: color as any,
                number: parseInt(numberStr, 10)
            };
        });
    }

    /**
     * 获取或创建指定图标的装饰类型
     */
    private getOrCreateDecorationTypeForIcon(key: string, icon: vscode.Uri): vscode.TextEditorDecorationType {
        if (this.decorationTypes.has(key)) {
            return this.decorationTypes.get(key)!;
        }

        const decorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: icon,
            gutterIconSize: 'contain'
        });

        this.decorationTypes.set(key, decorationType);
        return decorationType;
    }


    /**
     * 获取 hover 信息
     */
    private getHoverMessage(line: number, fileUri: string): vscode.MarkdownString {
        const bookmarks = this.dataManager.getBookmarksByFile(fileUri)
            .filter(b => b.line === line);

        const md = new vscode.MarkdownString();
        // 移除 supportHtml 和 isTrusted，改用纯 Markdown + Emoji 以保证最大兼容性
        // 用户反馈之前不显示，可能是 HTML 渲染被拦截或者格式错误

        if (bookmarks.length === 0) return md;

        md.appendMarkdown(`**Bookmarks (Line ${line})**\n\n`);

        for (const bookmark of bookmarks) {
            const relations = this.relationManager.getGroupsForBookmark(bookmark.id);
            for (const group of relations) {
                const allRelations = this.dataManager.getAllRelations();
                const relation = allRelations.find(r => r.bookmarkId === bookmark.id && r.groupId === group.id);

                if (relation) {
                    const colorEmoji = this.getColorEmoji(group.color);
                    // 格式: 🔴 [GroupName] Bookmark Title
                    md.appendMarkdown(`${colorEmoji} **[${group.displayName}]** ${relation.title}\n\n`);
                }
            }
        }

        return md;
    }

    private getColorEmoji(color: string): string {
        switch (color.toLowerCase()) {
            case 'red': return '🔴';
            case 'green': return '🟢';
            case 'blue': return '🔵';
            case 'yellow': return '🟡';
            case 'purple': return '🟣';
            case 'orange': return '🟠';
            default: return '⚪';
        }
    }

    /**
     * 清除所有装饰
     */
    private clearAll(): void {
        vscode.window.visibleTextEditors.forEach(editor => {
            this.decorationTypes.forEach(decorationType => {
                editor.setDecorations(decorationType, []);
            });
        });
    }

    /**
     * 获取相对路径
     */
    private getRelativePath(uri: vscode.Uri): string {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            return uri.fsPath;
        }

        const relativePath = uri.fsPath.substring(workspaceFolder.uri.fsPath.length + 1);
        return relativePath.replace(/\\/g, '/');
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.decorationTypes.forEach(type => type.dispose());
        this.decorationTypes.clear();
    }
}
