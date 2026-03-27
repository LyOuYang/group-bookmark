import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupColor, type TermNote, type TermNoteGroup, type TermNoteGroupRelation } from '../../src/models/types';
import { TermNoteCommandHandler } from '../../src/views/termNoteCommandHandler';
import { TermNoteTreeProvider } from '../../src/views/termNoteTreeProvider';

const mockState = vi.hoisted(() => ({
  window: {
    activeTextEditor: undefined as any,
    showQuickPick: vi.fn().mockResolvedValue(undefined),
    showInputBox: vi.fn().mockResolvedValue(undefined),
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
  it('creates a new note from selection using the original selected text and assigns it to the active group', async () => {
    const termNoteManager = {
      createOrGetTermNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    };
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn().mockReturnValue('group-1'),
      getGroupById: vi.fn().mockReturnValue(makeGroup('group-1')),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn().mockResolvedValue(undefined),
    };

    mockState.window.activeTextEditor = {
      document: {
        getText: vi.fn().mockReturnValue('User_Table'),
      },
      selection: {
        isEmpty: false,
      },
    };

    const handler = new TermNoteCommandHandler(
      termNoteManager as any,
      termNoteGroupManager as any,
      relationManager as any
    );

    await handler.addTermNoteFromSelection();

    expect(termNoteManager.createOrGetTermNote).toHaveBeenCalledWith('User_Table');
    expect(relationManager.addTermNoteToGroup).toHaveBeenCalledWith('note-1', 'group-1');
    expect(mockState.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('falls back when the stored active term-note group is stale and avoids orphan notes', async () => {
    const termNoteManager = {
      createOrGetTermNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    };
    const validGroup = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn().mockReturnValue('stale-group'),
      getGroupById: vi.fn((id: string) => (id === validGroup.id ? validGroup : undefined)),
      getAllGroups: vi.fn().mockReturnValue([validGroup]),
      createGroup: vi.fn(),
      setActiveTermNoteGroupId: vi.fn().mockResolvedValue(undefined),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn().mockResolvedValue(undefined),
    };

    mockState.window.activeTextEditor = {
      document: {
        getText: vi.fn().mockReturnValue('HTTP Client'),
      },
      selection: {
        isEmpty: false,
      },
    };
    mockState.window.showQuickPick.mockResolvedValue({
      label: '2. API Notes',
      groupId: 'group-2',
    });

    const handler = new TermNoteCommandHandler(
      termNoteManager as any,
      termNoteGroupManager as any,
      relationManager as any
    );

    await handler.addTermNoteFromSelection();

    expect(termNoteGroupManager.setActiveTermNoteGroupId).toHaveBeenNthCalledWith(1, undefined);
    expect(mockState.window.showQuickPick).toHaveBeenCalledTimes(1);
    expect(termNoteManager.createOrGetTermNote).toHaveBeenCalledTimes(1);
    expect(termNoteManager.createOrGetTermNote).toHaveBeenCalledWith('HTTP Client');
    expect(relationManager.addTermNoteToGroup).toHaveBeenCalledWith('note-1', 'group-2');
    expect(termNoteGroupManager.createGroup).not.toHaveBeenCalled();
  });

  it('selects an existing group when no active term-note group is set', async () => {
    const termNoteManager = {
      createOrGetTermNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    };
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn().mockReturnValue(undefined),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' })]),
      createGroup: vi.fn(),
      setActiveTermNoteGroupId: vi.fn().mockResolvedValue(undefined),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn().mockResolvedValue(undefined),
    };

    mockState.window.activeTextEditor = {
      document: {
        getText: vi.fn().mockReturnValue('User Table'),
      },
      selection: {
        isEmpty: false,
      },
    };
    mockState.window.showQuickPick.mockResolvedValue({
      label: '2. API Notes',
      groupId: 'group-2',
    });

    const handler = new TermNoteCommandHandler(
      termNoteManager as any,
      termNoteGroupManager as any,
      relationManager as any
    );

    await handler.addTermNoteFromSelection();

    expect(mockState.window.showQuickPick).toHaveBeenCalledTimes(1);
    expect(termNoteGroupManager.setActiveTermNoteGroupId).toHaveBeenCalledWith('group-2');
    expect(termNoteManager.createOrGetTermNote).toHaveBeenCalledWith('User Table');
    expect(relationManager.addTermNoteToGroup).toHaveBeenCalledWith('note-1', 'group-2');
    expect(termNoteGroupManager.createGroup).not.toHaveBeenCalled();
  });

  it('creates a group when no active term-note group exists and the user chooses create', async () => {
    const termNoteManager = {
      createOrGetTermNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    };
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn().mockReturnValue(undefined),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([]),
      createGroup: vi.fn().mockResolvedValue(makeGroup('group-new', { displayName: '1. Fresh Notes', name: 'Fresh Notes' })),
      setActiveTermNoteGroupId: vi.fn().mockResolvedValue(undefined),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn().mockResolvedValue(undefined),
    };

    mockState.window.activeTextEditor = {
      document: {
        getText: vi.fn().mockReturnValue('HTTP Client'),
      },
      selection: {
        isEmpty: false,
      },
    };
    mockState.window.showQuickPick.mockResolvedValue({
      label: 'Create New Group...',
      action: 'create',
    });
    mockState.window.showInputBox.mockResolvedValue('Fresh Notes');

    const handler = new TermNoteCommandHandler(
      termNoteManager as any,
      termNoteGroupManager as any,
      relationManager as any
    );

    await handler.addTermNoteFromSelection();

    expect(mockState.window.showQuickPick).toHaveBeenCalledTimes(1);
    expect(mockState.window.showInputBox).toHaveBeenCalledTimes(1);
    expect(termNoteGroupManager.createGroup).toHaveBeenCalledWith('Fresh Notes');
    expect(termNoteGroupManager.setActiveTermNoteGroupId).toHaveBeenCalledWith('group-new');
    expect(termNoteManager.createOrGetTermNote).toHaveBeenCalledWith('HTTP Client');
    expect(relationManager.addTermNoteToGroup).toHaveBeenCalledWith('note-1', 'group-new');
  });

  it('handles create-group failures gracefully when resolving the target group', async () => {
    const termNoteManager = {
      createOrGetTermNote: vi.fn(),
    };
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn().mockReturnValue(undefined),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([]),
      createGroup: vi.fn().mockRejectedValue(new Error('create failed')),
      setActiveTermNoteGroupId: vi.fn(),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn(),
    };

    mockState.window.activeTextEditor = {
      document: {
        getText: vi.fn().mockReturnValue('HTTP Client'),
      },
      selection: {
        isEmpty: false,
      },
    };
    mockState.window.showQuickPick.mockResolvedValue({
      label: 'Create New Group...',
      action: 'create',
    });
    mockState.window.showInputBox.mockResolvedValue('Fresh Notes');

    const handler = new TermNoteCommandHandler(
      termNoteManager as any,
      termNoteGroupManager as any,
      relationManager as any
    );

    await expect(handler.addTermNoteFromSelection()).resolves.toBeUndefined();

    expect(mockState.window.showErrorMessage).toHaveBeenCalledWith('Failed to add term note: create failed');
    expect(termNoteManager.createOrGetTermNote).not.toHaveBeenCalled();
    expect(relationManager.addTermNoteToGroup).not.toHaveBeenCalled();
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
    const provider = new TermNoteTreeProvider(
      dataManager as any,
      termNoteGroupManager as any,
      relationManager as any
    );

    const items = provider.getChildren();
    const childItems = provider.getChildren(items[0]);

    expect(items[0].contextValue).toBe('term-note-group');
    expect(childItems[0].contextValue).toBe('term-note');
    expect(childItems[0].label).toBe('User Table');
  });
});

describe('package contributions for term notes', () => {
  it('contributes the add-term-note command and term-notes view', () => {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const commands = packageJson.contributes.commands as Array<{ command: string }>;
    const views = packageJson.contributes.views.groupBookmarks as Array<{ id: string }>;

    expect(commands.some(item => item.command === 'groupBookmarks.addTermNoteFromSelection')).toBe(true);
    expect(views.some(item => item.id === 'groupTermNotesView')).toBe(true);
  });

  it('does not add an editor context menu entry for adding term notes from selection', () => {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const editorContextMenus = packageJson.contributes.menus['editor/context'] as Array<{ command: string }>;

    expect(editorContextMenus.some(item => item.command === 'groupBookmarks.addTermNoteFromSelection')).toBe(false);
  });
});
