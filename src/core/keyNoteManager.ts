import { v4 as uuidv4 } from 'uuid';
import { KeyNote } from '../models/types';
import { extractNormalizedTerm } from '../utils/keyNoteUtils';
import { DataManager } from '../data/dataManager';

/**
 * 术语笔记管理器 - 负责词条本体的业务逻辑
 */
export class KeyNoteManager {
    constructor(private dataManager: DataManager) { }

    /**
     * 创建或获取词条笔记
     */
    async createOrGetKeyNote(term: string): Promise<KeyNote> {
        const normalizedTerm = extractNormalizedTerm(term);
        if (!normalizedTerm) {
            throw new Error('Term cannot be blank');
        }

        const existing = this.getByNormalizedTerm(normalizedTerm);

        if (existing) {
            return existing;
        }

        const now = Date.now();
        const keyNote: KeyNote = {
            id: uuidv4(),
            term: term.trim(),
            normalizedTerm,
            contentMarkdown: '',
            createdAt: now,
            updatedAt: now
        };

        await this.dataManager.addKeyNote(keyNote);
        return keyNote;
    }

    /**
     * 更新词条正文
     */
    async updateContent(noteId: string, contentMarkdown: string): Promise<void> {
        await this.dataManager.updateKeyNote(noteId, { contentMarkdown });
    }

    /**
     * 重命名词条
     */
    async renameKeyNote(noteId: string, term: string): Promise<void> {
        const normalizedTerm = extractNormalizedTerm(term);
        if (!normalizedTerm) {
            throw new Error('Term cannot be blank');
        }

        const note = this.getById(noteId);
        if (!note) {
            throw new Error(`Key note ${noteId} not found`);
        }

        const existing = this.getByNormalizedTerm(normalizedTerm);
        if (existing && existing.id !== noteId) {
            throw new Error('Key note term already exists');
        }

        await this.dataManager.updateKeyNote(noteId, {
            term: term.trim(),
            normalizedTerm,
        });
    }

    /**
     * 删除词条笔记
     */
    async deleteKeyNote(noteId: string): Promise<void> {
        await this.dataManager.deleteKeyNote(noteId);
    }

    /**
     * 按 ID 查找词条笔记
     */
    getById(noteId: string): KeyNote | undefined {
        return this.dataManager.getKeyNote(noteId);
    }

    /**
     * 按规范化词条查找
     */
    getByNormalizedTerm(normalizedTerm: string): KeyNote | undefined {
        return this.dataManager.getAllKeyNotes().find(note => note.normalizedTerm === normalizedTerm);
    }
    /**
     * 获取所有词条笔记
     */
    getAllKeyNotes(): KeyNote[] {
        return this.dataManager.getAllKeyNotes();
    }
}
