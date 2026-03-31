import * as vscode from 'vscode';
import { KeyNote } from '../models/types';
import { extractNormalizedTerm } from '../utils/keyNoteUtils';
import { KeyNoteRelationManager } from '../core/keyNoteRelationManager';
import { KeyNoteManager } from '../core/keyNoteManager';

function escapeMarkdown(value: string): string {
    return value.replace(/[\\`*_{}[\]()#+.!>-]/g, '\\$&');
}

export class KeyNotePreviewService implements vscode.Disposable {
    private readonly decorationType: vscode.TextEditorDecorationType;

    constructor(
        private readonly keyNoteManager: Pick<KeyNoteManager, 'getByNormalizedTerm'>,
        private readonly keyNoteRelationManager: Pick<KeyNoteRelationManager, 'getGroupsForKeyNote'>
    ) {
        this.decorationType = vscode.window.createTextEditorDecorationType({});
    }

    dispose(): void {
        this.decorationType.dispose();
    }

    getSelectedKeyNote(editor?: vscode.TextEditor): KeyNote | undefined {
        if (!editor) {
            return undefined;
        }

        const selectedText = editor.document.getText(editor.selection);
        const normalizedTerm = this.getPreviewNormalizedTerm(selectedText);
        if (!normalizedTerm) {
            return undefined;
        }

        return this.keyNoteManager.getByNormalizedTerm(normalizedTerm);
    }

    async previewSelection(editor?: vscode.TextEditor): Promise<void> {
        if (!editor) {
            return;
        }

        const note = this.getSelectedKeyNote(editor);
        if (!note) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const hoverMessage = this.buildHoverMessage(note, this.keyNoteRelationManager.getGroupsForKeyNote(note.id));
        editor.setDecorations(this.decorationType, [
            {
                range: editor.selection,
                hoverMessage
            }
        ]);
        await vscode.commands.executeCommand('editor.action.showHover');
    }

    private getPreviewNormalizedTerm(selectedText: string): string | undefined {
        const trimmed = selectedText.trim();
        if (!trimmed || trimmed.length > 120 || /[\r\n]/.test(trimmed)) {
            return undefined;
        }

        return extractNormalizedTerm(trimmed);
    }

    private buildHoverMessage(note: KeyNote, groups: Array<{ displayName: string }>): vscode.MarkdownString {
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`### ${escapeMarkdown(note.term)}\n\n`);

        if (groups.length > 0) {
            markdown.appendMarkdown('**Related groups**\n');
            for (const group of groups) {
                markdown.appendMarkdown(`- \`${group.displayName.replace(/`/g, '\\`')}\`\n`);
            }
            markdown.appendMarkdown('\n');
        }

        const body = note.contentMarkdown.trim();
        markdown.appendMarkdown(body ? body : '_No note body yet_');

        return markdown;
    }
}
