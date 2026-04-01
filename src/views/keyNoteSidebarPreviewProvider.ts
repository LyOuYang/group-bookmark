import * as vscode from 'vscode';
import { KeyNoteManager } from '../core/keyNoteManager';
import { KeyNoteRelationManager } from '../core/keyNoteRelationManager';
import { KeyNoteGroupManager } from '../core/keyNoteGroupManager';
import { extractNormalizedTerm } from '../utils/keyNoteUtils';

const EMPTY_PREVIEW_TITLE = 'Select a key note';
const EMPTY_PREVIEW_BODY = 'Click a note in the Key Notes list to preview it here.';
const MISSING_PREVIEW_BODY = 'The selected note is no longer available.';
const EMPTY_NOTE_BODY = 'No note body yet.';
const TERM_NOTE_EDITOR_PANEL_COMMAND = 'workbench.view.extension.groupBookmarksKeyNotePanel';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUrl(url: string): string | undefined {
    const trimmed = url.trim();

    if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
        return trimmed;
    }

    return undefined;
}

function renderInline(markdown: string): string {
    const placeholders: string[] = [];
    const reserve = (html: string): string => {
        const index = placeholders.push(html) - 1;
        return `@@TERMNOTETOKEN${index}@@`;
    };

    let output = escapeHtml(markdown);

    output = output.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    output = output.replace(/`([^`]+)`/g, (_match, code: string) => reserve(`<code>${code}</code>`));
    output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text: string, url: string) => {
        const safeUrl = sanitizeUrl(url);
        if (!safeUrl) {
            return reserve(`<span class="link-text">${text}</span>`);
        }

        return reserve(`<a href="${escapeHtml(safeUrl)}">${text}</a>`);
    });
    output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    output = output.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    output = output.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');

    return output.replace(/@@TERMNOTETOKEN(\d+)@@/g, (_match, index: string) => placeholders[Number(index)] ?? '');
}

function isUnorderedListItem(line: string): boolean {
    return /^\s*[-*+]\s+/.test(line);
}

function isOrderedListItem(line: string): boolean {
    return /^\s*\d+\.\s+/.test(line);
}

function isBlockBoundary(line: string): boolean {
    return !line.trim()
        || /^\s*```/.test(line)
        || /^\s*#{1,6}\s+/.test(line)
        || /^\s*>/.test(line)
        || isUnorderedListItem(line)
        || isOrderedListItem(line);
}

function splitTableRow(line: string): string[] {
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) {
        trimmed = trimmed.slice(1);
    }
    if (trimmed.endsWith('|')) {
        trimmed = trimmed.slice(0, -1);
    }

    const cells: string[] = [];
    let current = '';

    for (let index = 0; index < trimmed.length; index += 1) {
        const character = trimmed[index];
        const nextCharacter = trimmed[index + 1];

        if (character === '\\' && nextCharacter === '|') {
            current += '|';
            index += 1;
            continue;
        }

        if (character === '|') {
            cells.push(current.trim());
            current = '';
            continue;
        }

        current += character;
    }

    cells.push(current.trim());
    return cells;
}

function isTableDivider(line: string): boolean {
    return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function isTableStart(lines: string[], index: number): boolean {
    if (index + 1 >= lines.length) {
        return false;
    }

    const headerLine = lines[index];
    const dividerLine = lines[index + 1];

    return headerLine.includes('|')
        && isTableDivider(dividerLine)
        && splitTableRow(headerLine).some(cell => cell.length > 0);
}

function renderMarkdown(markdown: string): string {
    const lines = markdown.replace(/\r/g, '').split('\n');
    const html: string[] = [];

    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
            index += 1;
            continue;
        }

        const codeFenceMatch = /^\s*```([\w-]+)?\s*$/.exec(line);
        if (codeFenceMatch) {
            const language = codeFenceMatch[1]?.trim();
            const codeLines: string[] = [];
            index += 1;

            while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
                codeLines.push(lines[index]);
                index += 1;
            }

            if (index < lines.length) {
                index += 1;
            }

            const className = language ? ` class="language-${escapeHtml(language)}"` : '';
            html.push(`<pre><code${className}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
            continue;
        }

        const headingMatch = /^\s*(#{1,6})\s+(.*)$/.exec(line);
        if (headingMatch) {
            const level = headingMatch[1].length;
            html.push(`<h${level}>${renderInline(headingMatch[2].trim())}</h${level}>`);
            index += 1;
            continue;
        }

        if (isTableStart(lines, index)) {
            const headerCells = splitTableRow(lines[index]);
            const rows: string[][] = [];
            index += 2;

            while (index < lines.length && lines[index].trim() && lines[index].includes('|') && !isTableDivider(lines[index])) {
                rows.push(splitTableRow(lines[index]));
                index += 1;
            }

            html.push([
                '<table>',
                `<thead><tr>${headerCells.map(cell => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`,
                `<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`,
                '</table>'
            ].join(''));
            continue;
        }

        if (/^\s*>/.test(line)) {
            const quotedLines: string[] = [];

            while (index < lines.length && (lines[index].trim() === '' || /^\s*>/.test(lines[index]))) {
                quotedLines.push(lines[index].trim() === '' ? '' : lines[index].replace(/^\s*>\s?/, ''));
                index += 1;
            }

            html.push(`<blockquote>${renderMarkdown(quotedLines.join('\n'))}</blockquote>`);
            continue;
        }

        if (isUnorderedListItem(line)) {
            const items: string[] = [];

            while (index < lines.length && isUnorderedListItem(lines[index])) {
                items.push(lines[index].replace(/^\s*[-*+]\s+/, ''));
                index += 1;
            }

            html.push(`<ul>${items.map(item => `<li>${renderInline(item.trim())}</li>`).join('')}</ul>`);
            continue;
        }

        if (isOrderedListItem(line)) {
            const items: string[] = [];

            while (index < lines.length && isOrderedListItem(lines[index])) {
                items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
                index += 1;
            }

            html.push(`<ol>${items.map(item => `<li>${renderInline(item.trim())}</li>`).join('')}</ol>`);
            continue;
        }

        const paragraphLines: string[] = [];
        while (index < lines.length && !isBlockBoundary(lines[index]) && !isTableStart(lines, index)) {
            paragraphLines.push(lines[index].trim());
            index += 1;
        }

        html.push(`<p>${renderInline(paragraphLines.join(' '))}</p>`);
    }

    return html.join('');
}

export class KeyNoteSidebarPreviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    private webviewView: vscode.WebviewView | undefined;
    private selectedNoteId: string | undefined;
    private mode: 'preview' | 'edit' = 'preview';
    private draftContent = '';
    private readonly disposables: vscode.Disposable[];

    // Auto Follow State
    private isAutoFollowEnabled = true;
    private draftTerm: string | undefined;
    private isDirty = false;
    private selectionTimeout: NodeJS.Timeout | undefined;
    // Ready handshake: true only after webview JS sends 'ready'
    private webviewReady = false;

    private readonly _onDidAutoFollowNote = new vscode.EventEmitter<string>();
    public readonly onDidAutoFollowNote = this._onDidAutoFollowNote.event;

    constructor(
        private readonly keyNoteManager: Pick<KeyNoteManager, 'getById' | 'getByNormalizedTerm' | 'createOrGetKeyNote'>,
        private readonly keyNoteRelationManager: Pick<KeyNoteRelationManager, 'getGroupsForKeyNote' | 'addKeyNoteToGroup'>,
        private readonly keyNoteGroupManager: Pick<KeyNoteGroupManager, 'getAllGroups' | 'getActiveKeyNoteGroupId' | 'setActiveKeyNoteGroupId' | 'createGroup'>,
        onDidChangeKeyNotes: vscode.Event<void>,
        onDidChangeKeyNoteRelations: vscode.Event<void>,
        private readonly updateKeyNoteContent?: (noteId: string, content: string) => Promise<void>
    ) {
        this.disposables = [
            onDidChangeKeyNotes(() => this.render()),
            onDidChangeKeyNoteRelations(() => this.render()),
            vscode.window.onDidChangeTextEditorSelection(e => this.onSelectionChange(e))
        ];
    }

    dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.webviewView = webviewView;
        this.webviewReady = false;   // reset — new webview context
        webviewView.webview.options = { enableScripts: true };
        this.disposables.push(
            webviewView.webview.onDidReceiveMessage(async message => {
                await this.handleMessage(message);
            })
        );
        // Do NOT render() here — the webview JS is not ready yet.
        // We wait for the 'ready' message from the webview instead.
        this.webviewView.webview.html = this.buildStaticHtml();
    }

    previewKeyNote(noteId: string | undefined): void {
        this.selectedNoteId = noteId;
        this.mode = 'preview';
        this.syncDraftContent();
        void this.revealEditorView();
        this.render();
    }

    editKeyNote(noteId: string): void {
        this.selectedNoteId = noteId;
        this.draftTerm = undefined;
        this.isDirty = false;
        this.mode = 'edit';
        this.syncDraftContent();
        void this.revealEditorView();
        this.render();
    }

    private onSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
        if (!this.isAutoFollowEnabled || !this.webviewView || !this.webviewView.visible || this.mode === 'edit') {
            return;
        }

        if (this.selectionTimeout) {
            clearTimeout(this.selectionTimeout);
        }

        this.selectionTimeout = setTimeout(() => {
            // Re-validate view states
            if (!this.webviewView || !this.webviewView.visible || this.isDirty) return;

            if (event.selections.length !== 1) return;
            const selection = event.selections[0];
            if (selection.isEmpty || !selection.isSingleLine) return;
            
            const text = event.textEditor.document.getText(selection).trim();
            if (text.length < 2 || text.length > 64 || /\\s/.test(text)) {
                return;
            }

            void this.handleAutoFollowWord(text);
        }, 300);
    }

    private async handleAutoFollowWord(word: string): Promise<void> {
        const normalized = extractNormalizedTerm(word);
        if (!normalized) return;

        const existingNote = this.keyNoteManager.getByNormalizedTerm(normalized);
        if (existingNote) {
            this.selectedNoteId = existingNote.id;
            this.draftTerm = undefined;
            this.mode = 'preview';
            this.isDirty = false;
            this.syncDraftContent();
            this.render();
            // 通知外部我们执行了一次合法的跟随
            this._onDidAutoFollowNote.fire(existingNote.id);
        } else {
            this.selectedNoteId = undefined;
            this.draftTerm = word;
            this.mode = 'preview';
            this.draftContent = '';
            this.isDirty = false;
            this.render();
        }
    }


    private async handleMessage(message: unknown): Promise<void> {
        if (!message || typeof message !== 'object' || !('type' in message)) {
            return;
        }

        const typedMessage = message as { type?: string; content?: string; groupId?: string };

        // Webview JS signals it has finished loading and is ready to receive state
        if (typedMessage.type === 'ready') {
            this.webviewReady = true;
            void this.webviewView?.webview.postMessage({ type: 'update', state: this.buildViewState() });
            return;
        }

        if (typedMessage.type === 'toggleAutoFollow') {
            this.isAutoFollowEnabled = !this.isAutoFollowEnabled;
            this.render();
            return;
        }

        if (typedMessage.type === 'dirty') {
            this.isDirty = true;
            return;
        }

        if (typedMessage.type === 'edit') {
            this.mode = 'edit';
            this.isDirty = false;
            this.syncDraftContent();
            this.render();
            return;
        }

        if (typedMessage.type === 'cancel') {
            this.isDirty = false;
            if (!this.selectedNoteId) {
                this.draftTerm = undefined;
                this.mode = 'preview';
            } else {
                this.mode = 'preview';
                this.syncDraftContent();
            }
            this.render();
            return;
        }

        if (typedMessage.type === 'requestCreateGroup') {
            const newGroupName = await vscode.window.showInputBox({
                prompt: 'Enter name for the new Key Group',
                placeHolder: 'Group name'
            });
            if (newGroupName && newGroupName.trim()) {
                try {
                    const newGroup = await this.keyNoteGroupManager.createGroup(newGroupName.trim());
                    await this.keyNoteGroupManager.setActiveKeyNoteGroupId(newGroup.id);
                    // The new active group will be automatically selected in the re-rendered select box.
                    this.render();
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to create group: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
            return;
        }

        if (typedMessage.type === 'save' && typeof typedMessage.content === 'string' && this.updateKeyNoteContent) {
            let noteId = this.selectedNoteId;
            
            if (!noteId && this.draftTerm) {
                const newNote = await this.keyNoteManager.createOrGetKeyNote(this.draftTerm);
                noteId = newNote.id;
                this.selectedNoteId = noteId;
                this.draftTerm = undefined;
            }

            if (!noteId) return;

            await this.updateKeyNoteContent(noteId, typedMessage.content);
            if (typedMessage.groupId) {
                // 如果用户刚刚选择了分组，或者已有分组，通过保存事件强关联
                await this.keyNoteRelationManager.addKeyNoteToGroup(noteId, typedMessage.groupId);
                await this.keyNoteGroupManager.setActiveKeyNoteGroupId(typedMessage.groupId);
            }
            this.draftContent = typedMessage.content;
            this.isDirty = false;
            this.mode = 'preview';
            this.render();
        }
    }

    private async revealEditorView(): Promise<void> {
        if (this.webviewView) {
            this.webviewView.show(true);
            return;
        }

        await vscode.commands.executeCommand(TERM_NOTE_EDITOR_PANEL_COMMAND);
    }


    private buildViewState(): object {
        const note = this.selectedNoteId
            ? this.keyNoteManager.getById(this.selectedNoteId)
            : undefined;

        if (!this.selectedNoteId && !this.draftTerm) {
            return {
                mode: 'empty', title: EMPTY_PREVIEW_TITLE, prefixIcon: '📝',
                bodyHtml: `<p class="muted">${escapeHtml(EMPTY_PREVIEW_BODY)}</p>`,
                groups: [], allGroups: [], targetGroupId: '', draftContent: '',
                isAutoFollowEnabled: this.isAutoFollowEnabled,
            };
        }
        if (this.selectedNoteId && !note) {
            return {
                mode: 'empty', title: EMPTY_PREVIEW_TITLE, prefixIcon: '📝',
                bodyHtml: `<p class="muted">${escapeHtml(MISSING_PREVIEW_BODY)}</p>`,
                groups: [], allGroups: [], targetGroupId: '', draftContent: '',
                isAutoFollowEnabled: this.isAutoFollowEnabled,
            };
        }
        const title = note ? note.term : (this.draftTerm ?? 'New Key Note');
        const groups = note ? this.keyNoteRelationManager.getGroupsForKeyNote(note.id).map(g => g.displayName) : [];
        let bodyHtml = note ? (renderMarkdown(note.contentMarkdown) || `<p class="muted">${escapeHtml(EMPTY_NOTE_BODY)}</p>`) : '';
        if (!note && this.mode === 'preview') {
            bodyHtml = `<p class="muted"><em>No note yet.</em> Click the <strong>Edit</strong> icon (✏️) to create one.</p>`;
        }
        const allGroups = this.keyNoteGroupManager.getAllGroups();
        const activeGroupId = this.keyNoteGroupManager.getActiveKeyNoteGroupId();
        const existingGroups = note ? this.keyNoteRelationManager.getGroupsForKeyNote(note.id) : undefined;
        let targetGroupId = '';
        if (existingGroups && existingGroups.length > 0) {
            targetGroupId = existingGroups[0].id;
        } else if (activeGroupId) {
            targetGroupId = activeGroupId;
        }
        return {
            mode: this.mode,
            title,
            prefixIcon: this.mode === 'edit' ? '🎯' : '🔖',
            bodyHtml,
            groups,
            allGroups: allGroups.map(g => ({ id: g.id, name: g.name })),
            targetGroupId,
            draftContent: this.draftContent,
            isAutoFollowEnabled: this.isAutoFollowEnabled,
        };
    }

    private render(): void {
        if (!this.webviewView) { return; }
        if (!this.webviewReady) {
            // Webview JS not yet ready — message would be lost. Skip.
            // State will be pushed when we receive the 'ready' handshake.
            return;
        }
        void this.webviewView.webview.postMessage({ type: 'update', state: this.buildViewState() });
    }

    private syncDraftContent(): void {
        const note = this.selectedNoteId ? this.keyNoteManager.getById(this.selectedNoteId) : undefined;
        this.draftContent = note?.contentMarkdown ?? '';
    }

    private buildStaticHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root { color-scheme: light dark; }
        html, body { height: 100%; margin: 0; }
        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); display: flex; flex-direction: column; overflow: hidden; }
        
        /* The main shell should flex fully to occupy space */
        .shell { box-sizing: border-box; flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 12px; min-height: 0; }
        .shell.animating { animation: fadeIn 0.15s ease-out; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }

        /* HEADER: Keep very compact */
        .header { display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-shrink: 0; }
        .hero-title-container { flex: 1; min-width: 0; display: flex; align-items: center; }
        .hero-title {
            margin: 0; font-size: 14px; font-weight: 600;
            font-family: var(--vscode-editor-font-family);
            background: color-mix(in srgb, var(--vscode-editorAction-activeBackground) 15%, transparent);
            color: var(--vscode-textLink-foreground);
            padding: 3px 8px; border-radius: 4px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .header-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        
        .icon-btn { 
            background: transparent; border: 1px solid transparent; color: var(--vscode-icon-foreground); 
            padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 13px; line-height: 1;
        }
        .icon-btn:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground); }
        .auto-follow-btn {
            font-size: 11px; padding: 2px 6px; border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
            background: var(--vscode-button-secondaryBackground, transparent); color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            border-radius: 4px; opacity: 0.85; cursor: pointer; white-space: nowrap;
        }
        .auto-follow-btn:hover { opacity: 1; }

        .groups { display: flex; flex-wrap: wrap; gap: 4px; flex-shrink: 0; }
        .badge { padding: 2px 6px; border-radius: 4px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 10px; line-height: 14px; }

        /* PREVIEW MODE: Use remaining space and scroll internally */
        .preview-layout { flex: 1; overflow-y: auto; padding-right: 4px; }
        
        /* EDIT MODE: Use remaining space with flex-grow */
        .edit-layout { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; }
        .compact-toolbar { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
        .compact-select { 
            flex: 1; min-width: 0; padding: 3px 6px; font-size: 12px; border-radius: 4px; 
            border: 1px solid var(--vscode-dropdown-border); background: var(--vscode-dropdown-background); 
            color: var(--vscode-dropdown-foreground); outline: none; cursor: pointer; 
        }
        .action-row { display: flex; gap: 4px; }
        .compact-icon-btn { 
            font-size: 12px; padding: 4px 8px; border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 80%, transparent); 
            border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; 
            background: var(--vscode-button-secondaryBackground, transparent); color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); 
        }
        .compact-icon-btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
        .compact-icon-btn:hover { filter: brightness(1.1); opacity: 0.9; }

        /* Text area fills the rest */
        .waterfall-editor { 
            flex: 1; width: 100%; resize: none; padding: 8px; 
            border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 80%, transparent); 
            border-left: 3px solid transparent; border-radius: 4px; 
            background: var(--vscode-input-background); color: var(--vscode-input-foreground); 
            font-family: var(--vscode-editor-font-family, var(--vscode-font-family)); 
            font-size: 13px; line-height: 1.5; outline: none; transition: border-color 0.15s; 
            box-sizing: border-box; 
        }
        .waterfall-editor:focus { border-color: var(--vscode-focusBorder); border-left-color: var(--vscode-focusBorder); }

        .hint-bar { font-size: 10px; color: var(--vscode-descriptionForeground); flex-shrink: 0; text-align: center; }
        .hidden { display: none !important; }

        /* MARKDOWN BODY */
        .markdown-body { line-height: 1.6; font-size: 13px; color: var(--vscode-foreground); padding-bottom: 12px; }
        .markdown-body > :first-child { margin-top: 0; }
        .markdown-body > :last-child { margin-bottom: 0; }
        .markdown-body h1,.markdown-body h2,.markdown-body h3,.markdown-body h4,.markdown-body h5,.markdown-body h6 { line-height: 1.3; margin: 1em 0 0.5em; }
        .markdown-body h1 { font-size: 1.35em; } .markdown-body h2 { font-size: 1.25em; } .markdown-body h3 { font-size: 1.1em; }
        .markdown-body p,.markdown-body ul,.markdown-body ol,.markdown-body blockquote,.markdown-body pre,.markdown-body table { margin: 0 0 0.8em; }
        .markdown-body ul,.markdown-body ol { padding-left: 1.4em; }
        .markdown-body li + li { margin-top: 0.25em; }
        .markdown-body blockquote { margin-left: 0; padding-left: 12px; border-left: 3px solid var(--vscode-textLink-foreground); color: var(--vscode-descriptionForeground); }
        .markdown-body code { font-family: var(--vscode-editor-font-family, var(--vscode-font-family)); font-size: 0.95em; padding: 0.1em 0.35em; border-radius: 4px; background: color-mix(in srgb, var(--vscode-textCodeBlock-background) 75%, transparent); }
        .markdown-body pre { overflow: auto; padding: 10px 12px; border-radius: 6px; background: var(--vscode-textCodeBlock-background); }
        .markdown-body pre code { display: block; padding: 0; background: transparent; white-space: pre; }
        .markdown-body table { width: 100%; border-collapse: collapse; }
        .markdown-body th,.markdown-body td { padding: 6px 8px; border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 80%, transparent); text-align: left; vertical-align: top; }
        .markdown-body th { font-weight: 600; background: color-mix(in srgb, var(--vscode-editor-background) 70%, transparent); }
        .markdown-body a,.markdown-body .link-text { color: var(--vscode-textLink-foreground); text-decoration: none; }
        .muted { color: var(--vscode-descriptionForeground); }
    </style>
</head>
<body>
    <div class="shell" id="shell">
        <div class="header">
            <div class="hero-title-container">
                <h3 class="hero-title" id="hero-title">📝 Key Note</h3>
            </div>
            <div class="header-actions">
                <button class="icon-btn hidden" id="edit-btn" title="Edit Note">✏️</button>
                <button class="auto-follow-btn" id="auto-follow-btn" title="Toggle auto-follow">🔗 Auto</button>
            </div>
        </div>
        <div class="groups hidden" id="groups-container"></div>

        <div id="preview-section" class="preview-layout hidden">
            <div class="markdown-body" id="preview-body"></div>
        </div>

        <div id="edit-section" class="edit-layout hidden">
            <div class="compact-toolbar">
                <select id="group-select" class="compact-select"></select>
                <div class="action-row">
                    <button class="compact-icon-btn cancel-btn" id="cancel-btn" title="Cancel">❌</button>
                    <button class="compact-icon-btn primary save-btn" id="save-btn" title="Save Changes (Ctrl+S)">✅ Save</button>
                </div>
            </div>
            <textarea id="editor" class="waterfall-editor" spellcheck="false" placeholder="Write your note down..."></textarea>
        </div>

        <div id="empty-section" class="preview-layout hidden">
            <div class="markdown-body" id="empty-body"></div>
        </div>
        
        <div class="hint-bar">Open Note for standalone markdown editing.</div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const shell = document.getElementById('shell');
        const heroTitle = document.getElementById('hero-title');
        const autoFollowBtn = document.getElementById('auto-follow-btn');
        const editBtn = document.getElementById('edit-btn');
        const groupsContainer = document.getElementById('groups-container');
        
        const previewSection = document.getElementById('preview-section');
        const previewBody = document.getElementById('preview-body');
        
        const editSection = document.getElementById('edit-section');
        const groupSelect = document.getElementById('group-select');
        const editorEl = document.getElementById('editor');
        const saveBtn = document.getElementById('save-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        
        const emptySection = document.getElementById('empty-section');
        const emptyBody = document.getElementById('empty-body');

        // clientDirty prevents auto-follow from switching views while user is typing
        let clientDirty = false;
        let prevTitle = null;
        let prevMode = null;

        window.addEventListener('message', event => {
            const msg = event.data;
            if (!msg || msg.type !== 'update') { return; }
            applyState(msg.state);
        });

        function applyState(state) {
            if (prevTitle !== state.title || prevMode !== state.mode) {
                shell.classList.remove('animating');
                void shell.offsetWidth;
                shell.classList.add('animating');
            }
            prevTitle = state.title;
            prevMode = state.mode;

            heroTitle.textContent = state.prefixIcon + ' ' + state.title;
            heroTitle.title = state.title;
            autoFollowBtn.innerHTML = state.isAutoFollowEnabled ? '🔗 Auto' : '<span style="opacity:0.6">🔗 Off</span>';

            if (state.groups && state.groups.length > 0) {
                groupsContainer.innerHTML = state.groups.map(g => '<span class="badge">' + escHtml(g) + '</span>').join('');
                groupsContainer.classList.remove('hidden');
            } else {
                groupsContainer.innerHTML = '';
                groupsContainer.classList.add('hidden');
            }

            previewSection.classList.add('hidden');
            editSection.classList.add('hidden');
            emptySection.classList.add('hidden');
            editBtn.classList.add('hidden');

            if (state.mode === 'preview') {
                previewSection.classList.remove('hidden');
                editBtn.classList.remove('hidden'); // Show edit icon in header during preview
                previewBody.innerHTML = state.bodyHtml;
                clientDirty = false;
            } else if (state.mode === 'edit') {
                editSection.classList.remove('hidden');
                rebuildGroupSelect(state.allGroups, state.targetGroupId);
                if (!clientDirty) { editorEl.value = state.draftContent; }
            } else {
                emptySection.classList.remove('hidden');
                emptyBody.innerHTML = state.bodyHtml;
                clientDirty = false;
            }
        }

        function rebuildGroupSelect(allGroups, targetGroupId) {
            const currentVal = groupSelect.value;
            groupSelect.innerHTML = '';
            const ph = document.createElement('option');
            ph.value = ''; ph.disabled = true; ph.selected = !targetGroupId;
            ph.textContent = '--- Select a Key Group ---';
            groupSelect.appendChild(ph);
            const cn = document.createElement('option');
            cn.value = '--create-new--'; cn.textContent = '+ Create New Group...';
            groupSelect.appendChild(cn);
            allGroups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id; opt.textContent = '\uD83D\uDDC2\uFE0F ' + g.name; opt.selected = g.id === targetGroupId;
                groupSelect.appendChild(opt);
            });
            if (currentVal && [...groupSelect.options].some(o => o.value === currentVal)) {
                groupSelect.value = currentVal;
            }
        }

        function escHtml(str) {
            return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }

        autoFollowBtn.addEventListener('click', () => { vscode.postMessage({ type: 'toggleAutoFollow' }); });
        editBtn.addEventListener('click', () => { vscode.postMessage({ type: 'edit' }); });
        editorEl.addEventListener('input', () => {
            if (!clientDirty) { clientDirty = true; vscode.postMessage({ type: 'dirty' }); }
        });
        
        let prevGroupValue = '';
        groupSelect.addEventListener('change', () => {
            if (groupSelect.value === '--create-new--') {
                vscode.postMessage({ type: 'requestCreateGroup' });
                groupSelect.value = prevGroupValue;
            } else { prevGroupValue = groupSelect.value; }
        });
        
        function doSave() {
            if (!groupSelect.value || groupSelect.value === '--create-new--') {
                alert('Please select a key group before saving.'); return;
            }
            clientDirty = false;
            vscode.postMessage({ type: 'save', content: editorEl.value, groupId: groupSelect.value });
        }
        saveBtn.addEventListener('click', doSave);
        cancelBtn.addEventListener('click', () => { clientDirty = false; vscode.postMessage({ type: 'cancel' }); });
        
        function tryParseTableText(text) {
            if (!text || text.trim().length === 0) return null;
            
            const isTsv = text.indexOf('\\t') !== -1;
            // Heuristic: if no tab and no comma, it's definitely not CSV/TSV
            if (!isTsv && text.indexOf(',') === -1) return null;
            
            const separator = isTsv ? '\\t' : ',';
            
            const rows = [];
            let currentRow = [];
            let currentCell = '';
            let inQuotes = false;
            
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                if (char === '"') {
                    if (inQuotes && text[i + 1] === '"') {
                        currentCell += '"';
                        i++; // consume matched escaped quote
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === separator && !inQuotes) {
                    currentRow.push(currentCell.trim());
                    currentCell = '';
                } else if (char === '\\n' && !inQuotes) {
                    if (currentCell.endsWith('\\r')) {
                        currentCell = currentCell.slice(0, -1);
                    }
                    currentRow.push(currentCell.trim());
                    rows.push(currentRow);
                    currentRow = [];
                    currentCell = '';
                } else {
                    currentCell += char;
                }
            }
            if (currentCell || currentRow.length > 0) {
                if (currentCell.endsWith('\\r')) {
                    currentCell = currentCell.slice(0, -1);
                }
                currentRow.push(currentCell.trim());
                rows.push(currentRow);
            }
            
            // Remove empty rows at the end caused by trailing newlines
            while (rows.length > 0) {
                const lastRow = rows[rows.length - 1];
                if (lastRow.every(cell => cell === '')) {
                    rows.pop();
                } else {
                    break;
                }
            }
            
            if (rows.length < 2) return null; 
            
            const colCount = rows[0].length;
            if (colCount < 2) return null; 
            
            // Must be a consistent grid to be considered a valid table format to convert
            const isConsistent = rows.every(row => row.length === colCount);
            if (!isConsistent) return null;
            
            // Generate markdown table
            let mdTable = '\\n\\n';
            const headers = rows[0];
            mdTable += '| ' + headers.map(h => h.replace(/\\|/g, '\\\\|').replace(/\\r?\\n/g, '<br>')).join(' | ') + ' |\\n';
            mdTable += '| ' + headers.map(() => '---').join(' | ') + ' |\\n';
            
            for (let i = 1; i < rows.length; i++) {
                mdTable += '| ' + rows[i].map(c => c.replace(/\\|/g, '\\\\|').replace(/\\r?\\n/g, '<br>')).join(' | ') + ' |\\n';
            }
            
            return mdTable + '\\n';
        }

        editorEl.addEventListener('paste', e => {
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (!text) return;
            
            const mdTable = tryParseTableText(text);
            if (mdTable) {
                e.preventDefault();
                const start = editorEl.selectionStart;
                const end = editorEl.selectionEnd;
                editorEl.value = editorEl.value.substring(0, start) + mdTable + editorEl.value.substring(end);
                editorEl.selectionStart = editorEl.selectionEnd = start + mdTable.length;
                if (!clientDirty) { clientDirty = true; vscode.postMessage({ type: 'dirty' }); }
            }
        });

        window.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); }
        });

        // Signal to the extension that we are ready to receive the state
        window.addEventListener('load', () => {
            vscode.postMessage({ type: 'ready' });
        });
    </script>
</body>
</html>`;
    }
}
