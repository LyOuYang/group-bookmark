import * as vscode from 'vscode';
import * as path from 'path';

/**
 * 路径工具类
 */
export class PathUtils {
    /**
     * 将绝对路径转换为相对于workspace的相对路径
     * 格式：
     * - 单工作区：relative/path/to/file.ext
     * - 多工作区：[WorkspaceName]:relative/path/to/file.ext
     */
    static toRelativePath(uri: vscode.Uri): string {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            return uri.fsPath;
        }

        const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
        // 统一使用 / 分隔符
        const normalizedPath = relativePath.replace(/\\/g, '/');

        // 如果是多工作区环境，添加工作区名称前缀
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 1) {
            const workspaceName = workspaceFolder.name;
            return `[${workspaceName}]:${normalizedPath}`;
        }

        return normalizedPath;
    }

    /**
     * 将相对路径转换为绝对路径 Uri
     * 支持格式：
     * - 相对路径：relative/path/to/file.ext (使用第一个工作区)
     * - 工作区前缀：[WorkspaceName]:relative/path/to/file.ext
     */
    static toAbsoluteUri(relativePath: string): vscode.Uri | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return null;
        }

        let targetFolder: vscode.WorkspaceFolder | undefined;
        let pathWithoutPrefix: string;

        // 检查是否包含工作区前缀 [WorkspaceName]:
        const prefixMatch = relativePath.match(/^\[([^\]]+)\]:(.+)$/);
        if (prefixMatch) {
            // 格式：[WorkspaceName]:path
            const workspaceName = prefixMatch[1];
            pathWithoutPrefix = prefixMatch[2];

            // 查找对应的工作区
            targetFolder = workspaceFolders.find(folder => folder.name === workspaceName);
            if (!targetFolder) {
                // 如果找不到指定工作区，返回 null
                console.warn(`Workspace "${workspaceName}" not found for path: ${relativePath}`);
                return null;
            }
        } else {
            // 没有前缀，使用第一个工作区（向后兼容）
            targetFolder = workspaceFolders[0];
            pathWithoutPrefix = relativePath;
        }

        // 将 / 转换为系统分隔符
        const systemPath = pathWithoutPrefix.replace(/\//g, path.sep);
        const absolutePath = path.join(targetFolder.uri.fsPath, systemPath);

        return vscode.Uri.file(absolutePath);
    }

    /**
     * 获取文件名（不含路径）
     */
    static getFileName(uri: vscode.Uri): string {
        return path.basename(uri.fsPath);
    }
}
