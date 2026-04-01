import * as vscode from 'vscode';
import { DataManager } from '../data/dataManager';
import { KeyNoteGroupManager } from '../core/keyNoteGroupManager';
import { KeyNoteRelationManager } from '../core/keyNoteRelationManager';

export type KeyNoteTreeItemType = 'key-note-group' | 'key-note';

export class KeyNoteTreeItem extends vscode.TreeItem {
    constructor(
        public readonly type: KeyNoteTreeItemType,
        public readonly dataId: string,
        public readonly groupId: string | undefined,
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.contextValue = type;
    }
}

export class KeyNoteTreeProvider implements vscode.TreeDataProvider<KeyNoteTreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<KeyNoteTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private readonly dataManager: DataManager,
        private readonly keyNoteGroupManager: KeyNoteGroupManager,
        private readonly keyNoteRelationManager: KeyNoteRelationManager
    ) {
        this.dataManager.onDidChangeKeyNotes(() => this.refresh());
        this.dataManager.onDidChangeKeyNoteGroups(() => this.refresh());
        this.dataManager.onDidChangeKeyNoteRelations(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: KeyNoteTreeItem): vscode.TreeItem {
        return element;
    }

    getParent(element: KeyNoteTreeItem): KeyNoteTreeItem | undefined {
        if (element.type !== 'key-note' || !element.groupId) {
            return undefined;
        }

        const group = this.keyNoteGroupManager.getGroupById(element.groupId);
        if (!group) {
            return undefined;
        }

        return this.createGroupItem(group);
    }

    getRevealItemForNoteId(noteId: string): KeyNoteTreeItem | undefined {
        const note = this.dataManager.getKeyNote(noteId);
        if (!note) {
            return undefined;
        }

        const groups = this.keyNoteRelationManager.getGroupsForKeyNote(noteId);
        if (groups.length === 0) {
            return undefined;
        }

        const activeGroupId = this.keyNoteGroupManager.getActiveKeyNoteGroupId();
        const targetGroup = groups.find(group => group.id === activeGroupId) ?? groups[0];

        return this.createNoteItem(note.id, targetGroup.id, note.term);
    }

    getChildren(element?: KeyNoteTreeItem): KeyNoteTreeItem[] {
        if (!element) {
            return this.getGroupItems();
        }

        if (element.type === 'key-note-group') {
            return this.getNoteItems(element.dataId);
        }

        return [];
    }

    private getGroupItems(): KeyNoteTreeItem[] {
        const activeGroupId = this.keyNoteGroupManager.getActiveKeyNoteGroupId();

        return this.keyNoteGroupManager.getAllGroups().map(group => this.createGroupItem(group, group.id === activeGroupId));
    }

    private getNoteItems(groupId: string): KeyNoteTreeItem[] {
        const group = this.keyNoteGroupManager.getGroupById(groupId);
        const sortMode = group?.sortMode || 'custom';

        const items = this.keyNoteRelationManager.getRelationsInGroup(groupId)
            .map(relation => {
                const note = this.dataManager.getKeyNote(relation.keyNoteId);
                return note ? { note, relation, item: this.createNoteItem(note.id, groupId, note.term) } : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);

        if (sortMode === 'name_asc') {
            items.sort((a, b) => a.note.term.localeCompare(b.note.term));
        } else if (sortMode === 'name_desc') {
            items.sort((a, b) => b.note.term.localeCompare(a.note.term));
        }

        return items.map(x => x.item);
    }

    private createGroupItem(group: { id: string; displayName: string }, isActive = false): KeyNoteTreeItem {
        const item = new KeyNoteTreeItem(
            'key-note-group',
            group.id,
            undefined,
            group.displayName,
            vscode.TreeItemCollapsibleState.Collapsed
        );

        if (isActive) {
            item.iconPath = new vscode.ThemeIcon(
                'pinned',
                new vscode.ThemeColor('list.highlightForeground')
            );
        }

        return item;
    }

    private createNoteItem(noteId: string, groupId: string, label: string): KeyNoteTreeItem {
        return new KeyNoteTreeItem(
            'key-note',
            noteId,
            groupId,
            label,
            vscode.TreeItemCollapsibleState.None
        );
    }
}
