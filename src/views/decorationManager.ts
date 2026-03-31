import * as vscode from 'vscode';
import { DataManager } from '../data/dataManager';
import { GroupManager } from '../core/groupManager';
import { RelationManager } from '../core/relationManager';
import { Bookmark, GroupColor } from '../models/types';
import { SVGIconCache, GroupInfo } from '../services/svgIconCache';
import { PathUtils } from '../utils/pathUtils';

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

        // Fix: Trigger initial render for currently active editors
        this.refreshAll();
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
        const relativePath = PathUtils.toRelativePath(editor.document.uri);
        const bookmarks = this.dataManager.getBookmarksByFile(relativePath);

        // 如果没有书签，清除所有装饰
        if (bookmarks.length === 0) {
            this.decorationTypes.forEach(decorationType => {
                editor.setDecorations(decorationType, []);
            });
            return;
        }

        // 按行分组书签
        // Map<line, Bookmarks[]>
        const bookmarksByLine = new Map<number, Bookmark[]>();

        for (const bookmark of bookmarks) {
            if (!bookmarksByLine.has(bookmark.line)) {
                bookmarksByLine.set(bookmark.line, []);
            }
            bookmarksByLine.get(bookmark.line)!.push(bookmark);
        }

        // 准备装饰数据
        // Key: IconKey (Color_Number combination)
        const decorationsByIcon = new Map<string, vscode.DecorationOptions[]>();

        const ghostColor = new vscode.ThemeColor('editorCodeLens.foreground');

        for (const [line, lineBookmarks] of bookmarksByLine) {
            // 收集该行所有分组信息（用于图标）和 Ghost Text
            const groupInfos: GroupInfo[] = [];
            let ghostText = '';

            for (const bookmark of lineBookmarks) {
                const groups = this.relationManager.getGroupsForBookmark(bookmark.id);

                for (const group of groups) {
                    // 收集图标信息
                    groupInfos.push({
                        color: group.color,
                        number: group.number
                    });

                    // 收集 Ghost Text 信息
                    // 检查分组是否启用 Ghost Text (默认为 true)
                    if (group.showGhostText !== false) {
                        const relations = this.dataManager.getAllRelations()
                            .filter(r => r.bookmarkId === bookmark.id && r.groupId === group.id);

                        for (const relation of relations) {
                            const colorEmoji = this.getColorEmoji(group.color);
                            // 格式: 🔴 [GroupName] Title
                            ghostText += `  ${colorEmoji} [${group.displayName}] ${relation.title}`;
                        }
                    }
                }
            }

            if (groupInfos.length === 0) {continue;}

            // 生成图标缓存 Key
            // Sort keys specifically to avoid duplicates like Red_1|Blue_2 vs Blue_2|Red_1?
            // Current caching logic relies on order. `groupInfos` order depends on `lineBookmarks` order (which is DB order?)
            // Usually stable enough.
            const iconKey = groupInfos.map(g => `${g.color}_${g.number}`).join('|');

            // Fix: Attach decoration to the END of the line so 'after' renders at the end.
            const lineRange = editor.document.lineAt(line - 1).range;
            const range = new vscode.Range(lineRange.end, lineRange.end);

            const hoverMessage = this.getHoverMessage(line, relativePath);

            // Expert UX: Truncate text if too long to prevent clutter
            const MAX_LENGTH = 50;
            if (ghostText.length > MAX_LENGTH) {
                ghostText = ghostText.substring(0, MAX_LENGTH) + '...';
            }

            const decorationOption: vscode.DecorationOptions = {
                range,
                hoverMessage,
                renderOptions: {
                    after: {
                        contentText: ghostText,
                        color: ghostColor,
                        margin: '0 0 0 2em'
                    }
                }
            };

            if (!decorationsByIcon.has(iconKey)) {
                decorationsByIcon.set(iconKey, []);
            }
            decorationsByIcon.get(iconKey)!.push(decorationOption);
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
        this.decorationTypes.forEach((decorationType) => {
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
                color: color as GroupColor,
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

        if (bookmarks.length === 0) {return md;}

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

    private getColorEmoji(color: GroupColor | string): string {
        switch (color) {
            case GroupColor.Red: return '🔴';
            case GroupColor.Green: return '🟢';
            case GroupColor.Blue: return '🔵';
            case GroupColor.Yellow: return '🟡';
            case GroupColor.Purple: return '🟣';
            case GroupColor.Orange: return '🟠';
            case GroupColor.Pink: return '🔴';
            case GroupColor.Gray: return '⚫';
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
     * 释放资源
     */
    dispose(): void {
        this.decorationTypes.forEach(type => type.dispose());
        this.decorationTypes.clear();
    }
}
