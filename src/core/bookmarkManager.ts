import { v4 as uuidv4 } from 'uuid';
import { Bookmark } from '../models/types';
import { DataManager } from '../data/dataManager';

/**
 * 书签管理器 - 负责书签的业务逻辑
 */
export class BookmarkManager {
    constructor(private dataManager: DataManager) { }

    /**
     * 创建书签
     */
    async createBookmark(fileUri: string, line: number, column: number = 0): Promise<Bookmark> {
        const bookmark: Bookmark = {
            id: uuidv4(),
            fileUri,
            line,
            column,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await this.dataManager.addBookmark(bookmark);
        return bookmark;
    }

    /**
     * 删除书签
     */
    async deleteBookmark(id: string): Promise<void> {
        await this.dataManager.deleteBookmark(id);
    }

    /**
     * 获取书签
     */
    getBookmarkById(id: string): Bookmark | undefined {
        return this.dataManager.getBookmark(id);
    }

    /**
     * 获取所有书签
     */
    getAllBookmarks(): Bookmark[] {
        return this.dataManager.getAllBookmarks();
    }

    /**
     * 获取指定文件的所有书签
     */
    getBookmarksForFile(fileUri: string): Bookmark[] {
        return this.dataManager.getBookmarksByFile(fileUri);
    }

    /**
     * 更新书签位置
     */
    async updateBookmarkPosition(id: string, line: number, column: number = 0): Promise<void> {
        await this.dataManager.updateBookmark(id, { line, column });
    }

    /**
     * 移动指定行号之后的书签
     * @param fileUri 文件路径（相对路径）
     * @param afterLine 在该行之后（不包含）的书签需要移动 (1-indexed)
     * @param delta 行数变化量（正数向下，负数向上）
     */
    async shiftBookmarks(fileUri: string, afterLine: number, delta: number): Promise<void> {
        if (delta === 0) return;

        // 批量更新 DataManager 中的数据
        await this.dataManager.batchUpdateBookmarks(bookmark => {
            if (bookmark.fileUri === fileUri && bookmark.line > afterLine) {
                bookmark.line += delta;
                return true; // 标记发生变更
            }
            return false;
        });
    }

    /**
     * 更新书签路径（文件重命名时调用）
     */
    async updateBookmarkPath(oldUri: string, newUri: string): Promise<void> {
        await this.dataManager.updateBookmarkPaths(oldUri, newUri);
    }

    /**
     * 处理文件删除
     */
    async handleFileDeleted(fileUri: string): Promise<void> {
        await this.dataManager.markBookmarksAsInvalid(fileUri);
    }
}
