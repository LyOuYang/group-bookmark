# GroupBookmarks - 分组书签工具

为代码流程理解而生的 VS Code 书签管理扩展。

## 功能特性

- ✅ **多视角分组**：按不同维度（架构、时间线、重构计划等）为同一代码创建多个书签
- ✅ **可视化标记**：Gutter 区域显示彩色书签图标
- ✅ **拖拽排序**：支持自定义排序和按名称排序
- ✅ **跨平台同步**：导入/导出功能，数据格式跨 IDE 兼容
- ✅ **智能追踪**：自动追踪文件重命名和移动

## 快速开始

### 添加书签

1. 将光标移至目标代码行
2. 按 `Ctrl+K B` (Mac: `Cmd+K B`)
3. 选择分组并输入标题

### 创建分组

1. 打开侧边栏 "Group Bookmarks" 视图
2. 点击 "+" 按钮创建分组
3. 选择颜色和输入名称

## 键盘快捷键

- `Ctrl+K B`：添加书签
- `Ctrl+K V`：聚焦书签视图

## 数据导入导出

### 导出
在侧边栏右键菜单选择 "Export Bookmarks"，保存为 JSON 文件。

### 导入
在侧边栏右键菜单选择 "Import Bookmarks"，选择合并或替换模式。

## 技术架构

- **语言**：TypeScript
- **存储**：JSON 文件（`.vscode/groupbookmarks/`）
- **备份**：自动备份最近 5 次修改

## 许可证

MIT

## 反馈

如有问题或建议，请访问 [GitHub Issues](https://github.com/your-repo/group-bookmarks)
