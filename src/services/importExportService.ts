import * as vscode from 'vscode';
import * as fs from 'fs';
import { StorageService } from '../data/storageService';
import { DataManager } from '../data/dataManager';
import { ExportData } from '../models/types';

/**
 * 导入导出服务
 */
export class ImportExportService {
    constructor(
        private storageService: StorageService,
        private dataManager: DataManager
    ) { }

    /**
     * 导出书签数据
     */
    async exportBookmarks(): Promise<void> {
        try {
            // 弹出保存对话框
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('group-bookmarks-export.json'),
                filters: {
                    'JSON Files': ['json']
                }
            });

            if (!uri) {
                return;
            }

            // 导出数据
            const data = await this.storageService.exportData();

            // 写入文件
            fs.writeFileSync(uri.fsPath, JSON.stringify(data, null, 2), 'utf-8');

            vscode.window.showInformationMessage(`Bookmarks exported to ${uri.fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export bookmarks: ${error}`);
        }
    }

    /**
     * 导入书签数据
     */
    async importBookmarks(): Promise<void> {
        try {
            // 弹出选择文件对话框
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: {
                    'JSON Files': ['json']
                }
            });

            if (!uris || uris.length === 0) {
                return;
            }

            // 读取文件
            const content = fs.readFileSync(uris[0].fsPath, 'utf-8');
            const data: ExportData = JSON.parse(content);

            // 验证数据格式
            if (!data.bookmarks || !data.groups || !data.relations) {
                throw new Error('Invalid export data format');
            }

            // 询问是否合并还是替换
            const action = await vscode.window.showQuickPick(
                [
                    { label: 'Merge', description: 'Add imported data to existing bookmarks', value: 'merge' },
                    { label: 'Replace', description: 'Replace all existing bookmarks', value: 'replace' }
                ],
                { placeHolder: 'How would you like to import?' }
            );

            if (!action) {
                return;
            }

            if (action.value === 'replace') {
                // 替换模式：直接导入
                await this.storageService.importData(data);
            } else {
                // 合并模式：需要处理 ID 冲突
                await this.mergeData(data);
            }

            // 重新加载数据
            await this.dataManager.loadAll();

            vscode.window.showInformationMessage('Bookmarks imported successfully!');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import bookmarks: ${error}`);
        }
    }

    /**
     * 合并导入数据
     */
    private async mergeData(importData: ExportData): Promise<void> {
        // 获取现有数据
        const existingBookmarks = this.dataManager.getAllBookmarks();
        const existingGroups = this.dataManager.getAllGroups();
        const existingRelations = this.dataManager.getAllRelations();

        // 创建 ID 映射（处理冲突）
        const bookmarkIdMap = new Map<string, string>();
        const groupIdMap = new Map<string, string>();

        // 处理分组
        for (const group of importData.groups) {
            const existingGroup = existingGroups.find(g => g.id === group.id);
            if (existingGroup) {
                // ID 冲突，生成新 ID
                const { v4: uuidv4 } = await import('uuid');
                const newId = uuidv4();
                groupIdMap.set(group.id, newId);
                group.id = newId;
            }
        }

        // 处理书签
        for (const bookmark of importData.bookmarks) {
            const existingBookmark = existingBookmarks.find(b => b.id === bookmark.id);
            if (existingBookmark) {
                // ID 冲突，生成新 ID
                const { v4: uuidv4 } = await import('uuid');
                const newId = uuidv4();
                bookmarkIdMap.set(bookmark.id, newId);
                bookmark.id = newId;
            }
        }

        // 处理关联关系（更新映射的 ID）
        for (const relation of importData.relations) {
            const newBookmarkId = bookmarkIdMap.get(relation.bookmarkId) || relation.bookmarkId;
            const newGroupId = groupIdMap.get(relation.groupId) || relation.groupId;

            relation.bookmarkId = newBookmarkId;
            relation.groupId = newGroupId;
            relation.id = `${newBookmarkId}_${newGroupId}`;
        }

        // 合并数据
        const mergedData: ExportData = {
            version: importData.version,
            workspace: importData.workspace,
            exportedAt: new Date().toISOString(),
            bookmarks: [...existingBookmarks, ...importData.bookmarks],
            groups: [...existingGroups, ...importData.groups],
            relations: [...existingRelations, ...importData.relations]
        };

        // 保存合并后的数据
        await this.storageService.saveBookmarks(mergedData.bookmarks);
        await this.storageService.saveGroups(mergedData.groups);
        await this.storageService.saveRelations(mergedData.relations);
    }
}
