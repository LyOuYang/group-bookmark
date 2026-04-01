import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupColor, type KeyNote, type KeyNoteGroup, type KeyNoteGroupRelation } from '../../src/models/types';
import { registerKeyNotePreviewSelectionListener, registerKeyNoteSelectionRevealListener } from '../../src/extension';
import { DataManager } from '../../src/data/dataManager';
import { KeyNoteManager } from '../../src/core/keyNoteManager';
import { KeyNoteGroupManager } from '../../src/core/keyNoteGroupManager';
import { KeyNoteRelationManager } from '../../src/core/keyNoteRelationManager';
import { KeyNoteDocumentService } from '../../src/services/keyNoteDocumentService';
import { KeyNotePreviewService } from '../../src/services/keyNotePreviewService';
import { KeyNoteCommandHandler } from '../../src/views/keyNoteCommandHandler';
import { KeyNoteTreeItem, KeyNoteTreeProvider } from '../../src/views/keyNoteTreeProvider';
import { KeyNoteSidebarPreviewProvider } from '../../src/views/keyNoteSidebarPreviewProvider';
import { registerKeyNoteTreePreviewSelectionListener } from '../../src/extension';

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

function makeGroup(id: string, overrides: Partial<KeyNoteGroup> = {}): KeyNoteGroup {
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

function makeNote(id: string, overrides: Partial<KeyNote> = {}): KeyNote {
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

function makeRelation(id: string, noteId: string, groupId: string, overrides: Partial<KeyNoteGroupRelation> = {}): KeyNoteGroupRelation {
  return {
    id,
    keyNoteId: noteId,
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

type KeyNoteTreeItemLike = {
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

function asKeyNoteManager(mock: unknown): KeyNoteManager {
  return mock as unknown as KeyNoteManager;
}

function asKeyNoteGroupManager(mock: unknown): KeyNoteGroupManager {
  return mock as unknown as KeyNoteGroupManager;
}

function asKeyNoteRelationManager(mock: unknown): KeyNoteRelationManager {
  return mock as unknown as KeyNoteRelationManager;
}

function asKeyNoteDocumentService(mock: unknown): KeyNoteDocumentService {
  return mock as unknown as KeyNoteDocumentService;
}

function asDataManager(mock: unknown): DataManager {
  return mock as unknown as DataManager;
}

function asPreviewService(mock: unknown): KeyNotePreviewService {
  return mock as unknown as KeyNotePreviewService;
}

function asSidebarPreviewProvider(mock: unknown): KeyNoteSidebarPreviewProvider {
  return mock as unknown as KeyNoteSidebarPreviewProvider;
}

function createWebviewView() {
  let messageListener: ((message: unknown) => void | Promise<void>) | undefined;

  return {
    webview: {
      html: '',
      options: {},
      postMessage: vi.fn().mockResolvedValue(true),
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

describe('KeyNoteCommandHandler', () => {
  it('registers key-note management commands', () => {
    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager({ createOrGetKeyNote: vi.fn() }),
      asKeyNoteGroupManager({ getActiveKeyNoteGroupId: vi.fn(), getGroupById: vi.fn(), getAllGroups: vi.fn() }),
      asKeyNoteRelationManager({
        addKeyNoteToGroup: vi.fn(),
        removeKeyNoteFromGroup: vi.fn(),
        deleteKeyNoteEverywhere: vi.fn(),
        getGroupsForKeyNote: vi.fn(),
      }),
      asKeyNoteDocumentService({ openNoteDocument: vi.fn() })
    );
    const context = createExtensionContext();

    handler.registerCommands(asExtensionContext(context));

    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.addKeyNoteFromSelection',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.openKeyNote',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.createKeyNoteGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.renameKeyNoteGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.deleteKeyNoteGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.removeKeyNoteFromGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.deleteKeyNote',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.addExistingKeyNoteToGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.setActiveKeyNoteGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.addKeyNoteToGroup',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.sortGroupCustom',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.sortGroupAsc',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.sortGroupDesc',
      expect.any(Function)
    );
    expect(mockState.commands.registerCommand).toHaveBeenCalledWith(
      'groupBookmarks.searchKeyNotes',
      expect.any(Function)
    );
    expect(context.subscriptions).toHaveLength(14);
  });

  it('opens the custom key-note document after creating or finding the note when no panel editor is available', async () => {
    const keyNoteManager = {
      createOrGetKeyNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    };
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn().mockReturnValue('group-1'),
      getGroupById: vi.fn().mockReturnValue(makeGroup('group-1')),
    };
    const relationManager = {
      addKeyNoteToGroup: vi.fn().mockResolvedValue(undefined),
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

    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager(keyNoteManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager),
      asKeyNoteDocumentService(documentService)
    );

    await handler.addKeyNoteFromSelection();

    expect(documentService.openNoteDocument).toHaveBeenCalledWith('note-1');
  });

  it('loads the fixed key-note editor after creating or finding the note when a panel editor is available', async () => {
    const keyNoteManager = {
      createOrGetKeyNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    };
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn().mockReturnValue('group-1'),
      getGroupById: vi.fn().mockReturnValue(makeGroup('group-1')),
    };
    const relationManager = {
      addKeyNoteToGroup: vi.fn().mockResolvedValue(undefined),
    };
    const documentService = {
      openNoteDocument: vi.fn().mockResolvedValue(undefined),
    };
    const sidebarPreviewProvider = {
      editKeyNote: vi.fn(),
    };

    mockState.window.activeTextEditor = {
      document: {
        getText: vi.fn().mockReturnValue('User_Table'),
      },
      selection: {
        isEmpty: false,
      },
    };

    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager(keyNoteManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager),
      asKeyNoteDocumentService(documentService),
      asSidebarPreviewProvider(sidebarPreviewProvider)
    );

    await handler.addKeyNoteFromSelection();

    expect(sidebarPreviewProvider.editKeyNote).toHaveBeenCalledWith('note-1');
    expect(documentService.openNoteDocument).not.toHaveBeenCalled();
  });

  it('opens an existing key note from the tree item command', async () => {
    const documentService = {
      openNoteDocument: vi.fn().mockResolvedValue(undefined),
    };
    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager({ createOrGetKeyNote: vi.fn() }),
      asKeyNoteGroupManager({ getActiveKeyNoteGroupId: vi.fn(), getGroupById: vi.fn(), getAllGroups: vi.fn() }),
      asKeyNoteRelationManager({
        addKeyNoteToGroup: vi.fn(),
        removeKeyNoteFromGroup: vi.fn(),
        deleteKeyNoteEverywhere: vi.fn(),
        getGroupsForKeyNote: vi.fn(),
      }),
      asKeyNoteDocumentService(documentService)
    );

    await handler.openKeyNote({
      dataId: 'note-1',
      groupId: 'group-1',
      label: 'User Table',
    } as KeyNoteTreeItemLike);

    expect(documentService.openNoteDocument).toHaveBeenCalledWith('note-1');
    expect(mockState.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('creates a new note from selection, avoiding any group prompts, and opens the editor', async () => {
    const keyNoteManager = {
      createOrGetKeyNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    };
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn(),
      getGroupById: vi.fn(),
    };
    const relationManager = {
      addKeyNoteToGroup: vi.fn(),
    };

    mockState.window.activeTextEditor = {
      document: {
        getText: vi.fn().mockReturnValue('User_Table'),
      },
      selection: {
        isEmpty: false,
      },
    };

    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager(keyNoteManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager),
      asKeyNoteDocumentService({ openNoteDocument: vi.fn().mockResolvedValue(undefined) })
    );

    await handler.addKeyNoteFromSelection();

    expect(keyNoteManager.createOrGetKeyNote).toHaveBeenCalledWith('User_Table');
    expect(mockState.window.showErrorMessage).not.toHaveBeenCalled();
    // 组选择由后续 Webview 负责，不再此测试：
    expect(relationManager.addKeyNoteToGroup).not.toHaveBeenCalled();
    expect(mockState.window.showQuickPick).not.toHaveBeenCalled();
    expect(mockState.window.showInputBox).not.toHaveBeenCalled();
  });

  it('prompts for a term and adds a new key note to an existing group from the sidebar', async () => {
    const keyNote = makeNote('note-custom', { term: 'CustomTerm' });
    const group = makeGroup('group-1', { displayName: '1. Group', name: 'Group' });

    const keyNoteManager = {
      createOrGetKeyNote: vi.fn().mockResolvedValue(keyNote),
      deleteKeyNote: vi.fn(),
    };
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn(),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([group]),
    };
    const relationManager = {
      addKeyNoteToGroup: vi.fn().mockResolvedValue(undefined),
      removeKeyNoteFromGroup: vi.fn(),
      deleteKeyNoteEverywhere: vi.fn(),
      getGroupsForKeyNote: vi.fn().mockReturnValue([]),
    };

    mockState.window.showInputBox.mockResolvedValue('CustomTerm');

    const editKeyNote = vi.fn();
    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager(keyNoteManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager),
      asKeyNoteDocumentService({ openNoteDocument: vi.fn() }),
      { editKeyNote }
    );

    await handler.addKeyNoteToGroup({
      dataId: group.id,
      label: 'Group',
    } as KeyNoteTreeItemLike);

    expect(mockState.window.showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Enter term/word for the new Key Note' })
    );
    expect(keyNoteManager.createOrGetKeyNote).toHaveBeenCalledWith('CustomTerm');
    expect(relationManager.addKeyNoteToGroup).toHaveBeenCalledWith(keyNote.id, group.id);
    expect(editKeyNote).toHaveBeenCalledWith(keyNote.id);
  });

  it('removes only the current group relation from a key-note tree item', async () => {
    const keyNoteManager = {
      createOrGetKeyNote: vi.fn(),
      deleteKeyNote: vi.fn(),
    };
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn(),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([]),
    };
    const relationManager = {
      addKeyNoteToGroup: vi.fn(),
      removeKeyNoteFromGroup: vi.fn().mockResolvedValue(undefined),
      deleteKeyNoteEverywhere: vi.fn(),
      getGroupsForKeyNote: vi.fn().mockReturnValue([]),
    };
    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager(keyNoteManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager),
      asKeyNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.removeKeyNoteFromGroup({
      dataId: 'note-1',
      groupId: 'group-1',
      label: 'User Table',
    } as KeyNoteTreeItemLike);

    expect(relationManager.removeKeyNoteFromGroup).toHaveBeenCalledWith('note-1', 'group-1');
    expect(relationManager.deleteKeyNoteEverywhere).not.toHaveBeenCalled();
    expect(keyNoteManager.deleteKeyNote).not.toHaveBeenCalled();
  });

  it('deletes the note body and all relations after confirmation', async () => {
    const keyNoteManager = {
      createOrGetKeyNote: vi.fn(),
      deleteKeyNote: vi.fn().mockResolvedValue(undefined),
    };
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn(),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([]),
    };
    const relationManager = {
      addKeyNoteToGroup: vi.fn(),
      removeKeyNoteFromGroup: vi.fn(),
      deleteKeyNoteEverywhere: vi.fn(),
      getGroupsForKeyNote: vi.fn().mockReturnValue([]),
    };
    mockState.window.showWarningMessage.mockResolvedValue('Delete');

    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager(keyNoteManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager),
      asKeyNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.deleteKeyNote({
      dataId: 'note-1',
      groupId: 'group-1',
      label: 'User Table',
    } as KeyNoteTreeItemLike);

    expect(mockState.window.showWarningMessage).toHaveBeenCalledWith(
      'Delete key note "User Table" everywhere?',
      'Delete',
      'Cancel'
    );
    expect(relationManager.deleteKeyNoteEverywhere).toHaveBeenCalledWith('note-1');
    expect(relationManager.removeKeyNoteFromGroup).not.toHaveBeenCalled();
    expect(keyNoteManager.deleteKeyNote).not.toHaveBeenCalled();
  });

  it('adds an existing key note to another group and excludes existing memberships', async () => {
    const userNotes = makeGroup('group-1', { displayName: '1. User Notes', name: 'User Notes' });
    const apiNotes = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const opsNotes = makeGroup('group-3', { displayName: '3. Ops Notes', name: 'Ops Notes' });
    const keyNoteManager = {
      createOrGetKeyNote: vi.fn(),
      deleteKeyNote: vi.fn(),
    };
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn(),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([userNotes, apiNotes, opsNotes]),
    };
    const relationManager = {
      addKeyNoteToGroup: vi.fn().mockResolvedValue(undefined),
      removeKeyNoteFromGroup: vi.fn(),
      deleteKeyNoteEverywhere: vi.fn(),
      getGroupsForKeyNote: vi.fn().mockReturnValue([userNotes, apiNotes]),
    };
    mockState.window.showQuickPick.mockResolvedValue({
      label: '3. Ops Notes',
      groupId: 'group-3',
    });

    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager(keyNoteManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager),
      asKeyNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.addExistingKeyNoteToGroup({
      dataId: 'note-1',
      groupId: 'group-1',
      label: 'User Table',
    } as KeyNoteTreeItemLike);

    expect(mockState.window.showQuickPick).toHaveBeenCalledTimes(1);
    expect(mockState.window.showQuickPick.mock.calls[0][0]).toEqual([
      expect.objectContaining({ groupId: 'group-3' }),
    ]);
    expect(relationManager.addKeyNoteToGroup).toHaveBeenCalledWith('note-1', 'group-3');
  });

  it('sets the selected key-note group as active and reports it', async () => {
    const group = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const keyNoteManager = {
      createOrGetKeyNote: vi.fn(),
      deleteKeyNote: vi.fn(),
    };
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn().mockReturnValue(undefined),
      getGroupById: vi.fn().mockReturnValue(group),
      getAllGroups: vi.fn().mockReturnValue([]),
      setActiveKeyNoteGroupId: vi.fn().mockResolvedValue(undefined),
    };
    const relationManager = {
      addKeyNoteToGroup: vi.fn(),
      removeKeyNoteFromGroup: vi.fn(),
      deleteKeyNoteEverywhere: vi.fn(),
      getGroupsForKeyNote: vi.fn().mockReturnValue([]),
    };
    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager(keyNoteManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager),
      asKeyNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.setActiveKeyNoteGroup({
      dataId: group.id,
      label: group.displayName,
    } as KeyNoteTreeItemLike);

    expect(keyNoteGroupManager.setActiveKeyNoteGroupId).toHaveBeenCalledWith(group.id);
    expect(mockState.window.showInformationMessage).toHaveBeenCalledWith(
      'Active key-note group set to "API Notes"'
    );
    expect(mockState.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('toggles the active key-note group off when the active group is selected again', async () => {
    const group = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn().mockReturnValue(group.id),
      getGroupById: vi.fn().mockReturnValue(group),
      getAllGroups: vi.fn().mockReturnValue([]),
      setActiveKeyNoteGroupId: vi.fn().mockResolvedValue(undefined),
    };
    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager({ createOrGetKeyNote: vi.fn(), deleteKeyNote: vi.fn() }),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager({
        addKeyNoteToGroup: vi.fn(),
        removeKeyNoteFromGroup: vi.fn(),
        deleteKeyNoteEverywhere: vi.fn(),
        getGroupsForKeyNote: vi.fn().mockReturnValue([]),
      }),
      asKeyNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.setActiveKeyNoteGroup({
      dataId: group.id,
      label: group.displayName,
    } as KeyNoteTreeItemLike);

    expect(keyNoteGroupManager.setActiveKeyNoteGroupId).toHaveBeenCalledWith(undefined);
    expect(mockState.window.showInformationMessage).toHaveBeenCalledWith('Active key-note group cleared');
  });

  it('renames a key-note group using the bookmark group prompt and success message pattern', async () => {
    const group = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn(),
      getGroupById: vi.fn().mockReturnValue(group),
      getAllGroups: vi.fn().mockReturnValue([group]),
      renameGroup: vi.fn().mockResolvedValue(undefined),
    };
    mockState.window.showInputBox.mockResolvedValue('Reference Notes');

    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager({ createOrGetKeyNote: vi.fn(), deleteKeyNote: vi.fn() }),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager({
        addKeyNoteToGroup: vi.fn(),
        removeKeyNoteFromGroup: vi.fn(),
        deleteKeyNoteEverywhere: vi.fn(),
        getGroupsForKeyNote: vi.fn().mockReturnValue([]),
        getRelationsInGroup: vi.fn().mockReturnValue([]),
      }),
      asKeyNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.renameKeyNoteGroup({
      dataId: group.id,
      label: group.displayName,
    } as KeyNoteTreeItemLike);

    expect(mockState.window.showInputBox).toHaveBeenCalledWith({
      prompt: 'Enter new group name',
      value: group.name,
    });
    expect(keyNoteGroupManager.renameGroup).toHaveBeenCalledWith(group.id, 'Reference Notes');
    expect(mockState.window.showInformationMessage).toHaveBeenCalledWith('Group renamed to "Reference Notes"');
  });

  it('confirms before deleting a key-note group and reports success', async () => {
    const group = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn(),
      getGroupById: vi.fn().mockReturnValue(group),
      getAllGroups: vi.fn().mockReturnValue([group]),
      deleteGroup: vi.fn().mockResolvedValue(undefined),
    };
    const relationManager = {
      addKeyNoteToGroup: vi.fn(),
      removeKeyNoteFromGroup: vi.fn(),
      deleteKeyNoteEverywhere: vi.fn(),
      getGroupsForKeyNote: vi.fn().mockReturnValue([]),
      getRelationsInGroup: vi.fn().mockReturnValue([
        makeRelation('rel-1', 'note-1', group.id),
        makeRelation('rel-2', 'note-2', group.id),
      ]),
    };
    mockState.window.showWarningMessage.mockResolvedValue('Delete');

    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager({ createOrGetKeyNote: vi.fn(), deleteKeyNote: vi.fn() }),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager),
      asKeyNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.deleteKeyNoteGroup({
      dataId: group.id,
      label: group.displayName,
    } as KeyNoteTreeItemLike);

    expect(mockState.window.showWarningMessage).toHaveBeenCalledWith(
      'Delete group "API Notes" with 2 key notes?',
      'Delete',
      'Cancel'
    );
    expect(keyNoteGroupManager.deleteGroup).toHaveBeenCalledWith(group.id);
    expect(mockState.window.showInformationMessage).toHaveBeenCalledWith('Group "API Notes" deleted');
  });

  it('creates a key-note group from the dedicated command and sets it active', async () => {
    const createdGroup = makeGroup('group-new', { displayName: '1. Fresh Notes', name: 'Fresh Notes' });
    const keyNoteManager = {
      createOrGetKeyNote: vi.fn(),
      deleteKeyNote: vi.fn(),
    };
    const keyNoteGroupManager = {
      getActiveKeyNoteGroupId: vi.fn(),
      getGroupById: vi.fn(),
      getAllGroups: vi.fn().mockReturnValue([]),
      createGroup: vi.fn().mockResolvedValue(createdGroup),
      setActiveKeyNoteGroupId: vi.fn().mockResolvedValue(undefined),
    };
    const relationManager = {
      addKeyNoteToGroup: vi.fn(),
      removeKeyNoteFromGroup: vi.fn(),
      deleteKeyNoteEverywhere: vi.fn(),
      getGroupsForKeyNote: vi.fn().mockReturnValue([]),
    };
    mockState.window.showInputBox.mockResolvedValue('Fresh Notes');

    const handler = new KeyNoteCommandHandler(
      asKeyNoteManager(keyNoteManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager),
      asKeyNoteDocumentService({ openNoteDocument: vi.fn() })
    );

    await handler.createKeyNoteGroup();

    expect(mockState.window.showInputBox).toHaveBeenCalledWith({
      prompt: 'Enter key-note group name',
      placeHolder: 'Group name',
    });
    expect(keyNoteGroupManager.createGroup).toHaveBeenCalledWith('Fresh Notes');
    expect(keyNoteGroupManager.setActiveKeyNoteGroupId).toHaveBeenCalledWith(createdGroup.id);
  });
});

describe('KeyNotePreviewService', () => {
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
    const keyNoteManager = {
      getByNormalizedTerm: vi.fn().mockReturnValue(note),
    };
    const keyNoteRelationManager = {
      getGroupsForKeyNote: vi.fn().mockReturnValue(groups),
    };
    const service = new KeyNotePreviewService(
      keyNoteManager as Pick<KeyNoteManager, 'getByNormalizedTerm'>,
      keyNoteRelationManager as Pick<KeyNoteRelationManager, 'getGroupsForKeyNote'>
    );
    const editor = createPreviewEditor('  User_Table  ');

    await service.previewSelection(asTextEditor(editor));

    expect(keyNoteManager.getByNormalizedTerm).toHaveBeenCalledWith('user_table');
    expect(keyNoteRelationManager.getGroupsForKeyNote).toHaveBeenCalledWith('note-1');
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
    const keyNoteManager = {
      getByNormalizedTerm: vi.fn().mockReturnValue(note),
    };
    const keyNoteRelationManager = {
      getGroupsForKeyNote: vi.fn().mockReturnValue(groups),
    };
    const service = new KeyNotePreviewService(
      keyNoteManager as Pick<KeyNoteManager, 'getByNormalizedTerm'>,
      keyNoteRelationManager as Pick<KeyNoteRelationManager, 'getGroupsForKeyNote'>
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
    const keyNoteManager = {
      getByNormalizedTerm: vi.fn(),
    };
    const keyNoteRelationManager = {
      getGroupsForKeyNote: vi.fn(),
    };
    const service = new KeyNotePreviewService(
      keyNoteManager as Pick<KeyNoteManager, 'getByNormalizedTerm'>,
      keyNoteRelationManager as Pick<KeyNoteRelationManager, 'getGroupsForKeyNote'>
    );

    for (const selectedText of ['', '   ', 'User\nTable', 'A'.repeat(121)]) {
      const editor = createPreviewEditor(selectedText);
      await service.previewSelection(asTextEditor(editor));

      expect(keyNoteManager.getByNormalizedTerm).not.toHaveBeenCalled();
      expect(keyNoteRelationManager.getGroupsForKeyNote).not.toHaveBeenCalled();
      expect(mockState.commands.executeCommand).not.toHaveBeenCalled();
      expect(editor.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
      vi.clearAllMocks();
      mockState.commands.executeCommand.mockReset().mockResolvedValue(undefined);
    }
  });
});

describe('KeyNoteRelationManager', () => {
  it('returns note groups ordered by group order with a deterministic tie-breaker', () => {
    const alpha = makeGroup('group-a', { displayName: '1. Alpha', order: 1 });
    const beta = makeGroup('group-b', { displayName: '1. Beta', order: 1 });
    const gamma = makeGroup('group-c', { displayName: '2. Gamma', order: 2 });
    const relationManager = new KeyNoteRelationManager({
      getAllKeyNoteRelations: vi.fn().mockReturnValue([
        makeRelation('relation-c', 'note-1', gamma.id, { order: 99 }),
        makeRelation('relation-b', 'note-1', beta.id, { order: 3 }),
        makeRelation('relation-a', 'note-1', alpha.id, { order: 1 }),
      ]),
      getKeyNoteGroup: vi.fn((id: string) => ({
        [alpha.id]: alpha,
        [beta.id]: beta,
        [gamma.id]: gamma,
      }[id]),
      ),
    } as unknown as DataManager);

    expect(relationManager.getGroupsForKeyNote('note-1').map(group => group.id)).toEqual([
      alpha.id,
      beta.id,
      gamma.id,
    ]);
  });
});

describe('extension key-note preview wiring', () => {
  it('does not register automatic hover preview wiring by default', () => {
    const previewSelection = vi.fn();
    const context = createExtensionContext();
    registerKeyNotePreviewSelectionListener(asExtensionContext(context));

    expect(mockState.window.onDidChangeTextEditorSelection).not.toHaveBeenCalled();
    expect(context.subscriptions).toHaveLength(1);
    expect(previewSelection).not.toHaveBeenCalled();
  });
});

describe('KeyNoteTreeProvider', () => {
  it('builds root tree items from key note groups', () => {
    const note = makeNote('note-1');
    const group = makeGroup('group-1');
    const relation = makeRelation('relation-1', note.id, group.id);
    const dataManager = {
      onDidChangeKeyNotes: vi.fn(),
      onDidChangeKeyNoteGroups: vi.fn(),
      onDidChangeKeyNoteRelations: vi.fn(),
      getKeyNote: vi.fn((id: string) => (id === note.id ? note : undefined)),
    };
    const keyNoteGroupManager = {
      getAllGroups: vi.fn().mockReturnValue([group]),
      getActiveKeyNoteGroupId: vi.fn().mockReturnValue(group.id),
      getGroupById: vi.fn((id: string) => (id === group.id ? group : undefined)),
    };
    const relationManager = {
      getRelationsInGroup: vi.fn((groupId: string) => (groupId === group.id ? [relation] : [])),
    };
    const provider = new KeyNoteTreeProvider(
      asDataManager(dataManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager)
    );

    const items = provider.getChildren();
    const childItems = provider.getChildren(items[0]);

    expect(items[0].contextValue).toBe('key-note-group');
    expect(items[0].groupId).toBeUndefined();
    expect(childItems[0].contextValue).toBe('key-note');
    expect(childItems[0].label).toBe('User Table');
    expect(childItems[0].groupId).toBe(group.id);
    expect(childItems[0].command).toBeUndefined();
  });

  it('refreshes when key-note data manager events fire', () => {
    const keyNotesEvent = createEventHook();
    const keyNoteGroupsEvent = createEventHook();
    const keyNoteRelationsEvent = createEventHook();
    const dataManager = {
      onDidChangeKeyNotes: keyNotesEvent.subscribe,
      onDidChangeKeyNoteGroups: keyNoteGroupsEvent.subscribe,
      onDidChangeKeyNoteRelations: keyNoteRelationsEvent.subscribe,
      getKeyNote: vi.fn(),
    };
    const keyNoteGroupManager = {
      getAllGroups: vi.fn().mockReturnValue([]),
      getActiveKeyNoteGroupId: vi.fn(),
    };
    const relationManager = {
      getRelationsInGroup: vi.fn().mockReturnValue([]),
    };

    const provider = new KeyNoteTreeProvider(
      asDataManager(dataManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager)
    );
    const refreshSpy = vi.spyOn(provider, 'refresh');

    expect(dataManager.onDidChangeKeyNotes).toHaveBeenCalledTimes(1);
    expect(dataManager.onDidChangeKeyNoteGroups).toHaveBeenCalledTimes(1);
    expect(dataManager.onDidChangeKeyNoteRelations).toHaveBeenCalledTimes(1);

    keyNotesEvent.fire();
    keyNoteGroupsEvent.fire();
    keyNoteRelationsEvent.fire();

    expect(refreshSpy).toHaveBeenCalledTimes(3);
  });

  it('builds a reveal item for a note using the active group when possible', () => {
    const note = makeNote('note-1');
    const userGroup = makeGroup('group-1', { displayName: '1. User Notes', name: 'User Notes' });
    const apiGroup = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const dataManager = {
      onDidChangeKeyNotes: vi.fn(),
      onDidChangeKeyNoteGroups: vi.fn(),
      onDidChangeKeyNoteRelations: vi.fn(),
      getKeyNote: vi.fn((id: string) => (id === note.id ? note : undefined)),
    };
    const keyNoteGroupManager = {
      getAllGroups: vi.fn().mockReturnValue([userGroup, apiGroup]),
      getGroupById: vi.fn((id: string) => ({ [userGroup.id]: userGroup, [apiGroup.id]: apiGroup }[id])),
      getActiveKeyNoteGroupId: vi.fn().mockReturnValue(apiGroup.id),
    };
    const relationManager = {
      getRelationsInGroup: vi.fn(),
      getGroupsForKeyNote: vi.fn().mockReturnValue([userGroup, apiGroup]),
    };
    const provider = new KeyNoteTreeProvider(
      asDataManager(dataManager),
      asKeyNoteGroupManager(keyNoteGroupManager),
      asKeyNoteRelationManager(relationManager)
    );

    const item = provider.getRevealItemForNoteId(note.id);
    const parent = item ? provider.getParent(item) : undefined;

    expect(item).toEqual(expect.objectContaining({
      type: 'key-note',
      dataId: note.id,
      groupId: apiGroup.id,
      label: note.term,
    }));
    expect(parent).toEqual(expect.objectContaining({
      type: 'key-note-group',
      dataId: apiGroup.id,
    }));
  });

  it('shows the active key-note group with the same pinned icon style as bookmark groups', () => {
    const apiGroup = makeGroup('group-2', { displayName: '2. API Notes', name: 'API Notes' });
    const provider = new KeyNoteTreeProvider(
      asDataManager({
        onDidChangeKeyNotes: vi.fn(),
        onDidChangeKeyNoteGroups: vi.fn(),
        onDidChangeKeyNoteRelations: vi.fn(),
        getKeyNote: vi.fn(),
      }),
      asKeyNoteGroupManager({
        getAllGroups: vi.fn().mockReturnValue([apiGroup]),
        getActiveKeyNoteGroupId: vi.fn().mockReturnValue(apiGroup.id),
      }),
      asKeyNoteRelationManager({
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

describe('KeyNoteDocumentService', () => {
  it('builds the custom markdown URI for a note id', () => {
    const service = new KeyNoteDocumentService(
      vi.fn(),
      vi.fn()
    );

    expect(service.getUri('note-1').toString()).toBe('groupbookmarks-key-note:/note-1.md');
  });

  it('opens a note by using the custom markdown URI', async () => {
    const service = new KeyNoteDocumentService(
      vi.fn().mockReturnValue(makeNote('note-1')),
      vi.fn()
    );

    await service.openNoteDocument('note-1');

    expect(mockState.workspace.openTextDocument).toHaveBeenCalledWith(service.getUri('note-1'));
    expect(mockState.window.showTextDocument).toHaveBeenCalledTimes(1);
  });

  it('writes saved markdown back through keyNoteManager.updateContent', async () => {
    const updateContent = vi.fn().mockResolvedValue(undefined);
    const service = new KeyNoteDocumentService(
      vi.fn().mockReturnValue(makeNote('note-1')),
      updateContent
    );

    await service.writeFile(service.getUri('note-1'), Buffer.from('# User table'), { create: false, overwrite: true });

    expect(updateContent).toHaveBeenCalledWith('note-1', '# User table');
  });
});

describe('package contributions for key notes', () => {
  it('contributes the add-key-note command, key-notes tree, and a dedicated note-editor panel', () => {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const commands = packageJson.contributes.commands as Array<{ command: string }>;
    const sidebarViews = packageJson.contributes.views.groupBookmarks as Array<{ id: string; type?: string }>;
    const panelContainers = packageJson.contributes.viewsContainers.panel as Array<{ id: string; title?: string }>;
    const panelViews = packageJson.contributes.views.groupBookmarksKeyNotePanel as Array<{ id: string; type?: string }>;

    expect(commands.some(item => item.command === 'groupBookmarks.addKeyNoteFromSelection')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.openKeyNote')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.createKeyNoteGroup')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.renameKeyNoteGroup')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.deleteKeyNoteGroup')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.removeKeyNoteFromGroup')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.deleteKeyNote')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.addExistingKeyNoteToGroup')).toBe(true);
    expect(commands.some(item => item.command === 'groupBookmarks.setActiveKeyNoteGroup')).toBe(true);
    expect(sidebarViews.some(item => item.id === 'groupKeyNotesView')).toBe(true);
    expect(sidebarViews.some(item => item.id === 'groupKeyNotePreviewView')).toBe(false);
    expect(panelContainers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'groupBookmarksKeyNotePanel',
        title: 'Key Note Editor',
      }),
    ]));
    expect(panelViews).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'groupKeyNotePreviewView',
        name: 'Note Editor',
        type: 'webview',
      }),
    ]));
  });

  it('uses consistent but distinct command metadata for adding bookmarks and key notes from the editor context menu', () => {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const commands = packageJson.contributes.commands as Array<{ command: string; title?: string; category?: string; icon?: string }>;
    const editorContextMenus = packageJson.contributes.menus['editor/context'] as Array<{ command: string }>;
    const bookmarkMenuEntry = editorContextMenus.find(item => item.command === 'groupBookmarks.addBookmarkMenu') as
      | { command: string; group?: string; when?: string }
      | undefined;
    const menuEntry = editorContextMenus.find(item => item.command === 'groupBookmarks.addKeyNoteFromSelection') as
      | { command: string; group?: string; when?: string }
      | undefined;
    const bookmarkCommandEntry = commands.find(item => item.command === 'groupBookmarks.addBookmarkMenu');
    const commandEntry = commands.find(item => item.command === 'groupBookmarks.addKeyNoteFromSelection');

    expect(bookmarkCommandEntry?.title).toBe('🔖 Add Group Bookmark (Ctrl+Alt+B)');
    expect(bookmarkCommandEntry?.category).toBe('Group Bookmarks');
    expect(bookmarkCommandEntry?.icon).toBe('$(bookmark)');
    expect(commandEntry?.title).toBe('🔖 Add Key Note');
    expect(commandEntry?.category).toBe('Group Bookmarks');
    expect(commandEntry?.icon).toBe('$(note)');
    expect(bookmarkMenuEntry).toBeDefined();
    expect(bookmarkMenuEntry?.when).toBe('editorTextFocus');
    expect(bookmarkMenuEntry?.group).toBe('9_bookmarks@1');
    expect(menuEntry).toBeDefined();
    expect(menuEntry?.when).toBe('editorTextFocus && editorHasSelection');
    expect(menuEntry?.group).toBe('9_bookmarks@2');
  });

  it('adds inline and context menu entries for key-note tree items and groups', () => {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const viewContextMenus = packageJson.contributes.menus['view/item/context'] as Array<{ command: string; when?: string; group?: string }>;

    const openEntry = viewContextMenus.find(item => item.command === 'groupBookmarks.openKeyNote');
    const removeEntry = viewContextMenus.find(item => item.command === 'groupBookmarks.removeKeyNoteFromGroup');
    const deleteEntries = viewContextMenus.filter(item => item.command === 'groupBookmarks.deleteKeyNote');
    const addExistingEntry = viewContextMenus.find(item => item.command === 'groupBookmarks.addExistingKeyNoteToGroup');
    const setActiveEntries = viewContextMenus.filter(item => item.command === 'groupBookmarks.setActiveKeyNoteGroup');
    const renameGroupEntry = viewContextMenus.find(item => item.command === 'groupBookmarks.renameKeyNoteGroup');
    const deleteGroupEntry = viewContextMenus.find(item => item.command === 'groupBookmarks.deleteKeyNoteGroup');

    expect(openEntry).toEqual(expect.objectContaining({
      when: 'view == groupKeyNotesView && viewItem == key-note',
      group: 'inline@1',
    }));
    expect(setActiveEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        when: 'view == groupKeyNotesView && viewItem == key-note-group',
        group: 'inline@1',
      }),
      expect.objectContaining({
        when: 'view == groupKeyNotesView && viewItem == key-note-group',
      }),
    ]));
    expect(renameGroupEntry).toEqual(expect.objectContaining({
      when: 'view == groupKeyNotesView && viewItem == key-note-group',
    }));
    expect(deleteGroupEntry).toEqual(expect.objectContaining({
      when: 'view == groupKeyNotesView && viewItem == key-note-group',
    }));
    expect(removeEntry).toEqual(expect.objectContaining({
      when: 'view == groupKeyNotesView && viewItem == key-note',
    }));
    expect(deleteEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        when: 'view == groupKeyNotesView && viewItem == key-note',
        group: 'inline@2',
      }),
      expect.objectContaining({
        when: 'view == groupKeyNotesView && viewItem == key-note',
      }),
    ]));
    expect(addExistingEntry).toEqual(expect.objectContaining({
      when: 'view == groupKeyNotesView && viewItem == key-note',
    }));
  });

  it('adds a title-bar create action for the key-notes view', () => {
    const packageJsonPath = path.resolve(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const titleMenus = packageJson.contributes.menus['view/title'] as Array<{ command: string; when?: string; group?: string }>;
    const createEntry = titleMenus.find(item => item.command === 'groupBookmarks.createKeyNoteGroup');

    expect(createEntry).toEqual(expect.objectContaining({
      when: 'view == groupKeyNotesView',
      group: 'navigation',
    }));
  });
});

describe('KeyNoteSidebarPreviewProvider', () => {
  it('renders an empty state before any key note is selected', async () => {
    const provider = new KeyNoteSidebarPreviewProvider(
      {
        getById: vi.fn(),
        getByNormalizedTerm: vi.fn(),
        createOrGetKeyNote: vi.fn()
      } as unknown as Pick<KeyNoteManager, 'getById' | 'getByNormalizedTerm' | 'createOrGetKeyNote'>,
      {
        getGroupsForKeyNote: vi.fn().mockReturnValue([]),
        addKeyNoteToGroup: vi.fn(),
      } as unknown as Pick<KeyNoteRelationManager, 'getGroupsForKeyNote' | 'addKeyNoteToGroup'>,
      {
        getAllGroups: vi.fn().mockReturnValue([]),
        getActiveKeyNoteGroupId: vi.fn(),
        setActiveKeyNoteGroupId: vi.fn(),
        createGroup: vi.fn(),
      } as unknown as Pick<KeyNoteGroupManager, 'getAllGroups' | 'getActiveKeyNoteGroupId' | 'setActiveKeyNoteGroupId' | 'createGroup'>,
      vi.fn(),
      vi.fn()
    );
    const view = createWebviewView();

    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    await view.fireMessage({ type: 'ready' });

    const lastState = (view.webview.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]?.state;
    expect(lastState?.title).toContain('Select a key note');
  });

  it('renders the selected key note as a formatted markdown preview and related groups', async () => {
    const note = makeNote('note-1', {
      term: 'User Table',
      contentMarkdown: '# Overview\n\nUsed by **API** layer.\n\n- indexed\n- cached\n\n> Important\n\n```ts\nconst stable = true;\n```',
    });
    const provider = new KeyNoteSidebarPreviewProvider(
      {
        getById: vi.fn().mockReturnValue(note),
        getByNormalizedTerm: vi.fn(),
        createOrGetKeyNote: vi.fn()
      } as unknown as Pick<KeyNoteManager, 'getById' | 'getByNormalizedTerm' | 'createOrGetKeyNote'>,
      {
        getGroupsForKeyNote: vi.fn().mockReturnValue([
          makeGroup('group-1', { displayName: '1. User Notes', name: 'User Notes' }),
        ]),
        addKeyNoteToGroup: vi.fn(),
      } as unknown as Pick<KeyNoteRelationManager, 'getGroupsForKeyNote' | 'addKeyNoteToGroup'>,
      {
        getAllGroups: vi.fn().mockReturnValue([]),
        getActiveKeyNoteGroupId: vi.fn(),
        setActiveKeyNoteGroupId: vi.fn(),
        createGroup: vi.fn(),
      } as unknown as Pick<KeyNoteGroupManager, 'getAllGroups' | 'getActiveKeyNoteGroupId' | 'setActiveKeyNoteGroupId' | 'createGroup'>,
      vi.fn(),
      vi.fn()
    );
    const view = createWebviewView();

    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    provider.previewKeyNote('note-1');
    await view.fireMessage({ type: 'ready' });

    const lastState = (view.webview.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]?.state;
    expect(lastState?.title).toContain('User Table');
    expect(lastState?.groups).toContain('1. User Notes');
    expect(lastState?.bodyHtml).toContain('<h1>Overview</h1>');
    expect(lastState?.bodyHtml).toContain('<p>Used by <strong>API</strong> layer.</p>');
    expect(lastState?.bodyHtml).toContain('<li>indexed</li>');
    expect(lastState?.bodyHtml).toContain('<li>cached</li>');
    expect(lastState?.bodyHtml).toContain('<blockquote><p>Important</p></blockquote>');
    expect(lastState?.bodyHtml).toContain('<pre><code class="language-ts">const stable = true;');
    expect(lastState?.bodyHtml).not.toContain('# Overview');
    expect(lastState?.bodyHtml).not.toContain('- indexed');
    expect(lastState?.bodyHtml).not.toContain('```ts');
  });

  it('renders markdown tables without leaking placeholder tokens', async () => {
    const note = makeNote('note-1', {
      term: 'Storage Service',
      contentMarkdown: [
        '| 字段 | 备注 |',
        '| --- | --- |',
        '| `SERIALNO` | 持仓编号 |',
        '| `TERMNO` | 投机/套保标志<br>分别记录在两张表 |',
      ].join('\n'),
    });
    const provider = new KeyNoteSidebarPreviewProvider(
      {
        getById: vi.fn().mockReturnValue(note),
        getByNormalizedTerm: vi.fn(),
        createOrGetKeyNote: vi.fn()
      } as unknown as Pick<KeyNoteManager, 'getById' | 'getByNormalizedTerm' | 'createOrGetKeyNote'>,
      {
        getGroupsForKeyNote: vi.fn().mockReturnValue([]),
        addKeyNoteToGroup: vi.fn(),
      } as unknown as Pick<KeyNoteRelationManager, 'getGroupsForKeyNote' | 'addKeyNoteToGroup'>,
      {
        getAllGroups: vi.fn().mockReturnValue([]),
        getActiveKeyNoteGroupId: vi.fn(),
        setActiveKeyNoteGroupId: vi.fn(),
        createGroup: vi.fn(),
      } as unknown as Pick<KeyNoteGroupManager, 'getAllGroups' | 'getActiveKeyNoteGroupId' | 'setActiveKeyNoteGroupId' | 'createGroup'>,
      vi.fn(),
      vi.fn()
    );
    const view = createWebviewView();

    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    provider.previewKeyNote('note-1');
    await view.fireMessage({ type: 'ready' });

    const lastState = (view.webview.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]?.state;
    expect(lastState?.bodyHtml).toContain('<table');
    expect(lastState?.bodyHtml).toContain('<th>字段</th>');
    expect(lastState?.bodyHtml).toContain('<code>SERIALNO</code>');
    expect(lastState?.bodyHtml).toContain('<code>TERMNO</code>');
    expect(lastState?.bodyHtml).toContain('投机/套保标志<br>');
    expect(lastState?.bodyHtml).not.toContain('@@TERMNOTE');
    expect(lastState?.bodyHtml).not.toContain('| `SERIALNO` |');
    expect(lastState?.bodyHtml).not.toContain('&lt;br&gt;');
  });

  it('refreshes the selected preview when key-note data changes', async () => {
    const keyNotesEvent = createEventHook();
    const keyNoteRelationsEvent = createEventHook();
    let currentContent = 'Old body';
    const getById = vi.fn(() => makeNote('note-1', { term: 'User Table', contentMarkdown: currentContent }));
    const provider = new KeyNoteSidebarPreviewProvider(
      {
        getById,
        getByNormalizedTerm: vi.fn(),
        createOrGetKeyNote: vi.fn()
      } as unknown as Pick<KeyNoteManager, 'getById' | 'getByNormalizedTerm' | 'createOrGetKeyNote'>,
      {
        getGroupsForKeyNote: vi.fn().mockReturnValue([]),
        addKeyNoteToGroup: vi.fn(),
      } as unknown as Pick<KeyNoteRelationManager, 'getGroupsForKeyNote' | 'addKeyNoteToGroup'>,
      {
        getAllGroups: vi.fn().mockReturnValue([]),
        getActiveKeyNoteGroupId: vi.fn(),
        setActiveKeyNoteGroupId: vi.fn(),
        createGroup: vi.fn(),
      } as unknown as Pick<KeyNoteGroupManager, 'getAllGroups' | 'getActiveKeyNoteGroupId' | 'setActiveKeyNoteGroupId' | 'createGroup'>,
      keyNotesEvent.subscribe,
      keyNoteRelationsEvent.subscribe
    );
    const view = createWebviewView();

    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    provider.previewKeyNote('note-1');
    await view.fireMessage({ type: 'ready' });
    let lastState = (view.webview.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]?.state;
    expect(lastState?.bodyHtml).toContain('<p>Old body</p>');

    currentContent = '## Updated body';
    keyNotesEvent.fire();

    lastState = (view.webview.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]?.state;
    expect(lastState?.bodyHtml).toContain('<h2>Updated body</h2>');
  });

  it('switches to edit mode and saves note content from the webview', async () => {
    const updateContent = vi.fn().mockResolvedValue(undefined);
    let currentContent = 'Old body';
    const provider = new KeyNoteSidebarPreviewProvider(
      {
        getById: vi.fn(() => makeNote('note-1', { term: 'User Table', contentMarkdown: currentContent })),
        getByNormalizedTerm: vi.fn(),
        createOrGetKeyNote: vi.fn()
      } as unknown as Pick<KeyNoteManager, 'getById' | 'getByNormalizedTerm' | 'createOrGetKeyNote'>,
      {
        getGroupsForKeyNote: vi.fn().mockReturnValue([]),
        addKeyNoteToGroup: vi.fn(),
      } as unknown as Pick<KeyNoteRelationManager, 'getGroupsForKeyNote' | 'addKeyNoteToGroup'>,
      {
        getAllGroups: vi.fn().mockReturnValue([]),
        getActiveKeyNoteGroupId: vi.fn(),
        setActiveKeyNoteGroupId: vi.fn(),
        createGroup: vi.fn(),
      } as unknown as Pick<KeyNoteGroupManager, 'getAllGroups' | 'getActiveKeyNoteGroupId' | 'setActiveKeyNoteGroupId' | 'createGroup'>,
      vi.fn(),
      vi.fn(),
      updateContent
    );
    const view = createWebviewView();

    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    provider.editKeyNote('note-1');
    await view.fireMessage({ type: 'ready' });
    let lastState = (view.webview.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]?.state;
    expect(lastState?.mode).toBe('edit');

    updateContent.mockImplementation(async (_noteId: string, content: string) => {
      currentContent = content;
    });
    await view.fireMessage({ type: 'save', content: '# Saved body', groupId: undefined });

    expect(updateContent).toHaveBeenCalledWith('note-1', '# Saved body');
    lastState = (view.webview.postMessage as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]?.state;
    expect(lastState?.bodyHtml).toContain('<h1>Saved body</h1>');
    expect(view.show).toHaveBeenCalledWith(true);
  });

  it('opens the note-editor panel when editing before the view has been resolved', async () => {
    const provider = new KeyNoteSidebarPreviewProvider(
      {
        getById: vi.fn().mockReturnValue(makeNote('note-1', { term: 'User Table', contentMarkdown: 'Body' })),
        getByNormalizedTerm: vi.fn(),
        createOrGetKeyNote: vi.fn()
      } as unknown as Pick<KeyNoteManager, 'getById' | 'getByNormalizedTerm' | 'createOrGetKeyNote'>,
      {
        getGroupsForKeyNote: vi.fn().mockReturnValue([]),
        addKeyNoteToGroup: vi.fn(),
      } as unknown as Pick<KeyNoteRelationManager, 'getGroupsForKeyNote' | 'addKeyNoteToGroup'>,
      {
        getAllGroups: vi.fn().mockReturnValue([]),
        getActiveKeyNoteGroupId: vi.fn(),
        setActiveKeyNoteGroupId: vi.fn(),
        createGroup: vi.fn(),
      } as unknown as Pick<KeyNoteGroupManager, 'getAllGroups' | 'getActiveKeyNoteGroupId' | 'setActiveKeyNoteGroupId' | 'createGroup'>,
      vi.fn(),
      vi.fn()
    );

    provider.editKeyNote('note-1');
    await Promise.resolve();

    expect(mockState.commands.executeCommand).toHaveBeenCalledWith(
      'workbench.view.extension.groupBookmarksKeyNotePanel'
    );
  });
});

describe('extension key-note tree preview wiring', () => {
  it('registers a tree selection listener that previews the selected key note and clears on non-note items', () => {
    const previewKeyNote = vi.fn();
    let selectionListener: ((event: { selection: Array<{ type?: string; dataId?: string }> }) => void) | undefined;
    const treeView = {
      onDidChangeSelection: vi.fn((listener: (event: { selection: Array<{ type?: string; dataId?: string }> }) => void) => {
        selectionListener = listener;
        return { dispose: vi.fn() };
      }),
    };
    const context = createExtensionContext();

    registerKeyNoteTreePreviewSelectionListener(
      asExtensionContext(context),
      treeView as unknown as vscode.TreeView<KeyNoteTreeItem>,
      asSidebarPreviewProvider({ previewKeyNote })
    );

    expect(treeView.onDidChangeSelection).toHaveBeenCalledTimes(1);
    expect(context.subscriptions).toHaveLength(1);

    selectionListener?.({ selection: [{ type: 'key-note', dataId: 'note-1' }] });
    selectionListener?.({ selection: [{ type: 'key-note-group', dataId: 'group-1' }] });

    expect(previewKeyNote).toHaveBeenNthCalledWith(1, 'note-1');
    expect(previewKeyNote).toHaveBeenNthCalledWith(2, undefined);
  });
});

describe('extension key-note selection reveal wiring', () => {
  it('reveals an existing selected key note in the tree when auto-follow event is fired', async () => {
    const reveal = vi.fn().mockResolvedValue(undefined);
    const getRevealItemForNoteId = vi.fn().mockReturnValue({
      type: 'key-note',
      dataId: 'note-1',
      groupId: 'group-1',
      label: 'User Table',
    });
    
    let listener: ((noteId: string) => Promise<void>) | undefined;
    const onDidAutoFollowNote = vi.fn((cb: (noteId: string) => Promise<void>) => {
      listener = cb;
      return { dispose: vi.fn() };
    });

    const context = createExtensionContext();
    registerKeyNoteSelectionRevealListener(
      asExtensionContext(context),
      {
        reveal,
      } as unknown as vscode.TreeView<KeyNoteTreeItem>,
      {
        getRevealItemForNoteId,
      } as unknown as Pick<KeyNoteTreeProvider, 'getRevealItemForNoteId'>,
      { onDidAutoFollowNote } as unknown as Pick<KeyNoteSidebarPreviewProvider, 'onDidAutoFollowNote'>
    );

    await listener?.('note-1');

    expect(getRevealItemForNoteId).toHaveBeenCalledWith('note-1');
    expect(reveal).toHaveBeenCalledWith(
      expect.objectContaining({ dataId: 'note-1' }),
      { expand: true, select: true, focus: false }
    );
  });
});
