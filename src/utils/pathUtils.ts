import * as vscode from 'vscode';
import * as path from 'path';

/**
 * 路径工具类
 */
export class PathUtils {
    /**
     * 将绝对路径转换为相对于workspace的相对路径
     */
    static toRelativePath(uri: vscode.Uri): string {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            return uri.fsPath;
        }

        const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
        // 统一使用 / 分隔符
        return relativePath.replace(/\\/g, '/');
    }

    /**
     * 将相对路径转换为绝对路径 Uri
     */
    static toAbsoluteUri(relativePath: string): vscode.Uri | null {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }

        // 将 / 转换为系统分隔符
        const systemPath = relativePath.replace(/\//g, path.sep);
        const absolutePath = path.join(workspaceFolder.uri.fsPath, systemPath);

        return vscode.Uri.file(absolutePath);
    }

    /**
     * 获取文件名（不含路径）
     */
    static getFileName(uri: vscode.Uri): string {
        return path.basename(uri.fsPath);
    }
}
