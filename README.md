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

### 4. 📝 Key Notes
*   **Active Group Flow**: Right-click a key-note group in the Key Notes tree and set it as active. `Add Note for Selection` uses the active key-note group automatically, and if none is active it will prompt you to select or create one.
*   **Group Controls**: Key Notes group rows now support active, rename, and delete actions in the same way as bookmark groups.
*   **Tree + Editor**: The Key Notes tree stays on the left, and the Note Editor stays in the panel area. Click a tree item to load it into the editor for preview, then continue editing from the panel when needed.
*   **Row Actions**: Note rows expose quick actions for common management tasks. Destructive actions, including delete, ask for confirmation.
*   **Unified Marking**: Editor context-menu entries for bookmarks and key notes now use the same marking style.
*   **Add Note**: Select text in the editor and run `Add Note for Selection` to create or open a key note.
*   **Manage Membership**: In the Key Notes view, right-click a note to set a group active, remove it from the current group, add it to another group, or delete it everywhere.
*   **Selection Sync**: Selecting a matching term reveals the note in the tree and loads the Note Editor in view mode, without opening a floating hover preview.

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

### 4. 📝 术语笔记
*   **激活分组**：在 Key Notes 树中右键术语分组即可设为当前激活分组。`Add Note for Selection` 会优先使用当前激活分组；如果没有激活分组，系统会提示你选择或创建一个分组。
*   **分组操作**：Key Notes 分组行现在支持激活、重命名和删除，和书签分组保持一致。
*   **树与编辑器**：Key Notes 树保留在左侧，Note Editor 保留在面板区域中。单击树项即可在编辑器中加载该笔记进行预览；需要时再从面板继续编辑。
*   **行内操作**：笔记行提供常用快捷操作。删除等破坏性操作会在执行前要求确认。
*   **统一标记**：编辑器右键菜单中，书签和术语笔记使用统一的标记样式。
*   **添加笔记**：在编辑器中选中一段文本后运行 `Add Note for Selection`，即可在当前术语分组中创建或打开对应笔记。
*   **管理归属**：在 Key Notes 视图中，右键笔记即可将其从当前分组移除、加入其他分组，或直接删除全部关联。
*   **选区联动**：当选中的术语与已有笔记匹配时，系统会在树中定位该笔记，并在 Note Editor 中以查看模式加载，不再自动弹出浮窗预览。

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
