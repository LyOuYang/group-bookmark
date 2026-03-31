import { v4 as uuidv4 } from 'uuid';
import { GroupColor, KeyNoteGroup } from '../models/types';
import { DataManager } from '../data/dataManager';

/**
 * 术语笔记分组管理器 - 负责分组的业务逻辑
 */
export class KeyNoteGroupManager {
    constructor(private dataManager: DataManager) { }

    /**
     * 创建分组
     */
    async createGroup(name: string, color: GroupColor = GroupColor.Blue): Promise<KeyNoteGroup> {
        const trimmedName = name.trim();
        if (!trimmedName) {
            throw new Error('Group name cannot be blank');
        }

        const existingGroups = this.dataManager.getAllKeyNoteGroups();
        const maxOrder = existingGroups.reduce((max, group) => Math.max(max, group.order), -1);
        const nextNumber = existingGroups.length > 0
            ? Math.max(...existingGroups.map(group => group.number || 0)) + 1
            : 1;

        const group: KeyNoteGroup = {
            id: uuidv4(),
            name: trimmedName,
            displayName: `${nextNumber}. ${trimmedName}`,
            number: nextNumber,
            color,
            order: maxOrder + 1,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await this.dataManager.addKeyNoteGroup(group);
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

        const group = this.dataManager.getKeyNoteGroup(id);
        if (!group) {
            throw new Error(`Key note group ${id} not found`);
        }

        await this.dataManager.updateKeyNoteGroup(id, {
            name: trimmedName,
            displayName: `${group.number}. ${trimmedName}`
        });
    }

    /**
     * 删除分组
     */
    async deleteGroup(id: string): Promise<void> {
        const activeGroupId = this.dataManager.getActiveKeyNoteGroupId();
        await this.dataManager.deleteKeyNoteGroup(id);

        if (activeGroupId === id) {
            await this.dataManager.setActiveKeyNoteGroupId(undefined);
        }
    }

    /**
     * 获取分组
     */
    getGroupById(id: string): KeyNoteGroup | undefined {
        return this.dataManager.getKeyNoteGroup(id);
    }

    /**
     * 获取所有分组
     */
    getAllGroups(): KeyNoteGroup[] {
        return this.dataManager.getAllKeyNoteGroups();
    }

    /**
     * 获取当前激活分组
     */
    getActiveKeyNoteGroupId(): string | undefined {
        return this.dataManager.getActiveKeyNoteGroupId();
    }

    /**
     * 设置当前激活分组
     */
    async setActiveKeyNoteGroupId(id: string | undefined): Promise<void> {
        if (id === undefined) {
            await this.dataManager.setActiveKeyNoteGroupId(undefined);
            return;
        }

        const group = this.dataManager.getKeyNoteGroup(id);
        if (!group) {
            throw new Error(`Key note group ${id} not found`);
        }

        await this.dataManager.setActiveKeyNoteGroupId(id);
    }
}
