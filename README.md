[🇺🇸 English](#-group-bookmarks) | [🇨🇳 中文说明](#-group-bookmarks-cn)

# 🔖 Group Bookmarks

**The ultimate bookmark manager for complex code flow analysis.**

When reading massive source code, logic often scatters across dozens of files. "Group Bookmarks" allows you to create a "Group" for a specific concern (e.g., "Login Flow", "Data Sync") and "Pin" scattered code lines into a single, organized list.

---

## ✨ Core Features

### 1. 📂 Multi-Dimensional Grouping
*   **On-Demand Aggregation**: Group related bookmarks together, e.g., "Feature A", "Bug fix 123".
*   **Custom Colors**: Support Red/Green/Blue/Yellow/Purple to visually distinguish different tasks.
*   **Smart Numbering**: Automatically numbers groups (e.g., `1. Login Flow`) for logical sorting.

### 2. 👁️ Visual Pro
*   **Ghost Text**: Displays the group name and note in faint gray at the **end of the code line**, keeping your reading flow uninterrupted.
    *   *Interaction*: Click the `👁️` inline button to toggle visibility globally.
*   **Vector Icons**: Modern vector icons clearly indicate group status (Active/Pinned).
*   **Icon Coexistence**: Active groups display both the 📌 Pin icon and the 🔴 Color tag simultaneously.
*   **Auto-Pinning**: Newly created groups are automatically set as **Active**, streamlining your workflow.

### 3. 🖱️ Rapid Interaction
*   **Code Preview**: **Hover** over a bookmark in the Side Bar to see a popup preview of the code line immediately.
*   **Drag & Drop**: Drag bookmarks to move them between groups, or drag groups to reorder them.
*   **Inline Actions**: Rename, delete, or toggle visibility directly from the group header.

### 4. 📝 Key Notes (New Major Feature since 1.0.9)
Beyond tracking code lines, understanding a complex codebase requires keeping track of domain-specific terminology, architectural concepts, and APIs. Version 2.0+ introduces a built-in knowledge base!
*   **Integrated Glossary**: Build a glossary of terms directly within your IDE. Select any term in the editor, and use `Add Note for Selection` to write rich Markdown notes describing it.
*   **Dedicated Webview Editor**: A rich Key Note Editor panel stays alongside your code. It renders your markdown seamlessly without forcing you to juggle raw `.md` files or breaking your flow.
*   **Search & Auto-Sync**: Globally search your key notes (`Search Key Notes...`). When you select a known term in your code, the extension automatically loads its documentation in the Key Note Editor.
*   **Powerful Group Management**: Just like bookmarks, you can organize your Key Notes into colored groups (e.g., "Database Models", "Protocols"). Support custom Drag&Drop ordering, sorting (A-Z, Z-A) via group context menu, and active group pinning!

### 5. 🔄 Import/Export
*   Export all groups and bookmarks to a JSON file for sharing with colleagues or syncing between devices.

---

## 🚀 User Guide

### 📌 Add Bookmark
1.  **Position Cursor**: Move cursor to the target code line.
2.  **Quick Menu**:
    *   **Right Click**: Select `🔖 Add Group Bookmark` from the editor context menu.
    *   **Shortcut**: `Ctrl+Alt+B` (Default) to open the Quick Pick menu.
    *   **Sidebar**: Click the `+` button in the view title to add the current line to a new group.

### 🎨 Manage Groups
1.  **Set Active**: Click the group header to set it as **Active** (📌). New bookmarks will be added to this group automatically.
2.  **Rename**: Right-click a group or use the edit icon to rename.
3.  **Sort**: Drag and drop any group or bookmark to reorder.

### 🔍 Browse Code
1.  **Jump**: Click a bookmark item to jump to the code line.
2.  **Preview**: Hover over a bookmark to peek at the code.
3.  **Ghost Text**: Enable `👁️` to see `🔴 [Group] Title` hints at the end of lines in the editor.

---

## ⚙️ Settings
*   `groupBookmarks.showGhostText`: Globally enable/disable end-of-line hints.
*   `groupBookmarks.activeGroupColor`: Set the highlight color for the active group.

---

<br/><br/><br/>

[🇺🇸 English](#-group-bookmarks) | [🇨🇳 中文说明](#-group-bookmarks-cn)

# 🔖 Group Bookmarks CN

**为复杂代码流程阅读而生的分组书签工具。**

在阅读大型源码时，我们常需要跨越十几个文件追踪逻辑。"Group Bookmarks" 允许您为同一个关注点（如"登录流程"、"数据同步"）创建一个分组，并将散落在各处的代码行"钉"在同一个清单中。

---

## ✨ 核心特性

### 1. 📂 多维分组管理
*   **按需聚合**: 将相关的书签放入同一个分组，如 "Feature A"、"Bug fix 123"。
*   **自定义颜色**: 支持 红/绿/蓝/黄/紫 等多种颜色标签，视觉区分不同任务。
*   **智能编号**: 自动为分组编号（如 `1. Login Flow`），便于逻辑排序。

### 2. 👁️ 可视化增强 (Visual Pro)
*   **Ghost Text (幽灵标签)**: 在代码行尾以淡灰色显示所属分组和备注，不打断代码阅读流。
    *   *交互*: 点击分组旁的 `👁️` 按钮即可一键开/关。
*   **Vector Icons**: 精美的矢量图标，清晰展示分组状态（Active/Pinned）。
*   **Icon Coexistence**: 激活的分组会同时显示 📌 图标和 🔴 颜色标签，信息一目了然。
*   **Auto-Pinning**: 新创建的分组会自动设为 **Active (激活)** 状态，让您的操作流更加顺畅。

### 3. 🖱️ 极速交互
*   **Code Preview**: 鼠标悬停在侧边栏书签上，立即浮窗显示该行 **代码预览**，无需跳转即可确认内容。
*   **Drag & Drop**: 支持拖拽书签在分组间移动，或拖拽改变分组排序。
*   **Inline Actions**: 在分组标题栏即可快速完成重命名、删除、切换可见性等操作。

### 4. 📝 术语笔记 (Key Notes - 对比 1.0.9 的重大理念升级)
在阅读复杂源码时，除了用“代码书签”记录执行流程外，我们不可避免地会遇到大量陌生的领域专有词汇、架构概念或外部 API。在 1.0.9 及以前，插件仅支持简单的代码行标记；现在，我们引入了完整的**内置代码知识库**！
*   **专属代码词典**: 在编辑器中选中任何陌生词汇，右键 `🔖 Add Key Note`，即可就地编写带有 Markdown 格式的术语解析。
*   **沉浸式 Webview 编辑器**: 笔记会在专属的 **Key Note Editor** 面板中打开并渲染，而不是让您去面对零散的物理 `.md` 文件，完美保证了您的沉浸式阅读心流。
*   **全局搜索与选区联动**: 支持全局搜索术语 (`Search Key Notes...`) 并直接在专属面板展示。当在源码中选中一个已被记录的术语时，系统会自动在面板中提取并展示它的解释！
*   **完善的分组与排序**: 与书签功能一样，您可以对术语进行多维分组（如“模型定义”、“通信协议”），并支持在分组右键菜单中直接点选排序方式（自定义拖拽、A-Z、Z-A）。

### 5. 🔄 导入/导出
*   支持将所有分组和书签导出为 JSON 文件，便于分享给同事或在不同设备间同步上下文。

---

## 🚀 使用指南

### 📌 添加书签
1.  **光标定位**: 将光标移至目标代码行。
2.  **快捷菜单**:
    *   **Right Click**: 在编辑器右键菜单选择 `🔖 Add Group Bookmark`。
    *   **快捷键**: `Ctrl+Alt+B` (默认) 呼出快速选择菜单。
    *   **Sidebar**: 点击侧边栏标题栏的 `+` 按钮，将当前行加入新分组。

### 🎨 管理分组
1.  **激活分组**: 点击分组标题将其设为 **Active** (📌)，此后添加的书签会自动进入该组。
2.  **重命名**: 右键分组或点击编辑图标，修改名称。
3.  **排序**: 所有的分组和书签都支持鼠标拖拽排序。

### 🔍 浏览代码
1.  **跳转**: 点击侧边栏的书签条目，编辑器自动跳转到对应行。
2.  **预览**: 鼠标悬停在书签条目上，查看代码片段。
3.  **Ghost Text**: 开启 `👁️` 后，代码行尾会出现 `🔴 [Group] Title` 提示。

---

## ⚙️ 设置
*   `groupBookmarks.showGhostText`: 全局开启/关闭行尾标签。
*   `groupBookmarks.activeGroupColor`: 设置激活分组的高亮颜色。

---

## 🔧 技术支持
如有问题或建议，欢迎提交 Issue 或联系开发团队。

**Enjoy your coding flow!**
