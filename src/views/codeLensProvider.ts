import * as vscode from 'vscode';
import { DataManager } from '../data/dataManager';
import { RelationManager } from '../core/relationManager';
import { PathUtils } from '../utils/pathUtils';

/**
 * Bookmark CodeLens Provider
 * 在书签行上方显示标题（可配置）
 */
export class BookmarkCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(
        private dataManager: DataManager,
        private relationManager: RelationManager
    ) {
        // 监听数据变化，刷新 CodeLens
        dataManager.onDidChangeBookmarks(() => this.refresh());
        dataManager.onDidChangeRelations(() => this.refresh());
    }

    /**
     * 刷新 CodeLens
     */
    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    /**
     * 提供 CodeLens
     */
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];

        // 获取文件的书签
        const relativePath = PathUtils.toRelativePath(document.uri);
        const bookmarks = this.dataManager.getBookmarksByFile(relativePath);

        for (const bookmark of bookmarks) {
            const groups = this.relationManager.getGroupsForBookmark(bookmark.id);
            if (groups.length === 0) {
                continue;
            }

            // 为每个分组创建 CodeLens
            for (const group of groups) {
                const relation = this.dataManager.getRelation(`${bookmark.id}_${group.id}`);
                if (!relation) {
                    continue;
                }

                // CodeLens 位置（书签所在行）
                const range = new vscode.Range(
                    bookmark.line - 1, 0,
                    bookmark.line - 1, 0
                );

                // 创建 CodeLens
                const codeLens = new vscode.CodeLens(range, {
                    title: `$(bookmark) ${group.displayName}: ${relation.title}`,
                    tooltip: `Jump to bookmark in ${group.displayName}`,
                    command: 'groupBookmarks.jumpToBookmark',
                    arguments: [bookmark]
                });

                codeLenses.push(codeLens);
            }
        }

        return codeLenses;
    }
}
