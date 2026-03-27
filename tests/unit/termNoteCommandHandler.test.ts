import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupColor, type TermNote, type TermNoteGroup, type TermNoteGroupRelation } from '../../src/models/types';
import { TermNoteDocumentService } from '../../src/services/termNoteDocumentService';
import { TermNoteCommandHandler } from '../../src/views/termNoteCommandHandler';
import { TermNoteTreeProvider } from '../../src/views/termNoteTreeProvider';

const mockState = vi.hoisted(() => ({
  window: {
    activeTextEditor: undefined as any,
    showQuickPick: vi.fn().mockResolvedValue(undefined),
    showInputBox: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
    showTextDocument: vi.fn().mockResolvedValue(undefined),
  },
  commands: {
    registerCommand: vi.fn((_command: string, handler: (...args: any[]) => any) => ({
      dispose: vi.fn(),
      handler,
    })),
  },
  workspace: {
    fs: {
      isWritableFileSystem: vi.fn().mockReturnValue(true),
    },
    openTextDocument: vi.fn().mockImplementation(async (uri: any) => ({
      uri,
      getText: vi.fn().mockReturnValue(''),
    })),
    registerFileSystemProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
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

  class MockDisposable {
    constructor(private readonly fn: () => void = () => {}) {}
    dispose() {
      this.fn();
    }
  }

  class MockUri {
    readonly scheme: string;
    readonly path: string;

    constructor(scheme: string, path: string) {
      this.scheme = scheme;
      this.path = path;
    }

    toString() {
      return `${this.scheme}:${this.path}`;
    }

    static parse(value: string) {
      const match = /^([^:]+):(.*)$/.exec(value);
      if (!match) {
        throw new Error(`Invalid URI: ${value}`);
      }

      return new MockUri(match[1], match[2]);
    }
  }

  return {
    EventEmitter: MockEventEmitter,
    TreeItem: MockTreeItem,
    Disposable: MockDisposable,
    Uri: MockUri,
    FileType: {
      File: 1,
    },
    FileChangeType: {
      Changed: 2,
    },
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    window: mockState.window,
    commands: mockState.commands,
    workspace: mockState.workspace,
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

function createEventHook() {
  const listeners: Array<() => void> = [];
  const subscribe = vi.fn((listener: () => void) => {
    listeners.push(listener);
    return { dispose: vi.fn() };
  });

  return {
    subscribe,
    fire: () => {
      listeners.forEach(listener => listener());
    },
  };
}

afterEach(() => {
  mockState.window.activeTextEditor = undefined;
  vi.clearAllMocks();
  mockState.workspace.fs.isWritableFileSystem.mockReturnValue(true);
});

describe('TermNoteCommandHandler', () => {
  it('opens the custom term-note document after creating or finding the note', async () => {
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
    const documentService = {
      openNoteDocument: vi.fn().mockResolvedValue(undefined),
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
      relationManager as any,
      documentService as any
    );

    await handler.addTermNoteFromSelection();

    expect(documentService.openNoteDocument).toHaveBeenCalledWith('note-1');
  });

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
      relationManager as any,
      { openNoteDocument: vi.fn().mockResolvedValue(undefined) } as any
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
      relationManager as any,
      { openNoteDocument: vi.fn().mockResolvedValue(undefined) } as any
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
      relationManager as any,
      { openNoteDocument: vi.fn().mockResolvedValue(undefined) } as any
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
      relationManager as any,
      { openNoteDocument: vi.fn().mockResolvedValue(undefined) } as any
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
      relationManager as any,
      { openNoteDocument: vi.fn().mockResolvedValue(undefined) } as any
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

  it('refreshes when term-note data manager events fire', () => {
    const termNotesEvent = createEventHook();
    const termNoteGroupsEvent = createEventHook();
    const termNoteRelationsEvent = createEventHook();
    const dataManager = {
      onDidChangeTermNotes: termNotesEvent.subscribe,
      onDidChangeTermNoteGroups: termNoteGroupsEvent.subscribe,
      onDidChangeTermNoteRelations: termNoteRelationsEvent.subscribe,
      getTermNote: vi.fn(),
    };
    const termNoteGroupManager = {
      getAllGroups: vi.fn().mockReturnValue([]),
      getActiveTermNoteGroupId: vi.fn(),
    };
    const relationManager = {
      getRelationsInGroup: vi.fn().mockReturnValue([]),
    };

    const provider = new TermNoteTreeProvider(
      dataManager as any,
      termNoteGroupManager as any,
      relationManager as any
    );
    const refreshSpy = vi.spyOn(provider, 'refresh');

    expect(dataManager.onDidChangeTermNotes).toHaveBeenCalledTimes(1);
    expect(dataManager.onDidChangeTermNoteGroups).toHaveBeenCalledTimes(1);
    expect(dataManager.onDidChangeTermNoteRelations).toHaveBeenCalledTimes(1);

    termNotesEvent.fire();
    termNoteGroupsEvent.fire();
    termNoteRelationsEvent.fire();

    expect(refreshSpy).toHaveBeenCalledTimes(3);
  });
});

describe('TermNoteDocumentService', () => {
  it('builds the custom markdown URI for a note id', () => {
    const service = new TermNoteDocumentService(
      vi.fn(),
      vi.fn()
    );

    expect(service.getUri('note-1').toString()).toBe('groupbookmarks-term-note:/note-1.md');
  });

  it('opens a note by using the custom markdown URI', async () => {
    const service = new TermNoteDocumentService(
      vi.fn().mockReturnValue(makeNote('note-1')),
      vi.fn()
    );

    await service.openNoteDocument('note-1');

    expect(mockState.workspace.openTextDocument).toHaveBeenCalledWith(service.getUri('note-1'));
    expect(mockState.window.showTextDocument).toHaveBeenCalledTimes(1);
  });

  it('writes saved markdown back through termNoteManager.updateContent', async () => {
    const updateContent = vi.fn().mockResolvedValue(undefined);
    const service = new TermNoteDocumentService(
      vi.fn().mockReturnValue(makeNote('note-1')),
      updateContent
    );

    await service.writeFile(service.getUri('note-1'), Buffer.from('# User table'), { create: false, overwrite: true });

    expect(updateContent).toHaveBeenCalledWith('note-1', '# User table');
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
