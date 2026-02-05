# GroupBookmarks 使用指南

## 快速上手

### 1. 创建第一个分组

1. 打开侧边栏，找到 "Group Bookmarks" 面板
2. 点击顶部的 `+` 按钮
3. 输入分组名称，例如："用户认证流程"
4. 选择颜色标识，例如：蓝色
5. **注意**：创建后，该分组会自动变为 **激活 (Active)** 状态 📌

### 2. 添加书签到分组

1. 在代码编辑器中，将光标移到需要标记的代码行
2. 按快捷键 `Ctrl+Alt+B`
3. 选择刚创建的分组
4. 输入书签标题，例如："登录验证入口"
5. 确认后，左侧 Gutter 会显示彩色圆点标记 (🔴/🔵)

### 3. 跳转到书签

在侧边栏 "Group Bookmarks" 面板中：
- 点击分组展开
- 点击书签即可跳转到对应代码位置

### 4. 管理书签和分组

**重命名分组**：
- 右击分组 → 选择 "Rename Group"

**删除书签**：
- 右击书签 → 选择 "Delete Bookmark"

**删除分组**：
- 右击分组 → 选择 "Delete Group"
- 注意：这会删除分组及其所有书签

## 进阶功能

### 多分组书签

一个代码位置可以属于多个分组，例如：

```
代码行 #42: `validateUser(credentials)`
  ├─ 分组 "用户认证流程" - "登录验证入口"
  ├─ 分组 "重构计划 Q1" - "需要添加 2FA 验证"
  └─ 分组 "安全审计" - "敏感操作检查点"
```

创建方法：对同一行代码多次添加书签，每次选择不同分组。

### 导出与导入

**导出书签**：
1. 在侧边栏右键菜单选择 "Export Bookmarks"
2. 选择保存位置，文件格式为 JSON

**导入书签**：
1. 在侧边栏右键菜单选择 "Import Bookmarks"
2. 选择 JSON 文件
3. 选择导入模式：
   - **Merge**：合并到现有书签（推荐）
   - **Replace**：替换所有现有书签（谨慎使用）

### Gutter 装饰器

左侧 Gutter 区域的彩色 Emoji 圆点 (🔴🔵🟢...) 表示书签：
- 不同颜色表示不同分组
- 鼠标 hover 可查看书签详情

**切换显示**：
- 命令面板 (`Ctrl+Shift+P`) → 输入 "Toggle Gutter Decorations"

## 典型使用场景

### 场景 1：代码流程理解

创建分组："用户注册流程"，按执行顺序添加书签：

```
1. "前端表单提交" → /pages/register.tsx:45
2. "API 路由处理" → /api/register.ts:12
3. "数据验证" → /services/validator.ts:78
4. "数据库写入" → /models/user.ts:156
5. "发送欢迎邮件" → /services/email.ts:34
```

### 场景 2：Bug 追踪

创建分组："Issue #123 - 支付失败"，标记相关代码：

```
1. "问题入口" → /controllers/payment.ts:89
2. "异常捕获" → /services/payment.ts:234
3. "日志记录" → /utils/logger.ts:45
4. "需要修复的逻辑" → /services/payment.ts:156
```

### 场景 3：重构计划

创建分组："Q1 重构任务"，标记需要优化的代码：

```
1. "替换为新 API" → /legacy/api-v1.ts:45
2. "删除冗余代码" → /utils/deprecated.ts:12
3. "提取公共逻辑" → /pages/dashboard.tsx:234
```

## 数据存储

### 本地存储

书签数据保存在：
```
.vscode/groupbookmarks/
├── bookmarks.json    # 书签数据
├── groups.json       # 分组数据
├── relations.json    # 关联关系
└── backup/           # 自动备份（保留最近 5 次）
```

### 跨设备同步

方法 1：使用 VS Code Settings Sync
- 将 `.vscode/groupbookmarks/` 加入同步

方法 2：手动导出/导入
- 在设备 A 导出 JSON
- 在设备 B 导入 JSON

## 快捷键

| 快捷键                      | 功能                          |
| --------------------------- | ----------------------------- |
| `Ctrl+Alt+B`                | 添加书签 (Add Group Bookmark) |
| `Ctrl+K V` (Mac: `Cmd+K V`) | 聚焦书签视图                  |

## 常见问题

### Q: 重命名文件后书签会丢失吗？
A: 不会，插件会自动追踪文件重命名。

### Q: 删除文件后书签会怎样？
A: 相关书签会自动清理。

### Q: 可以在多个项目间共享书签吗？
A: 使用导出/导入功能，但需要注意路径差异。

### Q: Gutter 图标不显示？
A: 检查命令面板中的 "Toggle Gutter Decorations" 是否启用。

## 技术支持

遇到问题？请访问：
- GitHub Issues: [链接]
- 文档：[链接]

---

**自动激活分组 (Auto-Pinning)**：
创建新分组后，系统会自动将其设为 **激活 (Active)** 状态。后续添加的书签将默认归入该组，无需手动切换。

---

**最后更新**：2026-02-05
