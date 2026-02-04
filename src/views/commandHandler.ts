import * as vscode from 'vscode';
import { Bookmark } from '../models/types';
import { BookmarkManager } from '../core/bookmarkManager';
import { GroupManager } from '../core/groupManager';
import { RelationManager } from '../core/relationManager';
import { BookmarkTreeProvider } from '../views/treeProvider';
import { GroupColor } from '../models/types';
import { PathUtils } from '../utils/pathUtils';
import { Logger } from '../utils/logger';

/**
 * 命令处理器 - 处理所有用户命令
 */
export class CommandHandler {
    private lastUsedGroupId?: string;  // 记忆上次使用的分组

    constructor(
        private bookmarkManager: BookmarkManager,
        private groupManager: GroupManager,
        private relationManager: RelationManager,
        private treeProvider: BookmarkTreeProvider
    ) { }

    /**
     * 注册所有命令
     */
    registerCommands(context: vscode.ExtensionContext): void {
        // 添加书签（快捷键）
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.addBookmark', () => this.addBookmark())
        );

        // 添加书签（右键菜单 - 使用 QuickPick）
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.addBookmarkMenu', () => this.addBookmarkWithQuickPick())
        );

        // 创建分组
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.createGroup', () => this.createGroup())
        );

        // 跳转到书签
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.jumpToBookmark', (bookmark: Bookmark) =>
                this.jumpToBookmark(bookmark)
            )
        );

        // 删除书签
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.deleteBookmark', (item: any) =>
                this.deleteBookmark(item)
            )
        );

        // 删除分组
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.deleteGroup', (item: any) =>
                this.deleteGroup(item)
            )
        );

        // 重命名分组
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.renameGroup', (item: any) =>
                this.renameGroup(item)
            )
        );
    }

    /**
     * 添加书签
     */
    private async addBookmark(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        // 获取当前光标位置
        const position = editor.selection.active;
        const fileUri = PathUtils.toRelativePath(editor.document.uri);

        // 选择分组
        const groups = this.groupManager.getAllGroups();
        if (groups.length === 0) {
            const createGroup = await vscode.window.showInformationMessage(
                'No groups found. Create a group first?',
                'Create Group'
            );
            if (createGroup) {
                await this.createGroup();
                // 递归调用，重新选择分组
                return this.addBookmark();
            }
            return;
        }

        const groupItems = groups.map(g => ({
            label: g.name,
            description: `${this.groupManager.getBookmarkCountInGroup(g.id)} bookmarks`,
            groupId: g.id
        }));

        const selectedGroup = await vscode.window.showQuickPick(groupItems, {
            placeHolder: 'Select a group'
        });

        if (!selectedGroup) {
            return;
        }

        // 获取当前行文本作为默认标题
        const lineText = editor.document.lineAt(position.line).text.trim();
        const defaultTitle = lineText.slice(0, 50);

        // 输入标题
        const title = await vscode.window.showInputBox({
            prompt: 'Enter bookmark title',
            value: defaultTitle,
            placeHolder: 'Bookmark title'
        });

        if (title === undefined) {
            return;
        }

        try {
            // 创建书签
            const bookmark = await this.bookmarkManager.createBookmark(
                fileUri,
                position.line + 1, // VS Code 使用 0-indexed，我们存储 1-indexed
                position.character
            );

            // 添加到分组
            await this.relationManager.addBookmarkToGroup(
                bookmark.id,
                selectedGroup.groupId,
                title || defaultTitle
            );

            vscode.window.showInformationMessage(`Bookmark "${title}" added`);
        } catch (error) {
            Logger.error('Failed to add bookmark', error);
            vscode.window.showErrorMessage(
                `Failed to add bookmark: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * 添加书签（使用 QuickPick 居中弹窗）
     */
    private async addBookmarkWithQuickPick(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        // 获取当前光标位置
        const position = editor.selection.active;
        const line = position.line + 1; // 显示用（1-indexed）
        const lineText = editor.document.lineAt(position.line).text.trim();
        const fileUri = PathUtils.toRelativePath(editor.document.uri);

        // 检查分组
        const groups = this.groupManager.getAllGroups();
        if (groups.length === 0) {
            const createGroup = await vscode.window.showInformationMessage(
                'No groups found. Create a group first?',
                'Create Group'
            );
            if (createGroup) {
                await this.createGroup();
                return this.addBookmarkWithQuickPick(); // 递归调用
            }
            return;
        }

        // 1. 高亮当前行
        const highlightDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            isWholeLine: true,
        });
        editor.setDecorations(highlightDecoration, [
            new vscode.Range(position.line, 0, position.line, 0),
        ]);

        // 2. 创建 QuickPick
        interface GroupQuickPickItem extends vscode.QuickPickItem {
            groupId: string;
        }

        const quickPick = vscode.window.createQuickPick<GroupQuickPickItem>();
        quickPick.title = `📌 Add bookmark (Line ${line})`;
        quickPick.placeholder = `Select group (↑/↓) | Enter title or press Enter to use: "${lineText.slice(0, 30)}..."`;
        quickPick.value = lineText.slice(0, 60); // 预填充当前行代码
        quickPick.ignoreFocusOut = true;

        // 3. 设置分组列表
        quickPick.items = groups.map(g => ({
            label: `$(bookmark) ${g.displayName}`,
            description: `${this.groupManager.getBookmarkCountInGroup(g.id)} bookmarks`,
            detail: `Color: ${g.color}`,
            groupId: g.id,
        }));

        // 4. 默认选中上次使用的分组
        if (this.lastUsedGroupId) {
            const lastGroupIndex = groups.findIndex(g => g.id === this.lastUsedGroupId);
            if (lastGroupIndex >= 0) {
                quickPick.activeItems = [quickPick.items[lastGroupIndex]];
            }
        } else if (groups.length > 0) {
            quickPick.activeItems = [quickPick.items[0]];
        }

        // 5. 监听选择变化（更新标题显示当前分组）
        quickPick.onDidChangeSelection(items => {
            if (items.length > 0) {
                const selectedGroupId = items[0].groupId;
                const selectedGroup = groups.find(g => g.id === selectedGroupId);
                if (selectedGroup) {
                    quickPick.title = `📌 Add to "${selectedGroup.displayName}" (Line ${line})`;
                }
            }
        });

        // 6. 监听确认（Enter 键）
        quickPick.onDidAccept(async () => {
            const selectedItem = quickPick.selectedItems[0];
            const title = quickPick.value.trim();

            if (!selectedItem) {
                vscode.window.showWarningMessage('Please select a group');
                return;
            }

            if (!title) {
                vscode.window.showWarningMessage('Bookmark title cannot be empty');
                return;
            }

            quickPick.hide();

            try {
                // 创建书签
                const bookmark = await this.bookmarkManager.createBookmark(
                    fileUri,
                    line, // 已经是 1-indexed
                    position.character
                );

                // 添加到分组
                await this.relationManager.addBookmarkToGroup(
                    bookmark.id,
                    selectedItem.groupId,
                    title
                );

                // 记忆上次使用的分组
                this.lastUsedGroupId = selectedItem.groupId;

                const selectedGroup = groups.find(g => g.id === selectedItem.groupId);
                vscode.window.showInformationMessage(
                    `✅ Bookmark "${title}" added to ${selectedGroup?.displayName}`
                );
            } catch (error) {
                Logger.error('Failed to add bookmark', error);
                vscode.window.showErrorMessage(
                    `Failed to add bookmark: ${error instanceof Error ? error.message : 'Unknown error'}`
                );
            }
        });

        // 7. 监听取消（Esc 键）
        quickPick.onDidHide(() => {
            highlightDecoration.dispose();
            quickPick.dispose();
        });

        // 8. 显示弹窗
        quickPick.show();
    }

    /**
     * 创建分组
     */
    private async createGroup(): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter group name',
            placeHolder: 'Group name'
        });

        if (!name) {
            return;
        }

        // 选择颜色
        const colors = [
            { label: '🔴 Red', color: GroupColor.Red },
            { label: '🟠 Orange', color: GroupColor.Orange },
            { label: '🟡 Yellow', color: GroupColor.Yellow },
            { label: '🟢 Green', color: GroupColor.Green },
            { label: '🔵 Blue', color: GroupColor.Blue },
            { label: '🟣 Purple', color: GroupColor.Purple },
            { label: '🔴 Pink', color: GroupColor.Pink },
            { label: '⚫ Gray', color: GroupColor.Gray }
        ];

        const selectedColor = await vscode.window.showQuickPick(colors, {
            placeHolder: 'Select a color'
        });

        if (!selectedColor) {
            return;
        }

        try {
            await this.groupManager.createGroup(name, selectedColor.color);
            vscode.window.showInformationMessage(`Group "${name}" created`);
        } catch (error) {
            Logger.error('Failed to create group', error);
            vscode.window.showErrorMessage(
                `Failed to create group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * 跳转到书签
     */
    private async jumpToBookmark(bookmark: Bookmark): Promise<void> {
        const uri = PathUtils.toAbsoluteUri(bookmark.fileUri);
        if (!uri) {
            vscode.window.showErrorMessage('Cannot resolve bookmark path');
            return;
        }

        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);

            // 跳转到指定位置（转换为 0-indexed）
            const position = new vscode.Position(bookmark.line - 1, bookmark.column);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        } catch (error) {
            Logger.error('Failed to jump to bookmark', error);
            vscode.window.showErrorMessage(
                `Failed to jump to bookmark: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * 删除书签
     */
    private async deleteBookmark(item: any): Promise<void> {
        // item.dataId 是 relation.id (bookmarkId_groupId)
        const parts = item.dataId.split('_');
        if (parts.length !== 2) {
            Logger.error('Invalid bookmark ID format', { dataId: item.dataId });
            vscode.window.showErrorMessage('Invalid bookmark ID format');
            return;
        }
        const [bookmarkId, groupId] = parts;

        const confirm = await vscode.window.showWarningMessage(
            'Delete this bookmark from the group?',
            'Delete',
            'Cancel'
        );

        if (confirm !== 'Delete') {
            return;
        }

        try {
            await this.relationManager.removeBookmarkFromGroup(bookmarkId, groupId);
            vscode.window.showInformationMessage('Bookmark deleted');
        } catch (error) {
            Logger.error('Failed to delete bookmark', error);
            vscode.window.showErrorMessage(
                `Failed to delete bookmark: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * 删除分组
     */
    private async deleteGroup(item: any): Promise<void> {
        if (!item.dataId) {
            Logger.error('Invalid group item', { item });
            vscode.window.showErrorMessage('Invalid group item');
            return;
        }
        const groupId = item.dataId;
        const group = this.groupManager.getGroupById(groupId);

        if (!group) {
            return;
        }

        const count = this.groupManager.getBookmarkCountInGroup(groupId);
        const confirm = await vscode.window.showWarningMessage(
            `Delete group "${group.name}" with ${count} bookmarks?`,
            'Delete',
            'Cancel'
        );

        if (confirm !== 'Delete') {
            return;
        }

        try {
            await this.groupManager.deleteGroup(groupId);
            vscode.window.showInformationMessage(`Group "${group.name}" deleted`);
        } catch (error) {
            Logger.error('Failed to delete group', error);
            vscode.window.showErrorMessage(
                `Failed to delete group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * 重命名分组
     */
    private async renameGroup(item: any): Promise<void> {
        if (!item.dataId) {
            Logger.error('Invalid group item', { item });
            vscode.window.showErrorMessage('Invalid group item');
            return;
        }
        const groupId = item.dataId;
        const group = this.groupManager.getGroupById(groupId);

        if (!group) {
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new group name',
            value: group.name
        });

        if (!newName || newName === group.name) {
            return;
        }

        try {
            await this.groupManager.renameGroup(groupId, newName);
            vscode.window.showInformationMessage(`Group renamed to "${newName}"`);
        } catch (error) {
            Logger.error('Failed to rename group', error);
            vscode.window.showErrorMessage(
                `Failed to rename group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}
