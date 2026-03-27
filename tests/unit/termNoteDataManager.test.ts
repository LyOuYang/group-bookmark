import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupColor, type TermNote, type TermNoteGroup, type TermNoteGroupRelation } from '../../src/models/types';
import { TermNoteManager } from '../../src/core/termNoteManager';
import { TermNoteRelationManager } from '../../src/core/termNoteRelationManager';

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
  class MockEventEmitter<T = void> {
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
  termNotes?: TermNote[];
  termNoteGroups?: TermNoteGroup[];
  termNoteRelations?: TermNoteGroupRelation[];
};

function createStorageDouble(seed: StorageDoubleSeed = {}) {
  let activeGroupId: string | undefined;
  let activeTermNoteGroupId: string | undefined;
  let termNotes = new Map((seed.termNotes ?? []).map(note => [note.id, note]));
  let termNoteGroups = new Map((seed.termNoteGroups ?? []).map(group => [group.id, group]));
  let termNoteRelations = new Map((seed.termNoteRelations ?? []).map(relation => [relation.id, relation]));

  return {
    loadBookmarks: vi.fn().mockResolvedValue([]),
    loadGroups: vi.fn().mockResolvedValue([]),
    loadRelations: vi.fn().mockResolvedValue([]),
    saveBookmarks: vi.fn().mockResolvedValue(undefined),
    saveGroups: vi.fn().mockResolvedValue(undefined),
    saveRelations: vi.fn().mockResolvedValue(undefined),
    loadTermNotes: vi.fn(async () => Array.from(termNotes.values())),
    loadTermNoteGroups: vi.fn(async () => Array.from(termNoteGroups.values())),
    loadTermNoteRelations: vi.fn(async () => Array.from(termNoteRelations.values())),
    saveTermNotes: vi.fn(async (notes: TermNote[]) => {
      termNotes = new Map(notes.map(note => [note.id, note]));
    }),
    saveTermNoteGroups: vi.fn(async (groups: TermNoteGroup[]) => {
      termNoteGroups = new Map(groups.map(group => [group.id, group]));
    }),
    saveTermNoteRelations: vi.fn(async (relations: TermNoteGroupRelation[]) => {
      termNoteRelations = new Map(relations.map(relation => [relation.id, relation]));
    }),
    getActiveGroupId: vi.fn(() => activeGroupId),
    setActiveGroupId: vi.fn(async (id: string | undefined) => {
      activeGroupId = id;
    }),
    getActiveTermNoteGroupId: vi.fn(() => activeTermNoteGroupId),
    setActiveTermNoteGroupId: vi.fn(async (id: string | undefined) => {
      activeTermNoteGroupId = id;
    }),
  };
}

function createWorkspaceContextDouble() {
  const state = new Map<string, string | undefined>();

  return {
    workspaceState: {
      get<T>(key: string): T | undefined {
        return state.get(key) as T | undefined;
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

function createTempWorkspaceRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'groupbookmarks-term-notes-'));
  mockState.workspaceFolders = [{ uri: { fsPath: root }, name: 'workspace' }];
  return root;
}

function cleanupWorkspaceRoot(root: string) {
  fs.rmSync(root, { recursive: true, force: true });
  mockState.workspaceFolders = [];
}

function makeTermNote(id: string, overrides: Partial<TermNote> = {}): TermNote {
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

function makeTermNoteGroup(id: string, order: number, overrides: Partial<TermNoteGroup> = {}): TermNoteGroup {
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

function makeTermNoteRelation(
  id: string,
  termNoteId: string,
  groupId: string,
  order: number,
  overrides: Partial<TermNoteGroupRelation> = {}
): TermNoteGroupRelation {
  return {
    id,
    termNoteId,
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
  it('loads missing term-note files as empty arrays', async () => {
    const root = createTempWorkspaceRoot();
    try {
      const storage = new StorageService(createWorkspaceContextDouble() as any);

      await expect(storage.loadTermNotes()).resolves.toEqual([]);
      await expect(storage.loadTermNoteGroups()).resolves.toEqual([]);
      await expect(storage.loadTermNoteRelations()).resolves.toEqual([]);
    } finally {
      cleanupWorkspaceRoot(root);
    }
  });

  it('persists term notes, groups, and relations through real files', async () => {
    const root = createTempWorkspaceRoot();
    try {
      const context = createWorkspaceContextDouble();
      const storage = new StorageService(context as any);

      const notes = [makeTermNote('note-1')];
      const groups = [makeTermNoteGroup('group-1', 0)];
      const relations = [makeTermNoteRelation('rel-1', 'note-1', 'group-1', 0)];

      await storage.saveTermNotes(notes);
      await storage.saveTermNoteGroups(groups);
      await storage.saveTermNoteRelations(relations);

      const reloaded = new StorageService(context as any);

      await expect(reloaded.loadTermNotes()).resolves.toEqual(notes);
      await expect(reloaded.loadTermNoteGroups()).resolves.toEqual(groups);
      await expect(reloaded.loadTermNoteRelations()).resolves.toEqual(relations);
    } finally {
      cleanupWorkspaceRoot(root);
    }
  });
});

describe('term note data manager', () => {
  it('loads and saves term notes, groups, and relations', async () => {
    const storage = createStorageDouble();
    const manager = new DataManager(storage as any);

    await manager.loadAll();
    await manager.addTermNote(makeTermNote('user_table'));

    expect(storage.saveTermNotes).toHaveBeenCalledTimes(1);
  });

  it('updates, deletes, and reorders term-note data', async () => {
    const storage = createStorageDouble({
      termNotes: [makeTermNote('note-1'), makeTermNote('note-2')],
      termNoteGroups: [makeTermNoteGroup('group-1', 0), makeTermNoteGroup('group-2', 1)],
      termNoteRelations: [
        makeTermNoteRelation('rel-1', 'note-1', 'group-1', 0),
        makeTermNoteRelation('rel-2', 'note-2', 'group-1', 1),
        makeTermNoteRelation('rel-3', 'note-1', 'group-2', 0),
        makeTermNoteRelation('rel-4', 'note-2', 'group-2', 1),
      ],
    });
    const manager = new DataManager(storage as any);

    await manager.loadAll();

    await manager.updateTermNote('note-1', { contentMarkdown: '# updated' });
    expect(manager.getTermNote('note-1')?.contentMarkdown).toBe('# updated');
    expect(storage.saveTermNotes).toHaveBeenCalledTimes(1);

    await manager.updateTermNoteGroup('group-1', { displayName: '1. renamed' });
    expect(manager.getTermNoteGroup('group-1')?.displayName).toBe('1. renamed');
    expect(storage.saveTermNoteGroups).toHaveBeenCalledTimes(1);

    await manager.reorderTermNoteGroups(['group-2', 'group-1']);
    expect(manager.getAllTermNoteGroups().map(group => group.id)).toEqual(['group-2', 'group-1']);
    expect(storage.saveTermNoteGroups).toHaveBeenCalledTimes(2);

    await manager.updateTermNoteRelation('rel-1', { order: 1 });
    expect(manager.getTermNoteRelation('rel-1')?.order).toBe(1);
    expect(storage.saveTermNoteRelations).toHaveBeenCalledTimes(1);

    await manager.reorderTermNoteRelationsInGroup('group-1', ['rel-2', 'rel-1']);
    expect(
      manager
        .getAllTermNoteRelations()
        .filter(relation => relation.groupId === 'group-1')
        .sort((a, b) => a.order - b.order)
        .map(relation => relation.id)
    ).toEqual(['rel-2', 'rel-1']);
    expect(storage.saveTermNoteRelations).toHaveBeenCalledTimes(2);

    await manager.deleteTermNoteRelation('rel-2');
    expect(manager.getTermNoteRelation('rel-2')).toBeUndefined();
    expect(storage.saveTermNoteRelations).toHaveBeenCalledTimes(3);

    await manager.deleteTermNote('note-2');
    expect(manager.getTermNote('note-2')).toBeUndefined();
    expect(manager.getAllTermNoteRelations().some(relation => relation.termNoteId === 'note-2')).toBe(false);
    expect(storage.saveTermNotes).toHaveBeenCalledTimes(2);
    expect(storage.saveTermNoteRelations).toHaveBeenCalledTimes(4);

    await manager.deleteTermNoteGroup('group-2');
    expect(manager.getTermNoteGroup('group-2')).toBeUndefined();
    expect(manager.getAllTermNoteRelations().some(relation => relation.groupId === 'group-2')).toBe(false);
    expect(storage.saveTermNoteGroups).toHaveBeenCalledTimes(3);
    expect(storage.saveTermNoteRelations).toHaveBeenCalledTimes(5);
  });

  it('tracks active term-note group separately from bookmark groups', async () => {
    const storage = createStorageDouble();
    const manager = new DataManager(storage as any);

    await manager.setActiveTermNoteGroupId('term-group-1');

    expect(manager.getActiveTermNoteGroupId()).toBe('term-group-1');
  });

  it('keeps the bookmark active group behavior intact', async () => {
    const storage = createStorageDouble();
    const manager = new DataManager(storage as any);

    await manager.setActiveGroupId('bookmark-group-1');

    expect(manager.getActiveGroupId()).toBe('bookmark-group-1');
  });

  it('reuses an existing note when normalizedTerm matches', async () => {
    const storage = createStorageDouble();
    const dataManager = new DataManager(storage as any);
    const manager = new TermNoteManager(dataManager);

    const first = await manager.createOrGetTermNote('User_Table');
    const second = await manager.createOrGetTermNote('user_table');

    expect(second.id).toBe(first.id);
  });

  it('removes only the relation for remove-from-group', async () => {
    const storage = createStorageDouble({
      termNotes: [makeTermNote('note-1')],
      termNoteGroups: [makeTermNoteGroup('group-a', 0), makeTermNoteGroup('group-b', 1)],
      termNoteRelations: [
        makeTermNoteRelation('rel-a', 'note-1', 'group-a', 0),
        makeTermNoteRelation('rel-b', 'note-1', 'group-b', 0),
      ],
    });
    const dataManager = new DataManager(storage as any);
    const relationManager = new TermNoteRelationManager(dataManager);

    await dataManager.loadAll();
    await relationManager.removeTermNoteFromGroup('note-1', 'group-a');

    expect(relationManager.getRelationsInGroup('group-b')).toHaveLength(1);
  });
});
