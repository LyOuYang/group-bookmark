import * as vscode from 'vscode';
import { StorageService } from './data/storageService';
import { DataManager } from './data/dataManager';
import { BookmarkManager } from './core/bookmarkManager';
import { GroupManager } from './core/groupManager';
import { RelationManager } from './core/relationManager';
import { BookmarkTreeProvider } from './views/treeProvider';
import { CommandHandler } from './views/commandHandler';
import { DecorationManager } from './views/decorationManager';
import { BookmarkCodeLensProvider } from './views/codeLensProvider';
import { ImportExportService } from './services/importExportService';
import { PathUtils } from './utils/pathUtils';
import { Logger } from './utils/logger';

/**
 * 插件激活时调用
 */
export async function activate(context: vscode.ExtensionContext) {
    // 初始化日志
    Logger.initialize();
    Logger.info('GroupBookmarks extension is now active');

    try {
        // 初始化各个管理器
        const storageService = new StorageService(context);
        const dataManager = new DataManager(storageService);

        // 加载数据
        await dataManager.loadAll();

        const bookmarkManager = new BookmarkManager(dataManager);
        const groupManager = new GroupManager(dataManager);
        const relationManager = new RelationManager(dataManager);

        // 初始化 TreeView
        const treeProvider = new BookmarkTreeProvider(dataManager, groupManager, relationManager);
        const treeView = vscode.window.createTreeView('groupBookmarksView', {
            treeDataProvider: treeProvider,
            showCollapseAll: true
        });

        context.subscriptions.push(treeView);

        // 初始化命令处理器
        const commandHandler = new CommandHandler(
            bookmarkManager,
            groupManager,
            relationManager,
            treeProvider
        );

        commandHandler.registerCommands(context);

        // 初始化 DecorationManager
        const decorationManager = new DecorationManager(dataManager, groupManager, relationManager);
        context.subscriptions.push({
            dispose: () => decorationManager.dispose()
        });

        // 初始化 CodeLens Provider（根据配置）
        const config = vscode.workspace.getConfiguration('groupBookmarks');
        const showCodeLens = config.get<boolean>('showCodeLens', false);

        if (showCodeLens) {
            const codeLensProvider = new BookmarkCodeLensProvider(dataManager, relationManager);
            context.subscriptions.push(
                vscode.languages.registerCodeLensProvider(
                    { scheme: 'file' },
                    codeLensProvider
                )
            );
            Logger.info('CodeLens Provider registered');
        }

        // 监听配置变化，动态启用/禁用 CodeLens
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('groupBookmarks.showCodeLens')) {
                    vscode.window.showInformationMessage(
                        'CodeLens setting changed. Please reload the window to apply changes.',
                        'Reload'
                    ).then(selection => {
                        if (selection === 'Reload') {
                            vscode.commands.executeCommand('workbench.action.reloadWindow');
                        }
                    });
                }
            })
        );

        // 初始化导入导出服务
        const importExportService = new ImportExportService(storageService, dataManager);

        // 注册导入导出命令
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.exportBookmarks', () =>
                importExportService.exportBookmarks()
            )
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.importBookmarks', () =>
                importExportService.importBookmarks()
            )
        );

        // 注册切换 Gutter 装饰的命令
        context.subscriptions.push(
            vscode.commands.registerCommand('groupBookmarks.toggleGutterDecorations', () => {
                decorationManager.toggle();
                vscode.window.showInformationMessage('Gutter decorations toggled');
            })
        );

        // 注册文件监听
        context.subscriptions.push(
            vscode.workspace.onDidRenameFiles(async (event) => {
                for (const file of event.files) {
                    const oldPath = PathUtils.toRelativePath(file.oldUri);
                    const newPath = PathUtils.toRelativePath(file.newUri);
                    await bookmarkManager.updateBookmarkPath(oldPath, newPath);
                }
            })
        );

        // 监听文本内容变化，处理书签行号自动更新
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(async (event) => {
                const relativePath = PathUtils.toRelativePath(event.document.uri);

                // 仅处理包含书签的文件
                const bookmarks = bookmarkManager.getBookmarksForFile(relativePath);
                if (bookmarks.length === 0 || event.contentChanges.length === 0) {
                    return;
                }

                // 按倒序处理变更（虽然 VS CodeAPI 通常是一个个发，但以防万一）
                // 实际上 onDidChangeTextDocument 每次触发可能包含多个 changes
                // 为了简单且安全，我们假设一次只处理一个主要的行变更，或者简单的 Delta 累加
                // 注意：VS Code 的 contentChanges 数组是根据 range 倒序排列的

                for (const change of event.contentChanges) {
                    const linesAdded = change.text.split('\n').length - 1;
                    const linesDeleted = change.range.end.line - change.range.start.line;
                    const netChange = linesAdded - linesDeleted;

                    if (netChange === 0) {
                        continue;
                    }

                    // 移动书签
                    // bookmark.line 是 1-indexed
                    // change.range.start.line 是 0-indexed

                    let threshold = change.range.start.line;
                    const isStartOfLine = change.range.start.character === 0;

                    if (!isStartOfLine && netChange > 0) {
                        // 非行首插入，阈值+1，保护当前行不被移动
                        threshold += 1;
                    }

                    await bookmarkManager.shiftBookmarks(
                        relativePath,
                        threshold,
                        netChange
                    );
                }
            })
        );

        context.subscriptions.push(
            vscode.workspace.onDidDeleteFiles(async (event) => {
                for (const uri of event.files) {
                    const relativePath = PathUtils.toRelativePath(uri);
                    await bookmarkManager.handleFileDeleted(relativePath);
                }
            })
        );

        vscode.window.showInformationMessage('GroupBookmarks is ready!');
    } catch (error) {
        Logger.error('Failed to activate GroupBookmarks', error);
        vscode.window.showErrorMessage(
            `Failed to activate GroupBookmarks: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

/**
 * 插件停用时调用
 */
export function deactivate() {
    Logger.info('GroupBookmarks extension is now deactivated');
    Logger.dispose();
}
