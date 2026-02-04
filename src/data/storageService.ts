import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    Bookmark,
    Group,
    BookmarkGroup,
    BookmarksData,
    GroupsData,
    RelationsData,
    ExportData,
    DATA_VERSION
} from '../models/types';
import { MigrationService } from '../services/migrationService';

/**
 * 存储服务 - 负责 JSON 文件的读写和备份
 */
export class StorageService {
    private storagePath: string;
    private backupPath: string;
    private maxBackups = 5;
    private backupTimer?: NodeJS.Timeout;
    private readonly BACKUP_DEBOUNCE_MS = 1000; // 1秒防抖

    constructor(private context: vscode.ExtensionContext) {
        // 使用 workspace 根目录下的 .vscode/groupbookmarks
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        this.storagePath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'groupbookmarks');
        this.backupPath = path.join(this.storagePath, 'backup');

        // 确保目录存在
        this.ensureDirectories();
    }

    /**
     * 确保存储目录存在
     */
    private ensureDirectories(): void {
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
        if (!fs.existsSync(this.backupPath)) {
            fs.mkdirSync(this.backupPath, { recursive: true });
        }
    }

    /**
     * 加载书签数据
     */
    async loadBookmarks(): Promise<Bookmark[]> {
        const filePath = path.join(this.storagePath, 'bookmarks.json');
        if (!fs.existsSync(filePath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data: BookmarksData = JSON.parse(content);

            // 版本检查
            if (data.version !== DATA_VERSION) {
                console.warn(`Data version mismatch: ${data.version} vs ${DATA_VERSION}`);
                // 异步显示警告，不阻塞加载
                vscode.window.showWarningMessage(
                    `Bookmarks data version mismatch (${data.version} vs ${DATA_VERSION}). Some features may not work correctly.`,
                    'Learn More'
                ).then(selection => {
                    if (selection === 'Learn More') {
                        vscode.env.openExternal(vscode.Uri.parse('https://github.com/your-repo/group-bookmarks#migration'));
                    }
                });
            }

            return data.bookmarks || [];
        } catch (error) {
            console.error('Failed to load bookmarks:', error);
            return [];
        }
    }

    /**
     * 保存书签数据
     */
    async saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
        const filePath = path.join(this.storagePath, 'bookmarks.json');
        const data: BookmarksData = {
            version: DATA_VERSION,
            bookmarks
        };

        // 计划备份（防抖）
        this.scheduleBackup();

        // 保存数据
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    /**
     * 加载分组数据
     */
    async loadGroups(): Promise<Group[]> {
        const filePath = path.join(this.storagePath, 'groups.json');
        if (!fs.existsSync(filePath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data: GroupsData = JSON.parse(content);

            // 检测版本并自动迁移
            if (MigrationService.needsMigration(data.version || '1.0.0')) {
                const migratedGroups = MigrationService.migrateGroups(data.groups || [], data.version || '1.0.0');

                // 保存迁移后的数据
                await this.saveGroups(migratedGroups);

                vscode.window.showInformationMessage(
                    '✅ GroupBookmarks data upgraded to V1.1'
                );

                return migratedGroups;
            }

            return data.groups || [];
        } catch (error) {
            console.error('Failed to load groups:', error);
            return [];
        }
    }

    /**
     * 保存分组数据
     */
    async saveGroups(groups: Group[]): Promise<void> {
        const filePath = path.join(this.storagePath, 'groups.json');
        const data: GroupsData = {
            version: DATA_VERSION,
            groups
        };

        this.scheduleBackup();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    /**
     * 加载关联关系数据
     */
    async loadRelations(): Promise<BookmarkGroup[]> {
        const filePath = path.join(this.storagePath, 'relations.json');
        if (!fs.existsSync(filePath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data: RelationsData = JSON.parse(content);
            return data.relations || [];
        } catch (error) {
            console.error('Failed to load relations:', error);
            return [];
        }
    }

    /**
     * 保存关联关系数据
     */
    async saveRelations(relations: BookmarkGroup[]): Promise<void> {
        const filePath = path.join(this.storagePath, 'relations.json');
        const data: RelationsData = {
            version: DATA_VERSION,
            relations
        };

        this.scheduleBackup();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    /**
     * 计划备份（防抖）
     */
    private scheduleBackup(): void {
        // 清除之前的定时器
        if (this.backupTimer) {
            clearTimeout(this.backupTimer);
        }

        // 设置新的定时器
        this.backupTimer = setTimeout(() => {
            this.backup().catch(error => {
                console.error('Scheduled backup failed:', error);
            });
        }, this.BACKUP_DEBOUNCE_MS);
    }

    /**
     * 备份当前数据
     */
    private async backup(): Promise<void> {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const backupDir = path.join(this.backupPath, timestamp);

            fs.mkdirSync(backupDir, { recursive: true });

            // 复制所有文件
            const files = ['bookmarks.json', 'groups.json', 'relations.json'];
            for (const file of files) {
                const sourcePath = path.join(this.storagePath, file);
                if (fs.existsSync(sourcePath)) {
                    const destPath = path.join(backupDir, file);
                    fs.copyFileSync(sourcePath, destPath);
                }
            }

            // 清理旧备份（保留最近 5 个）
            await this.cleanOldBackups();
        } catch (error) {
            console.error('Backup failed:', error);
        }
    }

    /**
     * 清理旧备份
     */
    private async cleanOldBackups(): Promise<void> {
        try {
            const backups = fs.readdirSync(this.backupPath)
                .filter(name => fs.statSync(path.join(this.backupPath, name)).isDirectory())
                .sort()
                .reverse();

            // 删除超过 maxBackups 的旧备份
            for (let i = this.maxBackups; i < backups.length; i++) {
                const backupDir = path.join(this.backupPath, backups[i]);
                fs.rmSync(backupDir, { recursive: true, force: true });
            }
        } catch (error) {
            console.error('Failed to clean old backups:', error);
        }
    }

    /**
     * 导出所有数据
     */
    async exportData(): Promise<ExportData> {
        const bookmarks = await this.loadBookmarks();
        const groups = await this.loadGroups();
        const relations = await this.loadRelations();

        const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || 'Unknown';

        return {
            version: DATA_VERSION,
            platform: 'vscode',
            workspace: workspaceName,
            exportedAt: new Date().toISOString(),
            bookmarks,
            groups,
            relations
        };
    }

    /**
     * 导入数据
     */
    async importData(data: ExportData): Promise<void> {
        // 强制备份当前数据
        await this.backup();

        // 导入新数据
        await this.saveBookmarks(data.bookmarks);
        await this.saveGroups(data.groups);
        await this.saveRelations(data.relations);
    }

    /**
     * 获取存储路径
     */
    getStoragePath(): string {
        return this.storagePath;
    }

    /**
     * 获取当前活动分组 ID
     */
    getActiveGroupId(): string | undefined {
        return this.context.workspaceState.get<string>('activeGroupId');
    }

    /**
     * 设置当前活动分组 ID
     */
    async setActiveGroupId(id: string | undefined): Promise<void> {
        await this.context.workspaceState.update('activeGroupId', id);
    }
}
