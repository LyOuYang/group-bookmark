import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupColor, type KeyNote, type KeyNoteGroup, type KeyNoteGroupRelation } from '../../src/models/types';
import { KeyNoteManager } from '../../src/core/keyNoteManager';
import { KeyNoteGroupManager } from '../../src/core/keyNoteGroupManager';
import { KeyNoteRelationManager } from '../../src/core/keyNoteRelationManager';

const mockState = vi.hoisted(() => ({
  workspaceFolders: [] as Array<{ uri: { fsPath: string }; name: string }>,
  window: {
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
  },
  env: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('vscode', () => {
  class MockEventEmitter {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  }

  return {
    EventEmitter: MockEventEmitter,
    Uri: {
      parse: (value: string) => ({ value }),
    },
    workspace: {
      get workspaceFolders() {
        return mockState.workspaceFolders;
      },
    },
    window: mockState.window,
    env: mockState.env,
  };
});

import { DataManager } from '../../src/data/dataManager';
import { StorageService } from '../../src/data/storageService';

type StorageDoubleSeed = {
  keyNotes?: KeyNote[];
  keyNoteGroups?: KeyNoteGroup[];
  keyNoteRelations?: KeyNoteGroupRelation[];
};

type WorkspaceStateDouble = {
  get(key: string): string | undefined;
  update(key: string, value: string | undefined): Promise<void>;
};

type WorkspaceContextDouble = {
  workspaceState: WorkspaceStateDouble;
};

function createStorageDouble(seed: StorageDoubleSeed = {}) {
  let activeGroupId: string | undefined;
  let activeKeyNoteGroupId: string | undefined;
  let keyNotes = new Map((seed.keyNotes ?? []).map(note => [note.id, note]));
  let keyNoteGroups = new Map((seed.keyNoteGroups ?? []).map(group => [group.id, group]));
  let keyNoteRelations = new Map((seed.keyNoteRelations ?? []).map(relation => [relation.id, relation]));

  return {
    loadBookmarks: vi.fn().mockResolvedValue([]),
    loadGroups: vi.fn().mockResolvedValue([]),
    loadRelations: vi.fn().mockResolvedValue([]),
    saveBookmarks: vi.fn().mockResolvedValue(undefined),
    saveGroups: vi.fn().mockResolvedValue(undefined),
    saveRelations: vi.fn().mockResolvedValue(undefined),
    loadKeyNotes: vi.fn(async () => Array.from(keyNotes.values())),
    loadKeyNoteGroups: vi.fn(async () => Array.from(keyNoteGroups.values())),
    loadKeyNoteRelations: vi.fn(async () => Array.from(keyNoteRelations.values())),
    saveKeyNotes: vi.fn(async (notes: KeyNote[]) => {
      keyNotes = new Map(notes.map(note => [note.id, note]));
    }),
    saveKeyNoteGroups: vi.fn(async (groups: KeyNoteGroup[]) => {
      keyNoteGroups = new Map(groups.map(group => [group.id, group]));
    }),
    saveKeyNoteRelations: vi.fn(async (relations: KeyNoteGroupRelation[]) => {
      keyNoteRelations = new Map(relations.map(relation => [relation.id, relation]));
    }),
    getActiveGroupId: vi.fn(() => activeGroupId),
    setActiveGroupId: vi.fn(async (id: string | undefined) => {
      activeGroupId = id;
    }),
    getActiveKeyNoteGroupId: vi.fn(() => activeKeyNoteGroupId),
    setActiveKeyNoteGroupId: vi.fn(async (id: string | undefined) => {
      activeKeyNoteGroupId = id;
    }),
  };
}

function createWorkspaceContextDouble(): WorkspaceContextDouble {
  const state = new Map<string, string | undefined>();

  return {
    workspaceState: {
      get(key: string): string | undefined {
        return state.get(key);
      },
      async update(key: string, value: string | undefined): Promise<void> {
        if (value === undefined) {
          state.delete(key);
          return;
        }

        state.set(key, value);
      },
    },
  };
}

function asStorageService(value: unknown): StorageService {
  return value as unknown as StorageService;
}

function asExtensionContext(value: unknown): vscode.ExtensionContext {
  return value as vscode.ExtensionContext;
}

function createTempWorkspaceRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'groupbookmarks-key-notes-'));
  mockState.workspaceFolders = [{ uri: { fsPath: root }, name: 'workspace' }];
  return root;
}

function cleanupWorkspaceRoot(root: string) {
  fs.rmSync(root, { recursive: true, force: true });
  mockState.workspaceFolders = [];
}

function makeKeyNote(id: string, overrides: Partial<KeyNote> = {}): KeyNote {
  return {
    id,
    term: overrides.term ?? 'User Table',
    normalizedTerm: overrides.normalizedTerm ?? 'user_table',
    contentMarkdown: overrides.contentMarkdown ?? '# note',
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    lastViewedAt: overrides.lastViewedAt,
  };
}

function makeKeyNoteGroup(id: string, order: number, overrides: Partial<KeyNoteGroup> = {}): KeyNoteGroup {
  return {
    id,
    name: overrides.name ?? `group-${id}`,
    displayName: overrides.displayName ?? `Group ${id}`,
    number: overrides.number ?? order + 1,
    color: overrides.color ?? GroupColor.Blue,
    order: overrides.order ?? order,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
  };
}

function makeKeyNoteRelation(
  id: string,
  keyNoteId: string,
  groupId: string,
  order: number,
  overrides: Partial<KeyNoteGroupRelation> = {}
): KeyNoteGroupRelation {
  return {
    id,
    keyNoteId,
    groupId,
    order: overrides.order ?? order,
    createdAt: overrides.createdAt ?? 1,
  };
}

afterEach(() => {
  mockState.workspaceFolders = [];
  vi.clearAllMocks();
});

describe('StorageService', () => {
  it('loads missing key-note files as empty arrays', async () => {
    const root = createTempWorkspaceRoot();
    try {
      const storage = new StorageService(asExtensionContext(createWorkspaceContextDouble()));

      await expect(storage.loadKeyNotes()).resolves.toEqual([]);
      await expect(storage.loadKeyNoteGroups()).resolves.toEqual([]);
      await expect(storage.loadKeyNoteRelations()).resolves.toEqual([]);
    } finally {
      cleanupWorkspaceRoot(root);
    }
  });

  it('persists key notes, groups, and relations through real files', async () => {
    const root = createTempWorkspaceRoot();
    try {
      const context = createWorkspaceContextDouble();
      const storage = new StorageService(asExtensionContext(context));

      const notes = [makeKeyNote('note-1')];
      const groups = [makeKeyNoteGroup('group-1', 0)];
      const relations = [makeKeyNoteRelation('rel-1', 'note-1', 'group-1', 0)];

      await storage.saveKeyNotes(notes);
      await storage.saveKeyNoteGroups(groups);
      await storage.saveKeyNoteRelations(relations);

      const reloaded = new StorageService(asExtensionContext(context));

      await expect(reloaded.loadKeyNotes()).resolves.toEqual(notes);
      await expect(reloaded.loadKeyNoteGroups()).resolves.toEqual(groups);
      await expect(reloaded.loadKeyNoteRelations()).resolves.toEqual(relations);
    } finally {
      cleanupWorkspaceRoot(root);
    }
  });
});

describe('key note data manager', () => {
  it('loads and saves key notes, groups, and relations', async () => {
    const storage = createStorageDouble();
    const manager = new DataManager(asStorageService(storage));

    await manager.loadAll();
    await manager.addKeyNote(makeKeyNote('user_table'));

    expect(storage.saveKeyNotes).toHaveBeenCalledTimes(1);
  });

  it('updates, deletes, and reorders key-note data', async () => {
    const storage = createStorageDouble({
      keyNotes: [makeKeyNote('note-1'), makeKeyNote('note-2')],
      keyNoteGroups: [makeKeyNoteGroup('group-1', 0), makeKeyNoteGroup('group-2', 1)],
      keyNoteRelations: [
        makeKeyNoteRelation('rel-1', 'note-1', 'group-1', 0),
        makeKeyNoteRelation('rel-2', 'note-2', 'group-1', 1),
        makeKeyNoteRelation('rel-3', 'note-1', 'group-2', 0),
        makeKeyNoteRelation('rel-4', 'note-2', 'group-2', 1),
      ],
    });
    const manager = new DataManager(asStorageService(storage));

    await manager.loadAll();

    await manager.updateKeyNote('note-1', { contentMarkdown: '# updated' });
    expect(manager.getKeyNote('note-1')?.contentMarkdown).toBe('# updated');
    expect(storage.saveKeyNotes).toHaveBeenCalledTimes(1);

    await manager.updateKeyNoteGroup('group-1', { displayName: '1. renamed' });
    expect(manager.getKeyNoteGroup('group-1')?.displayName).toBe('1. renamed');
    expect(storage.saveKeyNoteGroups).toHaveBeenCalledTimes(1);

    await manager.reorderKeyNoteGroups(['group-2', 'group-1']);
    expect(manager.getAllKeyNoteGroups().map(group => group.id)).toEqual(['group-2', 'group-1']);
    expect(storage.saveKeyNoteGroups).toHaveBeenCalledTimes(2);

    await manager.updateKeyNoteRelation('rel-1', { order: 1 });
    expect(manager.getKeyNoteRelation('rel-1')?.order).toBe(1);
    expect(storage.saveKeyNoteRelations).toHaveBeenCalledTimes(1);

    await manager.reorderKeyNoteRelationsInGroup('group-1', ['rel-2', 'rel-1']);
    expect(
      manager
        .getAllKeyNoteRelations()
        .filter(relation => relation.groupId === 'group-1')
        .sort((a, b) => a.order - b.order)
        .map(relation => relation.id)
    ).toEqual(['rel-2', 'rel-1']);
    expect(storage.saveKeyNoteRelations).toHaveBeenCalledTimes(2);

    await manager.deleteKeyNoteRelation('rel-2');
    expect(manager.getKeyNoteRelation('rel-2')).toBeUndefined();
    expect(storage.saveKeyNoteRelations).toHaveBeenCalledTimes(3);

    await manager.deleteKeyNote('note-2');
    expect(manager.getKeyNote('note-2')).toBeUndefined();
    expect(manager.getAllKeyNoteRelations().some(relation => relation.keyNoteId === 'note-2')).toBe(false);
    expect(storage.saveKeyNotes).toHaveBeenCalledTimes(2);
    expect(storage.saveKeyNoteRelations).toHaveBeenCalledTimes(4);

    await manager.deleteKeyNoteGroup('group-2');
    expect(manager.getKeyNoteGroup('group-2')).toBeUndefined();
    expect(manager.getAllKeyNoteRelations().some(relation => relation.groupId === 'group-2')).toBe(false);
    expect(storage.saveKeyNoteGroups).toHaveBeenCalledTimes(3);
    expect(storage.saveKeyNoteRelations).toHaveBeenCalledTimes(5);
  });

  it('tracks active key-note group separately from bookmark groups', async () => {
    const storage = createStorageDouble();
    const manager = new DataManager(asStorageService(storage));

    await manager.setActiveKeyNoteGroupId('term-group-1');

    expect(manager.getActiveKeyNoteGroupId()).toBe('term-group-1');
  });

  it('keeps the bookmark active group behavior intact', async () => {
    const storage = createStorageDouble();
    const manager = new DataManager(asStorageService(storage));

    await manager.setActiveGroupId('bookmark-group-1');

    expect(manager.getActiveGroupId()).toBe('bookmark-group-1');
  });

  it('rejects blank term creation', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const manager = new KeyNoteManager(dataManager);

    await expect(manager.createOrGetKeyNote('   ')).rejects.toThrow('Term cannot be blank');
  });

  it('reuses an existing note when normalizedTerm matches', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const manager = new KeyNoteManager(dataManager);

    const first = await manager.createOrGetKeyNote('User_Table');
    const second = await manager.createOrGetKeyNote('user_table');

    expect(second.id).toBe(first.id);
  });
  it('returns the note for getByNormalizedTerm', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const manager = new KeyNoteManager(dataManager);

    const note = await manager.createOrGetKeyNote('User_Table');

    expect(manager.getByNormalizedTerm('user_table')?.id).toBe(note.id);
  });

  it('updates content through the key note manager', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const manager = new KeyNoteManager(dataManager);

    const note = await manager.createOrGetKeyNote('User_Table');
    await manager.updateContent(note.id, '# updated');

    expect(dataManager.getKeyNote(note.id)?.contentMarkdown).toBe('# updated');
    expect(storage.saveKeyNotes).toHaveBeenCalledTimes(2);
  });

  it('deletes a key note through the key note manager', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const manager = new KeyNoteManager(dataManager);

    const note = await manager.createOrGetKeyNote('User_Table');
    await manager.deleteKeyNote(note.id);

    expect(dataManager.getKeyNote(note.id)).toBeUndefined();
    expect(storage.saveKeyNotes).toHaveBeenCalledTimes(2);
  });

  it('creates, renames, deletes, and tracks active key-note groups', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const groupManager = new KeyNoteGroupManager(dataManager);

    const group = await groupManager.createGroup('User Notes', GroupColor.Green);
    expect(groupManager.getGroupById(group.id)?.displayName).toBe('1. User Notes');
    expect(groupManager.getAllGroups()).toHaveLength(1);

    await groupManager.renameGroup(group.id, 'Reference Notes');
    expect(groupManager.getGroupById(group.id)?.name).toBe('Reference Notes');
    expect(groupManager.getGroupById(group.id)?.displayName).toBe('1. Reference Notes');

    await groupManager.setActiveKeyNoteGroupId(group.id);
    expect(groupManager.getActiveKeyNoteGroupId()).toBe(group.id);

    await groupManager.deleteGroup(group.id);
    expect(groupManager.getGroupById(group.id)).toBeUndefined();
    expect(groupManager.getAllGroups()).toHaveLength(0);
  });

  it('clears the active key-note group state when deleting the active group', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const groupManager = new KeyNoteGroupManager(dataManager);

    const group = await groupManager.createGroup('User Notes');
    await groupManager.setActiveKeyNoteGroupId(group.id);
    await groupManager.deleteGroup(group.id);

    expect(groupManager.getActiveKeyNoteGroupId()).toBeUndefined();
  });

  it('rejects setting the active key-note group to a nonexistent id', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const groupManager = new KeyNoteGroupManager(dataManager);

    await expect(groupManager.setActiveKeyNoteGroupId('missing-group')).rejects.toThrow(
      'Key note group missing-group not found'
    );
    expect(groupManager.getActiveKeyNoteGroupId()).toBeUndefined();
  });

  it('rejects blank key-note group creation', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const groupManager = new KeyNoteGroupManager(dataManager);

    await expect(groupManager.createGroup('   ')).rejects.toThrow('Group name cannot be blank');
  });

  it('trims key-note group names before persistence', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const groupManager = new KeyNoteGroupManager(dataManager);

    const group = await groupManager.createGroup('  User Notes  ');

    expect(group.name).toBe('User Notes');
    expect(group.displayName).toBe('1. User Notes');
    expect(dataManager.getKeyNoteGroup(group.id)?.name).toBe('User Notes');
  });

  it('rejects blank key-note group rename', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const groupManager = new KeyNoteGroupManager(dataManager);

    const group = await groupManager.createGroup('User Notes');

    await expect(groupManager.renameGroup(group.id, ' \t ')).rejects.toThrow('Group name cannot be blank');
  });

  it('trims key-note group rename values before persistence', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(asStorageService(storage));
    const groupManager = new KeyNoteGroupManager(dataManager);

    const group = await groupManager.createGroup('User Notes');
    await groupManager.renameGroup(group.id, '  Reference Notes  ');

    expect(groupManager.getGroupById(group.id)?.name).toBe('Reference Notes');
    expect(groupManager.getGroupById(group.id)?.displayName).toBe('1. Reference Notes');
  });

  it('adds a key note to a group without relying on composite relation ids', async () => {
    const storage = createStorageDouble({
      keyNotes: [makeKeyNote('note-1', { term: 'User Table', normalizedTerm: 'user_table' })],
      keyNoteGroups: [makeKeyNoteGroup('group-a', 0)],
      keyNoteRelations: [makeKeyNoteRelation('relation-1', 'note-1', 'group-a', 0)],
    });
    const dataManager = new DataManager(asStorageService(storage));
    const relationManager = new KeyNoteRelationManager(dataManager);

    await dataManager.loadAll();

    const relation = await relationManager.addKeyNoteToGroup('note-1', 'group-a');

    expect(relation.id).toBe('relation-1');
    expect(relationManager.getRelationsInGroup('group-a')).toHaveLength(1);
    expect(storage.saveKeyNoteRelations).toHaveBeenCalledTimes(0);
  });

  it('removes only the relation for remove-from-group', async () => {
    const storage = createStorageDouble({
      keyNotes: [makeKeyNote('note-1')],
      keyNoteGroups: [makeKeyNoteGroup('group-a', 0), makeKeyNoteGroup('group-b', 1)],
      keyNoteRelations: [
        makeKeyNoteRelation('rel-a', 'note-1', 'group-a', 0),
        makeKeyNoteRelation('rel-b', 'note-1', 'group-b', 0),
      ],
    });
    const dataManager = new DataManager(asStorageService(storage));
    const relationManager = new KeyNoteRelationManager(dataManager);

    await dataManager.loadAll();
    await relationManager.removeKeyNoteFromGroup('note-1', 'group-a');

    expect(relationManager.getRelationsInGroup('group-a')).toHaveLength(0);
    expect(relationManager.getRelationsInGroup('group-b')).toHaveLength(1);
    expect(storage.saveKeyNoteRelations).toHaveBeenCalledTimes(1);
  });

  it('deletes a key note everywhere', async () => {
    const storage = createStorageDouble({
      keyNotes: [makeKeyNote('note-1')],
      keyNoteGroups: [makeKeyNoteGroup('group-a', 0)],
      keyNoteRelations: [makeKeyNoteRelation('rel-a', 'note-1', 'group-a', 0)],
    });
    const dataManager = new DataManager(asStorageService(storage));
    const relationManager = new KeyNoteRelationManager(dataManager);

    await dataManager.loadAll();
    await relationManager.deleteKeyNoteEverywhere('note-1');

    expect(dataManager.getKeyNote('note-1')).toBeUndefined();
    expect(relationManager.getRelationsInGroup('group-a')).toHaveLength(0);
    expect(storage.saveKeyNotes).toHaveBeenCalledTimes(1);
    expect(storage.saveKeyNoteRelations).toHaveBeenCalledTimes(1);
  });
});
