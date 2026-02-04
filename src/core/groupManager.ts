import { v4 as uuidv4 } from 'uuid';
import { Group, GroupColor, SortMode } from '../models/types';
import { DataManager } from '../data/dataManager';

/**
 * 分组管理器 - 负责分组的业务逻辑
 */
export class GroupManager {
    constructor(private dataManager: DataManager) { }

    /**
     * 创建分组
     */
    async createGroup(name: string, color: GroupColor = GroupColor.Blue): Promise<Group> {
        const existingGroups = this.dataManager.getAllGroups();
        const maxOrder = existingGroups.reduce((max, g) => Math.max(max, g.order), -1);

        // 计算下一个编号（从现有分组中找最大编号）
        const nextNumber = existingGroups.length > 0
            ? Math.max(...existingGroups.map(g => g.number || 0)) + 1
            : 1;

        const group: Group = {
            id: uuidv4(),
            name,
            displayName: `${nextNumber}. ${name}`,  // 自动生成显示名称
            number: nextNumber,                     // 自动分配编号
            color,
            order: maxOrder + 1,
            sortMode: 'custom',
            showGhostText: true,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await this.dataManager.addGroup(group);
        return group;
    }

    /**
     * 删除分组
     * 注意：会同时删除所有关联的 relation（在 DataManager 中处理）
     */
    async deleteGroup(id: string): Promise<void> {
        await this.dataManager.deleteGroup(id);
    }

    /**
     * 重命名分组（保持编号不变）
     */
    async renameGroup(id: string, newName: string): Promise<void> {
        const group = this.dataManager.getGroup(id);
        if (!group) {
            throw new Error(`Group ${id} not found`);
        }

        // 保持编号不变，更新 displayName
        await this.dataManager.updateGroup(id, {
            name: newName,
            displayName: `${group.number}. ${newName}`
        });
    }

    /**
     * 修改分组颜色
     */
    async changeGroupColor(id: string, color: GroupColor): Promise<void> {
        await this.dataManager.updateGroup(id, { color });
    }

    /**
     * 修改排序模式
     */
    async changeSortMode(id: string, sortMode: SortMode): Promise<void> {
        await this.dataManager.updateGroup(id, { sortMode });
    }

    /**
     * 重新排序分组
     */
    async reorderGroups(groupIds: string[]): Promise<void> {
        await this.dataManager.reorderGroups(groupIds);
    }

    /**
     * 切换分组的 Ghost Text 显示状态
     */
    async toggleGroupGhostText(id: string): Promise<void> {
        const group = this.dataManager.getGroup(id);
        if (!group) return;

        // 如果未定义，视为 true，取反为 false
        const current = group.showGhostText !== false;
        await this.dataManager.updateGroup(id, { showGhostText: !current });
    }

    /**
     * 获取分组
     */
    getGroupById(id: string): Group | undefined {
        return this.dataManager.getGroup(id);
    }

    /**
     * 获取所有分组（已排序）
     */
    getAllGroups(): Group[] {
        return this.dataManager.getAllGroups();
    }

    /**
     * 获取分组中的书签数量
     */
    getBookmarkCountInGroup(groupId: string): number {
        return this.dataManager.getRelationsByGroup(groupId).length;
    }

    getActiveGroupId(): string | undefined {
        return this.dataManager.getActiveGroupId();
    }

    async setActiveGroup(id: string): Promise<void> {
        await this.dataManager.setActiveGroupId(id);
    }
}
