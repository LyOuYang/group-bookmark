# 架构设计文档｜GroupBookmarks VS Code 插件

## 文档信息

**项目名称**：GroupBookmarks - VS Code 分组书签插件  
**文档版本**：v1.0  
**创建日期**：2026-02-03  
**架构师**：技术架构师  
**关联文档**：[PRD 终版](./prd_final.md)

---

## 1. 技术选型

### 1.1 开发语言

#### 推荐方案：TypeScript

**选择理由**：

| 因素         | 说明                                               |
| ------------ | -------------------------------------------------- |
| **官方标准** | VS Code 插件官方推荐语言，API 类型定义完整         |
| **类型安全** | 编译时类型检查，减少运行时错误                     |
| **开发体验** | VS Code 对 TypeScript 有最佳支持（智能提示、重构） |
| **社区生态** | 所有主流 VS Code 插件都使用 TypeScript             |
| **可维护性** | 接口定义清晰，代码可读性高                         |

**版本要求**：
- TypeScript: `^5.3.0`（最新稳定版）
- Node.js: `^18.x`（LTS 版本）
- VS Code Engine: `^1.85.0`

---

### 1.2 构建工具链

#### 打包工具：**esbuild**

**对比分析**：

| 工具          | 优点                                                                     | 缺点             | 适用场景             |
| ------------- | ------------------------------------------------------------------------ | ---------------- | -------------------- |
| **esbuild** ⭐ | 极快的构建速度（100x vs webpack）<br>零配置开箱即用<br>内置 Tree Shaking | 生态较新，插件少 | **小型插件**（推荐） |
| Webpack       | 生态成熟，插件丰富                                                       | 构建慢，配置复杂 | 大型复杂项目         |
| Rollup        | 适合库打包                                                               | 配置相对复杂     | 开源库               |

**推荐配置**：
```json
{
  "scripts": {
    "compile": "esbuild ./src/extension.ts --bundle --outfile=out/extension.js --external:vscode --format=cjs --platform=node",
    "watch": "npm run compile -- --watch",
    "package": "vsce package"
  }
}
```

---

#### 代码规范：**ESLint + Prettier**

```json
{
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.50.0",
    "prettier": "^3.0.0"
  }
}
```

---

### 1.3 核心依赖库

#### VS Code 官方 API

```json
{
  "engines": {
    "vscode": "^1.85.0"
  },
  "dependencies": {
    "@types/vscode": "^1.85.0"
  }
}
```

#### 工具库

| 库名                         | 版本     | 用途                      |
| ---------------------------- | -------- | ------------------------- |
| `uuid`                       | `^9.0.0` | 生成书签和分组的唯一 ID   |
| `fast-json-stable-stringify` | `^2.1.0` | JSON 序列化（保证键顺序） |

**不推荐额外依赖**：
- ❌ Lodash（过重，使用原生 ES6+ 特性替代）
- ❌ Moment.js（使用原生 `Date` 或 `Intl.DateTimeFormat`）

---

### 1.4 开发辅助工具

| 工具                    | 用途         |
| ----------------------- | ------------ |
| `@vscode/test-electron` | 插件集成测试 |
| `mocha`                 | 单元测试框架 |
| `chai`                  | 断言库       |
| `nyc`                   | 代码覆盖率   |

---

## 2. 系统架构设计

### 2.1 整体架构

采用**分层 + 模块化架构**，遵循单一职责原则：

```
┌─────────────────────────────────────────────────────────┐
│                    Extension 入口层                      │
│  extension.ts - 插件激活、命令注册、生命周期管理          │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
┌────────▼────────┐    ┌────────▼────────┐
│  UI 层（View）   │    │  数据层（Data）  │
│ =============== │    │ =============== │
│ - TreeView      │◄───┤ - DataManager   │
│ - Decoration    │    │ - StorageService│
│ - QuickPick     │    │ - FileWatcher   │
└────────┬────────┘    └────────┬────────┘
         │                      │
         │    ┌────────────────┐│
         └────►  业务层（Core）  ◄┘
              │ ===============│
              │ - BookmarkMgr  │
              │ - GroupMgr     │
              │ - ImportExport │
              └────────────────┘
```

---

### 2.2 模块划分

#### 核心模块（Core Layer）

**职责**：业务逻辑处理，不依赖 VS Code API

| 模块                    | 文件路径                  | 职责                        |
| ----------------------- | ------------------------- | --------------------------- |
| **BookmarkManager**     | `core/bookmarkManager.ts` | 书签的 CRUD、位置跟踪、查询 |
| **GroupManager**        | `core/groupManager.ts`    | 分组的 CRUD、排序、颜色管理 |
| **RelationManager**     | `core/relationManager.ts` | 书签-分组关联关系管理       |
| **ImportExportService** | `core/importExport.ts`    | 导入导出逻辑、路径转换      |

---

#### 数据层（Data Layer）

**职责**：数据持久化、文件监听、备份

| 模块               | 文件路径                 | 职责                    |
| ------------------ | ------------------------ | ----------------------- |
| **StorageService** | `data/storageService.ts` | JSON 文件读写、备份管理 |
| **DataManager**    | `data/dataManager.ts`    | 内存数据缓存、变更通知  |
| **FileWatcher**    | `data/fileWatcher.ts`    | 监听文件重命名/删除     |

---

#### UI 层（View Layer）

**职责**：用户交互、UI 渲染

| 模块                     | 文件路径                     | 职责                         |
| ------------------------ | ---------------------------- | ---------------------------- |
| **BookmarkTreeProvider** | `views/treeProvider.ts`      | TreeView 数据提供、拖拽支持  |
| **DecorationManager**    | `views/decorationManager.ts` | Gutter 装饰器管理            |
| **QuickPickService**     | `views/quickPick.ts`         | 快速选择器（选择分组、颜色） |
| **CommandHandler**       | `views/commandHandler.ts`    | 命令回调处理                 |

---

#### 工具层（Utils Layer）

**职责**：通用工具函数

| 模块           | 文件路径              | 职责                          |
| -------------- | --------------------- | ----------------------------- |
| **PathUtils**  | `utils/pathUtils.ts`  | 路径转换（相对/绝对、跨平台） |
| **ColorUtils** | `utils/colorUtils.ts` | 颜色预设、图标生成            |
| **Logger**     | `utils/logger.ts`     | 日志输出（开发模式）          |

---

### 2.3 目录结构

```
group-bookmarks/
├── src/
│   ├── extension.ts              # 入口文件
│   ├── core/                     # 业务逻辑层
│   │   ├── bookmarkManager.ts
│   │   ├── groupManager.ts
│   │   ├── relationManager.ts
│   │   └── importExport.ts
│   ├── data/                     # 数据层
│   │   ├── storageService.ts
│   │   ├── dataManager.ts
│   │   └── fileWatcher.ts
│   ├── views/                    # UI 层
│   │   ├── treeProvider.ts
│   │   ├── decorationManager.ts
│   │   ├── quickPick.ts
│   │   └── commandHandler.ts
│   ├── models/                   # 数据模型
│   │   ├── bookmark.ts
│   │   ├── group.ts
│   │   └── types.ts
│   └── utils/                    # 工具函数
│       ├── pathUtils.ts
│       ├── colorUtils.ts
│       └── logger.ts
├── resources/                    # 静态资源
│   └── icons/                    # 分组颜色图标
│       ├── red.svg
│       ├── blue.svg
│       └── ...
├── test/                         # 测试文件
│   ├── suite/
│   └── runTest.ts
├── .vscode/
│   ├── launch.json               # 调试配置
│   └── tasks.json
├── package.json                  # 插件配置
├── tsconfig.json                 # TypeScript 配置
└── README.md
```

---

## 3. 数据架构设计

### 3.1 数据模型细化

#### Bookmark（书签）

```typescript
interface Bookmark {
  id: string;                    // UUID v4
  fileUri: string;               // 相对路径（如 "src/user.ts"）
  line: number;                  // 1-indexed
  column: number;                // 0-indexed（默认 0）
  createdAt: number;             // Unix 时间戳（毫秒）
  updatedAt: number;             // Unix 时间戳（毫秒）
}
```

**设计要点**：
- 不存储 `title`（标题属于 BookmarkGroup）
- `fileUri` 使用 **相对路径**（相对于 workspace 根目录）
- 移除 `decoration` 字段（运行时管理，不持久化）

---

#### Group（分组）

```typescript
interface Group {
  id: string;                    // UUID v4
  name: string;                  // 分组名称
  color: GroupColor;             // 预设颜色枚举
  order: number;                 // 排序权重（0-based）
  sortMode: 'custom' | 'name';   // 排序模式
  createdAt: number;
  updatedAt: number;
}

enum GroupColor {
  Red = '#FF6B6B',
  Orange = '#FFA500',
  Yellow = '#FFD700',
  Green = '#4CAF50',
  Blue = '#2196F3',
  Purple = '#9C27B0',
  Pink = '#E91E63',
  Gray = '#9E9E9E'
}
```

**设计要点**：
- 限定 8 种颜色（避免选择困难）
- `sortMode` 影响 TreeView 的排序逻辑

---

#### BookmarkGroup（关联关系）

```typescript
interface BookmarkGroup {
  id: string;                    // 复合键：`${bookmarkId}_${groupId}`
  bookmarkId: string;            // 外键 → Bookmark.id
  groupId: string;               // 外键 → Group.id
  title: string;                 // 在该分组中的标题
  order: number;                 // 在该分组中的排序权重
  createdAt: number;
}
```

**设计要点**：
- 使用复合 ID 保证唯一性
- `order` 独立于 Bookmark，支持不同分组的不同排序

---

### 3.2 存储方案设计

#### 主存储：JSON 文件

**存储路径**：`.vscode/groupbookmarks/`（用户可配置）

```
.vscode/
└── groupbookmarks/
    ├── bookmarks.json       # 所有书签
    ├── groups.json          # 所有分组
    ├── relations.json       # 书签-分组关联
    └── backup/              # 自动备份目录
        ├── 20260203_223000.zip
        └── 20260203_220000.zip
```

---

#### bookmarks.json 格式

```json
{
  "version": "1.0.0",
  "bookmarks": [
    {
      "id": "uuid-1",
      "fileUri": "src/user.ts",
      "line": 12,
      "column": 0,
      "createdAt": 1706979600000,
      "updatedAt": 1706979600000
    }
  ]
}
```

---

#### groups.json 格式

```json
{
  "version": "1.0.0",
  "groups": [
    {
      "id": "uuid-g1",
      "name": "登录流程",
      "color": "#FF6B6B",
      "order": 0,
      "sortMode": "custom",
      "createdAt": 1706979600000,
      "updatedAt": 1706979600000
    }
  ]
}
```

---

#### relations.json 格式

```json
{
  "version": "1.0.0",
  "relations": [
    {
      "id": "uuid-1_uuid-g1",
      "bookmarkId": "uuid-1",
      "groupId": "uuid-g1",
      "title": "参数校验",
      "order": 0,
      "createdAt": 1706979600000
    }
  ]
}
```

---

### 3.3 备份策略

#### 自动备份规则

| 触发事件       | 备份时机                | 保留策略           |
| -------------- | ----------------------- | ------------------ |
| **增删改操作** | 每次修改后 1 秒（防抖） | 保留最近 5 个版本  |
| **导入操作**   | 导入前强制备份          | 单独保留导入前快照 |

**备份文件命名**：`YYYYMMDD_HHMMSS.zip`

**备份内容**：
```
20260203_223000.zip
├── bookmarks.json
├── groups.json
└── relations.json
```

---

### 3.4 数据迁移策略

#### 版本兼容性

当前版本：`1.0.0`

**未来升级场景**：
- V1.1.0：添加新字段（如 `Bookmark.note`）→ 向后兼容
- V2.0.0：破坏性变更 → 提供迁移脚本

**迁移检测逻辑**：
```typescript
function loadData(filePath: string): any {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  
  if (data.version !== CURRENT_VERSION) {
    return migrateData(data);
  }
  
  return data;
}
```

---

## 4. 核心技术方案

### 4.1 Decoration API 实现

#### 行号跟踪机制

**核心原理**：VS Code 的 `TextEditorDecorationType` 会自动跟踪 `Range` 变化

```typescript
class DecorationManager {
  private decorations = new Map<string, vscode.TextEditorDecorationType>();
  
  // 为某个书签创建装饰器
  createDecoration(bookmark: Bookmark, groups: Group[]): void {
    const color = this.getMixedColor(groups); // 多分组颜色混合
    
    const decorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.generateColorIcon(color),
      gutterIconSize: 'contain',
      overviewRulerColor: color,
      overviewRulerLane: vscode.OverviewRulerLane.Left
    });
    
    this.decorations.set(bookmark.id, decorationType);
    this.applyDecoration(bookmark, decorationType);
  }
  
  // 应用装饰器到所有打开的编辑器
  private applyDecoration(bookmark: Bookmark, decoration: vscode.TextEditorDecorationType): void {
    vscode.window.visibleTextEditors.forEach(editor => {
      if (editor.document.uri.fsPath.endsWith(bookmark.fileUri)) {
        const range = new vscode.Range(bookmark.line - 1, 0, bookmark.line - 1, 0);
        editor.setDecorations(decoration, [range]);
      }
    });
  }
}
```

---

#### 多分组颜色叠加

**方案 1：渐变色混合（推荐）**

```typescript
function getMixedColor(groups: Group[]): string {
  if (groups.length === 1) {
    return groups[0].color;
  }
  
  // 生成渐变 SVG
  const gradient = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
          ${groups.map((g, i) => 
            `<stop offset="${i / (groups.length - 1) * 100}%" style="stop-color:${g.color}" />`
          ).join('')}
        </linearGradient>
      </defs>
      <circle cx="8" cy="8" r="4" fill="url(#grad)" />
    </svg>
  `;
  
  return `data:image/svg+xml;base64,${Buffer.from(gradient).toString('base64')}`;
}
```

**方案 2：多圆点叠加**（备选）

```
●●  ← 两个圆点并排（红+蓝）
```

---

#### Hover 提示

```typescript
const hoverProvider: vscode.HoverProvider = {
  provideHover(document, position) {
    const bookmark = findBookmarkAtLine(document.uri, position.line);
    if (!bookmark) return;
    
    const groups = getGroupsForBookmark(bookmark.id);
    const content = new vscode.MarkdownString();
    content.appendMarkdown(`📌 **此行包含 ${groups.length} 个书签**\n\n`);
    
    groups.forEach(group => {
      const relation = getRelation(bookmark.id, group.id);
      content.appendMarkdown(`- 🔴 **${group.name}** → ${relation.title}\n`);
    });
    
    return new vscode.Hover(content);
  }
};
```

---

### 4.2 TreeView 拖拽实现

#### TreeDragAndDropController

```typescript
class BookmarkTreeProvider implements 
  vscode.TreeDataProvider<TreeItem>,
  vscode.TreeDragAndDropController<TreeItem> {
  
  dragMimeTypes = ['application/vnd.code.tree.groupbookmarks'];
  dropMimeTypes = ['application/vnd.code.tree.groupbookmarks'];
  
  // 拖拽开始
  async handleDrag(source: TreeItem[], dataTransfer: vscode.DataTransfer): Promise<void> {
    dataTransfer.set(
      'application/vnd.code.tree.groupbookmarks',
      new vscode.DataTransferItem(source)
    );
  }
  
  // 拖拽放下
  async handleDrop(target: TreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const items = dataTransfer.get('application/vnd.code.tree.groupbookmarks')?.value;
    
    if (items[0].type === 'bookmark' && target?.type === 'group') {
      // 书签拖到分组 → 询问"移动 or 复制"
      const action = await vscode.window.showQuickPick(['移动', '复制'], {
        placeHolder: '选择操作类型'
      });
      
      if (action === '移动') {
        this.moveBookmark(items[0].id, target.id);
      } else {
        this.copyBookmark(items[0].id, target.id);
      }
    }
  }
}
```

---

### 4.3 文件监听方案

#### 文件重命名追踪

```typescript
class FileWatcher {
  constructor(private dataManager: DataManager) {
    // 监听文件重命名
    vscode.workspace.onDidRenameFiles(event => {
      event.files.forEach(({ oldUri, newUri }) => {
        const oldPath = this.toRelativePath(oldUri);
        const newPath = this.toRelativePath(newUri);
        
        // 更新所有受影响的书签
        this.dataManager.updateBookmarkPaths(oldPath, newPath);
      });
    });
    
    // 监听文件删除
    vscode.workspace.onDidDeleteFiles(event => {
      event.files.forEach(({ fsPath }) => {
        const relativePath = this.toRelativePath(fsPath);
        
        // 标记书签为"失效"
        this.dataManager.markBookmarksAsInvalid(relativePath);
      });
    });
  }
}
```

---

### 4.4 性能优化方案

#### 懒加载策略

**TreeView 懒加载**：

```typescript
class BookmarkTreeProvider {
  getChildren(element?: TreeItem): TreeItem[] {
    if (!element) {
      // 根节点：只返回分组
      return this.getGroupItems();
    }
    
    if (element.type === 'group') {
      // 展开分组时才加载书签
      return this.getBookmarkItemsForGroup(element.id);
    }
    
    return [];
  }
}
```

**Decoration 懒加载**：

```typescript
// 只为可见编辑器应用装饰器
vscode.window.onDidChangeVisibleTextEditors(editors => {
  editors.forEach(editor => {
    const bookmarks = this.getBookmarksForFile(editor.document.uri);
    this.applyDecorations(editor, bookmarks);
  });
});
```

---

#### 内存优化

**使用 WeakMap 缓存**：

```typescript
class DecorationManager {
  // 编辑器关闭时自动清理
  private decorationCache = new WeakMap<vscode.TextEditor, vscode.TextEditorDecorationType[]>();
  
  applyDecorations(editor: vscode.TextEditor, bookmarks: Bookmark[]): void {
    const decorations = bookmarks.map(b => this.createDecoration(b));
    this.decorationCache.set(editor, decorations);
  }
}
```

---

## 5. API 接口设计

### 5.1 内部 API（Module Interface）

#### BookmarkManager

```typescript
interface IBookmarkManager {
  // 创建书签
  createBookmark(fileUri: string, line: number, column?: number): Promise<Bookmark>;
  
  // 删除书签
  deleteBookmark(id: string): Promise<void>;
  
  // 查询书签
  getBookmarkById(id: string): Bookmark | undefined;
  getBookmarksForFile(fileUri: string): Bookmark[];
  getAllBookmarks(): Bookmark[];
  
  // 更新书签位置（文件重命名时）
  updateBookmarkPath(oldUri: string, newUri: string): Promise<void>;
}
```

---

#### GroupManager

```typescript
interface IGroupManager {
  // 创建分组
  createGroup(name: string, color: GroupColor): Promise<Group>;
  
  // 删除分组（级联删除关联关系）
  deleteGroup(id: string): Promise<void>;
  
  // 重命名分组
  renameGroup(id: string, newName: string): Promise<void>;
  
  // 排序分组
  reorderGroups(groupIds: string[]): Promise<void>;
  
  // 查询分组
  getGroupById(id: string): Group | undefined;
  getAllGroups(): Group[];
}
```

---

#### RelationManager

```typescript
interface IRelationManager {
  // 添加书签到分组
  addBookmarkToGroup(bookmarkId: string, groupId: string, title: string): Promise<BookmarkGroup>;
  
  // 从分组移除书签
  removeBookmarkFromGroup(bookmarkId: string, groupId: string): Promise<void>;
  
  // 更新书签标题（在特定分组中）
  updateBookmarkTitle(bookmarkId: string, groupId: string, newTitle: string): Promise<void>;
  
  // 重排序（在特定分组中）
  reorderBookmarksInGroup(groupId: string, bookmarkIds: string[]): Promise<void>;
  
  // 查询
  getRelationsForBookmark(bookmarkId: string): BookmarkGroup[];
  getRelationsForGroup(groupId: string): BookmarkGroup[];
  getGroupsForBookmark(bookmarkId: string): Group[];
}
```

---

### 5.2 命令 API（VS Code Commands）

```typescript
// package.json
{
  "contributes": {
    "commands": [
      {
        "command": "groupBookmarks.addBookmark",
        "title": "Add Bookmark to Group",
        "category": "Group Bookmarks"
      },
      {
        "command": "groupBookmarks.createGroup",
        "title": "Create Group",
        "category": "Group Bookmarks"
      },
      {
        "command": "groupBookmarks.exportBookmarks",
        "title": "Export Bookmarks",
        "category": "Group Bookmarks"
      },
      {
        "command": "groupBookmarks.importBookmarks",
        "title": "Import Bookmarks",
        "category": "Group Bookmarks"
      }
    ],
    "keybindings": [
      {
        "command": "groupBookmarks.addBookmark",
        "key": "ctrl+k b",
        "mac": "cmd+k b"
      }
    ]
  }
}
```

---

## 6. 部署与发布策略

### 6.1 打包流程

```bash
# 1. 安装依赖
npm install

# 2. 编译 TypeScript
npm run compile

# 3. 打包为 .vsix
vsce package

# 输出：group-bookmarks-1.0.0.vsix
```

---

### 6.2 发布渠道

| 渠道                    | 适用场景 | 说明                                                  |
| ----------------------- | -------- | ----------------------------------------------------- |
| **VS Code Marketplace** | 公开发布 | 需要 Microsoft Publisher 账号                         |
| **本地安装**            | 个人使用 | `code --install-extension group-bookmarks-1.0.0.vsix` |
| **GitHub Releases**     | 开源分发 | 提供 .vsix 下载链接                                   |

---

### 6.3 版本号规范

遵循 **语义化版本（SemVer）**：

```
主版本号.次版本号.修订号
└─ MAJOR.MINOR.PATCH

1.0.0 - 初始版本
1.0.1 - Bug 修复
1.1.0 - 新增功能（向后兼容）
2.0.0 - 破坏性变更
```

---

## 7. 测试策略

### 7.1 单元测试

**覆盖模块**：
- BookmarkManager
- GroupManager
- RelationManager
- PathUtils

**测试框架**：Mocha + Chai

```typescript
// test/suite/bookmarkManager.test.ts
import { expect } from 'chai';
import { BookmarkManager } from '../../src/core/bookmarkManager';

describe('BookmarkManager', () => {
  it('should create bookmark with correct properties', () => {
    const manager = new BookmarkManager();
    const bookmark = manager.createBookmark('src/test.ts', 10);
    
    expect(bookmark.fileUri).to.equal('src/test.ts');
    expect(bookmark.line).to.equal(10);
  });
});
```

---

### 7.2 集成测试

**测试场景**：
- TreeView 拖拽操作
- Decoration 应用和更新
- 文件重命名后书签同步

**运行命令**：
```bash
npm run test
```

---

### 7.3 手动测试清单

- [ ] 创建分组并设置颜色
- [ ] 添加书签到分组
- [ ] 拖拽排序
- [ ] 跨分组拖动（移动 vs 复制）
- [ ] 导出 JSON
- [ ] 导入 JSON（跨平台路径）
- [ ] 文件重命名后书签跟随
- [ ] Gutter 装饰器显示
- [ ] Hover 提示内容

---

## 8. 风险评估与应对

### 8.1 技术风险

| 风险                          | 影响         | 概率 | 应对措施                                  |
| ----------------------------- | ------------ | ---- | ----------------------------------------- |
| **Decoration API 行为不一致** | 行号跟踪失败 | 中   | 参考 Bookmarks 插件源码，增加备用定位策略 |
| **TreeView 拖拽体验差**       | 用户操作困难 | 低   | 提供键盘快捷键（Move Up/Down）            |
| **大量书签性能问题**          | 卡顿         | 中   | 懒加载 + WeakMap 缓存                     |
| **跨平台路径兼容**            | 导入失败     | 中   | 统一使用 `/` 分隔符，导入时自动转换       |

---

### 8.2 用户体验风险

| 风险       | 应对措施                     |
| ---------- | ---------------------------- |
| 误删数据   | 自动备份 + 确认对话框        |
| 复杂配置   | 提供合理默认值，配置项最小化 |
| 学习成本高 | 提供 GIF 教程和示例          |

---

## 9. 后续扩展方向

### 9.1 V1.1 计划

- 书签笔记功能（Markdown 支持）
- 全局搜索书签
- 统计面板（每个分组的书签数、最近访问）

---

### 9.2 V2.0 愿景

- 多 workspace 支持
- 云同步（可选 GitHub Gist）
- 团队协作（只读分享）

---

## 10. 关键技术决策总结

| 决策点         | 选择                      | 理由                       |
| -------------- | ------------------------- | -------------------------- |
| **开发语言**   | TypeScript                | 类型安全、VS Code 官方推荐 |
| **打包工具**   | esbuild                   | 构建速度快、配置简单       |
| **存储方案**   | JSON 文件                 | 简单、可读、跨平台         |
| **行号跟踪**   | Decoration API            | VS Code 原生支持，自动跟踪 |
| **多分组颜色** | SVG 渐变                  | 灵活、支持任意数量分组     |
| **拖拽实现**   | TreeDragAndDropController | 官方 API，体验一致         |

---

## 附录：参考资料

1. **VS Code Extension API**：https://code.visualstudio.com/api
2. **Bookmarks 插件源码**：https://github.com/alefragnani/vscode-bookmarks
3. **TypeScript 官方文档**：https://www.typescriptlang.org/docs/

---

**架构师签名**：技术架构师  
**审批日期**：2026-02-03
