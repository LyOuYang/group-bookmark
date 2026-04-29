# Group Bookmarks - IntelliJ IDEA 版本开发功能点文档

本文档旨在为 IDEA 插件团队开发 "Group Bookmarks" 提供核心功能定义与设计规范参照。目标是保持 VS Code 与 JetBrains IDE 版本在核心体验上的一致性。

## 1. 核心概念 (Core Concepts)

### 1.1 分组 (Group)
*   **定义**: 书签的聚合容器，具有"颜色"和"排序"属性。
*   **属性**:
    *   `id`: UUID, 唯一标识。
    *   `name`: 显示名称（用户输入）。
    *   `color`: 标签颜色 (Red, Green, Blue, Yellow, Purple)。
    *   `isCollapsed`: 是否折叠（UI状态）。
    *   `isActive`: 是否为当前激活组（新书签默认进入此组）。

### 1.2 关系 (Relation)
*   **定义**: 连接 "书签(Bookmark)" 与 "分组(Group)" 的中间实体。
*   **设计原则**: 允许一个书签属于多个分组（虽然 UI 上目前主要体现一对一）。

## 2. 界面与交互 (UI/UX)

### 2.1 工具栏视图 (Tool Window)
*   **Tree Structure**: 采用 Group -> Bookmark 两级树形结构。
*   **Group Node**:
    *   **图标**: 左侧显示 `Pinned Icon` (仅 Active 状态) 或 `Folder Icon` (普通状态)。
    *   **Label**: `[Color Emoji] [Number]. [Name]` (例: `🔴 1. Login Logic`)。
    *   **Inline Actions**: 悬停时显示 重命名、删除、Active 切换、Ghost Text 切换。
*   **Bookmark Node**:
    *   Label: 文件名 + 行号 + 代码预览摘要。
    *   Click: 跳转到编辑器对应行。

### 2.2 视觉增强 (Visual)
*   **Gutter Icon**: 在编辑器行号旁显示对应分组颜色的书签图标。
*   **Ghost Text (Inlay Hint)**:
    *   **位置**: 代码行尾 (Line End)。
    *   **样式**: 灰色, 斜体。
    *   **内容**: `[Color] [Group Name] Note`。
    *   **截断**: 超过 50 字符显示 `...`。
*   **Code Preview Tooltip**:
    *   鼠标悬停在 Tool Window 的书签上时，异步加载并显示该行代码的高亮预览。

### 2.3 交互逻辑
*   **Drag & Drop**:
    *   **Drag Bookmark**: 在分组间移动书签。
    *   **Drag Group**: 调整分组顺序。
*   **Add Bookmark Keybinding**:
    *   建议保留 `Ctrl + Alt + B` (或 IDEA 风格快捷键)，呼出 "Add to Group" 选择菜单。
*   **Auto-Pinning**:
    *   创建新分组后，必须自动将其设为 **Active** 状态，以便用户连续添加书签。

## 3. 数据存储 (Data Persistence)

为实现 IDE 间配置共享（未来规划），建议采用兼容的 JSON 结构存储在 `.idea/groupBookmarks/` 或项目根目录 `.vscode/groupbookmarks/` 下（如果希望与 VS Code 互通）。

**JSON Schema 示例**:
```json
{
  "version": "1.0",
  "groups": [
    { "id": "g1", "name": "Login", "color": "red", "createdTime": 1234567890 }
  ],
  "bookmarks": [
    { "id": "b1", "file": "src/Auth.java", "line": 42 }
  ],
  "relations": [
    { "groupId": "g1", "bookmarkId": "b1" }
  ]
}
```

## 4. 特性建议 (IDEA Specific)

*   **Line Marker**: 利用 IntelliJ 的 Line Marker Provider 实现 Gutter Icon。
*   **Inlay Hints**: 利用 InlayHintsProvider 实现 Ghost Text。
*   **Quick List**: 利用 `PopupFactory` 实现快速分组选择器。

---
*Generated for Group Bookmarks IDEA Team*
