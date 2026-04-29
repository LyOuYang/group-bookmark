# Grouped Key Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前工作区增加一套独立于行书签的“分组词条笔记”系统，支持从选区创建词条、Markdown 编辑、跨分组复用、选区命中自动预览，以及独立 `Key Notes` 侧边栏。

**Architecture:** 复用现有 bookmark/group/relation 的三层思路，但为 key note 建立独立的数据模型、存储文件、活动分组状态、命令处理器和树视图。先补一个轻量可运行的测试基建，用纯逻辑单测覆盖规范化、存储、关系和选择流程；再把 VS Code 集成能力分成文档编辑和选区预览两个服务落地。

**Tech Stack:** TypeScript, VS Code Extension API, esbuild, workspace JSON storage, Vitest

---

## 代码结构与职责划分

### 现有文件将被扩展

- Modify: `package.json`
  - 注册 `Key Notes` 视图、命令、菜单、测试脚本
- Modify: `tsconfig.json`
  - 让测试和新模块路径保持清晰
- Modify: `src/extension.ts`
  - 初始化 key-note 相关服务、视图、命令、文档和预览监听
- Modify: `src/models/types.ts`
  - 新增 `KeyNote`、`KeyNoteGroup`、`KeyNoteGroupRelation` 及其数据文件类型
- Modify: `src/data/storageService.ts`
  - 新增 key-note 三类 JSON 的读写与活动分组状态存取
- Modify: `src/data/dataManager.ts`
  - 新增 key-note 缓存、事件和 CRUD
- Modify: `doc/USER_GUIDE.md`
  - 补充新能力的使用说明
- Modify: `README.md`
  - 补充高层特性说明

### 新增文件

- Create: `vitest.config.ts`
  - 轻量测试配置
- Create: `tests/unit/keyNoteUtils.test.ts`
  - 词条规范化与去重规则测试
- Create: `tests/unit/keyNoteDataManager.test.ts`
  - 词条、分组、关系、活动分组状态测试
- Create: `tests/unit/keyNoteCommandHandler.test.ts`
  - 选区创建流程、去重与分组选择流程测试
- Create: `src/utils/keyNoteUtils.ts`
  - `normalizeTerm`、选区文本校验、显示文案辅助函数
- Create: `src/core/keyNoteManager.ts`
  - 词条本体增删改查、按 `normalizedTerm` 查询
- Create: `src/core/keyNoteGroupManager.ts`
  - 词条分组创建、重命名、删除、活动状态
- Create: `src/core/keyNoteRelationManager.ts`
  - 词条与分组关系管理、跨组添加、移除、删除
- Create: `src/views/keyNoteTreeProvider.ts`
  - `Key Notes` 树视图数据与交互
- Create: `src/views/keyNoteCommandHandler.ts`
  - 词条命令注册与 UI 流程
- Create: `src/services/keyNoteDocumentService.ts`
  - 自定义词条 Markdown 文档打开与保存
- Create: `src/services/keyNotePreviewService.ts`
  - 监听选区变化并展示 Markdown 预览

### 边界约束

- 词条笔记与现有书签逻辑分开，不复用 `BookmarkManager`、`RelationManager`、`BookmarkTreeProvider`
- 只复用已有的 `GroupColor`、`StorageService` 模式、`DataManager` 风格和通用工具
- V1 不加入导入导出、拖拽排序、别名、多作用域变体

## 计划前置说明

- 规格文档：`d:/code/self_soft/GroupBookmarks/doc/superpowers/specs/2026-03-25-grouped-key-notes-design.md`
- 当前 worktree：`d:/code/self_soft/GroupBookmarks/.worktrees/grouped-key-notes`
- 当前基线验证：
  - `npm install`
  - `npm run compile`

## Task 1: 建立 key-note 测试基建与规范化工具

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/utils/keyNoteUtils.ts`
- Test: `tests/unit/keyNoteUtils.test.ts`

- [ ] **Step 1: 为测试运行器添加脚本和依赖**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 写词条规范化与选区校验的失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { extractNormalizedTerm, normalizeTerm } from '../../src/utils/keyNoteUtils';

describe('normalizeTerm', () => {
  it('normalizes by trim + lowercase only', () => {
    expect(normalizeTerm(' User_Table ')).toBe('user_table');
  });

  it('does not fuzzy match substrings', () => {
    expect(normalizeTerm('user')).not.toBe(normalizeTerm('user_table'));
  });

  it('rejects empty selections', () => {
    expect(extractNormalizedTerm('   ')).toBeUndefined();
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

Run: `npm run test -- keyNoteUtils`  
Expected: FAIL，提示 `../../src/utils/keyNoteUtils` 不存在或缺少导出

- [ ] **Step 4: 实现最小工具函数**

```ts
export function normalizeTerm(value: string): string {
  return value.trim().toLowerCase();
}

export function extractNormalizedTerm(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? normalizeTerm(trimmed) : undefined;
}
```

- [ ] **Step 5: 重新运行测试，确认通过**

Run: `npm run test -- keyNoteUtils`  
Expected: PASS，所有 `keyNoteUtils` 用例通过

- [ ] **Step 6: 提交**

```bash
git add package.json tsconfig.json vitest.config.ts src/utils/keyNoteUtils.ts tests/unit/keyNoteUtils.test.ts
git commit -m "test: add key note utility coverage"
```

## Task 2: 扩展数据模型、存储与缓存

**Files:**
- Modify: `src/models/types.ts`
- Modify: `src/data/storageService.ts`
- Modify: `src/data/dataManager.ts`
- Test: `tests/unit/keyNoteDataManager.test.ts`

- [ ] **Step 1: 写 DataManager 和 StorageService 的失败测试**

```ts
it('loads and saves key notes, groups, and relations', async () => {
  const storage = createStorageDouble();
  const manager = new DataManager(storage as any);

  await manager.loadAll();
  await manager.addKeyNote(makeNote('user_table'));

  expect(storage.saveKeyNotes).toHaveBeenCalledTimes(1);
});

it('tracks active key-note group separately from bookmark groups', async () => {
  await manager.setActiveKeyNoteGroupId('term-group-1');
  expect(manager.getActiveKeyNoteGroupId()).toBe('term-group-1');
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test -- keyNoteDataManager`  
Expected: FAIL，提示 `addKeyNote` / `saveKeyNotes` / `getActiveKeyNoteGroupId` 不存在

- [ ] **Step 3: 在类型系统中加入 key-note 三层模型**

```ts
export interface KeyNote {
  id: string;
  term: string;
  normalizedTerm: string;
  contentMarkdown: string;
  createdAt: number;
  updatedAt: number;
  lastViewedAt?: number;
}

export interface KeyNoteGroup {
  id: string;
  name: string;
  displayName: string;
  number: number;
  color: GroupColor;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface KeyNoteGroupRelation {
  id: string;
  keyNoteId: string;
  groupId: string;
  order: number;
  createdAt: number;
}
```

- [ ] **Step 4: 在 StorageService 中加入 key-note 三类文件读写**

```ts
async loadKeyNotes(): Promise<KeyNote[]> { /* key-notes.json */ }
async saveKeyNotes(notes: KeyNote[]): Promise<void> { /* persist */ }
async loadKeyNoteGroups(): Promise<KeyNoteGroup[]> { /* key-note-groups.json */ }
async saveKeyNoteGroups(groups: KeyNoteGroup[]): Promise<void> { /* persist */ }
async loadKeyNoteRelations(): Promise<KeyNoteGroupRelation[]> { /* key-note-relations.json */ }
async saveKeyNoteRelations(relations: KeyNoteGroupRelation[]): Promise<void> { /* persist */ }
```

- [ ] **Step 5: 在 DataManager 中加入缓存、事件与活动分组状态**

```ts
private keyNotes = new Map<string, KeyNote>();
private keyNoteGroups = new Map<string, KeyNoteGroup>();
private keyNoteRelations = new Map<string, KeyNoteGroupRelation>();

getActiveKeyNoteGroupId(): string | undefined { /* workspaceState */ }
async setActiveKeyNoteGroupId(id: string | undefined): Promise<void> { /* fire group event */ }
```

- [ ] **Step 6: 重新运行测试，确认通过**

Run: `npm run test -- keyNoteDataManager`  
Expected: PASS，key-note 存储与活动分组测试通过

- [ ] **Step 7: 运行编译，确认未破坏原构建**

Run: `npm run compile`  
Expected: PASS，`out/extension.js` 更新成功

- [ ] **Step 8: 提交**

```bash
git add src/models/types.ts src/data/storageService.ts src/data/dataManager.ts tests/unit/keyNoteDataManager.test.ts
git commit -m "feat: add key note storage model"
```

## Task 3: 实现 key-note 核心管理器

**Files:**
- Create: `src/core/keyNoteManager.ts`
- Create: `src/core/keyNoteGroupManager.ts`
- Create: `src/core/keyNoteRelationManager.ts`
- Test: `tests/unit/keyNoteDataManager.test.ts`

- [ ] **Step 1: 写 manager 级失败测试**

```ts
it('reuses an existing note when normalizedTerm matches', async () => {
  const manager = new KeyNoteManager(dataManager);
  const first = await manager.createOrGetKeyNote('User_Table');
  const second = await manager.createOrGetKeyNote('user_table');

  expect(second.id).toBe(first.id);
});

it('removes only the relation for remove-from-group', async () => {
  await relationManager.removeKeyNoteFromGroup(note.id, groupA.id);
  expect(relationManager.getRelationsInGroup(groupB.id)).toHaveLength(1);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test -- keyNoteDataManager`  
Expected: FAIL，提示 `KeyNoteManager` / `KeyNoteRelationManager` 不存在

- [ ] **Step 3: 实现词条本体管理器**

```ts
export class KeyNoteManager {
  async createOrGetKeyNote(term: string): Promise<KeyNote> { /* normalize + dedupe */ }
  async updateContent(noteId: string, contentMarkdown: string): Promise<void> { /* persist */ }
  async deleteKeyNote(noteId: string): Promise<void> { /* delete note + lastViewedAt */ }
  getByNormalizedTerm(normalizedTerm: string): KeyNote | undefined { /* lookup */ }
}
```

- [ ] **Step 4: 实现分组与关系管理器**

```ts
export class KeyNoteGroupManager { /* create / rename / delete / active group */ }
export class KeyNoteRelationManager {
  async addKeyNoteToGroup(noteId: string, groupId: string): Promise<KeyNoteGroupRelation> { /* dedupe */ }
  async removeKeyNoteFromGroup(noteId: string, groupId: string): Promise<void> { /* relation only */ }
  async deleteKeyNoteEverywhere(noteId: string): Promise<void> { /* note + relations */ }
}
```

- [ ] **Step 5: 重新运行测试，确认通过**

Run: `npm run test -- keyNoteDataManager`  
Expected: PASS，关系删除语义与去重逻辑通过

- [ ] **Step 6: 提交**

```bash
git add src/core/keyNoteManager.ts src/core/keyNoteGroupManager.ts src/core/keyNoteRelationManager.ts tests/unit/keyNoteDataManager.test.ts
git commit -m "feat: add key note managers"
```

## Task 4: 实现 Key Notes 树视图与命令注册

**Files:**
- Create: `src/views/keyNoteTreeProvider.ts`
- Create: `src/views/keyNoteCommandHandler.ts`
- Modify: `package.json`
- Modify: `src/extension.ts`
- Test: `tests/unit/keyNoteCommandHandler.test.ts`

- [ ] **Step 1: 写树视图和命令流程的失败测试**

```ts
it('creates a new note from selection and assigns it to the active group', async () => {
  const handler = new KeyNoteCommandHandler(/* doubles */);
  await handler.addKeyNoteFromSelection();

  expect(keyNoteManager.createOrGetKeyNote).toHaveBeenCalledWith('user_table');
  expect(relationManager.addKeyNoteToGroup).toHaveBeenCalledWith('note-1', 'group-1');
});

it('builds root tree items from key note groups', () => {
  const items = provider.getChildren();
  expect(items[0].contextValue).toBe('key-note-group');
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test -- keyNoteCommandHandler`  
Expected: FAIL，提示新视图类和命令处理器不存在

- [ ] **Step 3: 在 `package.json` 中注册视图、命令和菜单**

```json
{
  "contributes": {
    "commands": [
      { "command": "groupBookmarks.addKeyNoteFromSelection", "title": "Add Note for Selection" }
    ],
    "views": {
      "groupBookmarks": [
        { "id": "groupKeyNotesView", "name": "Key Notes" }
      ]
    }
  }
}
```

- [ ] **Step 4: 实现独立的 KeyNoteTreeProvider**

```ts
export type KeyNoteTreeItemType = 'key-note-group' | 'key-note';
export class KeyNoteTreeProvider implements vscode.TreeDataProvider<KeyNoteTreeItem> {
  getChildren(element?: KeyNoteTreeItem): KeyNoteTreeItem[] { /* groups -> notes */ }
}
```

- [ ] **Step 5: 实现命令处理器并在 `extension.ts` 中接线**

```ts
const keyNoteTreeProvider = new KeyNoteTreeProvider(dataManager, keyNoteGroupManager, keyNoteRelationManager, keyNoteManager);
const keyNoteCommandHandler = new KeyNoteCommandHandler(keyNoteManager, keyNoteGroupManager, keyNoteRelationManager, keyNoteTreeProvider);
keyNoteCommandHandler.registerCommands(context);
```

- [ ] **Step 6: 重新运行测试和编译**

Run: `npm run test -- keyNoteCommandHandler && npm run compile`  
Expected: PASS，命令和树视图测试通过，扩展成功编译

- [ ] **Step 7: 提交**

```bash
git add package.json src/views/keyNoteTreeProvider.ts src/views/keyNoteCommandHandler.ts src/extension.ts tests/unit/keyNoteCommandHandler.test.ts
git commit -m "feat: add key note tree and commands"
```

## Task 5: 实现 Markdown 词条文档服务

**Files:**
- Create: `src/services/keyNoteDocumentService.ts`
- Modify: `src/extension.ts`
- Modify: `src/views/keyNoteCommandHandler.ts`
- Test: `tests/unit/keyNoteCommandHandler.test.ts`

- [ ] **Step 1: 写打开与保存词条文档的失败测试**

```ts
it('opens a key note using a custom markdown URI', async () => {
  const uri = documentService.getUri('note-1');
  expect(uri.scheme).toBe('groupbookmarks-key-note');
});

it('persists updated markdown content on save', async () => {
  await documentService.saveNoteDocument(noteUri, '# User table');
  expect(keyNoteManager.updateContent).toHaveBeenCalledWith('note-1', '# User table');
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test -- keyNoteCommandHandler`  
Expected: FAIL，提示文档服务和保存方法不存在

- [ ] **Step 3: 实现文档 URI 和内容加载**

```ts
export class KeyNoteDocumentService implements vscode.TextDocumentContentProvider {
  getUri(noteId: string): vscode.Uri {
    return vscode.Uri.parse(`groupbookmarks-key-note:/${noteId}.md`);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.keyNoteManager.getById(extractNoteId(uri))?.contentMarkdown ?? '';
  }
}
```

- [ ] **Step 4: 接入保存流程**

```ts
context.subscriptions.push(
  vscode.workspace.onDidSaveTextDocument(async doc => {
    if (doc.uri.scheme !== 'groupbookmarks-key-note') return;
    await keyNoteManager.updateContent(noteId, doc.getText());
  })
);
```

- [ ] **Step 5: 重新运行测试和编译**

Run: `npm run test -- keyNoteCommandHandler && npm run compile`  
Expected: PASS，打开与保存词条 Markdown 的路径跑通

- [ ] **Step 6: 提交**

```bash
git add src/services/keyNoteDocumentService.ts src/views/keyNoteCommandHandler.ts src/extension.ts tests/unit/keyNoteCommandHandler.test.ts
git commit -m "feat: add key note markdown document flow"
```

## Task 6: 实现选区命中预览服务

**Files:**
- Create: `src/services/keyNotePreviewService.ts`
- Modify: `src/utils/keyNoteUtils.ts`
- Modify: `src/extension.ts`
- Test: `tests/unit/keyNoteCommandHandler.test.ts`

- [ ] **Step 1: 写选区命中和防抖行为的失败测试**

```ts
it('ignores empty and multiline selections', async () => {
  expect(service.shouldPreview('')).toBe(false);
  expect(service.shouldPreview('foo\nbar')).toBe(false);
});

it('formats preview markdown with groups and body', () => {
  const markdown = service.buildPreviewMarkdown(note, ['DB', 'Core Schema']);
  expect(markdown.value).toContain('**user_table**');
  expect(markdown.value).toContain('`DB`');
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test -- keyNoteCommandHandler`  
Expected: FAIL，提示预览服务方法不存在

- [ ] **Step 3: 实现预览格式化和选区过滤**

```ts
export class KeyNotePreviewService {
  shouldPreview(selectionText: string): boolean { /* non-empty, single-line, <= 120 chars */ }
  buildPreviewMarkdown(note: KeyNote, groups: string[]): vscode.MarkdownString { /* heading + groups + body */ }
}
```

- [ ] **Step 4: 在 `extension.ts` 中接入 `window.onDidChangeTextEditorSelection`**

```ts
context.subscriptions.push(
  vscode.window.onDidChangeTextEditorSelection(event => {
    void keyNotePreviewService.handleSelectionChange(event);
  })
);
```

- [ ] **Step 5: 先用最简单稳定的触发方式实现**

```ts
await vscode.commands.executeCommand('editor.action.showHover');
```

如果该方式在真实验证里不稳定，则退回为通过 decoration/hover message 锚定当前选区；不要在这一任务引入 webview。

- [ ] **Step 6: 运行测试、编译，并做一次手工验证**

Run: `npm run test -- keyNoteCommandHandler && npm run compile`  
Expected: PASS  
Manual: 在 VS Code 扩展开发主机里选中已记录词条，应出现包含分组和 Markdown 正文的预览

- [ ] **Step 7: 提交**

```bash
git add src/services/keyNotePreviewService.ts src/utils/keyNoteUtils.ts src/extension.ts tests/unit/keyNoteCommandHandler.test.ts
git commit -m "feat: add key note selection preview"
```

## Task 7: 完成删除语义、菜单补齐与文档更新

**Files:**
- Modify: `package.json`
- Modify: `src/views/keyNoteCommandHandler.ts`
- Modify: `src/views/keyNoteTreeProvider.ts`
- Modify: `src/core/keyNoteRelationManager.ts`
- Modify: `README.md`
- Modify: `doc/USER_GUIDE.md`
- Test: `tests/unit/keyNoteCommandHandler.test.ts`

- [ ] **Step 1: 写删除语义和菜单动作的失败测试**

```ts
it('removes only the current relation for remove from group', async () => {
  await handler.removeKeyNoteFromGroup(treeItem);
  expect(keyNoteManager.deleteKeyNote).not.toHaveBeenCalled();
});

it('deletes the note body and all relations for delete note', async () => {
  await handler.deleteKeyNote(treeItem);
  expect(relationManager.deleteKeyNoteEverywhere).toHaveBeenCalledWith('note-1');
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm run test -- keyNoteCommandHandler`  
Expected: FAIL，提示删除命令和菜单路径未实现

- [ ] **Step 3: 实现删除、移组和添加到其他分组命令**

```ts
async removeKeyNoteFromGroup(item: KeyNoteTreeItem): Promise<void> { /* relation only */ }
async deleteKeyNote(item: KeyNoteTreeItem): Promise<void> { /* note + all relations */ }
async addExistingKeyNoteToGroup(item: KeyNoteTreeItem): Promise<void> { /* quick pick target group */ }
```

- [ ] **Step 4: 在 `package.json` 中补齐菜单声明**

```json
{
  "menus": {
    "editor/context": [
      { "command": "groupBookmarks.addKeyNoteFromSelection", "when": "editorHasSelection && editorTextFocus" }
    ],
    "view/item/context": [
      { "command": "groupBookmarks.removeKeyNoteFromGroup", "when": "view == groupKeyNotesView && viewItem == key-note" }
    ]
  }
}
```

- [ ] **Step 5: 更新 README 和用户文档**

```md
### Key Notes
- 选中文本后右键 `Add Note for Selection`
- 在 `Key Notes` 视图中管理分组和词条
- 再次选中同词条时查看 Markdown 预览
```

- [ ] **Step 6: 跑完整验证**

Run: `npm run test && npm run compile && npm run lint`  
Expected: PASS，测试、编译、静态检查均通过

- [ ] **Step 7: 提交**

```bash
git add package.json src/views/keyNoteCommandHandler.ts src/views/keyNoteTreeProvider.ts src/core/keyNoteRelationManager.ts README.md doc/USER_GUIDE.md tests/unit/keyNoteCommandHandler.test.ts
git commit -m "feat: finish grouped key notes workflow"
```

## 完整验证清单

- [ ] 在空工作区存储下首次创建词条，系统自动创建数据文件
- [ ] 使用活动词条分组直接创建新词条
- [ ] 选择不存在活动分组时，Quick Pick 可选组或新建组
- [ ] 同一词条大小写不同仅命中一个词条本体
- [ ] 同一词条可添加到两个分组
- [ ] `Remove from Group` 不删除词条正文
- [ ] `Delete Note` 删除词条正文及所有关系
- [ ] 打开 Markdown 文档后保存，关闭重开内容不丢失
- [ ] 再次选中同词条时可看到带分组列表的 Markdown 预览
- [ ] 原有 Bookmark 功能继续可编译、可显示、命令不受影响

## 风险与回退点

- 如果 `editor.action.showHover` 不能稳定触发预览，优先退到 decoration hover，不引入 webview
- 如果把 key-note 状态塞进现有 `DataManager` 导致复杂度失控，及时拆出 `KeyNoteDataManager`，但保持对外 manager API 不变
- 如果 Vitest 引入与现有构建冲突，优先保证 `npm run compile` 不受影响，再通过单独配置收敛测试环境

## 执行提示

- 每个任务都先跑失败测试，再做最小实现，再重新验证
- 除非某个文件边界已经明显失控，否则不要顺手重构现有 bookmark 子系统
- 每个任务完成后保持 `git status` 干净再进入下一任务
