import { v4 as uuidv4 } from 'uuid';
import { GroupColor, TermNoteGroup } from '../models/types';
import { DataManager } from '../data/dataManager';

/**
 * 术语笔记分组管理器 - 负责分组的业务逻辑
 */
export class TermNoteGroupManager {
    constructor(private dataManager: DataManager) { }

    /**
     * 创建分组
     */
    async createGroup(name: string, color: GroupColor = GroupColor.Blue): Promise<TermNoteGroup> {
        const existingGroups = this.dataManager.getAllTermNoteGroups();
        const maxOrder = existingGroups.reduce((max, group) => Math.max(max, group.order), -1);
        const nextNumber = existingGroups.length > 0
            ? Math.max(...existingGroups.map(group => group.number || 0)) + 1
            : 1;

        const group: TermNoteGroup = {
            id: uuidv4(),
            name,
            displayName: `${nextNumber}. ${name}`,
            number: nextNumber,
            color,
            order: maxOrder + 1,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await this.dataManager.addTermNoteGroup(group);
        return group;
    }

    /**
     * 重命名分组
     */
    async renameGroup(id: string, newName: string): Promise<void> {
        const group = this.dataManager.getTermNoteGroup(id);
        if (!group) {
            throw new Error(`Term note group ${id} not found`);
        }

        await this.dataManager.updateTermNoteGroup(id, {
            name: newName,
            displayName: `${group.number}. ${newName}`
        });
    }

    /**
     * 删除分组
     */
    async deleteGroup(id: string): Promise<void> {
        await this.dataManager.deleteTermNoteGroup(id);
    }

    /**
     * 获取分组
     */
    getGroupById(id: string): TermNoteGroup | undefined {
        return this.dataManager.getTermNoteGroup(id);
    }

    /**
     * 获取所有分组
     */
    getAllGroups(): TermNoteGroup[] {
        return this.dataManager.getAllTermNoteGroups();
    }

    /**
     * 获取当前激活分组
     */
    getActiveTermNoteGroupId(): string | undefined {
        return this.dataManager.getActiveTermNoteGroupId();
    }

    /**
     * 设置当前激活分组
     */
    async setActiveTermNoteGroupId(id: string): Promise<void> {
        await this.dataManager.setActiveTermNoteGroupId(id);
    }
}
