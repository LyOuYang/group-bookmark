import * as vscode from 'vscode';
import { KeyNoteManager } from '../core/keyNoteManager';
import { KeyNoteRelationManager } from '../core/keyNoteRelationManager';
import { KeyNoteGroupManager } from '../core/keyNoteGroupManager';

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

    constructor(
        private readonly keyNoteManager: Pick<KeyNoteManager, 'getById'>,
        private readonly keyNoteRelationManager: Pick<KeyNoteRelationManager, 'getGroupsForKeyNote' | 'addKeyNoteToGroup'>,
        private readonly keyNoteGroupManager: Pick<KeyNoteGroupManager, 'getAllGroups' | 'getActiveKeyNoteGroupId' | 'setActiveKeyNoteGroupId' | 'createGroup'>,
        onDidChangeKeyNotes: vscode.Event<void>,
        onDidChangeKeyNoteRelations: vscode.Event<void>,
        private readonly updateKeyNoteContent?: (noteId: string, content: string) => Promise<void>
    ) {
        this.disposables = [
            onDidChangeKeyNotes(() => this.render()),
            onDidChangeKeyNoteRelations(() => this.render())
        ];
    }

    dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true
        };
        this.disposables.push(
            webviewView.webview.onDidReceiveMessage(async message => {
                await this.handleMessage(message);
            })
        );
        this.render();
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
        this.mode = 'edit';
        this.syncDraftContent();
        void this.revealEditorView();
        this.render();
    }

    private render(): void {
        if (!this.webviewView) {
            return;
        }

        const note = this.selectedNoteId
            ? this.keyNoteManager.getById(this.selectedNoteId)
            : undefined;

        if (!this.selectedNoteId) {
            this.webviewView.webview.html = this.renderHtml({
                title: EMPTY_PREVIEW_TITLE,
                bodyHtml: `<p>${escapeHtml(EMPTY_PREVIEW_BODY)}</p>`,
                groups: [],
                muted: true
            });
            return;
        }

        if (!note) {
            this.webviewView.webview.html = this.renderHtml({
                title: EMPTY_PREVIEW_TITLE,
                bodyHtml: `<p>${escapeHtml(MISSING_PREVIEW_BODY)}</p>`,
                groups: [],
                muted: true
            });
            return;
        }

        const previewBodyHtml = renderMarkdown(note.contentMarkdown) || `<p class="muted">${escapeHtml(EMPTY_NOTE_BODY)}</p>`;
        const groups = this.keyNoteRelationManager.getGroupsForKeyNote(note.id)
            .map(group => group.displayName);

        this.webviewView.webview.html = this.renderHtml({
            title: note.term,
            bodyHtml: this.mode === 'edit'
                ? this.renderEditorHtml(note.id)
                : this.renderPreviewHtml(previewBodyHtml),
            groups,
            muted: false
        });
    }

    private syncDraftContent(): void {
        const note = this.selectedNoteId
            ? this.keyNoteManager.getById(this.selectedNoteId)
            : undefined;
        this.draftContent = note?.contentMarkdown ?? '';
    }

    private async handleMessage(message: unknown): Promise<void> {
        if (!this.selectedNoteId || !message || typeof message !== 'object' || !('type' in message)) {
            return;
        }

        const typedMessage = message as { type?: string; content?: string; groupId?: string };

        if (typedMessage.type === 'edit') {
            this.mode = 'edit';
            this.syncDraftContent();
            this.render();
            return;
        }

        if (typedMessage.type === 'cancel') {
            this.mode = 'preview';
            this.syncDraftContent();
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
            await this.updateKeyNoteContent(this.selectedNoteId, typedMessage.content);
            if (typedMessage.groupId) {
                // 如果用户刚刚选择了分组，或者已有分组，通过保存事件强关联
                await this.keyNoteRelationManager.addKeyNoteToGroup(this.selectedNoteId, typedMessage.groupId);
                await this.keyNoteGroupManager.setActiveKeyNoteGroupId(typedMessage.groupId);
            }
            this.draftContent = typedMessage.content;
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

    private renderEditorHtml(noteId: string): string {
        const allGroups = this.keyNoteGroupManager.getAllGroups();
        const activeGroupId = this.keyNoteGroupManager.getActiveKeyNoteGroupId();
        const existingGroups = this.keyNoteRelationManager.getGroupsForKeyNote(noteId);
        
        let targetGroupId = '';
        if (existingGroups && existingGroups.length > 0) {
            targetGroupId = existingGroups[0].id;
        } else if (activeGroupId) {
            targetGroupId = activeGroupId;
        }

        const optionsHtml = allGroups.map(group => 
            `<option value="${escapeHtml(group.id)}" ${targetGroupId === group.id ? 'selected' : ''}>${escapeHtml(group.name)}</option>`
        ).join('');

        return `
<div class="toolbar">
    <button class="button primary" data-action="save">Save</button>
    <button class="button" data-action="cancel">Cancel</button>
    <select id="key-note-group" class="group-select" required>
        <option value="" disabled ${!targetGroupId ? 'selected' : ''}>--- Select a Key Group ---</option>
        <option value="--create-new--" class="create-option">+ Create New Group...</option>
        ${optionsHtml}
    </select>
</div>
<textarea id="key-note-editor" class="editor" spellcheck="false">${escapeHtml(this.draftContent)}</textarea>
<div class="hint">Press Ctrl/Cmd+S or use Save to keep changes without leaving your code.</div>`;
    }

    private renderPreviewHtml(previewBodyHtml: string): string {
        return `
<div class="toolbar">
    <button class="button primary" data-action="edit">Edit</button>
</div>
${previewBodyHtml}`;
    }

    private renderHtml({
        title,
        bodyHtml,
        groups,
        muted
    }: {
        title: string;
        bodyHtml: string;
        groups: string[];
        muted: boolean;
    }): string {
        const groupMarkup = groups.length > 0
            ? `<div class="groups">${groups.map(group => `<span class="badge">${escapeHtml(group)}</span>`).join('')}</div>`
            : '';
        const bodyClass = muted ? 'body muted' : 'body';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            color-scheme: light dark;
        }

        html, body {
            height: 100%;
        }

        body {
            margin: 0;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
        }

        .shell {
            box-sizing: border-box;
            min-height: 100%;
            padding: 12px;
            display: grid;
            gap: 10px;
            grid-template-rows: auto auto minmax(0, 1fr) auto;
        }

        .title {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.4;
        }

        .groups {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .badge {
            padding: 2px 8px;
            border-radius: 999px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-size: 11px;
            line-height: 18px;
        }

        .body {
            line-height: 1.5;
            font-size: 12px;
            padding: 12px;
            border-radius: 8px;
            background: color-mix(in srgb, var(--vscode-editor-background) 88%, transparent);
            border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 65%, transparent);
            overflow: auto;
            min-height: 0;
        }

        .body > :first-child {
            margin-top: 0;
        }

        .body > :last-child {
            margin-bottom: 0;
        }

        .body h1,
        .body h2,
        .body h3,
        .body h4,
        .body h5,
        .body h6 {
            line-height: 1.3;
            margin: 1.1em 0 0.5em;
        }

        .body h1 {
            font-size: 1.4em;
        }

        .body h2 {
            font-size: 1.25em;
        }

        .body h3 {
            font-size: 1.12em;
        }

        .body p,
        .body ul,
        .body ol,
        .body blockquote,
        .body pre,
        .body table {
            margin: 0 0 0.9em;
        }

        .body ul,
        .body ol {
            padding-left: 1.4em;
        }

        .body li + li {
            margin-top: 0.25em;
        }

        .body blockquote {
            margin-left: 0;
            padding-left: 12px;
            border-left: 3px solid var(--vscode-textLink-foreground);
            color: var(--vscode-descriptionForeground);
        }

        .body code {
            font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
            font-size: 0.95em;
            padding: 0.1em 0.35em;
            border-radius: 4px;
            background: color-mix(in srgb, var(--vscode-textCodeBlock-background) 75%, transparent);
        }

        .body pre {
            overflow: auto;
            padding: 10px 12px;
            border-radius: 8px;
            background: var(--vscode-textCodeBlock-background);
        }

        .body pre code {
            display: block;
            padding: 0;
            background: transparent;
            white-space: pre;
        }

        .body table {
            width: 100%;
            border-collapse: collapse;
        }

        .body th,
        .body td {
            padding: 8px 10px;
            border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
            text-align: left;
            vertical-align: top;
        }

        .body th {
            font-weight: 600;
            background: color-mix(in srgb, var(--vscode-editor-background) 70%, transparent);
        }

        .body a,
        .body .link-text {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }

        .toolbar {
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
        }

        .button {
            border: 1px solid color-mix(in srgb, var(--vscode-button-border, var(--vscode-panel-border)) 80%, transparent);
            background: var(--vscode-button-secondaryBackground, transparent);
            color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            border-radius: 6px;
            padding: 6px 10px;
            cursor: pointer;
        }

        .button.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .editor {
            width: 100%;
            min-height: 260px;
            resize: vertical;
            box-sizing: border-box;
            border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 80%, transparent);
            border-radius: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            padding: 10px 12px;
            font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
            font-size: 12px;
            line-height: 1.5;
        }

        .group-select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 4px 8px;
            border-radius: 4px;
            outline: none;
            cursor: pointer;
            margin-left: auto; /* push to the right */
        }

        .muted {
            color: var(--vscode-descriptionForeground);
        }

        .hint {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="shell">
        <h3 class="title">${escapeHtml(title)}</h3>
        ${groupMarkup}
        <div class="${bodyClass}">${bodyHtml}</div>
        <div class="hint">Use Open Note when you need the note in a standalone markdown tab.</div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        const editor = document.getElementById('key-note-editor');
        const select = document.getElementById('key-note-group');
        
        if (select) {
            let previousValue = select.value;
            select.addEventListener('change', (e) => {
                if (e.target.value === '--create-new--') {
                    vscode.postMessage({ type: 'requestCreateGroup' });
                    e.target.value = previousValue; // Revert visually until re-render
                } else {
                    previousValue = e.target.value;
                }
            });
        }

        const save = () => {
            if (!editor) {
                return;
            }
            if (select && !select.value) {
                alert('Please select a key group before saving.');
                return;
            }
            vscode.postMessage({
                type: 'save',
                content: editor.value,
                groupId: select ? select.value : undefined
            });
        };

        document.querySelectorAll('[data-action]').forEach(button => {
            button.addEventListener('click', () => {
                const action = button.getAttribute('data-action');
                if (action === 'save') {
                    save();
                    return;
                }
                vscode.postMessage({ type: action });
            });
        });

        window.addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                save();
            }
        });
    </script>
</body>
</html>`;
    }
}
