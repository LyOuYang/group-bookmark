import * as vscode from 'vscode';
import { Bookmark, Group, BookmarkGroup } from '../models/types';
import { StorageService } from './storageService';

/**
 * 数据管理器 - 负责内存缓存和变更通知
 */
export class DataManager {
    private bookmarks: Map<string, Bookmark> = new Map();
    private groups: Map<string, Group> = new Map();
    private relations: Map<string, BookmarkGroup> = new Map();

    private _onDidChangeBookmarks = new vscode.EventEmitter<void>();
    private _onDidChangeGroups = new vscode.EventEmitter<void>();
    private _onDidChangeRelations = new vscode.EventEmitter<void>();

    public readonly onDidChangeBookmarks = this._onDidChangeBookmarks.event;
    public readonly onDidChangeGroups = this._onDidChangeGroups.event;
    public readonly onDidChangeRelations = this._onDidChangeRelations.event;

    constructor(private storageService: StorageService) { }

    getActiveGroupId(): string | undefined {
        return this.storageService.getActiveGroupId();
    }

    async setActiveGroupId(id: string | undefined): Promise<void> {
        await this.storageService.setActiveGroupId(id);
        this._onDidChangeGroups.fire(); // 触发 UI 刷新
    }

    /**
     * 从存储加载所有数据
     */
    async loadAll(): Promise<void> {
        const [bookmarks, groups, relations] = await Promise.all([
            this.storageService.loadBookmarks(),
            this.storageService.loadGroups(),
            this.storageService.loadRelations()
        ]);

        this.bookmarks.clear();
        bookmarks.forEach(b => this.bookmarks.set(b.id, b));

        this.groups.clear();
        groups.forEach(g => this.groups.set(g.id, g));

        this.relations.clear();
        relations.forEach(r => this.relations.set(r.id, r));
    }

    // ===== Bookmark 操作 =====

    getBookmark(id: string): Bookmark | undefined {
        return this.bookmarks.get(id);
    }

    getAllBookmarks(): Bookmark[] {
        return Array.from(this.bookmarks.values());
    }

    getBookmarksByFile(fileUri: string): Bookmark[] {
        return this.getAllBookmarks().filter(b => b.fileUri === fileUri);
    }

    async addBookmark(bookmark: Bookmark): Promise<void> {
        this.bookmarks.set(bookmark.id, bookmark);
        await this.storageService.saveBookmarks(this.getAllBookmarks());
        this._onDidChangeBookmarks.fire();
    }

    async updateBookmark(id: string, updates: Partial<Bookmark>): Promise<void> {
        const bookmark = this.bookmarks.get(id);
        if (!bookmark) {
            return;
        }

        Object.assign(bookmark, updates, { updatedAt: Date.now() });
        await this.storageService.saveBookmarks(this.getAllBookmarks());
        this._onDidChangeBookmarks.fire();
    }

    /**
     * 批量更新书签（性能优化）
     */
    async batchUpdateBookmarks(updater: (bookmark: Bookmark) => boolean): Promise<void> {
        let changed = false;

        for (const bookmark of this.bookmarks.values()) {
            if (updater(bookmark)) {
                bookmark.updatedAt = Date.now();
                changed = true;
            }
        }

        if (changed) {
            await this.storageService.saveBookmarks(this.getAllBookmarks());
            this._onDidChangeBookmarks.fire();
        }
    }

    async deleteBookmark(id: string): Promise<void> {
        this.bookmarks.delete(id);

        // 同时删除所有相关的 relation
        const relationsToDelete = Array.from(this.relations.values())
            .filter(r => r.bookmarkId === id);

        for (const relation of relationsToDelete) {
            this.relations.delete(relation.id);
        }

        await Promise.all([
            this.storageService.saveBookmarks(this.getAllBookmarks()),
            this.storageService.saveRelations(this.getAllRelations())
        ]);

        this._onDidChangeBookmarks.fire();
        this._onDidChangeRelations.fire();
    }

    /**
     * 更新书签路径（文件重命名时调用）
     */
    async updateBookmarkPaths(oldUri: string, newUri: string): Promise<void> {
        let changed = false;

        for (const bookmark of this.bookmarks.values()) {
            if (bookmark.fileUri === oldUri) {
                bookmark.fileUri = newUri;
                bookmark.updatedAt = Date.now();
                changed = true;
            }
        }

        if (changed) {
            await this.storageService.saveBookmarks(this.getAllBookmarks());
            this._onDidChangeBookmarks.fire();
        }
    }

    /**
     * 标记书签为失效（文件删除时调用）
     */
    async markBookmarksAsInvalid(fileUri: string): Promise<void> {
        // 这里简单删除，也可以标记为 invalid
        const bookmarksToDelete = this.getAllBookmarks().filter(b => b.fileUri === fileUri);

        for (const bookmark of bookmarksToDelete) {
            await this.deleteBookmark(bookmark.id);
        }
    }

    // ===== Group 操作 =====

    getGroup(id: string): Group | undefined {
        return this.groups.get(id);
    }

    getAllGroups(): Group[] {
        return Array.from(this.groups.values()).sort((a, b) => a.order - b.order);
    }

    async addGroup(group: Group): Promise<void> {
        this.groups.set(group.id, group);
        await this.storageService.saveGroups(this.getAllGroups());
        this._onDidChangeGroups.fire();
    }

    async updateGroup(id: string, updates: Partial<Group>): Promise<void> {
        const group = this.groups.get(id);
        if (!group) {
            return;
        }

        Object.assign(group, updates, { updatedAt: Date.now() });
        await this.storageService.saveGroups(this.getAllGroups());
        this._onDidChangeGroups.fire();
    }

    async deleteGroup(id: string): Promise<void> {
        this.groups.delete(id);

        // 删除所有相关的 relation
        const relationsToDelete = Array.from(this.relations.values())
            .filter(r => r.groupId === id);

        for (const relation of relationsToDelete) {
            this.relations.delete(relation.id);
        }

        await Promise.all([
            this.storageService.saveGroups(this.getAllGroups()),
            this.storageService.saveRelations(this.getAllRelations())
        ]);

        this._onDidChangeGroups.fire();
        this._onDidChangeRelations.fire();
    }

    async reorderGroups(groupIds: string[]): Promise<void> {
        groupIds.forEach((id, index) => {
            const group = this.groups.get(id);
            if (group) {
                group.order = index;
            }
        });

        await this.storageService.saveGroups(this.getAllGroups());
        this._onDidChangeGroups.fire();
    }

    // ===== Relation 操作 =====

    getRelation(id: string): BookmarkGroup | undefined {
        return this.relations.get(id);
    }

    getAllRelations(): BookmarkGroup[] {
        return Array.from(this.relations.values());
    }

    getRelationsByBookmark(bookmarkId: string): BookmarkGroup[] {
        return this.getAllRelations().filter(r => r.bookmarkId === bookmarkId);
    }

    getRelationsByGroup(groupId: string): BookmarkGroup[] {
        return this.getAllRelations()
            .filter(r => r.groupId === groupId)
            .sort((a, b) => a.order - b.order);
    }

    getGroupsForBookmark(bookmarkId: string): Group[] {
        const relations = this.getRelationsByBookmark(bookmarkId);
        return relations
            .map(r => this.groups.get(r.groupId))
            .filter((g): g is Group => g !== undefined);
    }

    async addRelation(relation: BookmarkGroup): Promise<void> {
        this.relations.set(relation.id, relation);
        await this.storageService.saveRelations(this.getAllRelations());
        this._onDidChangeRelations.fire();
    }

    async updateRelation(id: string, updates: Partial<BookmarkGroup>): Promise<void> {
        const relation = this.relations.get(id);
        if (!relation) {
            return;
        }

        Object.assign(relation, updates);
        await this.storageService.saveRelations(this.getAllRelations());
        this._onDidChangeRelations.fire();
    }

    async deleteRelation(id: string): Promise<void> {
        this.relations.delete(id);
        await this.storageService.saveRelations(this.getAllRelations());
        this._onDidChangeRelations.fire();
    }

    async reorderRelationsInGroup(groupId: string, relationIds: string[]): Promise<void> {
        relationIds.forEach((id, index) => {
            const relation = this.relations.get(id);
            if (relation && relation.groupId === groupId) {
                relation.order = index;
            }
        });

        await this.storageService.saveRelations(this.getAllRelations());
        this._onDidChangeRelations.fire();
    }

    /**
     * 清理数据（用于测试）
     */
    async clear(): Promise<void> {
        this.bookmarks.clear();
        this.groups.clear();
        this.relations.clear();

        await Promise.all([
            this.storageService.saveBookmarks([]),
            this.storageService.saveGroups([]),
            this.storageService.saveRelations([])
        ]);

        this._onDidChangeBookmarks.fire();
        this._onDidChangeGroups.fire();
        this._onDidChangeRelations.fire();
    }
}
