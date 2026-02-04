import * as vscode from 'vscode';
import * as path from 'path';
import { Group, BookmarkGroup } from '../models/types';
import { DataManager } from '../data/dataManager';
import { GroupManager } from '../core/groupManager';
import { RelationManager } from '../core/relationManager';

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
            const count = this.groupManager.getBookmarkCountInGroup(group.id);
            const isActive = group.id === activeGroupId;
            const prefix = isActive ? '📌 ' : this.getColorIcon(group.color) + ' ';
            const label = `${prefix}${group.name} [${count}]`;

            const item = new BookmarkTreeItem(
                'group',
                group.id,
                label,
                vscode.TreeItemCollapsibleState.Collapsed
            );

            item.tooltip = `${group.name} (${count} bookmarks)${isActive ? ' - Active Group' : ''}`;
            item.description = isActive ? 'Active' : '';

            // 设置 Context Value 以控制菜单显示
            // 格式：group_ghostVisible (默认) 或 group_ghostHidden
            const ghostStatus = group.showGhostText !== false ? 'ghostVisible' : 'ghostHidden';
            item.contextValue = `group_${ghostStatus}`;

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
            item.tooltip = `${relation.title}\n${bookmark.fileUri}:${bookmark.line}`;

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
    private getColorIcon(color: string): string {
        // 使用 emoji作为颜色标记
        const colorMap: { [key: string]: string } = {
            '#FF6B6B': '🔴',
            '#FFA500': '🟠',
            '#FFD700': '🟡',
            '#4CAF50': '🟢',
            '#2196F3': '🔵',
            '#9C27B0': '🟣',
            '#E91E63': '🔴',
            '#9E9E9E': '⚫'
        };

        return colorMap[color] || '⚪';
    }

    // ===== Drag and Drop Implementation =====

    handleDrag(source: readonly BookmarkTreeItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        if (source.length === 0) return;

        const item = source[0];
        // 仅支持拖拽书签
        if (item.type !== 'bookmark') return;

        dataTransfer.set('application/vnd.code.tree.groupBookmarks', new vscode.DataTransferItem(item));
    }

    async handleDrop(target: BookmarkTreeItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        const transferItem = dataTransfer.get('application/vnd.code.tree.groupBookmarks');
        if (!transferItem) return;

        const sourceItem = transferItem.value as BookmarkTreeItem;
        if (!sourceItem || sourceItem.type !== 'bookmark') return;

        // 解析 Source Info
        // relation.id = bookmarkId_groupId
        const [sourceBookmarkId, sourceGroupId] = sourceItem.dataId.split('_');

        // 1. Drop 到分组上 (移动到由该分组)
        if (target && target.type === 'group') {
            const targetGroupId = target.dataId;
            if (sourceGroupId !== targetGroupId) {
                // 移动分组
                await this.relationManager.moveBookmarkToGroup(sourceBookmarkId, sourceGroupId, targetGroupId);
            }
            return;
        }

        // 2. Drop 到书签上 (排序 或 移动并排序)
        if (target && target.type === 'bookmark') {
            const [targetBookmarkId, targetGroupId] = target.dataId.split('_');

            // 如果是同一个分组 -> 排序
            if (sourceGroupId === targetGroupId) {
                const relations = this.relationManager.getRelationsInGroup(sourceGroupId);
                const sourceRelationId = sourceItem.dataId;
                const targetRelationId = target.dataId;

                // 简单的重新排序：将 source 移动到 target 之前
                const ids = relations.map(r => r.id);
                const fromIndex = ids.indexOf(sourceRelationId);
                const toIndex = ids.indexOf(targetRelationId);

                if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
                    ids.splice(fromIndex, 1);
                    // 如果从后面拖到前面，直接插入到 toIndex
                    // 如果从前面拖到后面，因为删除了一个元素，toIndex 实际上变成了 target 的后面？
                    // 修正逻辑：splice 删除后，插入位置
                    // 目标是插在 target 之前
                    // 如果 from < to: target 的索引减小了 1，插入到 (original_to - 1) + 0?
                    // 标准逻辑：
                    // ids.splice(fromIndex, 1);
                    // const newToIndex = ids.indexOf(targetRelationId);
                    // ids.splice(newToIndex, 0, sourceRelationId);

                    // Re-find index because removing might shift it
                    const newToIndex = ids.indexOf(targetRelationId);
                    ids.splice(newToIndex, 0, sourceRelationId);

                    await this.relationManager.reorderRelations(sourceGroupId, ids);
                }
            } else {
                // 跨组拖拽到具体书签 -> 移动到该组并尝试插入到该书签之前
                // 目前简化处理：先 move 到 group
                await this.relationManager.moveBookmarkToGroup(sourceBookmarkId, sourceGroupId, targetGroupId);
                // 暂不支持跨组精确定位排序，或者需要 move 后再 sort
            }
        }
    }
}
