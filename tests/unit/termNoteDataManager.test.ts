import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => {
  class MockEventEmitter<T = void> {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  }

  return {
    EventEmitter: MockEventEmitter,
  };
});

import { DataManager } from '../../src/data/dataManager';

function createStorageDouble() {
  let activeGroupId: string | undefined;
  let activeTermNoteGroupId: string | undefined;

  return {
    loadBookmarks: vi.fn().mockResolvedValue([]),
    loadGroups: vi.fn().mockResolvedValue([]),
    loadRelations: vi.fn().mockResolvedValue([]),
    saveBookmarks: vi.fn().mockResolvedValue(undefined),
    saveGroups: vi.fn().mockResolvedValue(undefined),
    saveRelations: vi.fn().mockResolvedValue(undefined),
    loadTermNotes: vi.fn().mockResolvedValue([]),
    loadTermNoteGroups: vi.fn().mockResolvedValue([]),
    loadTermNoteRelations: vi.fn().mockResolvedValue([]),
    saveTermNotes: vi.fn().mockResolvedValue(undefined),
    saveTermNoteGroups: vi.fn().mockResolvedValue(undefined),
    saveTermNoteRelations: vi.fn().mockResolvedValue(undefined),
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

function makeNote(id: string) {
  return {
    id,
    term: 'User Table',
    normalizedTerm: 'user_table',
    contentMarkdown: '# note',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('term note data manager', () => {
  it('loads and saves term notes, groups, and relations', async () => {
    const storage = createStorageDouble();
    const manager = new DataManager(storage as any);

    await manager.loadAll();
    await manager.addTermNote(makeNote('user_table'));

    expect(storage.saveTermNotes).toHaveBeenCalledTimes(1);
  });

  it('tracks active term-note group separately from bookmark groups', async () => {
    const storage = createStorageDouble();
    const manager = new DataManager(storage as any);

    await manager.setActiveTermNoteGroupId('term-group-1');

    expect(manager.getActiveTermNoteGroupId()).toBe('term-group-1');
  });
});
