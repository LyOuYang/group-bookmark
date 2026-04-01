import * as vscode from 'vscode';
import { Bookmark, Group, GroupColor } from '../models/types';
import { BookmarkManager } from '../core/bookmarkManager';
import { GroupManager } from '../core/groupManager';
import { RelationManager } from '../core/relationManager';
import { BookmarkTreeProvider } from '../views/treeProvider';
import { PathUtils } from '../utils/pathUtils';
import { Logger } from '../utils/logger';

type ViewTreeItem = {
    dataId?: string;
};

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
            vscode.commands.registerCommand('groupBookmarks.addBookmark', () => this.addBookmarkWithQuickPick())
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
            vscode.commands.registerCommand('groupBookmarks.deleteBookmark', (item: ViewTreeItem) =>
                this.deleteBookmark(item)
            )
        );

        // 删除分组
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.deleteGroup', (item: ViewTreeItem) =>
                this.deleteGroup(item)
            )
        );

        // 重命名分组
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.renameGroup', (item: ViewTreeItem) =>
                this.renameGroup(item)
            )
        );

        // 重命名书签
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.renameBookmark', (item: ViewTreeItem) =>
                this.renameBookmark(item)
            )
        );

        // 切换分组 Ghost Text 显示
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.toggleGroupGhostText', (item: ViewTreeItem) =>
                this.toggleGroupGhostText(item)
            )
        );

        // 设置活动分组
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.setActiveGroup', (item: ViewTreeItem) =>
                this.setActiveGroup(item)
            )
        );

        // 取消活动分组
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.unsetActiveGroup', (item: ViewTreeItem) =>
                this.setActiveGroup(item)
            )
        );
        // 上移书签
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.moveUp', (item: ViewTreeItem) =>
                this.moveBookmark(item, 'up')
            )
        );

        // 下移书签
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.moveDown', (item: ViewTreeItem) =>
                this.moveBookmark(item, 'down')
            )
        );

        // 移到顶部
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.moveToTop', (item: ViewTreeItem) =>
                this.moveBookmark(item, 'top')
            )
        );

        // 移到底部
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.moveToBottom', (item: ViewTreeItem) =>
                this.moveBookmark(item, 'bottom')
            )
        );

        // 移动到其他分组
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.moveBookmarkToGroup', (item: ViewTreeItem) =>
                this.moveBookmarkToGroup(item)
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
     * 设置为活动分组
     */
    private async setActiveGroup(item: ViewTreeItem): Promise<void> {
        if (!item?.dataId) {return;}

        const group = this.groupManager.getGroupById(item.dataId);
        if (group) {
            // 支持 Toggle 逻辑
            const currentActive = this.groupManager.getActiveGroupId();
            if (currentActive === group.id) {
                await this.groupManager.setActiveGroup(undefined);
                vscode.window.showInformationMessage('📌 Active group cleared');
            } else {
                await this.groupManager.setActiveGroup(group.id);
                vscode.window.showInformationMessage(`📌 Active group set to "${group.name}"`);
            }
        }
    }

    /**
     * 添加书签流程入口
     */
    private async addBookmarkWithQuickPick(forcePickGroup = false): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        // 1. 获取上下文信息
        const position = editor.selection.active;
        const lineText = editor.document.lineAt(position.line).text.trim();
        const fileUri = PathUtils.toRelativePath(editor.document.uri);

        // 2. 高亮当前行
        const highlightDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            isWholeLine: true,
        });
        editor.setDecorations(highlightDecoration, [
            new vscode.Range(position.line, 0, position.line, 0),
        ]);

        try {
            let targetGroup: Group | undefined;

            // 1. 尝试获取 Active Group (除非强制选组)
            if (!forcePickGroup) {
                const activeGroupId = this.groupManager.getActiveGroupId();
                if (activeGroupId) {
                    targetGroup = this.groupManager.getGroupById(activeGroupId);
                }
            }

            // 如果没有有效的活动分组，或者用户需要切换，则显示选择器
            // 2. 交互循环
            let shouldRestart = true;
            while (shouldRestart) {
                shouldRestart = false;
                // 如果没有目标分组，进入选组环节
                if (!targetGroup) {
                    targetGroup = await this.pickGroup();
                    // 如果选组取消，则整个流程结束
                    if (!targetGroup) {return;}
                }

                // 进入标题输入环节
                const line = position.line + 1;
                const title = await this.inputBookmarkTitle(targetGroup, lineText, line);

                // title 为 null 表示用户按 Esc 取消
                if (title === null) {
                    return;
                }

                // title 为 undefined 表示用户按了 Back 按钮 -> 重置分组，循环重来
                if (title === undefined) {
                    targetGroup = undefined;
                    shouldRestart = true;
                    continue;
                }

                // 成功：创建书签
                await this.createBookmarkInGroup(fileUri, position, title, targetGroup);
                break; // 退出循环
            }
        } finally {
            highlightDecoration.dispose();
        }
    }

    /**
     * 选择分组
     */
    private async pickGroup(): Promise<Group | undefined> {
        return new Promise((resolve) => {
            const groups = this.groupManager.getAllGroups();
            const activeGroupId = this.groupManager.getActiveGroupId();

            interface GroupPickItem extends vscode.QuickPickItem {
                groupId?: string;
                action?: 'create' | 'create_custom';
            }

            const quickPick = vscode.window.createQuickPick<GroupPickItem>();
            quickPick.placeholder = 'Select Group (Type to filter or create new)';
            quickPick.title = '📌 Step 1/2: Select Group';
            quickPick.matchOnDescription = true;
            quickPick.matchOnDetail = true;

            let isResolved = false;

            // 生成列表项函数
            const getItems = (input: string): GroupPickItem[] => {
                const items: GroupPickItem[] = groups.map(g => ({
                    label: `$(bookmark) ${g.displayName}`,
                    description: g.id === activeGroupId ? '(Active)' : '',
                    groupId: g.id
                }));

                const trimmedInput = input.trim();

                // 只有当输入不为空，且没有完全匹配现有分组名时，才显示快速创建选项
                const exactMatch = groups.some(g => g.name.toLowerCase() === trimmedInput.toLowerCase());

                const createOptions: GroupPickItem[] = [];

                if (trimmedInput && !exactMatch) {
                    createOptions.push({
                        label: `$(add) Create group "${trimmedInput}"`,
                        description: 'Select color next',
                        alwaysShow: true,
                        action: 'create'
                    });
                }

                // 始终显示高级创建选项
                createOptions.push({
                    label: '$(plus) Create New Group...',
                    description: 'Custom name & color',
                    alwaysShow: true,
                    action: 'create_custom'
                });

                return [...items, ...createOptions];
            };

            quickPick.items = getItems('');

            // 监听输入变化
            quickPick.onDidChangeValue(value => {
                quickPick.items = getItems(value);
            });

            // 监听接受事件
            quickPick.onDidAccept(async () => {
                const selected = quickPick.selectedItems[0];
                if (selected) {
                    isResolved = true; // 标记已解决，防止 hide 触发 resolve(undefined)
                    quickPick.hide();

                    if (selected.action === 'create') {
                        // 快速创建 (使用输入值作为名称，但询问颜色)
                        const name = quickPick.value.trim();
                        const newGroup = await this.createGroup(name);
                        resolve(newGroup);
                    } else if (selected.action === 'create_custom') {
                        // 完全自定义创建
                        const newGroup = await this.createGroup();
                        resolve(newGroup);
                    } else {
                        // 选择了现有分组
                        resolve(this.groupManager.getGroupById(selected.groupId!));
                    }
                }
            });

            quickPick.onDidHide(() => {
                if (!isResolved) {
                    resolve(undefined);
                }
                quickPick.dispose();
            });

            quickPick.show();
        });
    }

    /**
     * 输入标题
     * 返回 string: 标题
     * 返回 null: 取消
     * 返回 undefined: 回退（Change Group）
     */
    private async inputBookmarkTitle(group: Group, defaultText: string, line: number): Promise<string | null | undefined> {
        // 创建 InputBox 以支持 Buttons
        const inputBox = vscode.window.createInputBox();
        inputBox.title = `📌 Add to "${group.name}" (Line ${line})`;
        inputBox.placeholder = `Enter title (Default: ${defaultText.slice(0, 30)}...)`;
        inputBox.value = ''; // 空白，用户偏好
        inputBox.buttons = [
            { iconPath: new vscode.ThemeIcon('arrow-left'), tooltip: 'Change Group' }
        ];

        return new Promise((resolve) => {
            inputBox.onDidAccept(() => {
                const value = inputBox.value.trim() || defaultText.slice(0, 50);
                inputBox.hide();
                resolve(value);
            });

            inputBox.onDidTriggerButton(() => {
                inputBox.hide();
                resolve(undefined); // Back
            });

            inputBox.onDidHide(() => {
                resolve(null); // Cancel (if managed by hide)
                // 注意：accept/triggerButton hide 也会触发 onDidHide。
                // 需要 flag 区分。
            });

            inputBox.show();
        });
    }

    /**
     * 创建书签逻辑封装
     */
    private async createBookmarkInGroup(fileUri: string, position: vscode.Position, title: string, group: Group): Promise<void> {
        try {
            const bookmark = await this.bookmarkManager.createBookmark(
                fileUri,
                position.line + 1,
                position.character
            );

            await this.relationManager.addBookmarkToGroup(
                bookmark.id,
                group.id,
                title
            );

            // 自动设置为活动分组 (Auto-set Active Group)
            // 这样下次用户操作时，会默认使用此分组，实现连续操作体验
            await this.groupManager.setActiveGroup(group.id);

            vscode.window.setStatusBarMessage(`✅ Bookmark added to ${group.name}`, 3000);
        } catch (error) {
            Logger.error('创建书签失败', error);
            vscode.window.showErrorMessage('Failed to create bookmark');
        }
    }

    /**
     * 创建分组
     * @param defaultName 可选的预填名称。如果提供，跳过名称输入步骤。
     * @returns 创建的分组，如果取消则返回 undefined
     */
    private async createGroup(defaultName?: string): Promise<Group | undefined> {
        let name = defaultName;

        if (!name) {
            name = await vscode.window.showInputBox({
                prompt: 'Enter group name',
                placeHolder: 'Group name'
            });
        }

        if (!name) {
            return undefined;
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
            placeHolder: `Select color for "${name}"`
        });

        if (!selectedColor) {
            return undefined;
        }

        try {
            const group = await this.groupManager.createGroup(name, selectedColor.color);

            // Auto-activate the new group for better UX
            await this.groupManager.setActiveGroup(group.id);

            vscode.window.showInformationMessage(`Group "${name}" created and set as active 📌`);
            return group;
        } catch (error) {
            Logger.error('Failed to create group', error);
            vscode.window.showErrorMessage(
                `Failed to create group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return undefined;
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
    private async deleteBookmark(item: ViewTreeItem): Promise<void> {
        if (!item.dataId) {
            Logger.error('Invalid bookmark item', { item });
            vscode.window.showErrorMessage('Invalid bookmark item');
            return;
        }

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
    private async deleteGroup(item: ViewTreeItem): Promise<void> {
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
    private async renameGroup(item: ViewTreeItem): Promise<void> {
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

    /**
     * 切换分组 Ghost Text 显示
     */
    private async toggleGroupGhostText(item: ViewTreeItem): Promise<void> {
        if (!item?.dataId) {return;}
        const groupId = item.dataId;

        try {
            await this.groupManager.toggleGroupGhostText(groupId);
            // 触发数据更新，视图自动刷新
        } catch (error) {
            Logger.error('Failed to toggle group ghost text', error);
        }
    }

    /**
     * 重命名书签
     */
    private async renameBookmark(item: ViewTreeItem): Promise<void> {
        if (!item?.dataId) {
            Logger.error('Invalid bookmark item', { item });
            vscode.window.showErrorMessage('Invalid bookmark item');
            return;
        }

        // item.dataId 是 relation.id (bookmarkId_groupId)
        const parts = item.dataId.split('_');
        if (parts.length !== 2) {
            Logger.error('Invalid bookmark ID format', { dataId: item.dataId });
            vscode.window.showErrorMessage('Invalid bookmark ID format');
            return;
        }
        const [bookmarkId, groupId] = parts;

        // 获取当前关系
        const relations = this.relationManager.getRelationsInGroup(groupId);
        const relation = relations.find(r => r.id === item.dataId);

        if (!relation) {
            vscode.window.showErrorMessage('Bookmark not found');
            return;
        }

        // 弹出输入框让用户输入新标题
        const newTitle = await vscode.window.showInputBox({
            prompt: 'Enter new bookmark title',
            value: relation.title,
            placeHolder: 'Bookmark title'
        });

        // 用户取消或输入空标题
        if (!newTitle || newTitle.trim() === '') {
            return;
        }

        // 标题没有变化
        if (newTitle === relation.title) {
            return;
        }

        try {
            await this.relationManager.updateBookmarkTitle(bookmarkId, groupId, newTitle);
            vscode.window.showInformationMessage(`Bookmark renamed to "${newTitle}"`);
        } catch (error) {
            Logger.error('Failed to rename bookmark', error);
            vscode.window.showErrorMessage(
                `Failed to rename bookmark: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * 移动书签（上移/下移/移到顶部/移到底部）
     */
    private async moveBookmark(item: ViewTreeItem, direction: 'up' | 'down' | 'top' | 'bottom'): Promise<void> {
        if (!item?.dataId) {return;}

        // item.dataId 是 relation.id (bookmarkId_groupId)
        const parts = item.dataId.split('_');
        const groupId = parts[1];

        if (!groupId) {return;}

        try {
            const relations = this.relationManager.getRelationsInGroup(groupId);
            const index = relations.findIndex(r => r.id === item.dataId);

            if (index === -1) {return;}

            const newRelations = [...relations];

            if (direction === 'up') {
                if (index > 0) {
                    [newRelations[index - 1], newRelations[index]] = [newRelations[index], newRelations[index - 1]];
                }
            } else if (direction === 'down') {
                if (index < newRelations.length - 1) {
                    [newRelations[index], newRelations[index + 1]] = [newRelations[index + 1], newRelations[index]];
                }
            } else if (direction === 'top') {
                // 移到顶部：将当前项移到数组开头
                if (index > 0) {
                    const [rel] = newRelations.splice(index, 1);
                    newRelations.unshift(rel);
                }
            } else if (direction === 'bottom') {
                // 移到底部：将当前项移到数组末尾
                if (index < newRelations.length - 1) {
                    const [rel] = newRelations.splice(index, 1);
                    newRelations.push(rel);
                }
            }

            // 获取新的 ID 顺序
            const orderedIds = newRelations.map(r => r.id);
            await this.relationManager.reorderRelations(groupId, orderedIds);

            // 保持焦点? TreeView 可能会刷新导致失去焦点，但 VS Code 通常会尝试保持
        } catch (error) {
            Logger.error('Failed to move bookmark', error);
        }
    }

    /**
     * 移动书签到另一个分组
     */
    private async moveBookmarkToGroup(item: ViewTreeItem): Promise<void> {
        if (!item?.dataId) {
            vscode.window.showErrorMessage('Invalid bookmark item');
            return;
        }

        const parts = item.dataId.split('_');
        if (parts.length !== 2) {
            vscode.window.showErrorMessage('Invalid bookmark ID format');
            return;
        }
        const [bookmarkId, currentGroupId] = parts;

        const allGroups = this.groupManager.getAllGroups();
        const availableGroups = allGroups.filter(g => g.id !== currentGroupId);

        if (availableGroups.length === 0) {
            vscode.window.showWarningMessage('No other groups available');
            return;
        }

        const groupItems = availableGroups.map(g => ({
            label: `$(bookmark) ${g.name}`,
            groupId: g.id
        }));

        const selectedGroup = await vscode.window.showQuickPick(groupItems, {
            placeHolder: 'Select target group to move bookmark to'
        });

        if (!selectedGroup) {
            return;
        }

        try {
            await this.relationManager.moveBookmarkToGroup(bookmarkId, currentGroupId, selectedGroup.groupId);
            vscode.window.showInformationMessage(`Bookmark moved successfully`);
        } catch (error) {
            Logger.error('Failed to move bookmark to group', error);
            vscode.window.showErrorMessage(
                `Failed to move bookmark to group: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }
}
