import { v4 as uuidv4 } from 'uuid';
import { TermNoteGroupRelation } from '../models/types';
import { DataManager } from '../data/dataManager';

/**
 * 术语笔记关联管理器 - 负责词条和分组之间的关联关系
 */
export class TermNoteRelationManager {
    constructor(private dataManager: DataManager) { }

    /**
     * 添加词条到分组
     */
    async addTermNoteToGroup(noteId: string, groupId: string): Promise<TermNoteGroupRelation> {
        const note = this.dataManager.getTermNote(noteId);
        const group = this.dataManager.getTermNoteGroup(groupId);

        if (!note) {
            throw new Error(`Term note ${noteId} not found`);
        }
        if (!group) {
            throw new Error(`Term note group ${groupId} not found`);
        }

        const existingRelation = this.findRelation(noteId, groupId);
        if (existingRelation) {
            return existingRelation;
        }

        const relationsInGroup = this.getRelationsInGroup(groupId);
        const maxOrder = relationsInGroup.reduce((max, relation) => Math.max(max, relation.order), -1);
        const relation: TermNoteGroupRelation = {
            id: `${noteId}_${groupId}`,
            termNoteId: noteId,
            groupId,
            order: maxOrder + 1,
            createdAt: Date.now()
        };

        await this.dataManager.addTermNoteRelation(relation);
        return relation;
    }

    /**
     * 从分组中移除词条
     */
    async removeTermNoteFromGroup(noteId: string, groupId: string): Promise<void> {
        const relation = this.findRelation(noteId, groupId);
        if (!relation) {
            return;
        }

        await this.dataManager.deleteTermNoteRelation(relation.id);
    }

    /**
     * 删除词条及其全部关联
     */
    async deleteTermNoteEverywhere(noteId: string): Promise<void> {
        await this.dataManager.deleteTermNote(noteId);
    }

    /**
     * 获取分组中的所有关联
     */
    getRelationsInGroup(groupId: string): TermNoteGroupRelation[] {
        return this.dataManager.getAllTermNoteRelations()
            .filter(relation => relation.groupId === groupId)
            .sort((a, b) => a.order - b.order);
    }

    /**
     * 私有方法：查找关联
     */
    private findRelation(noteId: string, groupId: string): TermNoteGroupRelation | undefined {
        return this.dataManager.getTermNoteRelation(`${noteId}_${groupId}`);
    }
}
