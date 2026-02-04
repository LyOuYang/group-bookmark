import { BookmarkGroup } from '../models/types';
import { DataManager } from '../data/dataManager';

/**
 * 关联关系管理器 - 负责书签和分组之间的关联关系
 */
export class RelationManager {
    constructor(private dataManager: DataManager) { }

    /**
     * 添加书签到分组
     */
    async addBookmarkToGroup(
        bookmarkId: string,
        groupId: string,
        title: string
    ): Promise<BookmarkGroup> {
        // 检查书签和分组是否存在
        const bookmark = this.dataManager.getBookmark(bookmarkId);
        const group = this.dataManager.getGroup(groupId);

        if (!bookmark) {
            throw new Error(`Bookmark ${bookmarkId} not found`);
        }
        if (!group) {
            throw new Error(`Group ${groupId} not found`);
        }

        // 检查是否已存在
        const existingRelation = this.findRelation(bookmarkId, groupId);
        if (existingRelation) {
            throw new Error('Bookmark already in group');
        }

        // 计算 order（在分组中的最后）
        const relationsInGroup = this.dataManager.getRelationsByGroup(groupId);
        const maxOrder = relationsInGroup.reduce((max, r) => Math.max(max, r.order), -1);

        const relation: BookmarkGroup = {
            id: `${bookmarkId}_${groupId}`,
            bookmarkId,
            groupId,
            title,
            order: maxOrder + 1,
            createdAt: Date.now()
        };

        await this.dataManager.addRelation(relation);
        return relation;
    }

    /**
     * 从分组中移除书签
     */
    async removeBookmarkFromGroup(bookmarkId: string, groupId: string): Promise<void> {
        const relation = this.findRelation(bookmarkId, groupId);
        if (!relation) {
            return;
        }

        await this.dataManager.deleteRelation(relation.id);

        // 如果书签不再属于任何分组，删除底层书签
        const remainingRelations = this.dataManager.getRelationsByBookmark(bookmarkId);
        if (remainingRelations.length === 0) {
            await this.dataManager.deleteBookmark(bookmarkId);
        }
    }

    /**
     * 更新书签标题（在特定分组中）
     */
    async updateBookmarkTitle(
        bookmarkId: string,
        groupId: string,
        newTitle: string
    ): Promise<void> {
        const relation = this.findRelation(bookmarkId, groupId);
        if (!relation) {
            throw new Error('Relation not found');
        }

        await this.dataManager.updateRelation(relation.id, { title: newTitle });
    }

    /**
     * 在分组内重新排序书签
     */
    async reorderBookmarksInGroup(groupId: string, bookmarkIds: string[]): Promise<void> {
        const relationIds = bookmarkIds.map(bid => `${bid}_${groupId}`);
        await this.dataManager.reorderRelationsInGroup(groupId, relationIds);
    }

    /**
     * 移动书签到另一个分组
     */
    async moveBookmarkToGroup(
        bookmarkId: string,
        fromGroupId: string,
        toGroupId: string,
        newTitle?: string
    ): Promise<void> {
        // 获取原标题
        const fromRelation = this.findRelation(bookmarkId, fromGroupId);
        if (!fromRelation) {
            throw new Error('Source relation not found');
        }

        const title = newTitle || fromRelation.title;

        // 删除原关联
        await this.removeBookmarkFromGroup(bookmarkId, fromGroupId);

        // 添加新关联
        await this.addBookmarkToGroup(bookmarkId, toGroupId, title);
    }

    /**
     * 复制书签到另一个分组
     */
    async copyBookmarkToGroup(
        bookmarkId: string,
        toGroupId: string,
        title: string
    ): Promise<void> {
        await this.addBookmarkToGroup(bookmarkId, toGroupId, title);
    }

    /**
     * 获取书签所属的所有分组
     */
    getGroupsForBookmark(bookmarkId: string) {
        return this.dataManager.getGroupsForBookmark(bookmarkId);
    }

    /**
     * 获取分组中的所有关联关系
     */
    getRelationsInGroup(groupId: string) {
        return this.dataManager.getRelationsByGroup(groupId);
    }

    /**
     * 重新排序分组内的书签
     */
    async reorderRelations(groupId: string, orderedRelationIds: string[]): Promise<void> {
        await this.dataManager.reorderRelationsInGroup(groupId, orderedRelationIds);
    }

    /**
     * 私有方法：查找关联关系
     */
    private findRelation(bookmarkId: string, groupId: string): BookmarkGroup | undefined {
        return this.dataManager.getRelation(`${bookmarkId}_${groupId}`);
    }
}
