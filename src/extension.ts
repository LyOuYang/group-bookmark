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
