import * as fs from 'fs';
import * as readline from 'readline';

export class FileUtils {
    /**
     * 读取文件的指定行范围（1-based inclusive）
     * @param filePath 文件绝对路径
     * @param startLine 起始行号 (1-based)
     * @param endLine 结束行号 (1-based)
     */
    static async readLines(filePath: string, startLine: number, endLine: number): Promise<string[]> {
        const lines: string[] = [];
        if (startLine > endLine) {
            return lines;
        }

        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let currentLine = 0;

        for await (const line of rl) {
            currentLine++;

            if (currentLine >= startLine && currentLine <= endLine) {
                lines.push(line);
            }

            if (currentLine > endLine) {
                rl.close();
                break;
            }
        }

        return lines;
    }
}
