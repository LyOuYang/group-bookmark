import * as vscode from 'vscode';
import { KeyNote } from '../models/types';

const TERM_NOTE_DOCUMENT_SCHEME = 'groupbookmarks-key-note';

type GetKeyNoteById = (noteId: string) => KeyNote | undefined;
type UpdateKeyNoteContent = (noteId: string, content: string) => Promise<void>;

export class KeyNoteDocumentService implements vscode.FileSystemProvider {
    static readonly scheme = TERM_NOTE_DOCUMENT_SCHEME;

    private readonly onDidChangeFileEmitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;

    constructor(
        private readonly getKeyNoteById: GetKeyNoteById,
        private readonly updateKeyNoteContent: UpdateKeyNoteContent
    ) { }

    getUri(noteId: string): vscode.Uri {
        return vscode.Uri.parse(`${TERM_NOTE_DOCUMENT_SCHEME}:/${noteId}.md`);
    }

    async openNoteDocument(noteId: string): Promise<void> {
        const document = await vscode.workspace.openTextDocument(this.getUri(noteId));
        await vscode.window.showTextDocument(document);
    }

    watch(): vscode.Disposable {
        return new vscode.Disposable(() => undefined);
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        const note = this.requireKeyNote(uri);
        return {
            type: vscode.FileType.File,
            ctime: note.createdAt,
            mtime: note.updatedAt,
            size: Buffer.byteLength(note.contentMarkdown, 'utf8')
        };
    }

    readDirectory(): [string, vscode.FileType][] {
        return [];
    }

    createDirectory(): void {
        throw new Error('Directories are not supported for key notes');
    }

    readFile(uri: vscode.Uri): Uint8Array {
        const note = this.requireKeyNote(uri);
        return Buffer.from(note.contentMarkdown, 'utf8');
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, _options: { create: boolean; overwrite: boolean }): Promise<void> {
        void _options;
        const noteId = this.getNoteId(uri);
        const markdown = Buffer.from(content).toString('utf8');
        await this.updateKeyNoteContent(noteId, markdown);
        this.onDidChangeFileEmitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }

    delete(): void {
        throw new Error('Deleting key note documents is not supported');
    }

    rename(): void {
        throw new Error('Renaming key note documents is not supported');
    }

    private requireKeyNote(uri: vscode.Uri): KeyNote {
        const note = this.getKeyNoteById(this.getNoteId(uri));
        if (!note) {
            throw new Error(`Key note not found: ${uri.toString()}`);
        }

        return note;
    }

    private getNoteId(uri: vscode.Uri): string {
        const fileName = uri.path.replace(/^\//, '');
        return fileName.replace(/\.md$/i, '');
    }
}
