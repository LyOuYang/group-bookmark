import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupColor, type TermNote, type TermNoteGroup, type TermNoteGroupRelation } from '../../src/models/types';
import { TermNoteCommandHandler } from '../../src/views/termNoteCommandHandler';
import { TermNoteTreeProvider } from '../../src/views/termNoteTreeProvider';

const mockState = vi.hoisted(() => ({
  window: {
    activeTextEditor: undefined as any,
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
  },
  commands: {
    registerCommand: vi.fn((_command: string, handler: (...args: any[]) => any) => ({
      dispose: vi.fn(),
      handler,
    })),
  },
}));

vi.mock('vscode', () => {
  class MockEventEmitter<T = void> {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  }

  class MockTreeItem {
    label: string;
    description?: string;
    contextValue?: string;
    collapsibleState: number;
    command?: unknown;

    constructor(label: string, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  return {
    EventEmitter: MockEventEmitter,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    window: mockState.window,
    commands: mockState.commands,
  };
});

function makeGroup(id: string, overrides: Partial<TermNoteGroup> = {}): TermNoteGroup {
  return {
    id,
    name: overrides.name ?? 'User Notes',
    displayName: overrides.displayName ?? '1. User Notes',
    number: overrides.number ?? 1,
    color: overrides.color ?? GroupColor.Blue,
    order: overrides.order ?? 0,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
  };
}

function makeNote(id: string, overrides: Partial<TermNote> = {}): TermNote {
  return {
    id,
    term: overrides.term ?? 'User Table',
    normalizedTerm: overrides.normalizedTerm ?? 'user_table',
    contentMarkdown: overrides.contentMarkdown ?? '',
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    lastViewedAt: overrides.lastViewedAt,
  };
}

function makeRelation(id: string, noteId: string, groupId: string, overrides: Partial<TermNoteGroupRelation> = {}): TermNoteGroupRelation {
  return {
    id,
    termNoteId: noteId,
    groupId,
    order: overrides.order ?? 0,
    createdAt: overrides.createdAt ?? 1,
  };
}

afterEach(() => {
  mockState.window.activeTextEditor = undefined;
  vi.clearAllMocks();
});

describe('TermNoteCommandHandler', () => {
  it('creates a new note from selection and assigns it to the active group', async () => {
    const termNoteManager = {
      createOrGetTermNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    };
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn().mockReturnValue('group-1'),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn().mockResolvedValue(undefined),
    };
    const treeProvider = {
      refresh: vi.fn(),
    };

    mockState.window.activeTextEditor = {
      document: {
        getText: vi.fn().mockReturnValue('user_table'),
      },
      selection: {
        isEmpty: false,
      },
    };

    const handler = new TermNoteCommandHandler(
      termNoteManager as any,
      termNoteGroupManager as any,
      relationManager as any,
      treeProvider as any
    );

    await handler.addTermNoteFromSelection();

    expect(termNoteManager.createOrGetTermNote).toHaveBeenCalledWith('user_table');
    expect(relationManager.addTermNoteToGroup).toHaveBeenCalledWith('note-1', 'group-1');
    expect(treeProvider.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('TermNoteTreeProvider', () => {
  it('builds root tree items from term note groups', () => {
    const note = makeNote('note-1');
    const group = makeGroup('group-1');
    const relation = makeRelation('relation-1', note.id, group.id);
    const dataManager = {
      onDidChangeTermNotes: vi.fn(),
      onDidChangeTermNoteGroups: vi.fn(),
      onDidChangeTermNoteRelations: vi.fn(),
      getTermNote: vi.fn((id: string) => (id === note.id ? note : undefined)),
    };
    const termNoteGroupManager = {
      getAllGroups: vi.fn().mockReturnValue([group]),
      getActiveTermNoteGroupId: vi.fn().mockReturnValue(group.id),
    };
    const relationManager = {
      getRelationsInGroup: vi.fn((groupId: string) => (groupId === group.id ? [relation] : [])),
    };
    const termNoteManager = {};

    const provider = new TermNoteTreeProvider(
      dataManager as any,
      termNoteGroupManager as any,
      relationManager as any,
      termNoteManager as any
    );

    const items = provider.getChildren();
    const childItems = provider.getChildren(items[0]);

    expect(items[0].contextValue).toBe('term-note-group');
    expect(childItems[0].contextValue).toBe('term-note');
    expect(childItems[0].label).toBe('User Table');
  });
});
