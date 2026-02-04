import * as vscode from 'vscode';

/**
 * 日志工具类
 */
export class Logger {
    private static outputChannel: vscode.OutputChannel | null = null;

    /**
     * 初始化日志输出通道
     */
    static initialize(): void {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('GroupBookmarks');
        }
    }

    /**
     * 记录错误日志
     */
    static error(message: string, error?: any): void {
        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : String(error);
        const stackTrace = error instanceof Error ? error.stack : '';

        const logMessage = `[ERROR] [${timestamp}] ${message}`;
        console.error(logMessage, error);

        if (this.outputChannel) {
            this.outputChannel.appendLine(logMessage);
            if (errorMessage) {
                this.outputChannel.appendLine(`  Message: ${errorMessage}`);
            }
            if (stackTrace) {
                this.outputChannel.appendLine(`  Stack: ${stackTrace}`);
            }
        }
    }

    /**
     * 记录警告日志
     */
    static warn(message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[WARN] [${timestamp}] ${message}`;
        console.warn(logMessage);

        if (this.outputChannel) {
            this.outputChannel.appendLine(logMessage);
        }
    }

    /**
     * 记录信息日志
     */
    static info(message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[INFO] [${timestamp}] ${message}`;
        console.log(logMessage);

        if (this.outputChannel) {
            this.outputChannel.appendLine(logMessage);
        }
    }

    /**
     * 显示输出通道
     */
    static show(): void {
        this.outputChannel?.show();
    }

    /**
     * 释放资源
     */
    static dispose(): void {
        this.outputChannel?.dispose();
        this.outputChannel = null;
    }
}
