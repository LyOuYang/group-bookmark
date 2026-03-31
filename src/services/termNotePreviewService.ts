import * as vscode from 'vscode';
import { TermNote } from '../models/types';
import { extractNormalizedTerm } from '../utils/termNoteUtils';
import { TermNoteRelationManager } from '../core/termNoteRelationManager';
import { TermNoteManager } from '../core/termNoteManager';

function escapeMarkdown(value: string): string {
    return value.replace(/[\\`*_{}[\]()#+.!>-]/g, '\\$&');
}

export class TermNotePreviewService implements vscode.Disposable {
    private readonly decorationType: vscode.TextEditorDecorationType;

    constructor(
        private readonly termNoteManager: Pick<TermNoteManager, 'getByNormalizedTerm'>,
        private readonly termNoteRelationManager: Pick<TermNoteRelationManager, 'getGroupsForTermNote'>
    ) {
        this.decorationType = vscode.window.createTextEditorDecorationType({});
    }

    dispose(): void {
        this.decorationType.dispose();
    }

    async previewSelection(editor?: vscode.TextEditor): Promise<void> {
        if (!editor) {
            return;
        }

        const selectedText = editor.document.getText(editor.selection);
        const normalizedTerm = this.getPreviewNormalizedTerm(selectedText);
        if (!normalizedTerm) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const note = this.termNoteManager.getByNormalizedTerm(normalizedTerm);
        if (!note) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const hoverMessage = this.buildHoverMessage(note, this.termNoteRelationManager.getGroupsForTermNote(note.id));
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

    private buildHoverMessage(note: TermNote, groups: Array<{ displayName: string }>): vscode.MarkdownString {
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
