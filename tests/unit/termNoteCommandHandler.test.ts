import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupColor, type TermNote, type TermNoteGroup, type TermNoteGroupRelation } from '../../src/models/types';
import { registerTermNotePreviewSelectionListener, registerTermNoteSelectionRevealListener } from '../../src/extension';
import { DataManager } from '../../src/data/dataManager';
import { TermNoteManager } from '../../src/core/termNoteManager';
import { TermNoteGroupManager } from '../../src/core/termNoteGroupManager';
import { TermNoteRelationManager } from '../../src/core/termNoteRelationManager';
import { TermNoteDocumentService } from '../../src/services/termNoteDocumentService';
import { TermNotePreviewService } from '../../src/services/termNotePreviewService';
import { TermNoteCommandHandler } from '../../src/views/termNoteCommandHandler';
import { TermNoteTreeItem, TermNoteTreeProvider } from '../../src/views/termNoteTreeProvider';
import { TermNoteSidebarPreviewProvider } from '../../src/views/termNoteSidebarPreviewProvider';
import { registerTermNoteTreePreviewSelectionListener } from '../../src/extension';

type CommandHandler = (...args: unknown[]) => unknown;
type RegisteredCommand = {
  dispose: () => void;
  handler: CommandHandler;
};
type TestExtensionContext = {
  subscriptions: Array<{ dispose: () => void }>;
};
type TextEditorSelectionMock = {
  isEmpty: boolean;
  start?: { line: number; character: number };
  end?: { line: number; character: number };
};
type TextEditorMock = {
  document: {
    getText: (selection?: unknown) => string;
  };
  selection: TextEditorSelectionMock;
};

const mockState = vi.hoisted(() => ({
  window: {
    activeTextEditor: undefined as TextEditorMock | undefined,
    createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onDidChangeTextEditorSelection: vi.fn(),
    showQuickPick: vi.fn().mockResolvedValue(undefined),
    showInputBox: vi.fn().mockResolvedValue(undefined),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showWarningMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
    showTextDocument: vi.fn().mockResolvedValue(undefined),
  },
  commands: {
    registerCommand: vi.fn((command: string, handler: CommandHandler): RegisteredCommand => {
      void command;
      return {
        dispose: vi.fn(),
        handler,
      };
    }),
    executeCommand: vi.fn().mockResolvedValue(undefined),
  },
  workspace: {
    fs: {
      isWritableFileSystem: vi.fn().mockReturnValue(true),
    },
    openTextDocument: vi.fn().mockImplementation(async (uri: vscode.Uri) => ({
      uri,
      getText: vi.fn().mockReturnValue(''),
    })),
    registerFileSystemProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  },
}));

const defaultRegisterCommand = (command: string, handler: CommandHandler): RegisteredCommand => {
  void command;
  return {
    dispose: vi.fn(),
    handler,
  };
};

const defaultOpenTextDocument = async (uri: vscode.Uri) => ({
  uri,
  getText: vi.fn().mockReturnValue(''),
});

vi.mock('vscode', () => {
  class MockEventEmitter {
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
    iconPath?: unknown;

    constructor(label: string, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class MockThemeColor {
    constructor(public readonly id: string) {}
  }

  class MockThemeIcon {
    constructor(
      public readonly id: string,
      public readonly color?: MockThemeColor
    ) {}
  }

  class MockDisposable {
    constructor(private readonly fn: () => void = () => {}) {}
    dispose() {
      this.fn();
    }
  }

  class MockMarkdownString {
    value = '';

    appendMarkdown(text: string) {
      this.value += text;
      return this;
    }

    appendText(text: string) {
      this.value += text.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] ?? ch));
      return this;
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
    ThemeColor: MockThemeColor,
    ThemeIcon: MockThemeIcon,
    Disposable: MockDisposable,
    MarkdownString: MockMarkdownString,
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
  mockState.window.showQuickPick.mockReset().mockResolvedValue(undefined);
  mockState.window.showInputBox.mockReset().mockResolvedValue(undefined);
  mockState.window.showInformationMessage.mockReset().mockResolvedValue(undefined);
  mockState.window.showWarningMessage.mockReset().mockResolvedValue(undefined);
  mockState.window.showErrorMessage.mockReset().mockResolvedValue(undefined);
  mockState.window.showTextDocument.mockReset().mockResolvedValue(undefined);
  mockState.window.createTextEditorDecorationType.mockReset().mockReturnValue({ dispose: vi.fn() });
  mockState.window.onDidChangeTextEditorSelection.mockReset();
  mockState.commands.registerCommand.mockReset().mockImplementation(defaultRegisterCommand);
  mockState.commands.executeCommand.mockReset().mockResolvedValue(undefined);
  mockState.workspace.openTextDocument.mockReset().mockImplementation(defaultOpenTextDocument);
  mockState.workspace.registerFileSystemProvider.mockReset().mockReturnValue({ dispose: vi.fn() });
  mockState.workspace.fs.isWritableFileSystem.mockReturnValue(true);
});

function createPreviewEditor(selectedText: string) {
  const selection: TextEditorSelectionMock = {
    isEmpty: selectedText.length === 0,
    start: { line: 1, character: 0 },
    end: { line: 1, character: selectedText.length },
  };

  return {
    document: {
      getText: vi.fn().mockReturnValue(selectedText),
    },
    selection,
    setDecorations: vi.fn(),
  };
}

function createExtensionContext() {
  return {
    subscriptions: [] as Array<{ dispose: () => void }>,
  };
}

type TermNoteTreeItemLike = {
  dataId?: string;
  groupId?: string;
  label?: string | { label: string };
};

function asExtensionContext(context: TestExtensionContext): vscode.ExtensionContext {
  return context as unknown as vscode.ExtensionContext;
}

function asTextEditor(editor: ReturnType<typeof createPreviewEditor>): vscode.TextEditor {
  return editor as unknown as vscode.TextEditor;
}

function asTermNoteManager(mock: unknown): TermNoteManager {
  return mock as unknown as TermNoteManager;
}

function asTermNoteGroupManager(mock: unknown): TermNoteGroupManager {
  return mock as unknown as TermNoteGroupManager;
}

function asTermNoteRelationManager(mock: unknown): TermNoteRelationManager {
  return mock as unknown as TermNoteRelationManager;
}

function asTermNoteDocumentService(mock: unknown): TermNoteDocumentService {
  return mock as unknown as TermNoteDocumentService;
}

function asDataManager(mock: unknown): DataManager {
  return mock as unknown as DataManager;
}

function asPreviewService(mock: unknown): TermNotePreviewService {
  return mock as unknown as TermNotePreviewService;
}

function asSidebarPreviewProvider(mock: unknown): TermNoteSidebarPreviewProvider {
  return mock as unknown as TermNoteSidebarPreviewProvider;
}

function createWebviewView() {
  let messageListener: ((message: unknown) => void | Promise<void>) | undefined;

  return {
    webview: {
      html: '',
      options: {},
      onDidReceiveMessage: vi.fn((listener: (message: unknown) => void | Promise<void>) => {
        messageListener = listener;
        return { dispose: vi.fn() };
      }),
    },
    show: vi.fn(),
    fireMessage: async (message: unknown) => {
      await messageListener?.(message);
    },
  };
}

describe('TermNoteCommandHandler', () => {
  it('registers term-note management commands', () => {
    const handler = new TermNoteCommandHandler(
      asTermNoteManager({ createOrGetTermNote: vi.fn() }),
      asTermNoteGroupManager({ getActiveTermNoteGroupId: vi.fn(), getGroupById: vi.fn(), getAllGroups: vi.fn() }),
      asTermNoteRelationManager({
        addTermNoteToGroup: vi.fn(),
        removeTermNoteFromGroup: vi.fn(),
        deleteTermNoteEverywhere: vi.fn(),
        getGroupsForTermNote: vi.fn(),
      }),
      asTermNoteDocumentService({ openNoteDocument: vi.fn() })
    );
    const context = createExtensionContext();

    handler.registerCommands(asExtensionContext(context));

    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.addTermNoteFromSelection',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.openTermNote',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.createTermNoteGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.renameTermNoteGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.deleteTermNoteGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.removeTermNoteFromGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.deleteTermNote',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.addExistingTermNoteToGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.setActiveTermNoteGroup',
      expect.any(Function)
    );
    expect(context.subscriptions).toHaveLength(9);
  });

  it('opens the custom term-note document after creating or finding the note when no panel editor is available', async () => {
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
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService(documentService)
    );

    await handler.addTermNoteFromSelection();

    expect(documentService.openNoteDocument).toHaveBeenCalledWith('note-1');
  });

  it('loads the fixed term-note editor after creating or finding the note when a panel editor is available', async () => {
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
    const sidebarPreviewProvider = {
      editTermNote: vi.fn(),
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
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService(documentService),
      asSidebarPreviewProvider(sidebarPreviewProvider)
    );

    await handler.addTermNoteFromSelection();

    expect(sidebarPreviewProvider.editTermNote).toHaveBeenCalledWith('note-1');
    expect(documentService.openNoteDocument).not.toHaveBeenCalled();
  });

  it('opens an existing term note from the tree item command', async () => {
    const documentService = {
      openNoteDocument: vi.fn().mockResolvedValue(undefined),
    };
    const handler = new TermNoteCommandHandler(
      asTermNoteManager({ createOrGetTermNote: vi.fn() }),
      asTermNoteGroupManager({ getActiveTermNoteGroupId: vi.fn(), getGroupById: vi.fn(), getAllGroups: vi.fn() }),
      asTermNoteRelationManager({
        addTermNoteToGroup: vi.fn(),
        removeTermNoteFromGroup: vi.fn(),
        deleteTermNoteEverywhere: vi.fn(),
        getGroupsForTermNote: vi.fn(),
      }),
      asTermNoteDocumentService(documentService)
    );

    await handler.openTermNote({
      dataId: 'note-1',
      groupId: 'group-1',
      label: 'User Table',
    } as TermNoteTreeItemLike);

    expect(documentService.openNoteDocument).toHaveBeenCalledWith('note-1');
    expect(mockState.window.showErrorMessage).not.toHaveBeenCalled();
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
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn().mockResolvedValue(undefined) })
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
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn().mockResolvedValue(undefined) })
    );

    await handler.addTermNoteFromSelection();

    expect(termNoteGroupManager.setActiveTermNoteGroupId).toHaveBeenNthCalledWith(1, undefined);
    expect(termNoteGroupManager.setActiveTermNoteGroupId).toHaveBeenNthCalledWith(2, 'group-2');
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
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn().mockResolvedValue(undefined) })
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
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn().mockResolvedValue(undefined) })
    );

    await handler.addTermNoteFromSelection();

    expect(mockState.window.showQuickPick).toHaveBeenCalledTimes(1);
    expect(mockState.window.showInputBox).toHaveBeenCalledTimes(1);
    expect(termNoteGroupManager.createGroup).toHaveBeenCalledWith('Fresh Notes');
    expect(termNoteGroupManager.setActiveTermNoteGroupId).toHaveBeenCalledWith('group-new');
    expect(termNoteManager.createOrGetTermNote).toHaveBeenCalledWith('HTTP Client');
    expect(relationManager.addTermNoteToGroup).toHaveBeenCalledWith('note-1', 'group-new');
  });

  it('creates a group when quick pick returns the create label without the custom action field', async () => {
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
    });
    mockState.window.showInputBox.mockResolvedValue('Fresh Notes');

    const handler = new TermNoteCommandHandler(
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn().mockResolvedValue(undefined) })
    );

    await handler.addTermNoteFromSelection();

    expect(mockState.window.showInputBox).toHaveBeenCalledTimes(1);
    expect(termNoteGroupManager.createGroup).toHaveBeenCalledWith('Fresh Notes');
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
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn().mockResolvedValue(undefined) })
    );

    await expect(handler.addTermNoteFromSelection()).resolves.toBeUndefined();

    expect(mockState.window.showErrorMessage).toHaveBeenCalledWith('Failed to add term note: create failed');
    expect(termNoteManager.createOrGetTermNote).not.toHaveBeenCalled();
    expect(relationManager.addTermNoteToGroup).not.toHaveBeenCalled();
  });

  it('removes only the current group relation from a term-note tree item', async () => {
    const termNoteManager = {
      createOrGetTermNote: vi.fn(),
      deleteTermNote: vi.fn(),
    };
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn(),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([]),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn(),
      removeTermNoteFromGroup: vi.fn().mockResolvedValue(undefined),
      deleteTermNoteEverywhere: vi.fn(),
      getGroupsForTermNote: vi.fn().mockReturnValue([]),
    };
    const handler = new TermNoteCommandHandler(
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.removeTermNoteFromGroup({
      dataId: 'note-1',
      groupId: 'group-1',
      label: 'User Table',
    } as TermNoteTreeItemLike);

    expect(relationManager.removeTermNoteFromGroup).toHaveBeenCalledWith('note-1', 'group-1');
    expect(relationManager.deleteTermNoteEverywhere).not.toHaveBeenCalled();
    expect(termNoteManager.deleteTermNote).not.toHaveBeenCalled();
  });

  it('deletes the note body and all relations after confirmation', async () => {
    const termNoteManager = {
      createOrGetTermNote: vi.fn(),
      deleteTermNote: vi.fn().mockResolvedValue(undefined),
    };
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn(),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([]),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn(),
      removeTermNoteFromGroup: vi.fn(),
      deleteTermNoteEverywhere: vi.fn(),
      getGroupsForTermNote: vi.fn().mockReturnValue([]),
    };
    mockState.window.showWarningMessage.mockResolvedValue('Delete');

    const handler = new TermNoteCommandHandler(
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.deleteTermNote({
      dataId: 'note-1',
      groupId: 'group-1',
      label: 'User Table',
    } as TermNoteTreeItemLike);

    expect(mockState.window.showWarningMessage).toHaveBeenCalledWith(
      'Delete term note "User Table" everywhere?',
      'Delete',
      'Cancel'
    );
    expect(relationManager.deleteTermNoteEverywhere).toHaveBeenCalledWith('note-1');
    expect(relationManager.removeTermNoteFromGroup).not.toHaveBeenCalled();
    expect(termNoteManager.deleteTermNote).not.toHaveBeenCalled();
  });

  it('adds an existing term note to another group and excludes existing memberships', async () => {
    const userNotes = makeGroup('group-1', { displayName: '1. User Notes', name: 'User Notes' });
    const apiNotes = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const opsNotes = makeGroup('group-3', { displayName: '3. Ops Notes', name: 'Ops Notes' });
    const termNoteManager = {
      createOrGetTermNote: vi.fn(),
      deleteTermNote: vi.fn(),
    };
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn(),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([userNotes, apiNotes, opsNotes]),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn().mockResolvedValue(undefined),
      removeTermNoteFromGroup: vi.fn(),
      deleteTermNoteEverywhere: vi.fn(),
      getGroupsForTermNote: vi.fn().mockReturnValue([userNotes, apiNotes]),
    };
    mockState.window.showQuickPick.mockResolvedValue({
      label: '3. Ops Notes',
      groupId: 'group-3',
    });

    const handler = new TermNoteCommandHandler(
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.addExistingTermNoteToGroup({
      dataId: 'note-1',
      groupId: 'group-1',
      label: 'User Table',
    } as TermNoteTreeItemLike);

    expect(mockState.window.showQuickPick).toHaveBeenCalledTimes(1);
    expect(mockState.window.showQuickPick.mock.calls[0][0]).toEqual([
      expect.objectContaining({ groupId: 'group-3' }),
    ]);
    expect(relationManager.addTermNoteToGroup).toHaveBeenCalledWith('note-1', 'group-3');
  });

  it('sets the selected term-note group as active and reports it', async () => {
    const group = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const termNoteManager = {
      createOrGetTermNote: vi.fn(),
      deleteTermNote: vi.fn(),
    };
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn().mockReturnValue(undefined),
      getGroupById: vi.fn().mockReturnValue(group),
      getAllGroups: vi.fn().mockReturnValue([]),
      setActiveTermNoteGroupId: vi.fn().mockResolvedValue(undefined),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn(),
      removeTermNoteFromGroup: vi.fn(),
      deleteTermNoteEverywhere: vi.fn(),
      getGroupsForTermNote: vi.fn().mockReturnValue([]),
    };
    const handler = new TermNoteCommandHandler(
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.setActiveTermNoteGroup({
      dataId: group.id,
      label: group.displayName,
    } as TermNoteTreeItemLike);

    expect(termNoteGroupManager.setActiveTermNoteGroupId).toHaveBeenCalledWith(group.id);
    expect(mockState.window.showInformationMessage).toHaveBeenCalledWith(
      'Active term-note group set to "API Notes"'
    );
    expect(mockState.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('toggles the active term-note group off when the active group is selected again', async () => {
    const group = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn().mockReturnValue(group.id),
      getGroupById: vi.fn().mockReturnValue(group),
      getAllGroups: vi.fn().mockReturnValue([]),
      setActiveTermNoteGroupId: vi.fn().mockResolvedValue(undefined),
    };
    const handler = new TermNoteCommandHandler(
      asTermNoteManager({ createOrGetTermNote: vi.fn(), deleteTermNote: vi.fn() }),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager({
        addTermNoteToGroup: vi.fn(),
        removeTermNoteFromGroup: vi.fn(),
        deleteTermNoteEverywhere: vi.fn(),
        getGroupsForTermNote: vi.fn().mockReturnValue([]),
      }),
      asTermNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.setActiveTermNoteGroup({
      dataId: group.id,
      label: group.displayName,
    } as TermNoteTreeItemLike);

    expect(termNoteGroupManager.setActiveTermNoteGroupId).toHaveBeenCalledWith(undefined);
    expect(mockState.window.showInformationMessage).toHaveBeenCalledWith('Active term-note group cleared');
  });

  it('renames a term-note group using the bookmark group prompt and success message pattern', async () => {
    const group = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn(),
      getGroupById: vi.fn().mockReturnValue(group),
      getAllGroups: vi.fn().mockReturnValue([group]),
      renameGroup: vi.fn().mockResolvedValue(undefined),
    };
    mockState.window.showInputBox.mockResolvedValue('Reference Notes');

    const handler = new TermNoteCommandHandler(
      asTermNoteManager({ createOrGetTermNote: vi.fn(), deleteTermNote: vi.fn() }),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager({
        addTermNoteToGroup: vi.fn(),
        removeTermNoteFromGroup: vi.fn(),
        deleteTermNoteEverywhere: vi.fn(),
        getGroupsForTermNote: vi.fn().mockReturnValue([]),
        getRelationsInGroup: vi.fn().mockReturnValue([]),
      }),
      asTermNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.renameTermNoteGroup({
      dataId: group.id,
      label: group.displayName,
    } as TermNoteTreeItemLike);

    expect(mockState.window.showInputBox).toHaveBeenCalledWith({
      prompt: 'Enter new group name',
      value: group.name,
    });
    expect(termNoteGroupManager.renameGroup).toHaveBeenCalledWith(group.id, 'Reference Notes');
    expect(mockState.window.showInformationMessage).toHaveBeenCalledWith('Group renamed to "Reference Notes"');
  });

  it('confirms before deleting a term-note group and reports success', async () => {
    const group = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn(),
      getGroupById: vi.fn().mockReturnValue(group),
      getAllGroups: vi.fn().mockReturnValue([group]),
      deleteGroup: vi.fn().mockResolvedValue(undefined),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn(),
      removeTermNoteFromGroup: vi.fn(),
      deleteTermNoteEverywhere: vi.fn(),
      getGroupsForTermNote: vi.fn().mockReturnValue([]),
      getRelationsInGroup: vi.fn().mockReturnValue([
        makeRelation('rel-1', 'note-1', group.id),
        makeRelation('rel-2', 'note-2', group.id),
      ]),
    };
    mockState.window.showWarningMessage.mockResolvedValue('Delete');

    const handler = new TermNoteCommandHandler(
      asTermNoteManager({ createOrGetTermNote: vi.fn(), deleteTermNote: vi.fn() }),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.deleteTermNoteGroup({
      dataId: group.id,
      label: group.displayName,
    } as TermNoteTreeItemLike);

    expect(mockState.window.showWarningMessage).toHaveBeenCalledWith(
      'Delete group "API Notes" with 2 term notes?',
      'Delete',
      'Cancel'
    );
    expect(termNoteGroupManager.deleteGroup).toHaveBeenCalledWith(group.id);
    expect(mockState.window.showInformationMessage).toHaveBeenCalledWith('Group "API Notes" deleted');
  });

  it('creates a term-note group from the dedicated command and sets it active', async () => {
    const createdGroup = makeGroup('group-new', { displayName: '1. Fresh Notes', name: 'Fresh Notes' });
    const termNoteManager = {
      createOrGetTermNote: vi.fn(),
      deleteTermNote: vi.fn(),
    };
    const termNoteGroupManager = {
      getActiveTermNoteGroupId: vi.fn(),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([]),
      createGroup: vi.fn().mockResolvedValue(createdGroup),
      setActiveTermNoteGroupId: vi.fn().mockResolvedValue(undefined),
    };
    const relationManager = {
      addTermNoteToGroup: vi.fn(),
      removeTermNoteFromGroup: vi.fn(),
      deleteTermNoteEverywhere: vi.fn(),
      getGroupsForTermNote: vi.fn().mockReturnValue([]),
    };
    mockState.window.showInputBox.mockResolvedValue('Fresh Notes');

    const handler = new TermNoteCommandHandler(
      asTermNoteManager(termNoteManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager),
      asTermNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.createTermNoteGroup();

    expect(mockState.window.showInputBox).toHaveBeenCalledWith({
      prompt: 'Enter term-note group name',
      placeHolder: 'Group name',
    });
    expect(termNoteGroupManager.createGroup).toHaveBeenCalledWith('Fresh Notes');
    expect(termNoteGroupManager.setActiveTermNoteGroupId).toHaveBeenCalledWith(createdGroup.id);
  });
});

describe('TermNotePreviewService', () => {
  it('shows a hover preview for a normalized matching term selection', async () => {
    const note = makeNote('note-1', {
      term: 'User Table',
      normalizedTerm: 'user_table',
      contentMarkdown: '- indexed\n\n**stable**',
    });
    const groups = [
      makeGroup('group-1', { displayName: '1. User Notes', name: 'User Notes' }),
      makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' }),
    ];
    const termNoteManager = {
      getByNormalizedTerm: vi.fn().mockReturnValue(note),
    };
    const termNoteRelationManager = {
      getGroupsForTermNote: vi.fn().mockReturnValue(groups),
    };
    const service = new TermNotePreviewService(
      termNoteManager as Pick<TermNoteManager, 'getByNormalizedTerm'>,
      termNoteRelationManager as Pick<TermNoteRelationManager, 'getGroupsForTermNote'>
    );
    const editor = createPreviewEditor('  User_Table  ');

    await service.previewSelection(asTextEditor(editor));

    expect(termNoteManager.getByNormalizedTerm).toHaveBeenCalledWith('user_table');
    expect(termNoteRelationManager.getGroupsForTermNote).toHaveBeenCalledWith('note-1');
    expect(editor.setDecorations).toHaveBeenCalledTimes(1);
    expect(editor.setDecorations).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          range: editor.selection,
          hoverMessage: expect.objectContaining({
            value: [
              '### User Table',
              '',
              '**Related groups**',
              '- `1. User Notes`',
              '- `2. API Notes`',
              '',
              '- indexed',
              '',
              '**stable**',
            ].join('\n'),
          }),
        }),
      ]
    );
    expect(mockState.commands.executeCommand).toHaveBeenCalledWith('editor.action.showHover');
  });

  it('shows a placeholder when a matching note has no markdown body', async () => {
    const note = makeNote('note-1', {
      term: 'HTTP Client',
      normalizedTerm: 'http_client',
      contentMarkdown: '',
    });
    const groups = [makeGroup('group-1', { displayName: '1. API Notes', name: 'API Notes' })];
    const termNoteManager = {
      getByNormalizedTerm: vi.fn().mockReturnValue(note),
    };
    const termNoteRelationManager = {
      getGroupsForTermNote: vi.fn().mockReturnValue(groups),
    };
    const service = new TermNotePreviewService(
      termNoteManager as Pick<TermNoteManager, 'getByNormalizedTerm'>,
      termNoteRelationManager as Pick<TermNoteRelationManager, 'getGroupsForTermNote'>
    );
    const editor = createPreviewEditor('HTTP Client');

    await service.previewSelection(asTextEditor(editor));

    const hoverMessage = editor.setDecorations.mock.calls[0][1][0].hoverMessage;
    expect(hoverMessage.value).toBe([
      '### HTTP Client',
      '',
      '**Related groups**',
      '- `1. API Notes`',
      '',
      '_No note body yet_',
    ].join('\n'));
  });

  it('ignores empty, multiline, and overlong selections without showing hover', async () => {
    const termNoteManager = {
      getByNormalizedTerm: vi.fn(),
    };
    const termNoteRelationManager = {
      getGroupsForTermNote: vi.fn(),
    };
    const service = new TermNotePreviewService(
      termNoteManager as Pick<TermNoteManager, 'getByNormalizedTerm'>,
      termNoteRelationManager as Pick<TermNoteRelationManager, 'getGroupsForTermNote'>
    );

    for (const selectedText of ['', '   ', 'User\nTable', 'A'.repeat(121)]) {
      const editor = createPreviewEditor(selectedText);
      await service.previewSelection(asTextEditor(editor));

      expect(termNoteManager.getByNormalizedTerm).not.toHaveBeenCalled();
      expect(termNoteRelationManager.getGroupsForTermNote).not.toHaveBeenCalled();
      expect(mockState.commands.executeCommand).not.toHaveBeenCalled();
      expect(editor.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
      vi.clearAllMocks();
      mockState.commands.executeCommand.mockReset().mockResolvedValue(undefined);
    }
  });
});

describe('TermNoteRelationManager', () => {
  it('returns note groups ordered by group order with a deterministic tie-breaker', () => {
    const alpha = makeGroup('group-a', { displayName: '1. Alpha', order: 1 });
    const beta = makeGroup('group-b', { displayName: '1. Beta', order: 1 });
    const gamma = makeGroup('group-c', { displayName: '2. Gamma', order: 2 });
    const relationManager = new TermNoteRelationManager({
      getAllTermNoteRelations: vi.fn().mockReturnValue([
        makeRelation('relation-c', 'note-1', gamma.id, { order: 99 }),
        makeRelation('relation-b', 'note-1', beta.id, { order: 3 }),
        makeRelation('relation-a', 'note-1', alpha.id, { order: 1 }),
      ]),
      getTermNoteGroup: vi.fn((id: string) => ({
        [alpha.id]: alpha,
        [beta.id]: beta,
        [gamma.id]: gamma,
      }[id]),
      ),
    } as unknown as DataManager);

    expect(relationManager.getGroupsForTermNote('note-1').map(group => group.id)).toEqual([
      alpha.id,
      beta.id,
      gamma.id,
    ]);
  });
});

describe('extension term-note preview wiring', () => {
  it('does not register automatic hover preview wiring by default', () => {
    const previewSelection = vi.fn();
    const context = createExtensionContext();
    registerTermNotePreviewSelectionListener(asExtensionContext(context));

    expect(mockState.window.onDidChangeTextEditorSelection).not.toHaveBeenCalled();
    expect(context.subscriptions).toHaveLength(1);
    expect(previewSelection).not.toHaveBeenCalled();
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
      asDataManager(dataManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager)
    );

    const items = provider.getChildren();
    const childItems = provider.getChildren(items[0]);

    expect(items[0].contextValue).toBe('term-note-group');
    expect(items[0].groupId).toBeUndefined();
    expect(childItems[0].contextValue).toBe('term-note');
    expect(childItems[0].label).toBe('User Table');
    expect(childItems[0].groupId).toBe(group.id);
    expect(childItems[0].command).toBeUndefined();
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
      asDataManager(dataManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager)
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

  it('builds a reveal item for a note using the active group when possible', () => {
    const note = makeNote('note-1');
    const userGroup = makeGroup('group-1', { displayName: '1. User Notes', name: 'User Notes' });
    const apiGroup = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const dataManager = {
      onDidChangeTermNotes: vi.fn(),
      onDidChangeTermNoteGroups: vi.fn(),
      onDidChangeTermNoteRelations: vi.fn(),
      getTermNote: vi.fn((id: string) => (id === note.id ? note : undefined)),
    };
    const termNoteGroupManager = {
      getAllGroups: vi.fn().mockReturnValue([userGroup, apiGroup]),
      getGroupById: vi.fn((id: string) => ({ [userGroup.id]: userGroup, [apiGroup.id]: apiGroup }[id])),
      getActiveTermNoteGroupId: vi.fn().mockReturnValue(apiGroup.id),
    };
    const relationManager = {
      getRelationsInGroup: vi.fn(),
      getGroupsForTermNote: vi.fn().mockReturnValue([userGroup, apiGroup]),
    };
    const provider = new TermNoteTreeProvider(
      asDataManager(dataManager),
      asTermNoteGroupManager(termNoteGroupManager),
      asTermNoteRelationManager(relationManager)
    );

    const item = provider.getRevealItemForNoteId(note.id);
    const parent = item ? provider.getParent(item) : undefined;

    expect(item).toEqual(expect.objectContaining({
      type: 'term-note',
      dataId: note.id,
      groupId: apiGroup.id,
      label: note.term,
    }));
    expect(parent).toEqual(expect.objectContaining({
      type: 'term-note-group',
      dataId: apiGroup.id,
    }));
  });

  it('shows the active term-note group with the same pinned icon style as bookmark groups', () => {
    const apiGroup = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const provider = new TermNoteTreeProvider(
      asDataManager({
        onDidChangeTermNotes: vi.fn(),
        onDidChangeTermNoteGroups: vi.fn(),
        onDidChangeTermNoteRelations: vi.fn(),
        getTermNote: vi.fn(),
      }),
      asTermNoteGroupManager({
        getAllGroups: vi.fn().mockReturnValue([apiGroup]),
        getActiveTermNoteGroupId: vi.fn().mockReturnValue(apiGroup.id),
      }),
      asTermNoteRelationManager({
        getRelationsInGroup: vi.fn().mockReturnValue([]),
      })
    );

    const [item] = provider.getChildren();

    expect(item.description).toBeUndefined();
    expect(item.iconPath).toEqual(expect.objectContaining({
      id: 'pinned',
      color: expect.objectContaining({
        id: 'list.highlightForeground',
      }),
    }));
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
  it('contributes the add-term-note command, term-notes tree, and a dedicated note-editor panel', () => {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const commands = packageJson.contributes.commands as Array<{ command: string }>;
    const sidebarViews = packageJson.contributes.views.groupBookmarks as Array<{ id: string; type?: string }>;
    const panelContainers = packageJson.contributes.viewsContainers.panel as Array<{ id: string; title?: string }>;
    const panelViews = packageJson.contributes.views.groupBookmarksTermNotePanel as Array<{ id: string; type?: string }>;

    expect(commands.some(item => item.command === 'groupBookmarks.addTermNoteFromSelection')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.openTermNote')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.createTermNoteGroup')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.renameTermNoteGroup')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.deleteTermNoteGroup')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.removeTermNoteFromGroup')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.deleteTermNote')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.addExistingTermNoteToGroup')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.setActiveTermNoteGroup')).toBe(true);
    expect(sidebarViews.some(item => item.id === 'groupTermNotesView')).toBe(true);
    expect(sidebarViews.some(item => item.id === 'groupTermNotePreviewView')).toBe(false);
    expect(panelContainers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'groupBookmarksTermNotePanel',
        title: 'Term Note Editor',
      }),
    ]));
    expect(panelViews).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'groupTermNotePreviewView',
        name: 'Note Editor',
        type: 'webview',
      }),
    ]));
  });

  it('uses consistent but distinct command metadata for adding bookmarks and term notes from the editor context menu', () => {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const commands = packageJson.contributes.commands as Array<{ command: string; title?: string; category?: string; icon?: string }>;
    const editorContextMenus = packageJson.contributes.menus['editor/context'] as Array<{ command: string }>;
    const bookmarkMenuEntry = editorContextMenus.find(item => item.command === 'groupBookmarks.addBookmarkMenu') as
      | { command: string; group?: string; when?: string }
      | undefined;
    const menuEntry = editorContextMenus.find(item => item.command === 'groupBookmarks.addTermNoteFromSelection') as
      | { command: string; group?: string; when?: string }
      | undefined;
    const bookmarkCommandEntry = commands.find(item => item.command === 'groupBookmarks.addBookmarkMenu');
    const commandEntry = commands.find(item => item.command === 'groupBookmarks.addTermNoteFromSelection');

    expect(bookmarkCommandEntry?.title).toBe('Add Group Bookmark');
    expect(bookmarkCommandEntry?.category).toBe('Group Bookmarks');
    expect(bookmarkCommandEntry?.icon).toBe('$(bookmark)');
    expect(commandEntry?.title).toBe('Add Note for Selection');
    expect(commandEntry?.category).toBe('Group Bookmarks');
    expect(commandEntry?.icon).toBe('$(note)');
    expect(bookmarkMenuEntry).toBeDefined();
    expect(bookmarkMenuEntry?.when).toBe('editorTextFocus');
    expect(bookmarkMenuEntry?.group).toBe('9_bookmarks@1');
    expect(menuEntry).toBeDefined();
    expect(menuEntry?.when).toBe('editorTextFocus && editorHasSelection');
    expect(menuEntry?.group).toBe('9_bookmarks@2');
  });

  it('adds inline and context menu entries for term-note tree items and groups', () => {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const viewContextMenus = packageJson.contributes.menus['view/item/context'] as Array<{ command: string; when?: string; group?: string }>;

    const openEntry = viewContextMenus.find(item => item.command === 'groupBookmarks.openTermNote');
    const removeEntry = viewContextMenus.find(item => item.command === 'groupBookmarks.removeTermNoteFromGroup');
    const deleteEntries = viewContextMenus.filter(item => item.command === 'groupBookmarks.deleteTermNote');
    const addExistingEntry = viewContextMenus.find(item => item.command === 'groupBookmarks.addExistingTermNoteToGroup');
    const setActiveEntries = viewContextMenus.filter(item => item.command === 'groupBookmarks.setActiveTermNoteGroup');
    const renameGroupEntry = viewContextMenus.find(item => item.command === 'groupBookmarks.renameTermNoteGroup');
    const deleteGroupEntry = viewContextMenus.find(item => item.command === 'groupBookmarks.deleteTermNoteGroup');

    expect(openEntry).toEqual(expect.objectContaining({
      when: 'view == groupTermNotesView && viewItem == term-note',
      group: 'inline@1',
    }));
    expect(setActiveEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        when: 'view == groupTermNotesView && viewItem == term-note-group',
        group: 'inline@1',
      }),
      expect.objectContaining({
        when: 'view == groupTermNotesView && viewItem == term-note-group',
      }),
    ]));
    expect(renameGroupEntry).toEqual(expect.objectContaining({
      when: 'view == groupTermNotesView && viewItem == term-note-group',
    }));
    expect(deleteGroupEntry).toEqual(expect.objectContaining({
      when: 'view == groupTermNotesView && viewItem == term-note-group',
    }));
    expect(removeEntry).toEqual(expect.objectContaining({
      when: 'view == groupTermNotesView && viewItem == term-note',
    }));
    expect(deleteEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        when: 'view == groupTermNotesView && viewItem == term-note',
        group: 'inline@2',
      }),
      expect.objectContaining({
        when: 'view == groupTermNotesView && viewItem == term-note',
      }),
    ]));
    expect(addExistingEntry).toEqual(expect.objectContaining({
      when: 'view == groupTermNotesView && viewItem == term-note',
    }));
  });

  it('adds a title-bar create action for the term-notes view', () => {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const titleMenus = packageJson.contributes.menus['view/title'] as Array<{ command: string; when?: string; group?: string }>;
    const createEntry = titleMenus.find(item => item.command === 'groupBookmarks.createTermNoteGroup');

    expect(createEntry).toEqual(expect.objectContaining({
      when: 'view == groupTermNotesView',
      group: 'navigation',
    }));
  });
});

describe('TermNoteSidebarPreviewProvider', () => {
  it('renders an empty state before any term note is selected', () => {
    const provider = new TermNoteSidebarPreviewProvider(
      {
        getById: vi.fn(),
      } as unknown as Pick<TermNoteManager, 'getById'>,
      {
        getGroupsForTermNote: vi.fn().mockReturnValue([]),
      } as unknown as Pick<TermNoteRelationManager, 'getGroupsForTermNote'>,
      vi.fn(),
      vi.fn()
    );
    const view = createWebviewView();

    provider.resolveWebviewView(view as unknown as vscode.WebviewView);

    expect(view.webview.html).toContain('Select a term note');
  });

  it('renders the selected term note as a formatted markdown preview and related groups', () => {
    const note = makeNote('note-1', {
      term: 'User Table',
      contentMarkdown: '# Overview\n\nUsed by **API** layer.\n\n- indexed\n- cached\n\n> Important\n\n```ts\nconst stable = true;\n```',
    });
    const provider = new TermNoteSidebarPreviewProvider(
      {
        getById: vi.fn().mockReturnValue(note),
      } as unknown as Pick<TermNoteManager, 'getById'>,
      {
        getGroupsForTermNote: vi.fn().mockReturnValue([
          makeGroup('group-1', { displayName: '1. User Notes', name: 'User Notes' }),
        ]),
      } as unknown as Pick<TermNoteRelationManager, 'getGroupsForTermNote'>,
      vi.fn(),
      vi.fn()
    );
    const view = createWebviewView();

    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    provider.previewTermNote('note-1');

    expect(view.webview.html).toContain('User Table');
    expect(view.webview.html).toContain('1. User Notes');
    expect(view.webview.html).toContain('data-action="edit"');
    expect(view.webview.html).toContain('<h1>Overview</h1>');
    expect(view.webview.html).toContain('<p>Used by <strong>API</strong> layer.</p>');
    expect(view.webview.html).toContain('<li>indexed</li>');
    expect(view.webview.html).toContain('<li>cached</li>');
    expect(view.webview.html).toContain('<blockquote><p>Important</p></blockquote>');
    expect(view.webview.html).toContain('<pre><code class="language-ts">const stable = true;');
    expect(view.webview.html).not.toContain('# Overview');
    expect(view.webview.html).not.toContain('- indexed');
    expect(view.webview.html).not.toContain('```ts');
  });

  it('renders markdown tables without leaking placeholder tokens', () => {
    const note = makeNote('note-1', {
      term: 'Storage Service',
      contentMarkdown: [
        '| 字段 | 备注 |',
        '| --- | --- |',
        '| `SERIALNO` | 持仓编号 |',
        '| `TERMNO` | 投机/套保标志<br>分别记录在两张表 |',
      ].join('\n'),
    });
    const provider = new TermNoteSidebarPreviewProvider(
      {
        getById: vi.fn().mockReturnValue(note),
      } as unknown as Pick<TermNoteManager, 'getById'>,
      {
        getGroupsForTermNote: vi.fn().mockReturnValue([]),
      } as unknown as Pick<TermNoteRelationManager, 'getGroupsForTermNote'>,
      vi.fn(),
      vi.fn()
    );
    const view = createWebviewView();

    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    provider.previewTermNote('note-1');

    expect(view.webview.html).toContain('<table');
    expect(view.webview.html).toContain('<th>字段</th>');
    expect(view.webview.html).toContain('<code>SERIALNO</code>');
    expect(view.webview.html).toContain('<code>TERMNO</code>');
    expect(view.webview.html).toContain('投机/套保标志<br>');
    expect(view.webview.html).not.toContain('@@TERMNOTE');
    expect(view.webview.html).not.toContain('| `SERIALNO` |');
    expect(view.webview.html).not.toContain('&lt;br&gt;');
  });

  it('refreshes the selected preview when term-note data changes', () => {
    const termNotesEvent = createEventHook();
    const termNoteRelationsEvent = createEventHook();
    let currentContent = 'Old body';
    const getById = vi.fn(() => makeNote('note-1', { term: 'User Table', contentMarkdown: currentContent }));
    const provider = new TermNoteSidebarPreviewProvider(
      {
        getById,
      } as unknown as Pick<TermNoteManager, 'getById'>,
      {
        getGroupsForTermNote: vi.fn().mockReturnValue([]),
      } as unknown as Pick<TermNoteRelationManager, 'getGroupsForTermNote'>,
      termNotesEvent.subscribe,
      termNoteRelationsEvent.subscribe
    );
    const view = createWebviewView();

    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    provider.previewTermNote('note-1');
    expect(view.webview.html).toContain('<p>Old body</p>');

    currentContent = '## Updated body';
    termNotesEvent.fire();

    expect(view.webview.html).toContain('<h2>Updated body</h2>');
  });

  it('switches to edit mode and saves note content from the webview', async () => {
    const updateContent = vi.fn().mockResolvedValue(undefined);
    let currentContent = 'Old body';
    const provider = new TermNoteSidebarPreviewProvider(
      {
        getById: vi.fn(() => makeNote('note-1', { term: 'User Table', contentMarkdown: currentContent })),
      } as unknown as Pick<TermNoteManager, 'getById'>,
      {
        getGroupsForTermNote: vi.fn().mockReturnValue([]),
      } as unknown as Pick<TermNoteRelationManager, 'getGroupsForTermNote'>,
      vi.fn(),
      vi.fn(),
      updateContent
    );
    const view = createWebviewView();

    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    provider.editTermNote('note-1');
    expect(view.webview.html).toContain('<textarea');

    updateContent.mockImplementation(async (_noteId: string, content: string) => {
      currentContent = content;
    });
    await view.fireMessage({ type: 'save', content: '# Saved body' });

    expect(updateContent).toHaveBeenCalledWith('note-1', '# Saved body');
    expect(view.webview.html).toContain('<h1>Saved body</h1>');
    expect(view.show).toHaveBeenCalledWith(true);
  });

  it('opens the note-editor panel when editing before the view has been resolved', async () => {
    const provider = new TermNoteSidebarPreviewProvider(
      {
        getById: vi.fn().mockReturnValue(makeNote('note-1', { term: 'User Table', contentMarkdown: 'Body' })),
      } as unknown as Pick<TermNoteManager, 'getById'>,
      {
        getGroupsForTermNote: vi.fn().mockReturnValue([]),
      } as unknown as Pick<TermNoteRelationManager, 'getGroupsForTermNote'>,
      vi.fn(),
      vi.fn()
    );

    provider.editTermNote('note-1');
    await Promise.resolve();

    expect(mockState.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.view.extension.groupBookmarksTermNotePanel'
    );
  });
});

describe('extension term-note tree preview wiring', () => {
  it('registers a tree selection listener that previews the selected term note and clears on non-note items', () => {
    const previewTermNote = vi.fn();
    let selectionListener: ((event: { selection: Array<{ type?: string; dataId?: string }> }) => void) | undefined;
    const treeView = {
      onDidChangeSelection: vi.fn((listener: (event: { selection: Array<{ type?: string; dataId?: string }> }) => void) => {
        selectionListener = listener;
        return { dispose: vi.fn() };
      }),
    };
    const context = createExtensionContext();

    registerTermNoteTreePreviewSelectionListener(
      asExtensionContext(context),
      treeView as unknown as vscode.TreeView<TermNoteTreeItem>,
      asSidebarPreviewProvider({ previewTermNote })
    );

    expect(treeView.onDidChangeSelection).toHaveBeenCalledTimes(1);
    expect(context.subscriptions).toHaveLength(1);

    selectionListener?.({ selection: [{ type: 'term-note', dataId: 'note-1' }] });
    selectionListener?.({ selection: [{ type: 'term-note-group', dataId: 'group-1' }] });

    expect(previewTermNote).toHaveBeenNthCalledWith(1, 'note-1');
    expect(previewTermNote).toHaveBeenNthCalledWith(2, undefined);
  });
});

describe('extension term-note selection reveal wiring', () => {
  it('reveals an existing selected term note in the tree and opens the panel in view mode without stealing focus', async () => {
    const reveal = vi.fn().mockResolvedValue(undefined);
    const previewTermNote = vi.fn();
    const getSelectedTermNote = vi.fn().mockReturnValue(makeNote('note-1', { term: 'User Table' }));
    const getRevealItemForNoteId = vi.fn().mockReturnValue({
      type: 'term-note',
      dataId: 'note-1',
      groupId: 'group-1',
      label: 'User Table',
    });
    let selectionListener: ((event: { textEditor: unknown }) => void) | undefined;
    mockState.window.onDidChangeTextEditorSelection.mockImplementation((listener: (event: { textEditor: unknown }) => void) => {
      selectionListener = listener;
      return { dispose: vi.fn() };
    });

    const context = createExtensionContext();
    registerTermNoteSelectionRevealListener(
      asExtensionContext(context),
      {
        reveal,
      } as unknown as vscode.TreeView<TermNoteTreeItem>,
      {
        getRevealItemForNoteId,
      } as unknown as Pick<TermNoteTreeProvider, 'getRevealItemForNoteId'>,
      asPreviewService({ getSelectedTermNote }),
      asSidebarPreviewProvider({ previewTermNote })
    );

    const textEditor = { id: 'editor-1' };
    selectionListener?.({ textEditor });
    await Promise.resolve();

    expect(getSelectedTermNote).toHaveBeenCalledWith(textEditor);
    expect(getRevealItemForNoteId).toHaveBeenCalledWith('note-1');
    expect(reveal).toHaveBeenCalledWith(
      expect.objectContaining({ dataId: 'note-1' }),
      { expand: true, select: true, focus: false }
    );
    expect(previewTermNote).toHaveBeenCalledWith('note-1');
  });
});
