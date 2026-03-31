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
        return this.compareVersions(dataVersion, this.getCurrentVersion()) < 0;
    }

    /**
     * 迁移分组数据（V1.0 → V1.1）
     * 为旧数据添加 number 和 displayName 字段
     */
    static migrateGroups(groups: unknown[], fromVersion: string): Group[] {
        if (this.needsMigration(fromVersion)) {
            return groups.map((group, index) => {
                const legacyGroup = this.asLegacyGroup(group);
                const name = typeof legacyGroup.name === 'string' ? legacyGroup.name : '';
                // 如果没有 number，按顺序分配
                const number = legacyGroup.number ?? (index + 1);
                const displayName = legacyGroup.displayName ?? `${number}. ${name}`;

                return {
                    ...legacyGroup,
                    number,
                    displayName,
                } as Group;
            });
        }
        return groups as Group[];
    }

    private static compareVersions(left: string, right: string): number {
        const [leftMajor, leftMinor, leftPatch] = this.parseVersion(left);
        const [rightMajor, rightMinor, rightPatch] = this.parseVersion(right);

        if (leftMajor !== rightMajor) {
            return leftMajor - rightMajor;
        }
        if (leftMinor !== rightMinor) {
            return leftMinor - rightMinor;
        }
        return leftPatch - rightPatch;
    }

    private static parseVersion(version: string): [number, number, number] {
        const [major = 0, minor = 0, patch = 0] = version.split('.', 3).map(part => {
            const value = Number.parseInt(part, 10);
            return Number.isFinite(value) ? value : 0;
        });
        return [major, minor, patch];
    }

    private static asLegacyGroup(group: unknown): Partial<Group> & { name?: string } {
        if (typeof group !== 'object' || group === null) {
            return {};
        }

        return group as Partial<Group> & { name?: string };
    }
}
