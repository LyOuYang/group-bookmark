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
        const trimmedName = name.trim();
        if (!trimmedName) {
            throw new Error('Group name cannot be blank');
        }

        const existingGroups = this.dataManager.getAllTermNoteGroups();
        const maxOrder = existingGroups.reduce((max, group) => Math.max(max, group.order), -1);
        const nextNumber = existingGroups.length > 0
            ? Math.max(...existingGroups.map(group => group.number || 0)) + 1
            : 1;

        const group: TermNoteGroup = {
            id: uuidv4(),
            name: trimmedName,
            displayName: `${nextNumber}. ${trimmedName}`,
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
        const trimmedName = newName.trim();
        if (!trimmedName) {
            throw new Error('Group name cannot be blank');
        }

        const group = this.dataManager.getTermNoteGroup(id);
        if (!group) {
            throw new Error(`Term note group ${id} not found`);
        }

        await this.dataManager.updateTermNoteGroup(id, {
            name: trimmedName,
            displayName: `${group.number}. ${trimmedName}`
        });
    }

    /**
     * 删除分组
     */
    async deleteGroup(id: string): Promise<void> {
        const activeGroupId = this.dataManager.getActiveTermNoteGroupId();
        await this.dataManager.deleteTermNoteGroup(id);

        if (activeGroupId === id) {
            await this.dataManager.setActiveTermNoteGroupId(undefined);
        }
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
    async setActiveTermNoteGroupId(id: string | undefined): Promise<void> {
        if (id === undefined) {
            await this.dataManager.setActiveTermNoteGroupId(undefined);
            return;
        }

        const group = this.dataManager.getTermNoteGroup(id);
        if (!group) {
            throw new Error(`Term note group ${id} not found`);
        }

        await this.dataManager.setActiveTermNoteGroupId(id);
    }
}
