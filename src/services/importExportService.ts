import * as vscode from 'vscode';
import * as fs from 'fs';
import { StorageService } from '../data/storageService';
import { DataManager } from '../data/dataManager';
import { ExportData, ExportScope } from '../models/types';

type ImportMode = 'merge' | 'replace';

/**
 * 导入导出服务
 */
export class ImportExportService {
    constructor(
        private storageService: StorageService,
        private dataManager: DataManager
    ) { }

    /**
     * 导出书签或笔记数据
     * @param scope 导出的作用域
     */
    async exportData(scope: ExportScope): Promise<void> {
        try {
            // 弹出保存对话框
            let exportName = 'group-bookmarks-export.json';
            if (scope === 'bookmarks') {exportName = 'group-bookmarks-only.json';}
            if (scope === 'keyNotes') {exportName = 'group-key-notes-only.json';}

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(exportName),
                filters: { 'JSON Files': ['json'] }
            });

            if (!uri) {
                return;
            }

            // 导出数据
            const data = await this.storageService.exportData(scope);

            // 写入文件
            fs.writeFileSync(uri.fsPath, JSON.stringify(data, null, 2), 'utf-8');

            vscode.window.showInformationMessage(`Data (${scope}) exported to ${uri.fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export data: ${error}`);
        }
    }

    /**
     * 导入书签或笔记数据
     * @param scope 导入的作用域
     */
    async importData(scope: ExportScope): Promise<void> {
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
            if (typeof data !== 'object' || !data.version) {
                throw new Error('Invalid export data format');
            }
            if (!this.hasDataForScope(data, scope)) {
                throw new Error(`Selected file does not contain ${this.getScopeLabel(scope)} data`);
            }

            // 询问是否合并还是替换
            const action = await vscode.window.showQuickPick(
                this.getImportModeOptions(scope),
                { placeHolder: 'How would you like to import?' }
            );

            if (!action) {
                return;
            }

            if (action.value === 'replace') {
                const dataToImport = this.buildReplaceImportData(data, scope);
                await this.storageService.importData(dataToImport);
            } else {
                // 合并模式：需要处理 ID 冲突，并同样遵从 scope 指令
                await this.mergeData(this.cloneExportData(data), scope);
            }

            // 重新加载数据
            await this.dataManager.loadAll();

            vscode.window.showInformationMessage(`Data (${scope}) imported successfully!`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import data: ${error}`);
        }
    }

    /**
     * 合并导入数据
     */
    private async mergeData(importData: ExportData, scope: ExportScope): Promise<void> {
        // ---- 书签部分 ----
        const existingBookmarks = this.dataManager.getAllBookmarks();
        const existingGroups = this.dataManager.getAllGroups();
        const existingRelations = this.dataManager.getAllRelations();

        const bookmarkIdMap = new Map<string, string>();
        const groupIdMap = new Map<string, string>();

        if ((scope === 'all' || scope === 'bookmarks') && importData.groups) {
            for (const group of importData.groups) {
                const existingGroup = existingGroups.find(g => g.id === group.id);
                if (existingGroup) {
                    const { v4: uuidv4 } = await import('uuid');
                    const newId = uuidv4();
                    groupIdMap.set(group.id, newId);
                    group.id = newId;
                }
            }
        }

        if ((scope === 'all' || scope === 'bookmarks') && importData.bookmarks) {
            for (const bookmark of importData.bookmarks) {
                const existingBookmark = existingBookmarks.find(b => b.id === bookmark.id);
                if (existingBookmark) {
                    const { v4: uuidv4 } = await import('uuid');
                    const newId = uuidv4();
                    bookmarkIdMap.set(bookmark.id, newId);
                    bookmark.id = newId;
                }
            }
        }

        if ((scope === 'all' || scope === 'bookmarks') && importData.relations) {
            for (const relation of importData.relations) {
                const newBookmarkId = bookmarkIdMap.get(relation.bookmarkId) || relation.bookmarkId;
                const newGroupId = groupIdMap.get(relation.groupId) || relation.groupId;

                relation.bookmarkId = newBookmarkId;
                relation.groupId = newGroupId;
                relation.id = `${newBookmarkId}_${newGroupId}`;
            }
        }

        // 加载现有的 Key Note 数据
        const existingKeyNotes = this.dataManager.getAllKeyNotes();
        const existingKeyNoteGroups = this.dataManager.getAllKeyNoteGroups();
        const existingKeyNoteRelations = this.dataManager.getAllKeyNoteRelations();

        const keyNoteIdMap = new Map<string, string>();
        const keyNoteGroupIdMap = new Map<string, string>();

        // 处理 Key Note 分组
        if ((scope === 'all' || scope === 'keyNotes') && importData.keyNoteGroups) {
            for (const group of importData.keyNoteGroups) {
                const existingGroup = existingKeyNoteGroups.find(g => g.id === group.id);
                if (existingGroup) {
                    const { v4: uuidv4 } = await import('uuid');
                    const newId = uuidv4();
                    keyNoteGroupIdMap.set(group.id, newId);
                    group.id = newId;
                }
            }
        }

        // 处理 Key Note
        if ((scope === 'all' || scope === 'keyNotes') && importData.keyNotes) {
            for (const note of importData.keyNotes) {
                const existingNote = existingKeyNotes.find(n => n.id === note.id);
                if (existingNote) {
                    const { v4: uuidv4 } = await import('uuid');
                    const newId = uuidv4();
                    keyNoteIdMap.set(note.id, newId);
                    note.id = newId;
                }
            }
        }

        // 处理 Key Note 关联关系
        if ((scope === 'all' || scope === 'keyNotes') && importData.keyNoteRelations) {
            for (const relation of importData.keyNoteRelations) {
                const newNoteId = keyNoteIdMap.get(relation.keyNoteId) || relation.keyNoteId;
                const newGroupId = keyNoteGroupIdMap.get(relation.groupId) || relation.groupId;

                relation.keyNoteId = newNoteId;
                relation.groupId = newGroupId;
                relation.id = `${newNoteId}_${newGroupId}`;
            }
        }

        // 合并数据
        const mergedData: ExportData = {
            version: importData.version,
            workspace: importData.workspace,
            exportedAt: new Date().toISOString(),
            bookmarks: scope === 'all' || scope === 'bookmarks' ? [...existingBookmarks, ...(importData.bookmarks || [])] : existingBookmarks,
            groups: scope === 'all' || scope === 'bookmarks' ? [...existingGroups, ...(importData.groups || [])] : existingGroups,
            relations: scope === 'all' || scope === 'bookmarks' ? [...existingRelations, ...(importData.relations || [])] : existingRelations,
            keyNotes: scope === 'all' || scope === 'keyNotes' ? [...existingKeyNotes, ...(importData.keyNotes || [])] : existingKeyNotes,
            keyNoteGroups: scope === 'all' || scope === 'keyNotes' ? [...existingKeyNoteGroups, ...(importData.keyNoteGroups || [])] : existingKeyNoteGroups,
            keyNoteRelations: scope === 'all' || scope === 'keyNotes' ? [...existingKeyNoteRelations, ...(importData.keyNoteRelations || [])] : existingKeyNoteRelations
        };

        // 保存合并后的数据
        if (scope === 'all' || scope === 'bookmarks') {
            await this.storageService.saveBookmarks(mergedData.bookmarks || []);
            await this.storageService.saveGroups(mergedData.groups || []);
            await this.storageService.saveRelations(mergedData.relations || []);
        }
        
        if (mergedData.keyNotes) {
            await this.storageService.saveKeyNotes(mergedData.keyNotes);
        }
        if (mergedData.keyNoteGroups) {
            await this.storageService.saveKeyNoteGroups(mergedData.keyNoteGroups);
        }
        if (mergedData.keyNoteRelations) {
            await this.storageService.saveKeyNoteRelations(mergedData.keyNoteRelations);
        }
    }

    private getImportModeOptions(scope: ExportScope): Array<{ label: string; description: string; value: ImportMode }> {
        const scopeLabel = this.getScopeLabel(scope);

        return [
            { label: 'Merge', description: `Add imported ${scopeLabel} to the current workspace`, value: 'merge' },
            { label: 'Replace', description: `Replace the current ${scopeLabel}`, value: 'replace' }
        ];
    }

    private getScopeLabel(scope: ExportScope): string {
        if (scope === 'bookmarks') {
            return 'bookmarks';
        }

        if (scope === 'keyNotes') {
            return 'key note data';
        }

        return 'bookmarks and key notes';
    }

    private hasDataForScope(data: ExportData, scope: ExportScope): boolean {
        if (scope === 'bookmarks') {
            return data.bookmarks !== undefined || data.groups !== undefined || data.relations !== undefined;
        }

        if (scope === 'keyNotes') {
            return data.keyNotes !== undefined || data.keyNoteGroups !== undefined || data.keyNoteRelations !== undefined;
        }

        return this.hasDataForScope(data, 'bookmarks') || this.hasDataForScope(data, 'keyNotes');
    }

    private buildReplaceImportData(data: ExportData, scope: ExportScope): ExportData {
        const cloned = this.cloneExportData(data);
        const scopedData: ExportData = {
            version: cloned.version,
            platform: cloned.platform,
            workspace: cloned.workspace,
            exportedAt: cloned.exportedAt
        };

        if (scope === 'all' || scope === 'bookmarks') {
            scopedData.bookmarks = cloned.bookmarks || [];
            scopedData.groups = cloned.groups || [];
            scopedData.relations = cloned.relations || [];
        }

        if (scope === 'all' || scope === 'keyNotes') {
            scopedData.keyNotes = cloned.keyNotes || [];
            scopedData.keyNoteGroups = cloned.keyNoteGroups || [];
            scopedData.keyNoteRelations = cloned.keyNoteRelations || [];
        }

        return scopedData;
    }

    private cloneExportData(data: ExportData): ExportData {
        return {
            ...data,
            bookmarks: data.bookmarks?.map(bookmark => ({ ...bookmark })),
            groups: data.groups?.map(group => ({ ...group })),
            relations: data.relations?.map(relation => ({ ...relation })),
            keyNotes: data.keyNotes?.map(note => ({ ...note })),
            keyNoteGroups: data.keyNoteGroups?.map(group => ({ ...group })),
            keyNoteRelations: data.keyNoteRelations?.map(relation => ({ ...relation }))
        };
    }
}
