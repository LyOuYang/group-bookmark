import * as vscode from 'vscode';
import * as path from 'path';
import { GroupColor } from '../models/types';
import { DataManager } from '../data/dataManager';
import { GroupManager } from '../core/groupManager';
import { RelationManager } from '../core/relationManager';
import { FileUtils } from '../utils/fileUtils';
import { PathUtils } from '../utils/pathUtils';

/**
 * TreeView 项类型
 */
export type TreeItemType = 'group' | 'bookmark';

/**
 * 自定义 TreeItem
 */
export class BookmarkTreeItem extends vscode.TreeItem {
    constructor(
        public readonly type: TreeItemType,
        public readonly dataId: string,
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);

        if (type === 'group') {
            this.contextValue = 'group';
        } else {
            this.contextValue = 'bookmark';
        }
    }
}

/**
 * TreeDataProvider 实现
 */
export class BookmarkTreeProvider implements vscode.TreeDataProvider<BookmarkTreeItem>, vscode.TreeDragAndDropController<BookmarkTreeItem> {
    dropMimeTypes = ['application/vnd.code.tree.groupBookmarks'];
    dragMimeTypes = ['text/uri-list', 'application/vnd.code.tree.groupBookmarks'];
    private _onDidChangeTreeData = new vscode.EventEmitter<BookmarkTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private dataManager: DataManager,
        private groupManager: GroupManager,
        private relationManager: RelationManager
    ) {
        // 监听数据变化，刷新视图
        dataManager.onDidChangeGroups(() => this.refresh());
        dataManager.onDidChangeBookmarks(() => this.refresh());
        dataManager.onDidChangeRelations(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async resolveTreeItem(item: BookmarkTreeItem): Promise<vscode.TreeItem> {
        if (item.type === 'bookmark') {
            try {
                // Determine Relation ID (item.dataId is relation.id)
                const relationId = item.dataId;

                // Get Relation and Bookmark
                // Note: We need a direct way to get Relation by ID from DataManager or existing lists
                // Since this is lazy load, performance is less critical than initial load, but we should be efficient.
                const relations = this.dataManager.getAllRelations();
                const relation = relations.find(r => r.id === relationId);

                if (relation) {
                    const bookmark = this.dataManager.getBookmark(relation.bookmarkId);
                    if (bookmark) {
                        const absUri = PathUtils.toAbsoluteUri(bookmark.fileUri);
                        if (absUri) {
                            // Read context: bookmark line centered with +/- 10 lines (Total 20+ lines)
                            const startLine = Math.max(1, bookmark.line - 10);
                            const endLine = bookmark.line + 10;

                            const lines = await FileUtils.readLines(absUri.fsPath, startLine, endLine);

                            if (lines.length > 0) {
                                // Add marker to the bookmark line
                                const bookmarkLineIndex = bookmark.line - startLine;
                                if (bookmarkLineIndex >= 0 && bookmarkLineIndex < lines.length) {
                                    lines[bookmarkLineIndex] = lines[bookmarkLineIndex] + ' // ⬅️ 此书签行';
                                }

                                const code = lines.join('\n'); // Join lines
                                const md = new vscode.MarkdownString();

                                // Detect language from file extension
                                const ext = path.extname(bookmark.fileUri).replace('.', '') || 'typescript';

                                md.appendCodeblock(code, ext);
                                md.appendMarkdown(`\n\n__${PathUtils.getFileName(absUri)}:${startLine}-${Math.min(endLine, startLine + lines.length - 1)}__`);

                                item.tooltip = md;
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to resolve tree item', error);
                item.tooltip = 'Failed to load preview';
            }
        }
        return item;
    }

    getTreeItem(element: BookmarkTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: BookmarkTreeItem): BookmarkTreeItem[] {
        if (!element) {
            // 根节点：返回所有分组
            return this.getGroupItems();
        }

        if (element.type === 'group') {
            // 展开分组：返回分组中的书签
            return this.getBookmarkItems(element.dataId);
        }

        return [];
    }

    /**
     * 获取分组项
     */
    private getGroupItems(): BookmarkTreeItem[] {
        const groups = this.groupManager.getAllGroups();
        const activeGroupId = this.groupManager.getActiveGroupId();

        // 如果没有 Active Group 且有分组，默认激活第一个
        /* 用户反馈希望手动 pin，所以这里不自动 pin，除非用户第一次安装？
           暂时保持手动 pin 的逻辑。或者在 CommandHandler 里处理 addBookmark 时自动 pin。
        */

        return groups.map(group => {
            const isActive = group.id === activeGroupId;

            // Req: Label 格式改为 "1. GroupName" (无数量)
            let label = `${group.number}. ${group.name}`;

            // Req: 可见性状态使用 Tick 符号，避免 Emoji 眼睛的"吓人"感
            // 用户接受 "点击的那个眼睛" (Inline)，但 Label 需要静态指示
            // 采用 ✔，若 Ghost Text 开启
            if (group.showGhostText !== false) {
                label = `✔ ${label}`;
            }

            // Description 移除数量，保持干净? 用户说 "group后面的()统计tag数的不需要"
            // 之前放在 Label 后，后来放到 Description。现在 Description 也移除？
            // 保持 Description 干净，仅在 Active 时显示状态，或者完全留空
            const item = new BookmarkTreeItem(
                'group',
                group.id,
                label,
                vscode.TreeItemCollapsibleState.Collapsed
            );

            // V1.4: Icon Coexistence Strategy
            // 1. Label always has Color Emoji (Identity)
            const colorIcon = this.getColorIcon(group.color);
            item.label = `${colorIcon} ${label}`;

            // 2. IconPath used for State (Pinned/Active)
            if (isActive) {
                // Active: Show Pinned Icon (highlighted)
                item.iconPath = new vscode.ThemeIcon('pinned', new vscode.ThemeColor('list.highlightForeground'));
            }
            // Inactive: IconPath undefined (no icon), only Color in Label

            return item;
        });
    }

    /**
     * 获取书签项
     */
    private getBookmarkItems(groupId: string): BookmarkTreeItem[] {
        const relations = this.relationManager.getRelationsInGroup(groupId);

        return relations.map(relation => {
            const bookmark = this.dataManager.getBookmark(relation.bookmarkId);
            if (!bookmark) {
                return null;
            }

            const fileName = path.basename(bookmark.fileUri);
            const label = `${relation.title}`;

            const item = new BookmarkTreeItem(
                'bookmark',
                relation.id,
                label,
                vscode.TreeItemCollapsibleState.None
            );

            item.description = `(${fileName}:${bookmark.line})`;
            // Remove static tooltip to enable resolveTreeItem (lazy loading)
            // item.tooltip = `${relation.title}\n${bookmark.fileUri}:${bookmark.line}`;

            // 设置点击命令
            item.command = {
                command: 'groupBookmarks.jumpToBookmark',
                title: 'Jump to Bookmark',
                arguments: [bookmark]
            };

            return item;
        }).filter((item): item is BookmarkTreeItem => item !== null);
    }

    /**
     * 获取颜色图标
     */
    private getColorIcon(color: GroupColor | string): string {
        // 使用 emoji作为颜色标记
        const colorMap = new Map<GroupColor, string>([
            [GroupColor.Red, '🔴'],
            [GroupColor.Orange, '🟠'],
            [GroupColor.Yellow, '🟡'],
            [GroupColor.Green, '🟢'],
            [GroupColor.Blue, '🔵'],
            [GroupColor.Purple, '🟣'],
            [GroupColor.Pink, '🔴'],
            [GroupColor.Gray, '⚫']
        ]);

        return colorMap.get(color as GroupColor) || '⚪';
    }

    // ===== Drag and Drop Implementation =====

    handleDrag(source: readonly BookmarkTreeItem[], dataTransfer: vscode.DataTransfer): void | Thenable<void> {
        if (source.length === 0) {return;}

        const item = source[0];
        // 仅支持拖拽书签
        if (item.type !== 'bookmark') {return;}

        dataTransfer.set('application/vnd.code.tree.groupBookmarks', new vscode.DataTransferItem(item));
    }

    async handleDrop(target: BookmarkTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const transferItem = dataTransfer.get('application/vnd.code.tree.groupBookmarks');
        if (!transferItem) {return;}

        const sourceItem = transferItem.value as BookmarkTreeItem;
        if (!sourceItem || sourceItem.type !== 'bookmark') {return;}

        // 解析 Source Info
        // relation.id = bookmarkId_groupId
        const [sourceBookmarkId, sourceGroupId] = sourceItem.dataId.split('_');

        // 1. Drop 到分组上 (移动到由该分组)
        if (target && target.type === 'group') {
            const targetGroupId = target.dataId;
            if (sourceGroupId !== targetGroupId) {
                // 跨组移动
                await this.relationManager.moveBookmarkToGroup(sourceBookmarkId, sourceGroupId, targetGroupId);
            } else {
                // 同组移动：拖到分组标题 = 移到该组末尾
                const relations = this.relationManager.getRelationsInGroup(sourceGroupId);
                const ids = relations.map(r => r.id);
                const sourceRelationId = sourceItem.dataId;
                const index = ids.indexOf(sourceRelationId);
                if (index > -1) {
                    ids.splice(index, 1);
                    ids.push(sourceRelationId); // 追加到末尾
                    await this.relationManager.reorderRelations(sourceGroupId, ids);
                }
            }
            return;
        }

        // 2. Drop 到书签上 (排序 或 移动并排序)
        if (target && target.type === 'bookmark') {
            const [, targetGroupId] = target.dataId.split('_');

            // 如果是同一个分组 -> 排序
            if (sourceGroupId === targetGroupId) {
                const relations = this.relationManager.getRelationsInGroup(sourceGroupId);
                const sourceRelationId = sourceItem.dataId;
                const targetRelationId = target.dataId;

                const ids = relations.map(r => r.id);
                const oldIndex = ids.indexOf(sourceRelationId);
                if (oldIndex > -1) {ids.splice(oldIndex, 1);}

                // 插入到 target 之前
                const newIndex = ids.indexOf(targetRelationId);
                if (newIndex > -1) {
                    ids.splice(newIndex, 0, sourceRelationId);
                } else {
                    ids.push(sourceRelationId);
                }

                await this.relationManager.reorderRelations(sourceGroupId, ids);
            } else {
                // 跨组拖拽到具体书签 -> 移动到该组
                await this.relationManager.moveBookmarkToGroup(sourceBookmarkId, sourceGroupId, targetGroupId);
            }
        }
    }
}
