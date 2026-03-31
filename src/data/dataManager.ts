import * as vscode from 'vscode';
import {
    Bookmark,
    Group,
    BookmarkGroup,
    KeyNote,
    KeyNoteGroup,
    KeyNoteGroupRelation
} from '../models/types';
import { StorageService } from './storageService';

/**
 * 数据管理器 - 负责内存缓存和变更通知
 */
export class DataManager {
    private bookmarks: Map<string, Bookmark> = new Map();
    private groups: Map<string, Group> = new Map();
    private relations: Map<string, BookmarkGroup> = new Map();
    private keyNotes: Map<string, KeyNote> = new Map();
    private keyNoteGroups: Map<string, KeyNoteGroup> = new Map();
    private keyNoteRelations: Map<string, KeyNoteGroupRelation> = new Map();

    private _onDidChangeBookmarks = new vscode.EventEmitter<void>();
    private _onDidChangeGroups = new vscode.EventEmitter<void>();
    private _onDidChangeRelations = new vscode.EventEmitter<void>();
    private _onDidChangeKeyNotes = new vscode.EventEmitter<void>();
    private _onDidChangeKeyNoteGroups = new vscode.EventEmitter<void>();
    private _onDidChangeKeyNoteRelations = new vscode.EventEmitter<void>();

    public readonly onDidChangeBookmarks = this._onDidChangeBookmarks.event;
    public readonly onDidChangeGroups = this._onDidChangeGroups.event;
    public readonly onDidChangeRelations = this._onDidChangeRelations.event;
    public readonly onDidChangeKeyNotes = this._onDidChangeKeyNotes.event;
    public readonly onDidChangeKeyNoteGroups = this._onDidChangeKeyNoteGroups.event;
    public readonly onDidChangeKeyNoteRelations = this._onDidChangeKeyNoteRelations.event;

    constructor(private storageService: StorageService) { }

    getActiveGroupId(): string | undefined {
        return this.storageService.getActiveGroupId();
    }

    async setActiveGroupId(id: string | undefined): Promise<void> {
        await this.storageService.setActiveGroupId(id);
        this._onDidChangeGroups.fire(); // 触发 UI 刷新
    }

    getActiveKeyNoteGroupId(): string | undefined {
        return this.storageService.getActiveKeyNoteGroupId();
    }

    async setActiveKeyNoteGroupId(id: string | undefined): Promise<void> {
        await this.storageService.setActiveKeyNoteGroupId(id);
        this._onDidChangeKeyNoteGroups.fire();
    }

    /**
     * 从存储加载所有数据
     */
    async loadAll(): Promise<void> {
        const [bookmarks, groups, relations, keyNotes, keyNoteGroups, keyNoteRelations] = await Promise.all([
            this.storageService.loadBookmarks(),
            this.storageService.loadGroups(),
            this.storageService.loadRelations(),
            this.storageService.loadKeyNotes(),
            this.storageService.loadKeyNoteGroups(),
            this.storageService.loadKeyNoteRelations()
        ]);

        this.bookmarks.clear();
        bookmarks.forEach(b => this.bookmarks.set(b.id, b));

        this.groups.clear();
        groups.forEach(g => this.groups.set(g.id, g));

        this.relations.clear();
        relations.forEach(r => this.relations.set(r.id, r));

        this.keyNotes.clear();
        keyNotes.forEach(note => this.keyNotes.set(note.id, note));

        this.keyNoteGroups.clear();
        keyNoteGroups.forEach(group => this.keyNoteGroups.set(group.id, group));

        this.keyNoteRelations.clear();
        keyNoteRelations.forEach(relation => this.keyNoteRelations.set(relation.id, relation));
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

    // ===== Key Note 操作 =====

    getKeyNote(id: string): KeyNote | undefined {
        return this.keyNotes.get(id);
    }

    getAllKeyNotes(): KeyNote[] {
        return Array.from(this.keyNotes.values());
    }

    async addKeyNote(keyNote: KeyNote): Promise<void> {
        this.keyNotes.set(keyNote.id, keyNote);
        await this.storageService.saveKeyNotes(this.getAllKeyNotes());
        this._onDidChangeKeyNotes.fire();
    }

    async updateKeyNote(id: string, updates: Partial<KeyNote>): Promise<void> {
        const keyNote = this.keyNotes.get(id);
        if (!keyNote) {
            return;
        }

        Object.assign(keyNote, updates, { updatedAt: Date.now() });
        await this.storageService.saveKeyNotes(this.getAllKeyNotes());
        this._onDidChangeKeyNotes.fire();
    }

    async deleteKeyNote(id: string): Promise<void> {
        this.keyNotes.delete(id);

        const relationsToDelete = Array.from(this.keyNoteRelations.values())
            .filter(relation => relation.keyNoteId === id);

        for (const relation of relationsToDelete) {
            this.keyNoteRelations.delete(relation.id);
        }

        await Promise.all([
            this.storageService.saveKeyNotes(this.getAllKeyNotes()),
            this.storageService.saveKeyNoteRelations(this.getAllKeyNoteRelations())
        ]);

        this._onDidChangeKeyNotes.fire();
        this._onDidChangeKeyNoteRelations.fire();
    }

    getKeyNoteGroup(id: string): KeyNoteGroup | undefined {
        return this.keyNoteGroups.get(id);
    }

    getAllKeyNoteGroups(): KeyNoteGroup[] {
        return Array.from(this.keyNoteGroups.values()).sort((a, b) => a.order - b.order);
    }

    async addKeyNoteGroup(group: KeyNoteGroup): Promise<void> {
        this.keyNoteGroups.set(group.id, group);
        await this.storageService.saveKeyNoteGroups(this.getAllKeyNoteGroups());
        this._onDidChangeKeyNoteGroups.fire();
    }

    async updateKeyNoteGroup(id: string, updates: Partial<KeyNoteGroup>): Promise<void> {
        const group = this.keyNoteGroups.get(id);
        if (!group) {
            return;
        }

        Object.assign(group, updates, { updatedAt: Date.now() });
        await this.storageService.saveKeyNoteGroups(this.getAllKeyNoteGroups());
        this._onDidChangeKeyNoteGroups.fire();
    }

    async deleteKeyNoteGroup(id: string): Promise<void> {
        this.keyNoteGroups.delete(id);

        const relationsToDelete = Array.from(this.keyNoteRelations.values())
            .filter(relation => relation.groupId === id);

        for (const relation of relationsToDelete) {
            this.keyNoteRelations.delete(relation.id);
        }

        await Promise.all([
            this.storageService.saveKeyNoteGroups(this.getAllKeyNoteGroups()),
            this.storageService.saveKeyNoteRelations(this.getAllKeyNoteRelations())
        ]);

        this._onDidChangeKeyNoteGroups.fire();
        this._onDidChangeKeyNoteRelations.fire();
    }

    async reorderKeyNoteGroups(groupIds: string[]): Promise<void> {
        groupIds.forEach((id, index) => {
            const group = this.keyNoteGroups.get(id);
            if (group) {
                group.order = index;
            }
        });

        await this.storageService.saveKeyNoteGroups(this.getAllKeyNoteGroups());
        this._onDidChangeKeyNoteGroups.fire();
    }

    getKeyNoteRelation(id: string): KeyNoteGroupRelation | undefined {
        return this.keyNoteRelations.get(id);
    }

    getAllKeyNoteRelations(): KeyNoteGroupRelation[] {
        return Array.from(this.keyNoteRelations.values());
    }

    async addKeyNoteRelation(relation: KeyNoteGroupRelation): Promise<void> {
        this.keyNoteRelations.set(relation.id, relation);
        await this.storageService.saveKeyNoteRelations(this.getAllKeyNoteRelations());
        this._onDidChangeKeyNoteRelations.fire();
    }

    async updateKeyNoteRelation(id: string, updates: Partial<KeyNoteGroupRelation>): Promise<void> {
        const relation = this.keyNoteRelations.get(id);
        if (!relation) {
            return;
        }

        Object.assign(relation, updates);
        await this.storageService.saveKeyNoteRelations(this.getAllKeyNoteRelations());
        this._onDidChangeKeyNoteRelations.fire();
    }

    async deleteKeyNoteRelation(id: string): Promise<void> {
        this.keyNoteRelations.delete(id);
        await this.storageService.saveKeyNoteRelations(this.getAllKeyNoteRelations());
        this._onDidChangeKeyNoteRelations.fire();
    }

    async reorderKeyNoteRelationsInGroup(groupId: string, relationIds: string[]): Promise<void> {
        relationIds.forEach((id, index) => {
            const relation = this.keyNoteRelations.get(id);
            if (relation && relation.groupId === groupId) {
                relation.order = index;
            }
        });

        await this.storageService.saveKeyNoteRelations(this.getAllKeyNoteRelations());
        this._onDidChangeKeyNoteRelations.fire();
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
        this.keyNotes.clear();
        this.keyNoteGroups.clear();
        this.keyNoteRelations.clear();

        await Promise.all([
            this.storageService.saveBookmarks([]),
            this.storageService.saveGroups([]),
            this.storageService.saveRelations([]),
            this.storageService.saveKeyNotes([]),
            this.storageService.saveKeyNoteGroups([]),
            this.storageService.saveKeyNoteRelations([])
        ]);

        this._onDidChangeBookmarks.fire();
        this._onDidChangeGroups.fire();
        this._onDidChangeRelations.fire();
        this._onDidChangeKeyNotes.fire();
        this._onDidChangeKeyNoteGroups.fire();
        this._onDidChangeKeyNoteRelations.fire();
    }
}
