import { Group } from '../models/types';

/**
 * 数据迁移服务
 * 负责自动升级旧版本数据
 */
export class MigrationService {
    /**
     * 当前数据版本
     */
    static getCurrentVersion(): string {
        return '1.1.0';
    }

    /**
     * 检测是否需要迁移
     */
    static needsMigration(dataVersion: string): boolean {
        return dataVersion < this.getCurrentVersion();
    }

    /**
     * 迁移分组数据（V1.0 → V1.1）
     * 为旧数据添加 number 和 displayName 字段
     */
    static migrateGroups(groups: any[], fromVersion: string): Group[] {
        if (fromVersion === '1.0.0' || !fromVersion) {
            return groups.map((group, index) => {
                // 如果没有 number，按顺序分配
                const number = group.number ?? (index + 1);
                const displayName = group.displayName ?? `${number}. ${group.name}`;

                return {
                    ...group,
                    number,
                    displayName,
                } as Group;
            });
        }
        return groups as Group[];
    }
}
