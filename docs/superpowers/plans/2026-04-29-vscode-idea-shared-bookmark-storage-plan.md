# VS Code 与 IDEA 共享书签数据 Implementation Plan

> **给 agentic workers：** 本计划用于后续实现阶段逐项执行。用户明确要求“不需要具体代码”，所以本文只写目标、架构、文件职责、实施步骤、测试与风险，不包含代码片段。

**Goal:** 让同一份代码仓库中的 Group Bookmarks 数据由 VS Code 插件和 IDEA 插件共同读写，用户用任意一个 IDE 打开项目时都能看到一致的书签分组、书签、关联关系和 Key Notes。

**Architecture:** 以 IDEA 版已经落地的 `.group-bookmarks/` 作为唯一 canonical repository sidecar。VS Code 版从旧的 `.vscode/groupbookmarks/*.json` 多文件存储迁移到 `.group-bookmarks/bookmarks.json` 单文件聚合存储，并补齐字段映射、锚点定位、冲突保护和旧数据迁移。AI staged bookmarks 作为第二阶段接入，复用 `.group-bookmarks/drop-zone/` 与 `.group-bookmarks/staged-bookmarks.json` 协议。

**Tech Stack:** TypeScript, VS Code Extension API, Node fs/path, Vitest, JSON sidecar storage, existing IDEA `.group-bookmarks` schema.

---

## 1. 背景与目标边界

### 当前状态

- IDEA 版主存储在 `.group-bookmarks/bookmarks.json`，暂存 AI 审查数据在 `.group-bookmarks/staged-bookmarks.json`。
- VS Code 版主存储在 `.vscode/groupbookmarks/`，并拆成 `bookmarks.json`、`groups.json`、`relations.json`、`key-notes.json`、`key-note-groups.json`、`key-note-relations.json`。
- 两边都已有“书签实体 + 分组实体 + 关系实体”的核心思想，但字段命名、颜色表示、排序字段、Key Note 正文字段和定位锚点不完全一致。

### 第一阶段目标

- VS Code 插件优先读取 `.group-bookmarks/bookmarks.json`。
- VS Code 插件保存时写回 `.group-bookmarks/bookmarks.json`。
- IDEA 插件无需转换即可读取 VS Code 插件写入的数据。
- 旧 VS Code 数据可一次性迁移，用户已有 `.vscode/groupbookmarks/` 数据不丢失。
- 正式书签、分组、关联关系、Key Notes、Key Note 分组、Key Note 关系都能跨 IDE 共用。

### 第一阶段不做

- 不实现云同步。
- 不做双向实时多进程协同编辑。
- 不改 IDEA 版现有 schema，除非发现兼容性缺口必须补。
- 不要求两个 IDE 同时打开并同时编辑时自动合并冲突，第一阶段只做保守冲突检测和拒绝覆盖。

### 第二阶段目标

- VS Code 版支持 IDEA 版 AI staged bookmark 协议。
- AI 只写 `.group-bookmarks/drop-zone/inbox/*.json` import batch。
- VS Code 插件导入 batch、补齐定位信息、写入 `.group-bookmarks/staged-bookmarks.json`。
- VS Code 侧提供基本 staged review/apply UI。

## 2. 目标数据协议

### Canonical 文件

- `.group-bookmarks/bookmarks.json`
  - 正式书签、正式分组、书签关系、Key Notes、Key Note 分组、Key Note 关系。
- `.group-bookmarks/staged-bookmarks.json`
  - AI/人工暂存书签审查数据，第二阶段支持。
- `.group-bookmarks/drop-zone/`
  - AI import batch 入口，第二阶段支持。

### 旧数据位置

- `.vscode/groupbookmarks/*.json`
  - 只作为迁移来源。
  - 成功迁移后不再作为主写入目标。
  - 可以保留原文件，避免破坏用户备份和回退能力。

### 数据兼容原则

- 统一使用仓库相对路径。
- 路径分隔符统一为 `/`。
- ID 保持 UUID 字符串，不按 IDE 重新生成，除非迁移时发生冲突。
- 颜色以 IDEA schema 为 canonical，VS Code UI 层负责把 canonical color token 转成实际显示颜色。
- 排序以 canonical 的 `displayOrder` / `orderInGroup` 为准。
- Key Note 正文以 canonical 的 `markdownContent` 为准。

## 3. 字段映射表

### Bookmark

| VS Code 当前字段 | Canonical 字段 | 处理方式 |
| --- | --- | --- |
| `id` | `id` | 原样保留 |
| `fileUri` | `filePath` | 重命名，标准化为 `/` |
| `line` | `line` | 原样保留，1-based |
| `column` | `column` | 原样保留，0-based |
| `createdAt` | `createdAt` | 原样保留 |
| `updatedAt` | `updatedAt` | 原样保留 |
| 无 | `lineTextAnchor` | VS Code 保存时补齐 |
| 无 | `contextBeforeAnchor` | VS Code 保存时补齐 |
| 无 | `contextAfterAnchor` | VS Code 保存时补齐 |
| 无 | `lastCandidateLine` 等运行时定位字段 | 初始化默认值 |

### Bookmark Group

| VS Code 当前字段 | Canonical 字段 | 处理方式 |
| --- | --- | --- |
| `id` | `id` | 原样保留 |
| `name` | `name` | 原样保留，不包含编号 |
| `order` | `displayOrder` | 重命名 |
| `showGhostText` | `showLineHint` | 重命名 |
| 无 | `showInEditor` | 默认 `true` |
| `color` HEX | `color` enum token | 映射到 `RED/GREEN/BLUE/YELLOW/PURPLE/...` |
| `displayName` / `number` | 无 canonical 对应 | UI 层动态生成或迁移时忽略 |

### Bookmark Relation

| VS Code 当前字段 | Canonical 字段 | 处理方式 |
| --- | --- | --- |
| `id` | `id` | 原样保留 |
| `bookmarkId` | `bookmarkId` | 原样保留 |
| `groupId` | `groupId` | 原样保留 |
| `title` | `title` | 原样保留 |
| `order` | `orderInGroup` | 重命名 |
| `linkedGroupIds` | `linkedGroupIds` | 原样保留，缺省为空数组 |

### Key Note

| VS Code 当前字段 | Canonical 字段 | 处理方式 |
| --- | --- | --- |
| `id` | `id` | 原样保留 |
| `term` | `term` | 原样保留 |
| `normalizedTerm` | `normalizedTerm` | 原样保留 |
| `contentMarkdown` | `markdownContent` | 重命名 |
| `createdAt` | `createdAt` | 原样保留 |
| `updatedAt` | `updatedAt` | 原样保留 |
| `lastViewedAt` | `lastViewedAt` | 原样保留，缺省为 `0` |

### Key Note Group / Relation

| VS Code 当前字段 | Canonical 字段 | 处理方式 |
| --- | --- | --- |
| Key Note Group `order` | `displayOrder` | 重命名 |
| Key Note Group `color` HEX | `color` enum token | 映射 |
| Key Note Group `sortMode` | `sortMode` | 保留，缺省 `custom` |
| Key Note Relation `order` | `orderInGroup` | 重命名 |

## 4. 文件结构与职责

### 新增文件

- Create: `src/data/repositoryStore.ts`
  - 负责 `.group-bookmarks/` 目录解析、文件创建、读写、stamp/hash 冲突检测、原子写入。
- Create: `src/data/repositorySchema.ts`
  - 定义 canonical repository file TypeScript 类型，对齐 IDEA 版 `GroupBookmarksRepositoryFile` 和 `GroupBookmarksProjectState`。
- Create: `src/data/repositoryMapper.ts`
  - 负责旧 VS Code 模型与 canonical 模型之间的双向映射。
- Create: `src/data/legacyStorageMigration.ts`
  - 负责从 `.vscode/groupbookmarks/*.json` 迁移到 `.group-bookmarks/bookmarks.json`。
- Create: `src/services/bookmarkAnchorService.ts`
  - 负责为 VS Code 侧创建或刷新 `lineTextAnchor`、上下文锚点和候选定位信息。
- Test: `tests/unit/repositoryMapper.test.ts`
  - 覆盖字段映射、颜色映射、路径标准化。
- Test: `tests/unit/repositoryStore.test.ts`
  - 覆盖创建默认文件、读取、写入、冲突拒绝、parse failure 保护。
- Test: `tests/unit/legacyStorageMigration.test.ts`
  - 覆盖旧多文件存储迁移。
- Test: `tests/unit/bookmarkAnchorService.test.ts`
  - 覆盖锚点生成和简单漂移定位。

### 修改文件

- Modify: `src/models/types.ts`
  - 保留现有 VS Code 内部模型，必要时补充 canonical 类型引用或兼容字段。
- Modify: `src/data/storageService.ts`
  - 从“直接读写 `.vscode/groupbookmarks`”改为委托 `repositoryStore`。
  - 保留旧方法签名，减少 `DataManager` 和业务层改动。
- Modify: `src/data/dataManager.ts`
  - 加载流程改为从 canonical repository state 拆回现有内存 Map。
  - 保存流程改为聚合当前内存 Map 后写回 canonical repository state。
- Modify: `src/utils/pathUtils.ts`
  - 增加 repository-root-relative 路径解析能力。
  - 多工作区场景先保持保守策略：第一阶段使用第一个 workspace folder 或明确 repository root。
- Modify: `src/core/bookmarkManager.ts`
  - 创建书签时触发锚点补齐。
  - 行号变更时更新 runtime 定位缓存。
- Modify: `src/core/groupManager.ts`
  - 去除对持久化 `displayName/number` 的强依赖，改为 UI 层派生。
- Modify: `src/core/keyNoteManager.ts`
  - 适配 `markdownContent` / `contentMarkdown` 的持久化映射。
- Modify: `src/views/treeProvider.ts`
  - 展示逻辑继续使用 VS Code 内部模型，避免 UI 大改。
- Modify: `src/views/decorationManager.ts`
  - 使用 canonical color token 映射为 VS Code 装饰颜色。
- Modify: `src/services/importExportService.ts`
  - 导入导出继续支持现有 export bundle，同时可导出 canonical repository file。
- Modify: `README.md`
  - 说明跨 IDE 共享数据路径。
- Modify: `docs/USER_GUIDE.md`
  - 说明迁移、共享和冲突处理行为。

### 第二阶段新增文件

- Create: `src/data/stagedBookmarksStore.ts`
  - 读写 `.group-bookmarks/staged-bookmarks.json`。
- Create: `src/models/stagedBookmarkTypes.ts`
  - 对齐 IDEA staged schema。
- Create: `src/services/stagedImportService.ts`
  - 处理 `.group-bookmarks/drop-zone/inbox/*.json`。
- Create: `src/services/stagedImportCoordinator.ts`
  - 管理 inbox / processing / processed / failed / receipts。
- Create: `src/services/stagedImportValidator.ts`
  - 校验 AI import batch。
- Create: `src/views/stagedBookmarksTreeProvider.ts`
  - VS Code staged review 树视图。
- Create: `src/views/stagedBookmarksCommandHandler.ts`
  - 导入、应用、跳转、清理 staged changes。
- Copy or create: `.group-bookmarks/ai/`
  - 复用 IDEA 版 prompt pack 和 validator。

## 5. 实施任务

### Task 1: 固化 canonical schema 与映射规则

**Files:**

- Create: `src/data/repositorySchema.ts`
- Create: `src/data/repositoryMapper.ts`
- Test: `tests/unit/repositoryMapper.test.ts`

**Steps:**

- [ ] 定义 VS Code 侧的 canonical repository 类型，字段命名与 IDEA 版保持一致。
- [ ] 写映射测试：旧 VS Code `Bookmark` 可转成 canonical `BookmarkState`。
- [ ] 写映射测试：canonical `BookmarkState` 可转回现有 VS Code 内部 `Bookmark`。
- [ ] 写映射测试：Key Note 的 `contentMarkdown` 与 `markdownContent` 能互转。
- [ ] 写映射测试：HEX color 与 canonical color token 能互转。
- [ ] 写映射测试：缺省字段被补齐，不产生 `undefined` 持久化字段。
- [ ] 实现最小映射逻辑。
- [ ] 运行 `npm run test -- repositoryMapper`。
- [ ] 运行 `npm run typecheck`。

**Acceptance:**

- 不接触实际文件系统，仅模型映射测试通过。
- 映射后的 JSON 结构可被 IDEA schema 理解。

### Task 2: 新增 `.group-bookmarks` repository store

**Files:**

- Create: `src/data/repositoryStore.ts`
- Test: `tests/unit/repositoryStore.test.ts`

**Steps:**

- [ ] 写测试：无 `.group-bookmarks/bookmarks.json` 时创建默认空文件。
- [ ] 写测试：可读取已有 canonical `bookmarks.json`。
- [ ] 写测试：保存时使用临时文件再替换，避免半写入文件。
- [ ] 写测试：文件在读取后被外部修改时拒绝覆盖。
- [ ] 写测试：JSON parse 失败后拒绝覆盖原文件。
- [ ] 实现 repository root 解析。
- [ ] 实现 sidecar 目录创建。
- [ ] 实现 stamp/hash 记录和冲突检测。
- [ ] 运行 `npm run test -- repositoryStore`。

**Acceptance:**

- VS Code 侧具备与 IDEA 版类似的保守读写行为。
- 外部 AI 或 IDEA 修改文件后，VS Code 不会静默覆盖。

### Task 3: 从旧 `.vscode/groupbookmarks` 迁移到 canonical 文件

**Files:**

- Create: `src/data/legacyStorageMigration.ts`
- Modify: `src/data/storageService.ts`
- Test: `tests/unit/legacyStorageMigration.test.ts`

**Steps:**

- [ ] 写测试：没有 canonical 文件但有旧多文件数据时，迁移生成 `.group-bookmarks/bookmarks.json`。
- [ ] 写测试：已有 canonical 文件时，不覆盖 canonical 文件。
- [ ] 写测试：迁移后旧文件保留，不删除。
- [ ] 写测试：迁移结果保留书签、分组、关系、Key Notes。
- [ ] 写测试：旧路径中的 `\` 被规范化为 `/`。
- [ ] 实现迁移检测。
- [ ] 实现旧多文件读取。
- [ ] 复用 `repositoryMapper` 生成 canonical state。
- [ ] 迁移成功后提示用户数据已升级为跨 IDE 共享格式。
- [ ] 运行迁移相关测试。

**Acceptance:**

- 老用户升级后数据不丢失。
- 新用户直接创建 `.group-bookmarks/bookmarks.json`。

### Task 4: 保持现有业务层 API，替换底层存储

**Files:**

- Modify: `src/data/storageService.ts`
- Modify: `src/data/dataManager.ts`
- Test: `tests/unit/keyNoteDataManager.test.ts`
- Test: existing storage/data tests

**Steps:**

- [ ] 保留 `loadBookmarks/saveBookmarks/loadGroups/saveGroups/...` 方法签名。
- [ ] 将这些方法内部改为读写 canonical repository aggregate。
- [ ] 确保多个 save 方法不会互相覆盖其他集合。
- [ ] 为 “保存 bookmarks 不丢 keyNotes” 写回归测试。
- [ ] 为 “保存 keyNotes 不丢 bookmark groups” 写回归测试。
- [ ] 运行现有 DataManager 相关测试。
- [ ] 运行 `npm run typecheck`。

**Acceptance:**

- 上层 manager、tree provider、command handler 尽量少改。
- 任意单集合保存都能保留 repository file 里的其他集合。

### Task 5: 补齐书签锚点与漂移定位基础

**Files:**

- Create: `src/services/bookmarkAnchorService.ts`
- Modify: `src/core/bookmarkManager.ts`
- Modify: `src/data/dataManager.ts`
- Test: `tests/unit/bookmarkAnchorService.test.ts`

**Steps:**

- [ ] 写测试：创建书签时从目标文件读取当前行文本作为 `lineTextAnchor`。
- [ ] 写测试：创建书签时保存目标行前后若干行上下文。
- [ ] 写测试：文件行号变化但 anchor 文本仍存在时能找到新行。
- [ ] 写测试：无法解析时记录候选行和诊断，而不是直接删除书签。
- [ ] 实现 anchor 构建。
- [ ] 实现基础 anchor resolve。
- [ ] 创建书签和保存前补齐缺失 anchor。
- [ ] 运行 anchor 服务测试。

**Acceptance:**

- VS Code 写出的书签包含 IDEA 版可使用的锚点字段。
- 跨 IDE 修改代码后，书签更不容易因行号漂移失效。

### Task 6: 颜色、编号和 UI 展示适配

**Files:**

- Modify: `src/core/groupManager.ts`
- Modify: `src/views/treeProvider.ts`
- Modify: `src/views/decorationManager.ts`
- Modify: `src/services/svgIconCache.ts`
- Test: relevant unit tests

**Steps:**

- [ ] 将持久化颜色从 HEX 思维切换为 canonical color token。
- [ ] UI 层提供 color token 到 HEX / icon 的映射。
- [ ] 分组编号不再作为 canonical 持久字段依赖。
- [ ] `displayName` 改为基于 `displayOrder` 派生。
- [ ] 验证拖拽排序后 `displayOrder` 与 UI 编号一致。
- [ ] 验证 Ghost Text / gutter icon 仍正常显示。
- [ ] 运行 compile 和相关测试。

**Acceptance:**

- VS Code UI 表现不倒退。
- IDEA 打开同一份数据时颜色和排序合理。

### Task 7: 导入导出兼容策略

**Files:**

- Modify: `src/services/importExportService.ts`
- Modify: `src/data/storageService.ts`
- Test: `tests/unit/importExportService.test.ts`

**Steps:**

- [ ] 保留现有 export bundle 格式，避免破坏用户已有流程。
- [ ] 增加 canonical export 选项或内部能力，便于直接导出 `.group-bookmarks/bookmarks.json`。
- [ ] 导入旧 bundle 时先转 canonical，再写 repository file。
- [ ] 导入 canonical file 时直接校验并写入。
- [ ] 写测试覆盖旧格式导入。
- [ ] 写测试覆盖 canonical 格式导入。
- [ ] 运行 import/export 测试。

**Acceptance:**

- 用户仍可用旧导出文件。
- 新导出的数据天然适合跨 IDE 共享。

### Task 8: 文档与用户提示

**Files:**

- Modify: `README.md`
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`

**Steps:**

- [ ] README 增加“跨 VS Code / IDEA 共用同一份 `.group-bookmarks` 数据”的说明。
- [ ] 用户指南说明新数据位置。
- [ ] 用户指南说明旧 `.vscode/groupbookmarks` 会自动迁移。
- [ ] 用户指南说明两个 IDE 同时编辑时可能出现保存冲突。
- [ ] 架构文档更新 canonical storage 设计。
- [ ] roadmap 标记旧 “直接导入导出兼容” 方案升级为 “共享 sidecar 协议”。

**Acceptance:**

- 用户能理解数据在哪里、如何同步、如何处理冲突。
- 文档不再暗示 `.vscode/groupbookmarks` 是主存储。

### Task 9: 第一阶段端到端验证

**Files:**

- No production file changes expected
- Add test fixtures if needed under `tests/fixtures/`

**Steps:**

- [ ] 准备一个 fixture：IDEA canonical `bookmarks.json`。
- [ ] VS Code 测试读取 fixture，验证分组、书签、Key Notes 均加载。
- [ ] VS Code 修改一个书签标题，保存后验证 canonical file 仍能被 schema 读取。
- [ ] VS Code 新增一个 Key Note，保存后验证字段为 `markdownContent`。
- [ ] 手工用 IDEA 打开同一仓库，确认能看到 VS Code 写入的数据。
- [ ] 手工用 VS Code 打开 IDEA 写过的数据，确认能看到 IDEA 写入的数据。
- [ ] 运行完整验证命令：`npm run compile`、`npm run typecheck`、`npm run test`。

**Acceptance:**

- 同一个仓库、同一份 `.group-bookmarks/bookmarks.json`，两个 IDE 都能读写正式数据。

## 6. 第二阶段：AI Staged Bookmarks 计划

### Task 10: 引入 staged bookmarks schema

**Files:**

- Create: `src/models/stagedBookmarkTypes.ts`
- Create: `src/data/stagedBookmarksStore.ts`
- Test: `tests/unit/stagedBookmarksStore.test.ts`

**Steps:**

- [ ] 对齐 IDEA `StagedBookmarksFile`、`StagedBookmarkGroupState`、`StagedBookmarkChangeState`。
- [ ] 读取 `.group-bookmarks/staged-bookmarks.json`。
- [ ] 文件不存在时创建默认空文件。
- [ ] 保存时使用冲突检测。
- [ ] 测试 schema 默认值和 round-trip。

### Task 11: 支持 AI import batch drop-zone

**Files:**

- Create: `src/services/stagedImportCoordinator.ts`
- Create: `src/services/stagedImportValidator.ts`
- Create: `src/services/stagedImportService.ts`
- Test: `tests/unit/stagedImportService.test.ts`

**Steps:**

- [ ] 创建 inbox / processing / processed / failed / receipts 目录。
- [ ] claim inbox 中的 `.json` batch。
- [ ] 校验 import batch 只包含允许字段。
- [ ] 解析 `targetGroupName/items/title/filePath/line/expectedLineText/placement`。
- [ ] 根据实际文件补齐 line anchor 和上下文。
- [ ] 写入 staged bookmarks。
- [ ] 成功 batch 归档到 processed。
- [ ] 失败 batch 归档到 failed 并生成 error 文本。
- [ ] 重复 batch 通过 receipt 跳过。

### Task 12: VS Code staged review UI

**Files:**

- Create: `src/views/stagedBookmarksTreeProvider.ts`
- Create: `src/views/stagedBookmarksCommandHandler.ts`
- Modify: `package.json`
- Modify: `src/extension.ts`

**Steps:**

- [ ] 注册 `Staged Bookmarks` 视图。
- [ ] 显示 staged groups 和 changes。
- [ ] 支持跳转到 candidate 文件行。
- [ ] 支持 apply 单个 staged change。
- [ ] 支持 apply group。
- [ ] 支持 skip / clear imported session。
- [ ] 支持 import all drop-zone batches。
- [ ] 支持显示 `needsReview` 状态。

### Task 13: AI prompt pack 复用

**Files:**

- Create or copy: `.group-bookmarks/ai/README.md`
- Create or copy: `.group-bookmarks/ai/staged-bookmarks.schema.json`
- Create or copy: `.group-bookmarks/ai/skill/stage-bookmarks-full/`
- Create or copy: `.group-bookmarks/ai/skill/stage-bookmarks-changes/`

**Steps:**

- [ ] 复制 IDEA 版 prompt pack。
- [ ] 保持 import batch contract 不变。
- [ ] 校验脚本兼容 VS Code 项目路径。
- [ ] 文档说明 AI 不能直接写 `bookmarks.json` 或 `staged-bookmarks.json`。
- [ ] 验证 AI 生成 batch 后 VS Code 可导入。
- [ ] 验证同一 batch IDEA 也可导入。

## 7. 测试策略

### 单元测试

- `repositoryMapper`
  - 字段映射
  - 缺省值
  - 颜色映射
  - 路径标准化
- `repositoryStore`
  - 默认文件创建
  - 原子写入
  - 冲突检测
  - parse failure 保护
- `legacyStorageMigration`
  - 旧多文件迁移
  - 已存在 canonical 时不覆盖
- `bookmarkAnchorService`
  - 锚点生成
  - 漂移定位
- `stagedImportService`
  - 第二阶段 batch 导入、失败归档、receipt 去重

### 集成测试

- 从 fixture `.group-bookmarks/bookmarks.json` 启动 VS Code 数据层。
- 修改 VS Code 内部模型后保存，验证 canonical JSON 未丢集合。
- 从旧 `.vscode/groupbookmarks/` fixture 启动，验证迁移结果。
- 第二阶段验证 drop-zone import 到 staged state。

### 手工验证

- IDEA 创建分组和书签，VS Code 打开同一仓库能看到。
- VS Code 创建分组和书签，IDEA 打开同一仓库能看到。
- IDEA 创建 Key Note，VS Code 能搜索/预览。
- VS Code 创建 Key Note，IDEA 能打开虚拟文件或详情视图。
- 两个 IDE 先后编辑同一份数据时，后保存的一方能感知冲突。

## 8. 风险与处理

### 风险 1：两个 IDE 同时打开导致覆盖

处理：

- 第一阶段不做复杂 merge。
- 每次保存前比较文件 stamp/hash。
- 发现外部修改时拒绝覆盖，提示用户 reload repository data。

### 风险 2：旧 VS Code `displayName/number` 与 IDEA 不一致

处理：

- 不把 `displayName/number` 作为 canonical 字段。
- UI 展示时根据 `displayOrder` 派生编号。
- 迁移时只保留 `name` 和排序。

### 风险 3：颜色表达不一致

处理：

- canonical 存 enum token。
- VS Code UI 层做 token 到 HEX 的映射。
- 无法识别的颜色默认 `BLUE`。

### 风险 4：行号漂移策略差异

处理：

- VS Code 侧补齐 IDEA 使用的 anchor 字段。
- 保存时尽量刷新 anchor。
- 无法定位时标记 stale/candidate，而不是删除数据。

### 风险 5：多 workspace 支持复杂

处理：

- 第一阶段优先支持单 workspace 或第一个 workspace folder。
- 多 workspace 后续再增加明确 repository root 配置。
- 文档明确第一阶段行为。

### 风险 6：AI staged UI 工作量膨胀

处理：

- 第一阶段只做正式数据共用。
- staged/import/review 放第二阶段。
- 第二阶段先实现最小可用：导入、列表、跳转、apply、clear。

## 9. 推荐里程碑

### Milestone A: 正式数据共用

- 完成 Task 1 到 Task 4。
- VS Code 可读写 `.group-bookmarks/bookmarks.json`。
- 旧 `.vscode/groupbookmarks` 可迁移。
- 现有 UI 基本不变。

### Milestone B: 跨 IDE 稳定性

- 完成 Task 5 到 Task 9。
- 补齐锚点、颜色、排序、导入导出、文档。
- 手工验证 IDEA 与 VS Code 双向读写。

### Milestone C: AI 书签共用

- 完成 Task 10 到 Task 13。
- VS Code 版支持 IDEA 同款 AI import batch 和 staged review 流程。

## 10. 建议提交粒度

- Commit 1: canonical schema and mapper
- Commit 2: repository store with conflict protection
- Commit 3: legacy storage migration
- Commit 4: storage service backed by canonical sidecar
- Commit 5: bookmark anchors and drift basics
- Commit 6: UI color/order compatibility
- Commit 7: import/export and docs
- Commit 8: staged schema and store
- Commit 9: staged import drop-zone
- Commit 10: staged review UI and AI prompt pack

## 11. 完成定义

第一阶段完成时：

- [ ] VS Code 新建数据时生成 `.group-bookmarks/bookmarks.json`。
- [ ] VS Code 不再把 `.vscode/groupbookmarks/` 当主存储。
- [ ] 旧 `.vscode/groupbookmarks/` 数据可迁移。
- [ ] VS Code 写出的 `bookmarks.json` 可被 IDEA 版读取。
- [ ] IDEA 写出的 `bookmarks.json` 可被 VS Code 版读取。
- [ ] 正式书签、分组、关系、Key Notes 均可跨 IDE 共用。
- [ ] 保存冲突不会静默覆盖外部修改。
- [ ] 文档说明新存储位置和迁移行为。

第二阶段完成时：

- [ ] VS Code 支持 `.group-bookmarks/staged-bookmarks.json`。
- [ ] VS Code 支持 `.group-bookmarks/drop-zone/inbox/*.json` AI batch 导入。
- [ ] 同一 AI prompt pack 生成的 batch 可被 VS Code 和 IDEA 导入。
- [ ] VS Code 具备最小 staged review/apply 能力。
