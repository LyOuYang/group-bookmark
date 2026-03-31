import * as vscode from 'vscode';
import { DataManager } from '../data/dataManager';
import { TermNoteGroupManager } from '../core/termNoteGroupManager';
import { TermNoteRelationManager } from '../core/termNoteRelationManager';

export type TermNoteTreeItemType = 'term-note-group' | 'term-note';

export class TermNoteTreeItem extends vscode.TreeItem {
    constructor(
        public readonly type: TermNoteTreeItemType,
        public readonly dataId: string,
        public readonly groupId: string | undefined,
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.contextValue = type;
    }
}

export class TermNoteTreeProvider implements vscode.TreeDataProvider<TermNoteTreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TermNoteTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private readonly dataManager: DataManager,
        private readonly termNoteGroupManager: TermNoteGroupManager,
        private readonly termNoteRelationManager: TermNoteRelationManager
    ) {
        this.dataManager.onDidChangeTermNotes(() => this.refresh());
        this.dataManager.onDidChangeTermNoteGroups(() => this.refresh());
        this.dataManager.onDidChangeTermNoteRelations(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TermNoteTreeItem): vscode.TreeItem {
        return element;
    }

    getParent(element: TermNoteTreeItem): TermNoteTreeItem | undefined {
        if (element.type !== 'term-note' || !element.groupId) {
            return undefined;
        }

        const group = this.termNoteGroupManager.getGroupById(element.groupId);
        if (!group) {
            return undefined;
        }

        return this.createGroupItem(group);
    }

    getRevealItemForNoteId(noteId: string): TermNoteTreeItem | undefined {
        const note = this.dataManager.getTermNote(noteId);
        if (!note) {
            return undefined;
        }

        const groups = this.termNoteRelationManager.getGroupsForTermNote(noteId);
        if (groups.length === 0) {
            return undefined;
        }

        const activeGroupId = this.termNoteGroupManager.getActiveTermNoteGroupId();
        const targetGroup = groups.find(group => group.id === activeGroupId) ?? groups[0];

        return this.createNoteItem(note.id, targetGroup.id, note.term);
    }

    getChildren(element?: TermNoteTreeItem): TermNoteTreeItem[] {
        if (!element) {
            return this.getGroupItems();
        }

        if (element.type === 'term-note-group') {
            return this.getNoteItems(element.dataId);
        }

        return [];
    }

    private getGroupItems(): TermNoteTreeItem[] {
        const activeGroupId = this.termNoteGroupManager.getActiveTermNoteGroupId();

        return this.termNoteGroupManager.getAllGroups().map(group => this.createGroupItem(group, group.id === activeGroupId));
    }

    private getNoteItems(groupId: string): TermNoteTreeItem[] {
        return this.termNoteRelationManager.getRelationsInGroup(groupId)
            .map(relation => {
                const note = this.dataManager.getTermNote(relation.termNoteId);
                if (!note) {
                    return null;
                }

                return this.createNoteItem(note.id, groupId, note.term);
            })
            .filter((item): item is TermNoteTreeItem => item !== null);
    }

    private createGroupItem(group: { id: string; displayName: string }, isActive = false): TermNoteTreeItem {
        const item = new TermNoteTreeItem(
            'term-note-group',
            group.id,
            undefined,
            group.displayName,
            vscode.TreeItemCollapsibleState.Collapsed
        );

        if (isActive) {
            item.description = 'Active';
        }

        return item;
    }

    private createNoteItem(noteId: string, groupId: string, label: string): TermNoteTreeItem {
        return new TermNoteTreeItem(
            'term-note',
            noteId,
            groupId,
            label,
            vscode.TreeItemCollapsibleState.None
        );
    }
}
