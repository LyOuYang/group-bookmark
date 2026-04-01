import * as vscode from 'vscode';
import { KeyNoteManager } from '../core/keyNoteManager';
import { KeyNoteGroupManager } from '../core/keyNoteGroupManager';
import { KeyNoteRelationManager } from '../core/keyNoteRelationManager';
import { KeyNoteDocumentService } from '../services/keyNoteDocumentService';
import { extractNormalizedTerm } from '../utils/keyNoteUtils';

const CREATE_TERM_NOTE_GROUP_LABEL = 'Create New Group...';

type KeyNoteGroupQuickPickItem = vscode.QuickPickItem & {
    groupId?: string;
    action?: 'create';
};

type KeyNoteTreeItemContext = {
    dataId?: string;
    groupId?: string;
    label?: string | vscode.TreeItemLabel;
};

type KeyNoteSidebarEditor = {
    editKeyNote: (noteId: string) => void;
};

export class KeyNoteCommandHandler {
    constructor(
        private readonly keyNoteManager: KeyNoteManager,
        private readonly keyNoteGroupManager: KeyNoteGroupManager,
        private readonly keyNoteRelationManager: KeyNoteRelationManager,
        private readonly keyNoteDocumentService: KeyNoteDocumentService,
        private readonly keyNoteSidebarEditor?: KeyNoteSidebarEditor
    ) { }

    registerCommands(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.addKeyNoteFromSelection', () => this.addKeyNoteFromSelection()),
            vscode.commands.registerCommand('groupBookmarks.openKeyNote', (item: KeyNoteTreeItemContext) => this.openKeyNote(item)),
            vscode.commands.registerCommand('groupBookmarks.createKeyNoteGroup', () => this.createKeyNoteGroup()),
            vscode.commands.registerCommand('groupBookmarks.renameKeyNoteGroup', (item: KeyNoteTreeItemContext) => this.renameKeyNoteGroup(item)),
            vscode.commands.registerCommand('groupBookmarks.deleteKeyNoteGroup', (item: KeyNoteTreeItemContext) => this.deleteKeyNoteGroup(item)),
            vscode.commands.registerCommand('groupBookmarks.setActiveKeyNoteGroup', (item: KeyNoteTreeItemContext) => this.setActiveKeyNoteGroup(item)),
            vscode.commands.registerCommand('groupBookmarks.removeKeyNoteFromGroup', (item: KeyNoteTreeItemContext) => this.removeKeyNoteFromGroup(item)),
            vscode.commands.registerCommand('groupBookmarks.deleteKeyNote', (item: KeyNoteTreeItemContext) => this.deleteKeyNote(item)),
            vscode.commands.registerCommand('groupBookmarks.addExistingKeyNoteToGroup', (item: KeyNoteTreeItemContext) => this.addExistingKeyNoteToGroup(item)),
            vscode.commands.registerCommand('groupBookmarks.addKeyNoteToGroup', (item: KeyNoteTreeItemContext) => this.addKeyNoteToGroup(item)),
            vscode.commands.registerCommand('groupBookmarks.sortGroupCustom', (item: KeyNoteTreeItemContext) => this.setGroupSortMode(item, 'custom')),
            vscode.commands.registerCommand('groupBookmarks.sortGroupAsc', (item: KeyNoteTreeItemContext) => this.setGroupSortMode(item, 'name_asc')),
            vscode.commands.registerCommand('groupBookmarks.sortGroupDesc', (item: KeyNoteTreeItemContext) => this.setGroupSortMode(item, 'name_desc')),
            vscode.commands.registerCommand('groupBookmarks.searchKeyNotes', () => this.searchKeyNotes())
        );
    }

    async addKeyNoteFromSelection(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        let selectedText = editor.document.getText(editor.selection);
        if (!selectedText.trim()) {
            const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
            if (wordRange) {
                selectedText = editor.document.getText(wordRange);
            }
        }

        const term = extractNormalizedTerm(selectedText) ? selectedText.trim() : undefined;
        if (!term) {
            vscode.window.showWarningMessage('Please select a valid key to add a key note');
            return;
        }

        try {
            const note = await this.keyNoteManager.createOrGetKeyNote(term);
            
            // 查一下是否在任何 group 里，如果没有任何 group，我们也可以先不管，
            // 之后在 editor(Sidebar) 里面让用户强校验并分配.
            // 此时直接唤起编辑器
            if (this.keyNoteSidebarEditor) {
                this.keyNoteSidebarEditor.editKeyNote(note.id);
                return;
            }

            await this.keyNoteDocumentService.openNoteDocument(note.id);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to add key note: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async setActiveKeyNoteGroup(item: KeyNoteTreeItemContext): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showWarningMessage('Invalid key-note group');
            return;
        }

        try {
            const group = this.keyNoteGroupManager.getGroupById(item.dataId);
            if (!group) {
                vscode.window.showWarningMessage('Invalid key-note group');
                return;
            }

            const activeGroupId = this.keyNoteGroupManager.getActiveKeyNoteGroupId();
            if (activeGroupId === group.id) {
                await this.keyNoteGroupManager.setActiveKeyNoteGroupId(undefined);
                vscode.window.showInformationMessage('Active key-note group cleared');
                return;
            }

            await this.keyNoteGroupManager.setActiveKeyNoteGroupId(group.id);
            vscode.window.showInformationMessage(`Active key-note group set to "${group.name}"`);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to set active key-note group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async openKeyNote(item: KeyNoteTreeItemContext): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showWarningMessage('Invalid key-note item');
            return;
        }

        try {
            if (this.keyNoteSidebarEditor) {
                this.keyNoteSidebarEditor.editKeyNote(item.dataId);
            } else {
                await this.keyNoteDocumentService.openNoteDocument(item.dataId);
            }
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to open key note: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async createKeyNoteGroup(): Promise<string | undefined> {
        try {
            return await this.promptForNewKeyNoteGroup();
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to create key-note group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return undefined;
        }
    }

    async renameKeyNoteGroup(item: KeyNoteTreeItemContext): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showErrorMessage('Invalid key-note group');
            return;
        }

        const group = this.keyNoteGroupManager.getGroupById(item.dataId);
        if (!group) {
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new group name',
            value: group.name
        });

        if (!newName || newName === group.name) {
            return;
        }

        try {
            await this.keyNoteGroupManager.renameGroup(group.id, newName);
            vscode.window.showInformationMessage(`Group renamed to "${newName}"`);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to rename key-note group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async deleteKeyNoteGroup(item: KeyNoteTreeItemContext): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showErrorMessage('Invalid key-note group');
            return;
        }

        const group = this.keyNoteGroupManager.getGroupById(item.dataId);
        if (!group) {
            return;
        }

        const keyNoteCount = this.keyNoteRelationManager.getRelationsInGroup(group.id).length;
        const confirm = await vscode.window.showWarningMessage(
            `Delete group "${group.name}" with ${keyNoteCount} key notes?`,
            'Delete',
            'Cancel'
        );

        if (confirm !== 'Delete') {
            return;
        }

        try {
            await this.keyNoteGroupManager.deleteGroup(group.id);
            vscode.window.showInformationMessage(`Group "${group.name}" deleted`);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to delete key-note group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async removeKeyNoteFromGroup(item: KeyNoteTreeItemContext): Promise<void> {
        if (!item?.dataId || !item.groupId) {
            vscode.window.showWarningMessage('Invalid key-note item');
            return;
        }

        try {
            await this.keyNoteRelationManager.removeKeyNoteFromGroup(item.dataId, item.groupId);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to remove key note from group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async deleteKeyNote(item: KeyNoteTreeItemContext): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showWarningMessage('Invalid key-note item');
            return;
        }

        const noteLabel = typeof item.label === 'string' ? item.label : item.dataId;
        const confirm = await vscode.window.showWarningMessage(
            `Delete key note "${noteLabel}" everywhere?`,
            'Delete',
            'Cancel'
        );

        if (confirm !== 'Delete') {
            return;
        }

        try {
            await this.keyNoteRelationManager.deleteKeyNoteEverywhere(item.dataId);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to delete key note: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async addExistingKeyNoteToGroup(item: KeyNoteTreeItemContext): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showWarningMessage('Invalid key-note item');
            return;
        }

        const existingGroupIds = new Set(
            this.keyNoteRelationManager.getGroupsForKeyNote(item.dataId).map(group => group.id)
        );
        const availableGroups = this.keyNoteGroupManager.getAllGroups().filter(group => !existingGroupIds.has(group.id));

        if (availableGroups.length === 0) {
            vscode.window.showWarningMessage('No other key-note groups available');
            return;
        }

        const quickPickItems: KeyNoteGroupQuickPickItem[] = availableGroups.map(group => ({
            label: group.displayName,
            description: group.name,
            groupId: group.id
        }));

        const selection = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select a key-note group'
        });

        if (!selection?.groupId) {
            return;
        }

        try {
            await this.keyNoteRelationManager.addKeyNoteToGroup(item.dataId, selection.groupId);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to add existing key note to group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async addKeyNoteToGroup(item?: KeyNoteTreeItemContext): Promise<void> {
        let targetGroupId = item?.dataId;
        
        // 如果没有传入 item（比如通过命令面板调取），尝试让用户选一个组
        if (!targetGroupId) {
            targetGroupId = await this.resolveTargetGroupId();
        }

        if (!targetGroupId) {
            return;
        }

        const inputTerm = await vscode.window.showInputBox({
            prompt: 'Enter term/word for the new Key Note',
            placeHolder: 'e.g. UserData'
        });

        if (!inputTerm || !inputTerm.trim()) {
            return;
        }

        const term = extractNormalizedTerm(inputTerm) ? inputTerm.trim() : undefined;
        if (!term) {
            vscode.window.showWarningMessage('Please enter a valid key note term');
            return;
        }

        try {
            const note = await this.keyNoteManager.createOrGetKeyNote(term);
            await this.keyNoteRelationManager.addKeyNoteToGroup(note.id, targetGroupId);

            if (this.keyNoteSidebarEditor) {
                this.keyNoteSidebarEditor.editKeyNote(note.id);
                return;
            }

            await this.keyNoteDocumentService.openNoteDocument(note.id);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to add key note to group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    private async resolveTargetGroupId(): Promise<string | undefined> {
        const activeGroupId = this.keyNoteGroupManager.getActiveKeyNoteGroupId();
        if (activeGroupId) {
            const activeGroup = this.keyNoteGroupManager.getGroupById(activeGroupId);
            if (activeGroup) {
                return activeGroup.id;
            }

            await this.keyNoteGroupManager.setActiveKeyNoteGroupId(undefined);
        }

        const groups = this.keyNoteGroupManager.getAllGroups();
        const items: KeyNoteGroupQuickPickItem[] = groups.map(group => ({
            label: group.displayName,
            description: group.name,
            groupId: group.id
        }));

        items.push({
            label: CREATE_TERM_NOTE_GROUP_LABEL,
            action: 'create'
        });

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select or create a key-note group'
        });

        if (!selection) {
            return undefined;
        }

        if (selection.action === 'create' || selection.label === CREATE_TERM_NOTE_GROUP_LABEL) {
            return this.promptForNewKeyNoteGroup();
        }

        if (!selection.groupId) {
            return undefined;
        }

        await this.keyNoteGroupManager.setActiveKeyNoteGroupId(selection.groupId);
        return selection.groupId;
    }

    private async promptForNewKeyNoteGroup(): Promise<string | undefined> {
        const groupName = await vscode.window.showInputBox({
            prompt: 'Enter key-note group name',
            placeHolder: 'Group name'
        });

        if (!groupName?.trim()) {
            return undefined;
        }

        const group = await this.keyNoteGroupManager.createGroup(groupName.trim());
        await this.keyNoteGroupManager.setActiveKeyNoteGroupId(group.id);
        return group.id;
    }

    async setGroupSortMode(item: KeyNoteTreeItemContext, mode: 'custom' | 'name_asc' | 'name_desc'): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showErrorMessage('Invalid key-note group');
            return;
        }

        const group = this.keyNoteGroupManager.getGroupById(item.dataId);
        if (!group) {
            return;
        }

        const currentMode = group.sortMode || 'custom';
        if (mode !== currentMode) {
            try {
                await this.keyNoteGroupManager.updateGroupSortMode(group.id, mode);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Failed to set group sort mode: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        }
    }

    async searchKeyNotes(): Promise<void> {
        const notes = this.keyNoteManager.getAllKeyNotes();
        const items = notes.map(note => {
            const groups = this.keyNoteRelationManager.getGroupsForKeyNote(note.id);
            const groupNames = groups.map(g => g.displayName).join(', ');
            return {
                label: `$(note) ${note.term}`,
                description: groupNames,
                noteId: note.id
            };
        });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Search all key notes...',
            matchOnDescription: true
        });

        if (selected) {
            await this.openKeyNote({ dataId: selected.noteId });
        }
    }
}
