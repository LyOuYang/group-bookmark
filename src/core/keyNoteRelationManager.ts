import { v4 as uuidv4 } from 'uuid';
import { KeyNoteGroup, KeyNoteGroupRelation } from '../models/types';
import { DataManager } from '../data/dataManager';

/**
 * 术语笔记关联管理器 - 负责词条和分组之间的关联关系
 */
export class KeyNoteRelationManager {
    constructor(private dataManager: DataManager) { }

    /**
     * 添加词条到分组
     */
    async addKeyNoteToGroup(noteId: string, groupId: string): Promise<KeyNoteGroupRelation> {
        const note = this.dataManager.getKeyNote(noteId);
        const group = this.dataManager.getKeyNoteGroup(groupId);

        if (!note) {
            throw new Error(`Key note ${noteId} not found`);
        }
        if (!group) {
            throw new Error(`Key note group ${groupId} not found`);
        }

        const existingRelation = this.findRelation(noteId, groupId);
        if (existingRelation) {
            return existingRelation;
        }

        const relationsInGroup = this.getRelationsInGroup(groupId);
        const maxOrder = relationsInGroup.reduce((max, relation) => Math.max(max, relation.order), -1);
        const relation: KeyNoteGroupRelation = {
            id: uuidv4(),
            keyNoteId: noteId,
            groupId,
            order: maxOrder + 1,
            createdAt: Date.now()
        };

        await this.dataManager.addKeyNoteRelation(relation);
        return relation;
    }

    /**
     * 从分组中移除词条
     */
    async removeKeyNoteFromGroup(noteId: string, groupId: string): Promise<void> {
        const relation = this.findRelation(noteId, groupId);
        if (!relation) {
            return;
        }

        await this.dataManager.deleteKeyNoteRelation(relation.id);
    }

    /**
     * 删除词条及其全部关联
     */
    async deleteKeyNoteEverywhere(noteId: string): Promise<void> {
        await this.dataManager.deleteKeyNote(noteId);
    }

    /**
     * 获取分组中的所有关联
     */
    getRelationsInGroup(groupId: string): KeyNoteGroupRelation[] {
        return this.dataManager.getAllKeyNoteRelations()
            .filter(relation => relation.groupId === groupId)
            .sort((a, b) => a.order - b.order);
    }

    /**
     * 获取某个词条所属的分组
     */
    getGroupsForKeyNote(noteId: string): KeyNoteGroup[] {
        return this.dataManager.getAllKeyNoteRelations()
            .filter(relation => relation.keyNoteId === noteId)
            .map(relation => this.dataManager.getKeyNoteGroup(relation.groupId))
            .filter((group): group is KeyNoteGroup => group !== undefined)
            .sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
    }

    /**
     * 私有方法：查找关联
     */
    private findRelation(noteId: string, groupId: string): KeyNoteGroupRelation | undefined {
        return this.dataManager.getAllKeyNoteRelations()
            .find(relation => relation.keyNoteId === noteId && relation.groupId === groupId);
    }
}
