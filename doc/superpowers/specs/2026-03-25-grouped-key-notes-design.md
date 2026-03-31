# 分组词条笔记设计稿

日期：2026-03-25  
状态：待评审  
范围：为 VS Code 扩展设计一个“工作区内有效”的分组词条笔记功能

## 1. 概述

这个功能会在现有“按代码行定位的书签系统”旁边，新增一套“按词条记录上下文”的笔记系统。

当前书签模型适合解决“这行代码很重要”这一类问题，但不适合解决“这个词在整个项目里反复出现，我希望随时看到它的说明”这一类问题。用户希望选中一个表名、字段名、接口名、API 路径，记录一份 Markdown 备注；之后在工作区内再次选中同一个词时，可以直接看到对应说明。

新能力需要满足以下要求：

- 仅在当前工作区内生效
- 支持 Markdown 笔记正文
- 支持分组，交互尽量贴近现有书签分组体验
- 一个词条笔记可以属于多个分组
- 匹配规则为“完整文本精确匹配，忽略大小写”
- 再次选中同一个词时，可以自动显示笔记内容
- 提供独立的侧边栏视图进行管理

这不是对现有“行书签”做小修小补，而是一套新的“词条笔记”子系统。它应与书签并存，但不应复用书签的核心身份模型。

## 2. 目标

- 允许用户基于当前选中文本创建一条词条笔记
- 允许用户对词条笔记进行分组管理
- 支持一个词条归属于多个分组
- 在适当的地方复用现有书签分组的交互习惯
- 提供适合多行内容的 Markdown 编辑体验，而不是单行输入框
- 当用户再次选中同一个词条时，自动显示该笔记
- 保持数据只存储在当前工作区

## 3. 非目标

- 跨工作区或跨机器共享词条笔记
- 模糊匹配、子串匹配、语义匹配
- 同一个词条按语言或目录拥有不同版本的笔记
- 同一个词条在不同分组下拥有不同正文
- 基于 Webview 的富文本编辑器
- V1 版本中的导入导出能力
- 将词条笔记混入现有 Bookmark 树视图

## 4. 用户问题

典型场景包括：

- 某个数据库表名会出现在 SQL、后端代码、迁移脚本、API 处理中
- 某个外部 API 路径或服务标识符会出现在多个模块中
- 某个字段名有明确业务含义，但一段时间后很容易忘记

目前用户往往需要反复给这些位置打书签来保留上下文，但书签的本质是“文件位置”。用户真正需要的是“这个词代表什么”，而不是“这行代码在哪”。

## 5. 产品形态

扩展将在现有扩展容器下新增第二个功能区：

- `Bookmarks`：现有按代码位置组织的分组书签
- `Key Notes`：新增按词条组织的分组笔记

这两套系统会在使用上相互补充，但在存储、身份、UI 状态上保持分离。

## 6. 功能需求

### 6.1 从选区创建词条笔记

用户可以在编辑器中选中文本，然后通过右键命令：

- `Add Note for Selection`

完成创建流程。

建议流程如下：

1. 读取当前选区文本
2. 校验选区必须是单段、非空文本
3. 对选中内容进行规范化，生成匹配键
4. 选择目标分组：
   - 如果当前存在活动词条分组，则默认使用
   - 否则弹出 Quick Pick 让用户选择或创建分组
5. 如果相同 `normalizedTerm` 的词条已经存在：
   - 不创建重复词条
   - 如果当前分组下还没有关联关系，则补建关联
   - 直接打开已有词条进入编辑
6. 如果词条不存在：
   - 创建词条本体
   - 创建分组关联
   - 打开词条进入编辑

### 6.2 工作区内匹配规则

匹配规则固定为：

- 完整文本精确匹配
- 忽略大小写
- 不做子串匹配
- 不做模糊匹配
- 除去前后空白外，不额外去掉符号或标点

初始规范化规则建议为：

```ts
normalizedTerm = selectedText.trim().toLowerCase();
```

示例：

- `USER_TABLE` 可以命中 `user_table`
- `User_Table` 可以命中 `user_table`
- `user` 不能命中 `user_table`

### 6.3 自动显示词条笔记

当用户在编辑器中再次选中文本时，扩展应尝试查找是否存在对应词条笔记。

若命中，应自动展示一段 Markdown 预览，内容包含：

- 词条展示名
- 所属分组列表
- 笔记正文

建议的预览样式如下：

```md
**user_table**

Groups: `DB` `Core Schema`

# 用户表
用于存储认证和资料流程依赖的核心用户记录。
```

### 6.4 分组侧边栏管理

新增独立树视图：

- 视图容器：沿用当前 `groupBookmarks` activity bar 容器
- 新 view id：`groupKeyNotesView`
- 新 view name：`Key Notes`

树结构建议为：

- 顶层为分组节点
- 分组下为词条笔记节点

应支持以下能力：

- 创建分组
- 重命名分组
- 删除分组
- 设为活动分组
- 取消活动分组
- 打开词条笔记
- 将词条从当前分组移除
- 彻底删除词条
- 将词条添加到其他分组

V1 应保持简单、稳定。分组排序应尽量贴近现有 bookmark group 的行为；分组内词条顺序应由 relation 控制，方式与现有 bookmark relation 一致。

### 6.5 Markdown 编辑体验

词条正文应在 Markdown 友好的编辑体验中完成，而不是输入框。

要求：

- 打开词条时应以 Markdown 文档形式呈现
- 用户可以自然地编辑多行 Markdown 内容
- 保存时应回写到工作区存储
- 关闭后再次打开时内容应保持一致

正文只存储一份，不随分组复制。

## 7. 数据模型

词条笔记子系统在概念上与现有书签架构平行，但不应直接复用书签实体。

### 7.1 KeyNote

```ts
interface KeyNote {
  id: string;
  term: string;
  normalizedTerm: string;
  contentMarkdown: string;
  createdAt: number;
  updatedAt: number;
  lastViewedAt?: number;
}
```

规则：

- `term` 保留首次创建时的原始文本，用于展示
- `normalizedTerm` 作为唯一匹配键
- `contentMarkdown` 在所有分组之间共享

### 7.2 KeyNoteGroup

该结构应尽量贴近当前 Group 的定义，以减少实现与体验分叉。

```ts
interface KeyNoteGroup {
  id: string;
  name: string;
  displayName: string;
  number: number;
  color: GroupColor;
  order: number;
  createdAt: number;
  updatedAt: number;
}
```

### 7.3 KeyNoteGroupRelation

```ts
interface KeyNoteGroupRelation {
  id: string;           // `${keyNoteId}_${groupId}`
  keyNoteId: string;
  groupId: string;
  order: number;
  createdAt: number;
}
```

## 8. 存储设计

该功能仍然只在当前工作区有效，因此存储位置应与现有书签保持一致：

```text
.vscode/groupbookmarks/
```

新增文件建议为：

```text
key-notes.json
key-note-groups.json
key-note-relations.json
```

对应的序列化结构建议为：

```ts
interface KeyNotesData {
  version: string;
  notes: KeyNote[];
}

interface KeyNoteGroupsData {
  version: string;
  groups: KeyNoteGroup[];
}

interface KeyNoteRelationsData {
  version: string;
  relations: KeyNoteGroupRelation[];
}
```

补充规则：

- 不修改现有 bookmark 相关文件
- 如果文件不存在，默认视为空数据集
- 备份策略应沿用当前 `StorageService` 的行为模式

## 9. 交互设计

### 9.1 创建时的分组选择

词条创建流程应尽量贴近当前添加书签的手感。

推荐行为：

- 如果存在活动词条分组，则直接使用
- 如果不存在活动词条分组，则提示用户选择一个分组
- Quick Pick 里应支持边输入边创建新分组

这里的活动分组应与书签系统分离。词条笔记和行书签的操作上下文不同，不应共享同一个 active group 状态。

### 9.2 删除语义

删除需要明确区分两类动作：

- `Remove from Group`
  - 仅删除当前分组下的 relation
  - 词条本体和其他分组关联仍保留
- `Delete Note`
  - 删除词条本体
  - 同时删除它在所有分组中的关系

删除分组时，只移除该分组下的所有 relation；若词条仍被其他分组引用，则不应删除词条正文。

### 9.3 去重规则

对于同一个 `normalizedTerm`，系统中只能存在一条词条本体。

当用户再次选中仅大小写不同的同一词条时：

- 不创建新的词条本体
- 如果当前分组缺少 relation，则补建 relation
- 然后直接打开已有词条

## 10. VS Code 集成设计

### 10.1 建议新增命令

- `groupBookmarks.addKeyNoteFromSelection`
- `groupBookmarks.createKeyNoteGroup`
- `groupBookmarks.renameKeyNoteGroup`
- `groupBookmarks.deleteKeyNoteGroup`
- `groupBookmarks.setActiveKeyNoteGroup`
- `groupBookmarks.unsetActiveKeyNoteGroup`
- `groupBookmarks.openKeyNote`
- `groupBookmarks.removeKeyNoteFromGroup`
- `groupBookmarks.deleteKeyNote`
- `groupBookmarks.addExistingKeyNoteToGroup`
- `groupBookmarks.refreshKeyNotes`

### 10.2 上下文菜单

编辑器右键菜单：

- `Add Note for Selection`

`Key Notes` 视图标题栏：

- 创建分组
- 刷新

`Key Notes` 分组节点右键菜单：

- 重命名分组
- 删除分组
- 设为活动
- 取消活动

`Key Notes` 词条节点右键菜单：

- 打开或编辑词条
- 从当前分组移除
- 删除词条
- 添加到其他分组

### 10.3 Tree Provider

建议为 `Key Notes` 单独实现一套 Tree Provider，而不是在现有 `BookmarkTreeProvider` 上继续扩展。两者虽然数据形态相似，但命令语义与交互边界已经明显不同，独立实现会更清晰，也更易维护。

### 10.4 自动预览触发条件

扩展应监听激活编辑器中的选区变化。

V1 建议限制触发条件为：

- 仅一个选区
- 选区非空
- 选区不跨多行
- `trim` 后长度在安全范围内，例如 `1-120` 个字符
- 使用 debounce 降低抖动和误触发

### 10.5 预览展示机制

目标行为是：

- 当选中词条命中时，展示 Markdown 预览
- 预览顶部显示词条名和所属分组

实现层需要注意一点：

VS Code 对“根据选区主动弹出标准 Hover”并没有特别顺手、稳定的原生接口，所以设计层需要允许实现方案降级：

- 首选：通过命令触发接近 Hover 的预览体验
- 次选：通过 editor decoration 的 hover 能力附着在当前选区附近
- 兜底：除非原生方式确实不可行，否则 V1 不接受临时 webview 或信息面板代替

在 implementation planning 阶段，需要先验证哪条路径在真实编辑器行为中最稳。

## 11. 编辑架构

Markdown 编辑应基于专门的 note document 模型，而不是简单输入框。

推荐方向：

- 为词条笔记定义一个自定义 URI scheme
- 每条词条以虚拟 Markdown 文档形式打开
- 保存时将内容持久化回 note store

示例 URI：

```text
groupbookmarks-key-note:/<noteId>.md
```

预期行为：

- 打开词条时加载 `contentMarkdown`
- 保存文档时更新对应 `KeyNote`
- 保存成功后刷新树视图与预览缓存

可接受的替代实现：

- 生成一个临时的 untitled Markdown 文档，并通过元信息或拦截保存回写

计划阶段应选择“能稳定跑通 VS Code 保存语义”的最简单实现，而不是最花哨的实现。

## 12. 架构变更

当前扩展在 `src/extension.ts` 中初始化的是以 bookmark 为中心的服务。新增词条笔记后，需要并行加入一套 key-note 相关服务。

大概率会新增：

- `src/models/types.ts` 中新增类型，或拆出独立的 key-note 类型文件
- `src/data/storageService.ts` 增加词条笔记读写能力
- `src/data/dataManager.ts` 扩展 key-note 缓存和事件，或新增独立的 key-note data manager
- `KeyNoteManager`
- `KeyNoteGroupManager`
- `KeyNoteRelationManager`
- `KeyNoteTreeProvider`
- 选区预览服务
- 词条文档编辑服务

推荐边界：

- 词条笔记逻辑尽量与现有 bookmark manager 分开
- 只复用通用工具和存储模式

## 13. UX 风险

### 13.1 选区触发过于频繁

如果每次选中文本都立刻弹出内容，功能很容易变成打扰项。

缓解方式：

- 对选区变化加 debounce
- 短时间内同一词条不要重复弹出
- 空选区、多行选区不触发

### 13.2 “全局”一词产生歧义

这个需求里的“全局”指的是“跨分组命中”，不是“跨工作区共享”。后续 UI 文案和文档都应避免单独使用“全局”这个词，除非明确限定范围。

### 13.3 编辑保存可靠性

虚拟文档的保存流程如果 URI、生命周期、文档回写处理不好，会比较脆弱。实现阶段应尽早验证保存、关闭、重开、取消等路径。

## 14. 测试与验证范围

implementation planning 阶段至少应覆盖以下验证点：

- 从新选区成功创建词条
- 创建词条时可以顺手新建分组
- 同一词条大小写不同仍命中同一条笔记
- 选中子串时不会误命中
- 一条词条能同时出现在多个分组
- 编辑 Markdown 后保存成功并持久化
- 从一个分组移除后，其他分组中的词条仍存在
- 删除词条后，所有 relation 一并清理
- 删除一个分组后，仍被其他分组引用的词条不受影响
- 重开工作区后，词条和分组都能正确加载

## 15. 推荐的 V1 范围

建议按以下顺序实现：

1. 词条数据模型与存储
2. 分组与 relation manager
3. `Key Notes` 树视图
4. 从选区创建词条的流程
5. Markdown 词条编辑
6. 选区命中后的自动预览
7. 删除与 relation 管理命令

V1 的目标应是尽快形成完整闭环，而不是立刻补齐所有现有 bookmark 的便利功能。

## 16. 规划阶段待决项

这些属于实现规划问题，而不是产品需求问题，应在下一阶段决策：

- 是扩展现有 `DataManager`，还是单独做一个 key-note data manager
- 选区命中后的 Markdown 预览到底采用哪种技术路径
- 词条编辑采用 custom document provider 还是更简单的保存拦截模型
- 分组颜色是否直接复用现有 enum，还是拆成共享通用类型

## 17. 建议结论

建议在当前工作区存储体系内，新增一套独立的“分组词条笔记”子系统。它应复用书签分组的心智模型和熟悉的交互方式，但在数据模型、树视图、活动分组状态、编辑行为上与现有按行书签保持分离。

这样用户就能为重复出现的表名、字段名、接口名、API 路径保留稳定、可复用的语义说明，而不必再勉强用“行书签”去承载“词条上下文”。
