import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { ExportData, KeyNote } from '../../src/models/types';

const mockState = vi.hoisted(() => ({
  window: {
    showOpenDialog: vi.fn().mockResolvedValue(undefined),
    showQuickPick: vi.fn().mockResolvedValue(undefined),
    showInformationMessage: vi.fn().mockResolvedValue(undefined),
    showErrorMessage: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('vscode', () => ({
  window: mockState.window,
}));

import { DataManager } from '../../src/data/dataManager';
import { StorageService } from '../../src/data/storageService';
import { ImportExportService } from '../../src/services/importExportService';

function asStorageService(value: unknown): StorageService {
  return value as unknown as StorageService;
}

function asDataManager(value: unknown): DataManager {
  return value as unknown as DataManager;
}

function createImportFile(data: ExportData): string {
  const filePath = path.join(os.tmpdir(), `groupbookmarks-import-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  return filePath;
}

function makeKeyNote(id: string): KeyNote {
  return {
    id,
    term: 'User Table',
    normalizedTerm: 'user_table',
    contentMarkdown: '# note',
    createdAt: 1,
    updatedAt: 1,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  mockState.window.showOpenDialog.mockReset().mockResolvedValue(undefined);
  mockState.window.showQuickPick.mockReset().mockResolvedValue(undefined);
  mockState.window.showInformationMessage.mockReset().mockResolvedValue(undefined);
  mockState.window.showErrorMessage.mockReset().mockResolvedValue(undefined);
});

describe('ImportExportService', () => {
  it('replaces missing key-note collections with empty arrays for scoped imports', async () => {
    const filePath = createImportFile({
      version: '1.1.0',
      workspace: 'demo',
      exportedAt: '2026-04-10T00:00:00.000Z',
      keyNotes: [makeKeyNote('note-1')],
    });
    const storageService = {
      importData: vi.fn().mockResolvedValue(undefined),
    };
    const dataManager = {
      loadAll: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ImportExportService(
      asStorageService(storageService),
      asDataManager(dataManager)
    );

    mockState.window.showOpenDialog.mockResolvedValue([{ fsPath: filePath } as vscode.Uri]);
    mockState.window.showQuickPick.mockResolvedValue({ value: 'replace' });

    await service.importData('keyNotes');

    expect(storageService.importData).toHaveBeenCalledWith(expect.objectContaining({
      keyNotes: [expect.objectContaining({ id: 'note-1' })],
      keyNoteGroups: [],
      keyNoteRelations: [],
    }));
    expect(dataManager.loadAll).toHaveBeenCalledTimes(1);
    expect(mockState.window.showInformationMessage).toHaveBeenCalledWith('Data (keyNotes) imported successfully!');

    fs.rmSync(filePath, { force: true });
  });

  it('rejects files that do not contain data for the requested import scope', async () => {
    const filePath = createImportFile({
      version: '1.1.0',
      workspace: 'demo',
      exportedAt: '2026-04-10T00:00:00.000Z',
      bookmarks: [],
      groups: [],
      relations: [],
    });
    const storageService = {
      importData: vi.fn().mockResolvedValue(undefined),
    };
    const dataManager = {
      loadAll: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ImportExportService(
      asStorageService(storageService),
      asDataManager(dataManager)
    );

    mockState.window.showOpenDialog.mockResolvedValue([{ fsPath: filePath } as vscode.Uri]);

    await service.importData('keyNotes');

    expect(mockState.window.showQuickPick).not.toHaveBeenCalled();
    expect(storageService.importData).not.toHaveBeenCalled();
    expect(dataManager.loadAll).not.toHaveBeenCalled();
    expect(mockState.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('does not contain key note data')
    );

    fs.rmSync(filePath, { force: true });
  });
});
