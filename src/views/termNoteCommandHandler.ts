import * as vscode from 'vscode';
import { TermNoteManager } from '../core/termNoteManager';
import { TermNoteGroupManager } from '../core/termNoteGroupManager';
import { TermNoteRelationManager } from '../core/termNoteRelationManager';
import { TermNoteDocumentService } from '../services/termNoteDocumentService';
import { extractNormalizedTerm } from '../utils/termNoteUtils';

const CREATE_TERM_NOTE_GROUP_LABEL = 'Create New Group...';

type TermNoteGroupQuickPickItem = vscode.QuickPickItem & {
    groupId?: string;
    action?: 'create';
};

type TermNoteTreeItemContext = {
    dataId?: string;
    groupId?: string;
    label?: string | vscode.TreeItemLabel;
};

type TermNoteSidebarEditor = {
    editTermNote: (noteId: string) => void;
};

export class TermNoteCommandHandler {
    constructor(
        private readonly termNoteManager: TermNoteManager,
        private readonly termNoteGroupManager: TermNoteGroupManager,
        private readonly termNoteRelationManager: TermNoteRelationManager,
        private readonly termNoteDocumentService: TermNoteDocumentService,
        private readonly termNoteSidebarEditor?: TermNoteSidebarEditor
    ) { }

    registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.addTermNoteFromSelection', () => this.addTermNoteFromSelection()),
            vscode.commands.registerCommand('groupBookmarks.openTermNote', (item: TermNoteTreeItemContext) => this.openTermNote(item)),
            vscode.commands.registerCommand('groupBookmarks.createTermNoteGroup', () => this.createTermNoteGroup()),
            vscode.commands.registerCommand('groupBookmarks.setActiveTermNoteGroup', (item: TermNoteTreeItemContext) => this.setActiveTermNoteGroup(item)),
            vscode.commands.registerCommand('groupBookmarks.removeTermNoteFromGroup', (item: TermNoteTreeItemContext) => this.removeTermNoteFromGroup(item)),
            vscode.commands.registerCommand('groupBookmarks.deleteTermNote', (item: TermNoteTreeItemContext) => this.deleteTermNote(item)),
            vscode.commands.registerCommand('groupBookmarks.addExistingTermNoteToGroup', (item: TermNoteTreeItemContext) => this.addExistingTermNoteToGroup(item))
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

        try {
            const targetGroupId = await this.resolveTargetGroupId();
            if (!targetGroupId) {
                return;
            }

            const note = await this.termNoteManager.createOrGetTermNote(selectedText);
            await this.termNoteRelationManager.addTermNoteToGroup(note.id, targetGroupId);

            if (this.termNoteSidebarEditor) {
                this.termNoteSidebarEditor.editTermNote(note.id);
                return;
            }

            await this.termNoteDocumentService.openNoteDocument(note.id);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to add term note: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async setActiveTermNoteGroup(item: TermNoteTreeItemContext): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showWarningMessage('Invalid term-note group');
            return;
        }

        try {
            await this.termNoteGroupManager.setActiveTermNoteGroupId(item.dataId);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to set active term-note group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async openTermNote(item: TermNoteTreeItemContext): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showWarningMessage('Invalid term-note item');
            return;
        }

        try {
            await this.termNoteDocumentService.openNoteDocument(item.dataId);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to open term note: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async createTermNoteGroup(): Promise<string | undefined> {
        try {
            return await this.promptForNewTermNoteGroup();
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to create term-note group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return undefined;
        }
    }

    async removeTermNoteFromGroup(item: TermNoteTreeItemContext): Promise<void> {
        if (!item?.dataId || !item.groupId) {
            vscode.window.showWarningMessage('Invalid term-note item');
            return;
        }

        try {
            await this.termNoteRelationManager.removeTermNoteFromGroup(item.dataId, item.groupId);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to remove term note from group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async deleteTermNote(item: TermNoteTreeItemContext): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showWarningMessage('Invalid term-note item');
            return;
        }

        const noteLabel = typeof item.label === 'string' ? item.label : item.dataId;
        const confirm = await vscode.window.showWarningMessage(
            `Delete term note "${noteLabel}" everywhere?`,
            'Delete',
            'Cancel'
        );

        if (confirm !== 'Delete') {
            return;
        }

        try {
            await this.termNoteRelationManager.deleteTermNoteEverywhere(item.dataId);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to delete term note: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async addExistingTermNoteToGroup(item: TermNoteTreeItemContext): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showWarningMessage('Invalid term-note item');
            return;
        }

        const existingGroupIds = new Set(
            this.termNoteRelationManager.getGroupsForTermNote(item.dataId).map(group => group.id)
        );
        const availableGroups = this.termNoteGroupManager.getAllGroups().filter(group => !existingGroupIds.has(group.id));

        if (availableGroups.length === 0) {
            vscode.window.showWarningMessage('No other term-note groups available');
            return;
        }

        const quickPickItems: TermNoteGroupQuickPickItem[] = availableGroups.map(group => ({
            label: group.displayName,
            description: group.name,
            groupId: group.id
        }));

        const selection = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select a term-note group'
        });

        if (!selection?.groupId) {
            return;
        }

        try {
            await this.termNoteRelationManager.addTermNoteToGroup(item.dataId, selection.groupId);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to add existing term note to group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    private async resolveTargetGroupId(): Promise<string | undefined> {
        const activeGroupId = this.termNoteGroupManager.getActiveTermNoteGroupId();
        if (activeGroupId) {
            const activeGroup = this.termNoteGroupManager.getGroupById(activeGroupId);
            if (activeGroup) {
                return activeGroup.id;
            }

            await this.termNoteGroupManager.setActiveTermNoteGroupId(undefined);
        }

        const groups = this.termNoteGroupManager.getAllGroups();
        const items: TermNoteGroupQuickPickItem[] = groups.map(group => ({
            label: group.displayName,
            description: group.name,
            groupId: group.id
        }));

        items.push({
            label: CREATE_TERM_NOTE_GROUP_LABEL,
            action: 'create'
        });

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select or create a term-note group'
        });

        if (!selection) {
            return undefined;
        }

        if (selection.action === 'create' || selection.label === CREATE_TERM_NOTE_GROUP_LABEL) {
            return this.promptForNewTermNoteGroup();
        }

        if (!selection.groupId) {
            return undefined;
        }

        await this.termNoteGroupManager.setActiveTermNoteGroupId(selection.groupId);
        return selection.groupId;
    }

    private async promptForNewTermNoteGroup(): Promise<string | undefined> {
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
}
