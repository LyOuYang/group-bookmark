# Key Note Sort, Drag & Drop, and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement UI-level alphabetical sorting, TreeView drag-and-drop reordering/moving, and a global quick-search QuickPick for Key Notes, without breaking the existing data structure tracking orders.

**Architecture:**
1. Extend `KeyNoteGroup` interface with an optional `sortMode?: 'custom' | 'name_asc' | 'name_desc'`.
2. Update `KeyNoteTreeProvider` to sort children arrays based on `sortMode` and implement the `vscode.TreeDragAndDropController` for native D&D.
3. Register new VS Code Commands for toggling sort modes and triggering a fuzzy `QuickPick` search to locate notes instantly.

**Tech Stack:** TypeScript, VS Code Extension API, vitest.

---

### Task 1: Extend Data Model and Manager Support for Sort Mode

**Files:**
- Modify: `src/models/types.ts`
- Modify: `src/core/keyNoteGroupManager.ts`
- Modify: `tests/unit/keyNoteDataManager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// Add to `tests/unit/keyNoteDataManager.test.ts` within the 'creates, renames, deletes...' test case or make a new test:
  it('updates the sort mode of a key-note group', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const groupManager = new KeyNoteGroupManager(dataManager);

    const group = await groupManager.createGroup('User Notes');
    // Default should be treated as falsy or custom
    expect(group.sortMode).toBeUndefined();

    await groupManager.updateGroupSortMode(group.id, 'name_asc');
    
    expect(groupManager.getGroupById(group.id)?.sortMode).toBe('name_asc');
    expect(storage.saveKeyNoteGroups).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/keyNoteDataManager.test.ts`
Expected: FAIL since `updateGroupSortMode` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```typescript
// In src/models/types.ts
export interface KeyNoteGroup {
    id: string;
    // ...
    order: number;
    sortMode?: 'custom' | 'name_asc' | 'name_desc'; // Add this line
    createdAt: number;
    // ...
}

// In src/core/keyNoteGroupManager.ts
export class KeyNoteGroupManager {
    // ...
    async updateGroupSortMode(groupId: string, sortMode: 'custom' | 'name_asc' | 'name_desc'): Promise<void> {
        const group = this.getGroupById(groupId);
        if (!group) throw new Error(`Group not found`);
        await this.dataManager.updateKeyNoteGroup(groupId, { sortMode });
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/keyNoteDataManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/types.ts src/core/keyNoteGroupManager.ts tests/unit/keyNoteDataManager.test.ts
git commit -m "feat: add sortMode to KeyNoteGroup and update manager logic"
```

---

### Task 2: Implement Sorted Note List Rendering

**Files:**
- Modify: `src/views/keyNoteTreeProvider.ts`

- [ ] **Step 1: Modify `getChildren` rendering logic**

```typescript
// In src/views/keyNoteTreeProvider.ts, update `getNoteItems`
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
        } else {
            // custom uses relation.order which is already sorted by getRelationsInGroup
        }

        return items.map(x => x.item);
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/views/keyNoteTreeProvider.ts
git commit -m "feat: sort keynote tree items based on group sortMode"
```

---

### Task 3: Toggle Group Sort Mode Command

**Files:**
- Modify: `package.json`
- Modify: `src/extension.ts`

- [ ] **Step 1: Add command and context menu to `package.json`**

Add right under the `groupBookmarks.renameKeyNoteGroup` command declaration:
```json
      {
        "command": "groupBookmarks.toggleKeyNoteGroupSortMode",
        "title": "Toggle Sort Mode",
        "category": "Group Bookmarks",
        "icon": "$(sort-precedence)"
      }
```
Add to `menus -> view/item/context` (only for `groupKeyNotesView && viewItem == key-note-group`):
```json
        {
          "command": "groupBookmarks.toggleKeyNoteGroupSortMode",
          "when": "view == groupKeyNotesView && viewItem == key-note-group"
        }
```

- [ ] **Step 2: Register command in `src/extension.ts`**

```typescript
// In src/extension.ts, add inside the activate function

    context.subscriptions.push(vscode.commands.registerCommand('groupBookmarks.toggleKeyNoteGroupSortMode', async (item: KeyNoteTreeItem) => {
        if (!item || item.type !== 'key-note-group' || !item.dataId) return;
        const group = keyNoteGroupManager.getGroupById(item.dataId);
        if (!group) return;

        const currentMode = group.sortMode || 'custom';
        const options: Array<{ label: string; mode: 'custom'|'name_asc'|'name_desc'; iconPath?: vscode.ThemeIcon }> = [
            { label: 'Custom (Drag & Drop)', mode: 'custom', iconPath: currentMode === 'custom' ? new vscode.ThemeIcon('check') : undefined },
            { label: 'Name (A-Z)', mode: 'name_asc', iconPath: currentMode === 'name_asc' ? new vscode.ThemeIcon('check') : undefined },
            { label: 'Name (Z-A)', mode: 'name_desc', iconPath: currentMode === 'name_desc' ? new vscode.ThemeIcon('check') : undefined }
        ];

        const selected = await vscode.window.showQuickPick(options, { placeHolder: 'Select Sort Mode' });
        if (selected && selected.mode !== currentMode) {
            await keyNoteGroupManager.updateGroupSortMode(group.id, selected.mode);
        }
    }));
```

- [ ] **Step 3: Run Extension Test (Manual)**
Run the extension, right-click a key note group, select "Toggle Sort Mode", and verify it toggles and the tree view re-sorts automatically (because dataManager trigger refreshes the view).

- [ ] **Step 4: Commit**

```bash
git add package.json src/extension.ts
git commit -m "feat: add toggleKeyNoteGroupSortMode command and context menu"
```

---

### Task 4: QuickPick Fast Search

**Files:**
- Modify: `package.json`
- Modify: `src/extension.ts`

- [ ] **Step 1: Add Search command to `package.json`**

```json
      {
        "command": "groupBookmarks.searchKeyNotes",
        "title": "Search Key Notes...",
        "category": "Group Bookmarks",
        "icon": "$(search)"
      }
```
Add to `menus -> view/title` (for Key Notes view navigation):
```json
        {
          "command": "groupBookmarks.searchKeyNotes",
          "when": "view == groupKeyNotesView",
          "group": "navigation@1"
        }
```

- [ ] **Step 2: Register command in `src/extension.ts`**

```typescript
// In extension.ts activate():
    context.subscriptions.push(vscode.commands.registerCommand('groupBookmarks.searchKeyNotes', async () => {
        const notes = dataManager.getAllKeyNotes();
        const items = notes.map(note => {
            const groups = keyNoteRelationManager.getGroupsForKeyNote(note.id);
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
            await vscode.commands.executeCommand('groupBookmarks.openKeyNote', selected.noteId);
        }
    }));
```

- [ ] **Step 3: Wait and run Extension Test (Manual)**
Verify the search icon is in the top right of the Key Notes View, clicking it pops up a functional QuickPick.

- [ ] **Step 4: Commit**

```bash
git add package.json src/extension.ts
git commit -m "feat: add global key-note fast search command and icon"
```

---

### Task 5: Drag and Drop Reordering / Move

**Files:**
- Modify: `src/views/keyNoteTreeProvider.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Implement `TreeDragAndDropController` in `keyNoteTreeProvider.ts`**

```typescript
// Update class signature
export class KeyNoteTreeProvider implements vscode.TreeDataProvider<KeyNoteTreeItem>, vscode.TreeDragAndDropController<KeyNoteTreeItem> {
    
    // Add properties
    public readonly dragMimeTypes = ['application/vnd.code.tree.keynotes'];
    public readonly dropMimeTypes = ['application/vnd.code.tree.keynotes'];

    // Add handleDrag
    public async handleDrag(source: readonly KeyNoteTreeItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        if (source.length === 0 || source[0].type !== 'key-note') return; // only allow dragging notes
        dataTransfer.set('application/vnd.code.tree.keynotes', new vscode.DataTransferItem(source));
    }

    // Add handleDrop
    public async handleDrop(target: KeyNoteTreeItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        const transferItem = dataTransfer.get('application/vnd.code.tree.keynotes');
        if (!transferItem) return;
        const sourceItems = transferItem.value as KeyNoteTreeItem[];
        if (sourceItems.length !== 1 || !target) return; // Only 1 at a time

        const sourceItem = sourceItems[0];
        if (sourceItem.type !== 'key-note' || !sourceItem.groupId) return;
        const noteId = sourceItem.dataId;

        if (target.type === 'key-note-group') {
            const targetGroupId = target.dataId;
            if (sourceItem.groupId !== targetGroupId) {
                // Change Group 
                await this.keyNoteRelationManager.removeKeyNoteFromGroup(noteId, sourceItem.groupId);
                await this.keyNoteRelationManager.addKeyNoteToGroup(noteId, targetGroupId);
            }
        } else if (target.type === 'key-note') {
            const targetGroupId = target.groupId;
            // Prevent drag outside of bounds
            if (!targetGroupId || sourceItem.groupId !== targetGroupId) return;

            // Check if group is sorted
            const group = this.keyNoteGroupManager.getGroupById(targetGroupId);
            if (group && group.sortMode && group.sortMode !== 'custom') {
                vscode.window.showWarningMessage('Cannot reorder notes when non-custom sort mode is active. Toggle sort mode first.');
                return;
            }

            // Simple reordering logic (move source to before target)
            const relations = this.keyNoteRelationManager.getRelationsInGroup(targetGroupId);
            const sourceRel = relations.find(r => r.keyNoteId === noteId);
            const targetRel = relations.find(r => r.keyNoteId === target.dataId);
            if (!sourceRel || !targetRel) return;

            const existingIds = relations.map(r => r.id);
            const newIds = existingIds.filter(id => id !== sourceRel.id);
            const targetIndex = newIds.indexOf(targetRel.id);
            newIds.splice(targetIndex, 0, sourceRel.id); // insert before target

            await this.dataManager.reorderKeyNoteRelationsInGroup(targetGroupId, newIds);
        }
    }
}
```

- [ ] **Step 2: Bind the Controller to TreeView in `src/extension.ts`**

```typescript
// Replace the old registerTreeDataProvider line for groupKeyNotesView with:
    const keyNoteTreeProvider = new KeyNoteTreeProvider(dataManager, keyNoteGroupManager, keyNoteRelationManager);
    context.subscriptions.push(vscode.window.createTreeView('groupKeyNotesView', {
        treeDataProvider: keyNoteTreeProvider,
        dragAndDropController: keyNoteTreeProvider
    }));
// Note: You must also handle `onDidChangeTreeData: keyNoteTreeProvider.onDidChangeTreeData` if needed.
```

- [ ] **Step 3: Run Extension Test (Manual)**
Verify dragging a note onto a group drops it in that group.
Verify dragging a note onto another note reorders them (in custom mode).

- [ ] **Step 4: Commit**

```bash
git add src/views/keyNoteTreeProvider.ts src/extension.ts
git commit -m "feat: add drag and drop reordering and group changing for key notes"
```
