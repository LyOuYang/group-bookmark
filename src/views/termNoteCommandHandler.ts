import * as vscode from 'vscode';
import { TermNoteManager } from '../core/termNoteManager';
import { TermNoteGroupManager } from '../core/termNoteGroupManager';
import { TermNoteRelationManager } from '../core/termNoteRelationManager';
import { extractNormalizedTerm } from '../utils/termNoteUtils';
import { TermNoteTreeProvider } from './termNoteTreeProvider';

export class TermNoteCommandHandler {
    constructor(
        private readonly termNoteManager: TermNoteManager,
        private readonly termNoteGroupManager: TermNoteGroupManager,
        private readonly termNoteRelationManager: TermNoteRelationManager,
        private readonly treeProvider: TermNoteTreeProvider
    ) { }

    registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.addTermNoteFromSelection', () => this.addTermNoteFromSelection())
        );
    }

    async addTermNoteFromSelection(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const term = extractNormalizedTerm(editor.document.getText(editor.selection));
        if (!term) {
            vscode.window.showWarningMessage('Select a term to add a note');
            return;
        }

        const activeGroupId = this.termNoteGroupManager.getActiveTermNoteGroupId();
        if (!activeGroupId) {
            vscode.window.showWarningMessage('Set an active term-note group first');
            return;
        }

        try {
            const note = await this.termNoteManager.createOrGetTermNote(term);
            await this.termNoteRelationManager.addTermNoteToGroup(note.id, activeGroupId);
            this.treeProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to add term note: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}
