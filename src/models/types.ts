/**
 * 书签数据模型
 */
export interface Bookmark {
    id: string;                    // UUID v4
    fileUri: string;               // 文件相对路径（如 "src/user.ts"）
    line: number;                  // 行号（1-indexed）
    column: number;                // 列号（0-indexed）
    createdAt: number;             // Unix 时间戳（毫秒）
    updatedAt: number;             // Unix 时间戳（毫秒）
}

/**
 * 分组数据模型
 */
export interface Group {
    id: string;                    // UUID v4
    name: string;                  // 分组名称（原始名称，不含编号）
    displayName: string;           // 显示名称（含编号，如 "1. 前端架构"）
    number: number;                // 分组编号（自动分配，不回收）
    color: GroupColor;             // 分组颜色
    order: number;                 // 排序权重（0-based）
    sortMode: SortMode;            // 排序模式
    createdAt: number;
    updatedAt: number;
}

/**
 * 书签-分组关联关系
 */
export interface BookmarkGroup {
    id: string;                    // 复合键：`${bookmarkId}_${groupId}`
    bookmarkId: string;            // 外键 → Bookmark.id
    groupId: string;               // 外键 → Group.id
    title: string;                 // 在该分组中的标题
    order: number;                 // 在该分组中的排序权重
    createdAt: number;
}

/**
 * 分组颜色枚举
 */
export enum GroupColor {
    Red = '#FF6B6B',
    Orange = '#FFA500',
    Yellow = '#FFD700',
    Green = '#4CAF50',
    Blue = '#2196F3',
    Purple = '#9C27B0',
    Pink = '#E91E63',
    Gray = '#9E9E9E'
}

/**
 * 排序模式
 */
export type SortMode = 'custom' | 'name';

/**
 * 导出数据格式
 */
export interface ExportData {
    version: string;
    platform?: string;
    workspace: string;
    exportedAt: string;
    bookmarks: Bookmark[];
    groups: Group[];
    relations: BookmarkGroup[];
}

/**
 * 存储数据格式（bookmarks.json）
 */
export interface BookmarksData {
    version: string;
    bookmarks: Bookmark[];
}

/**
 * 存储数据格式（groups.json）
 */
export interface GroupsData {
    version: string;
    groups: Group[];
}

/**
 * 存储数据格式（relations.json）
 */
export interface RelationsData {
    version: string;
    relations: BookmarkGroup[];
}

/**
 * 数据版本号
 */
export const DATA_VERSION = '1.1.0';

/**
 * 平台标识
 */
export const PLATFORM = 'vscode';
