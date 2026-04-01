# Key Note Sorting, Reordering, and Search Design

## Objective
Support sorting and reordering of key notes inside groups, dragging a note to another group, and quickly searching key notes via a global fuzzy search interface.

## 1. Architecture & Data Model Changes
- Current state allows `KeyNoteGroupRelation` to handle order and association.
- Add `sortMode` property to `KeyNoteGroup`.
  - Allowed values: `'custom' | 'name_asc' | 'name_desc'`
  - Fallback logic: old groups without `sortMode` default to `'custom'`.
- Data persistence mechanisms inside `KeyNoteGroupManager` will be updated to store and retrieve `sortMode`.

## 2. TreeView Drag & Drop (Reordering & Move)
- Implement `vscode.TreeDragAndDropController` within `KeyNoteTreeProvider`.
  - Define custom `dragMimeTypes` and `dropMimeTypes` (e.g., `application/vnd.code.tree.keynotes`).
  - Set `dragAndDropController` property on the created `vscode.TreeView`.
- **Reorder** (`custom` mode only): Dragging a `key-note` tree item onto another `key-note` in the same group modifies the internal `order` logic using standard sorting offsets. Reordering while in `name_asc`/`name_desc` will visibly show an error/warning or simply be disabled.
- **Move to Group**: Dragging a `key-note` node onto a `key-note-group` node removes the note's previous `KeyNoteGroupRelation` mapping and provisions a new mapped connection.

## 3. Top-Level Actions & Tree Commands
- **Sort Context Action**: Right-click context menu on `key-note-group` tree items: "Toggle Sort Mode" -> Cycles through Custom, A-Z, Z-A. Reloads the children of the group locally based on internal UI sorting before rendering.
- **Global Search Action**:
  - `groupBookmarks.searchKeyNotes` command.
  - Placed in `view/title` menu for Key Notes view as a prominent `$(search)` icon to dramatically improve discoverability.
  - Executing command launches `vscode.window.showQuickPick` listing all notes with their assigned groups as `description`.
  - Selecting an item triggers `TreeView.reveal` to select the note in the side-bar and updates the preview Webview.

## 4. Verification Plan
- Unit tests to verify `sortMode` correctly defaults and persists on change.
- Extension UI/manual testing to assert that drag-and-drop between boundaries prevents edge cases (dragging groups is not allowed).
- Verifying the quick search displays up to date terminology immediately.
