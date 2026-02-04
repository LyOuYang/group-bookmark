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
            const description = isActive ? 'Active' : '';

            const item = new BookmarkTreeItem(
                'group',
                group.id,
                label,
                vscode.TreeItemCollapsibleState.Collapsed
            );

            // Req: Active 亮起来 -> 使用 Pin 图标 + 高亮色
            if (isActive) {
                // Active: 使用 Pinned 图标 (Filled/Slanted per user request)
                item.iconPath = new vscode.ThemeIcon('pinned', new vscode.ThemeColor('list.highlightForeground'));
            } else {
                // Inactive: 使用 Color Emoji 在 Label 前缀 (保持旧风格，但组合新 Label)
                const colorIcon = this.getColorIcon(group.color);
                item.label = `${colorIcon} ${label}`;
            }

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
            const [targetBookmarkId, targetGroupId] = target.dataId.split('_');

            // 如果是同一个分组 -> 排序
            if (sourceGroupId === targetGroupId) {
                const relations = this.relationManager.getRelationsInGroup(sourceGroupId);
                const sourceRelationId = sourceItem.dataId;
                const targetRelationId = target.dataId;

                const ids = relations.map(r => r.id);
                const oldIndex = ids.indexOf(sourceRelationId);
                if (oldIndex > -1) ids.splice(oldIndex, 1);

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
