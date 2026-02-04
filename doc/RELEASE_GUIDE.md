# 🚀 Group Bookmarks 发布流程指南

本文档说明如何使用 GitHub Actions 自动打包和发布 Group Bookmarks 扩展。

## 📋 准备工作

在发布新版本之前，请确保：
1. 本地代码已测试通过。
2. `CHANGELOG.md` 已更新（如果有）。
3. 所有更改已提交并推送到 GitHub。

## 📦 正式发布步骤 (Standard Release)

假设我们要发布 **v1.0.0** 正式版：

### 1. 更新版本号
修改 `package.json` 中的 `version` 字段：
```json
{
  "version": "1.0.0"
}
```
提交更改：
```bash
git add package.json
git commit -m "chore: bump version to 1.0.0"
git push
```

### 1.1 版本升级
```bash
npm version patch  # 1.0.1 -> 1.0.2
git push --follow-tags
```

### 2. 打标签 (Tagging)
创建以 `v` 开头的标签（这是触发自动发布的关键）：
```bash
git tag v1.0.0
```

### 3. 触发发布
推送标签到远程仓库：
```bash
git push origin v1.0.0
```

### 4. 等待自动化完成
1. 前往 GitHub 仓库的 **Actions** 页面。
2. 你会看到一个名为 `Release` 的工作流正在运行。
3. 等待由 🟡 变为 🟢。

### 5. 验证
前往 GitHub 仓库的 **Releases** 页面，你应该能看到：
- 标题为 `Release 1.0.0` 的新版本。
- 附件中包含 `group-bookmarks-1.0.0.vsix`。

---

## 🧪 测试发布步骤 (Beta/Test Release)

如果你想先发一个测试版（例如 v1.0.1-beta）：

1. 修改 `package.json` 版本为 `1.0.1`。
2. 打测试标签：
   ```bash
   git tag v1.0.1-beta
   ```
3. 推送标签：
   ```bash
   git push origin v1.0.1-beta
   ```
4. GitHub Actions 依然会打包并发布，用户可以下载 VSIX 进行测试。

---

## ⚠️ 常见问题

### 1. Action 失败了怎么办？
- 点击 Actions 页面失败的记录，查看详细日志。
- 常见原因：版本号冲突（Tag已存在）、编译错误、权限不足（已在 workflow 中修复）。

### 2. 如何重新发布同一个版本？
GitHub 不允许覆盖已存在的 Release Tag。如果你发布 v1.0.0 失败了需要重试：
1. 在 GitHub Releases 页面删除失败的 Release。
2. 在本地和远程删除旧 Tag：
   ```bash
   git tag -d v1.0.0
   git push --delete origin v1.0.0
   ```
3. 重新打 Tag 并推送。

### 3. 需要配置密钥吗？
**不需要**。工作流使用 GitHub 自动生成的 `GITHUB_TOKEN`，无需任何人工干预。
