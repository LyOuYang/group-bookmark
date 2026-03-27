import { v4 as uuidv4 } from 'uuid';
import { TermNote } from '../models/types';
import { extractNormalizedTerm } from '../utils/termNoteUtils';
import { DataManager } from '../data/dataManager';

/**
 * 术语笔记管理器 - 负责词条本体的业务逻辑
 */
export class TermNoteManager {
    constructor(private dataManager: DataManager) { }

    /**
     * 创建或获取词条笔记
     */
    async createOrGetTermNote(term: string): Promise<TermNote> {
        const normalizedTerm = extractNormalizedTerm(term);
        if (!normalizedTerm) {
            throw new Error('Term cannot be blank');
        }

        const existing = this.getByNormalizedTerm(normalizedTerm);

        if (existing) {
            return existing;
        }

        const now = Date.now();
        const termNote: TermNote = {
            id: uuidv4(),
            term: term.trim(),
            normalizedTerm,
            contentMarkdown: '',
            createdAt: now,
            updatedAt: now
        };

        await this.dataManager.addTermNote(termNote);
        return termNote;
    }

    /**
     * 更新词条正文
     */
    async updateContent(noteId: string, contentMarkdown: string): Promise<void> {
        await this.dataManager.updateTermNote(noteId, { contentMarkdown });
    }

    /**
     * 删除词条笔记
     */
    async deleteTermNote(noteId: string): Promise<void> {
        await this.dataManager.deleteTermNote(noteId);
    }

    /**
     * 按规范化词条查找
     */
    getByNormalizedTerm(normalizedTerm: string): TermNote | undefined {
        return this.dataManager.getAllTermNotes().find(note => note.normalizedTerm === normalizedTerm);
    }
}
