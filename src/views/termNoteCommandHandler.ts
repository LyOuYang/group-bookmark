import * as vscode from 'vscode';
import { TermNoteManager } from '../core/termNoteManager';
import { TermNoteGroupManager } from '../core/termNoteGroupManager';
import { TermNoteRelationManager } from '../core/termNoteRelationManager';
import { extractNormalizedTerm } from '../utils/termNoteUtils';
import { TermNoteTreeProvider } from './termNoteTreeProvider';

type TermNoteGroupQuickPickItem = vscode.QuickPickItem & {
    groupId?: string;
    action?: 'create';
};

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

        const selectedText = editor.document.getText(editor.selection);
        if (!extractNormalizedTerm(selectedText)) {
            vscode.window.showWarningMessage('Select a term to add a note');
            return;
        }

        const targetGroupId = await this.resolveTargetGroupId();
        if (!targetGroupId) {
            return;
        }

        try {
            const note = await this.termNoteManager.createOrGetTermNote(selectedText);
            await this.termNoteRelationManager.addTermNoteToGroup(note.id, targetGroupId);
            this.treeProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to add term note: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    private async resolveTargetGroupId(): Promise<string | undefined> {
        const activeGroupId = this.termNoteGroupManager.getActiveTermNoteGroupId();
        if (activeGroupId) {
            return activeGroupId;
        }

        const groups = this.termNoteGroupManager.getAllGroups();
        const items: TermNoteGroupQuickPickItem[] = groups.map(group => ({
            label: group.displayName,
            description: group.name,
            groupId: group.id
        }));

        items.push({
            label: 'Create New Group...',
            action: 'create'
        });

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select or create a term-note group'
        });

        if (!selection) {
            return undefined;
        }

        if (selection.action === 'create') {
            const groupName = await vscode.window.showInputBox({
                prompt: 'Enter term-note group name',
                placeHolder: 'Group name'
            });

            if (!groupName?.trim()) {
                return undefined;
            }

            const group = await this.termNoteGroupManager.createGroup(groupName.trim());
            await this.termNoteGroupManager.setActiveTermNoteGroupId(group.id);
            return group.id;
        }

        if (!selection.groupId) {
            return undefined;
        }

        await this.termNoteGroupManager.setActiveTermNoteGroupId(selection.groupId);
        return selection.groupId;
    }
}
