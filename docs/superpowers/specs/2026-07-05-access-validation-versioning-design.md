# 会员权限服务化、路线规则检查与版本恢复设计规格

## 背景

项目已经具备会员计划、设计存储额度、自定义障碍额度、AI 配额、实时协作、路线校验、自动保存和撤销重做等基础能力，但这些能力目前分散在多个视图、序列化器、消费者和前端状态中。随着会员权益、专业规则检查和版本恢复继续扩展，如果不先统一权限语义，后续功能会产生重复判断、边界不一致和回归风险。

本规格按已确认的 A 路线推进：

1. 会员/权限服务化
2. 路线规则检查面板
3. 设计版本历史 + 自动保存恢复

三阶段必须独立可上线，并坚持测试先行。

## 总体目标

- 将会员状态刷新、额度读取、权限判断和统一错误信息收敛到后端服务层。
- 将路线专业规则检查产品化为用户可见的检查面板，并支持画布定位。
- 将当前自动保存升级为可恢复、可对比、可回滚的版本与草稿体系。
- 保持现有功能兼容，避免重写画布编辑器或会员计费模型。

## 非目标

- Phase 1 不新增会员计划字段，不重构计费表结构，不新增复杂运营后台。
- Phase 2 不做设计版本保存，不把规则逻辑写入前端画布组件。
- Phase 3 不重写画布编辑器，不改变现有手动保存/导出主流程。
- 本轮不引入新的第三方付费服务。

## Phase 1：会员/权限服务化

### 目标

把当前散落在 `views`、`serializers`、`consumers` 和前端 store 中的会员与额度判断收敛到统一服务，确保个人中心展示、设计额度、自定义障碍额度、AI 配额和协作权限一致。

### 后端设计

新增服务模块：

- `BackEnd/user/services/__init__.py`
- `BackEnd/user/services/membership_access.py`

核心对象：

- `EntitlementSnapshot`
  - `user_id`
  - `plan_code`
  - `plan_name`
  - `is_premium_active`
  - `design_count`
  - `design_limit`
  - `custom_obstacle_count`
  - `custom_obstacle_limit`
  - `custom_obstacle_unlimited`
  - `ai_remaining_quota`
  - `can_collaborate`
  - `pending_plan`

核心方法：

- `get_entitlements(user) -> EntitlementSnapshot`
  - 调用现有会员到期刷新逻辑。
  - 读取设计数量、自定义障碍数量、AI 剩余额度和会员计划。
  - 返回不可变的权益快照，供接口序列化和权限判断复用。

- `assert_design_capacity(user) -> EntitlementSnapshot`
  - 如果设计数量达到限制，抛出统一业务异常。
  - 异常响应包含 `current_count`、`limit`、`is_limit_reached`、`plan_code`。

- `assert_custom_obstacle_capacity(user) -> EntitlementSnapshot`
  - 如果自定义障碍数量达到限制，抛出统一业务异常。
  - 高级会员 `custom_obstacle_limit=None` 表示无限制。

- `can_collaborate(user) -> bool`
  - 当前保持高级会员或邀请链接可协作的既有语义。
  - 后续如需调整协作权益，只改服务层。

迁移调用点：

- `BackEnd/user/views/design_views.py`
  - 创建设计前改用 `assert_design_capacity`。

- `BackEnd/user/views/obstacle_views.py`
  - `count` 与创建入口改用权益快照和容量断言。

- `BackEnd/user/serializers.py`
  - `CustomObstacleSerializer.create` 不再自行读取会员计划，改由服务层校验或由 view 注入已校验上下文。

- `BackEnd/user/consumers.py`
  - 协作权限从手写 `membership_plan.name == "高级会员"` 改为服务层判断。

- `BackEnd/user/views/user_views.py`
  - `my_profile` 返回权益快照字段，保持现有字段兼容。

- `BackEnd/user/ai_views.py`
  - 不改变 AI 扣减事务逻辑，但个人中心/配额展示纳入统一权益快照。

### 前端设计

扩展统一类型：

- `FrontEnd/src/types/user.ts`
  - 新增 `EntitlementSnapshot` 类型。
  - 个人中心、协作、AI 生成、自定义障碍管理读取统一字段。

调用点：

- `FrontEnd/src/stores/user.ts`
  - 存储 `entitlements`，同时保留现有 `is_premium_active` 字段兼容旧组件。

- `FrontEnd/src/views/UserProfile.vue`
  - 会员计划、设计额度、自定义障碍额度、AI 剩余次数从权益快照展示。

- `FrontEnd/src/components/CustomObstacleManager.vue`
  - 数量限制与超限提示使用权益快照字段。

- `FrontEnd/src/components/CollaborationPanel.vue` 与 websocket store
  - 协作可用性读取统一权限字段。

### 测试要求

后端测试：

- 免费用户设计额度为 5，自定义障碍额度为 10，不可开启高级协作。
- 标准会员设计额度为 100，自定义障碍额度为 50，不具备高级协作。
- 高级会员设计额度为 500，自定义障碍无限制，具备协作权限。
- 会员降级到期后所有入口读取同一份更新后的权益。
- 设计创建、自定义障碍创建、个人中心和协作权限保持一致。

前端测试：

- 用户 store 能保存并刷新 `entitlements`。
- 个人中心基于权益快照展示当前计划与额度。
- 自定义障碍管理在超限时展示统一提示。

## Phase 2：路线规则检查面板

### 目标

把现有 `RouteValidator` 的规则检查能力从 AI 生成反馈扩展为设计器内的专业检查面板，让用户在编辑路线时看到可操作的专业建议。

### 后端设计

扩展 `BackEnd/user/route_validator.py` 的输出结构，新增结构化 issue：

- `code`：规则代码，例如 `MIN_DISTANCE`、`BOUNDARY_DISTANCE`、`HEIGHT_RANGE`。
- `severity`：`error`、`warning`、`info`。
- `message`：中文说明。
- `obstacle_ids`：关联障碍物 ID 或编号。
- `suggested_action`：建议操作，例如移动障碍、调整高度、检查路径方向。
- `auto_fixable`：是否可自动修复。

新增或扩展 API：

- 推荐新增 `POST /user/designs/validate-course/`
- 请求体包含当前路线 JSON、场地尺寸、难度。
- 响应包含：
  - `score`
  - `is_valid`
  - `issues`
  - `warnings`
  - `auto_fixed`
  - `summary`

### 前端设计

新增组件：

- `FrontEnd/src/components/RouteValidationPanel.vue`

职责：

- 展示路线总评分。
- 分组展示严重问题、警告、自动修复记录。
- 支持点击问题定位障碍物。
- 支持手动触发“重新检查”。
- 如果后端返回可自动修复建议，展示“应用自动修复”。

状态扩展：

- `FrontEnd/src/stores/course.ts`
  - 新增当前校验结果。
  - 新增当前高亮 issue / obstacle。
  - 提供 `setValidationResult`、`highlightValidationIssue`、`clearValidationHighlight`。

画布联动：

- `CourseCanvasV2.vue` 只根据 store 中的高亮信息渲染辅助效果。
- 画布不实现规则判断。
- 点击 issue 后，高亮相关障碍物，间距/边界问题显示辅助线。

### 测试要求

后端：

- 空路线返回 invalid。
- 障碍物距离过近返回结构化 error。
- 边界距离不足返回结构化 warning/error。
- 高度超出难度范围返回可自动修复记录。

前端：

- 规则面板正确渲染 score、issue、warning。
- 点击 issue 调用 store 高亮方法。
- 无问题时展示“未发现需要处理的问题”。

## Phase 3：设计版本历史 + 自动保存恢复

### 目标

提升用户对保存可靠性的信任，支持从本地草稿恢复，也支持从服务端版本历史预览、恢复和复制。

### 后端设计

新增模型：

- `DesignVersion`
  - `design`：关联 `Design`
  - `author`
  - `version_number`
  - `source`：`manual`、`autosave`、`ai`、`restore`
  - `title`
  - `description`
  - `course_data`
  - `image_snapshot` 或现有文件引用策略
  - `download_snapshot` 或现有文件引用策略
  - `created_at`

API：

- `GET /user/designs/{id}/versions/`
  - 返回版本列表。

- `GET /user/designs/{id}/versions/{version_id}/`
  - 返回版本详情用于预览。

- `POST /user/designs/{id}/versions/{version_id}/restore/`
  - 将版本恢复为当前设计，并创建新的 `restore` 版本。

- `POST /user/designs/{id}/versions/{version_id}/copy/`
  - 复制为新设计。

版本创建策略：

- 手动保存时创建版本。
- AI 生成应用到画布后首次保存标记 `ai` 来源。
- 恢复版本时创建新的 `restore` 来源版本。
- 自动保存默认先保留本地；服务端自动版本可作为后续增强，不纳入第一版。

### 前端设计

本地草稿升级：

- 当前全局 `autosaved_course` 改为按用户 + 设计 ID 分桶。
- 草稿元数据包含：
  - `user_id`
  - `design_id`
  - `course_id`
  - `saved_at`
  - `dirty`
  - `schema_version`

冲突恢复：

- 打开设计时比较本地草稿时间和服务端更新时间。
- 如果本地草稿较新，提示：
  - 恢复草稿
  - 使用服务端版本
  - 另存为新设计

新增组件：

- `FrontEnd/src/components/DesignVersionHistory.vue`
  - 展示版本时间线。
  - 支持预览、恢复、复制为新设计。

### 测试要求

后端：

- 保存设计时创建版本。
- 版本列表只返回当前用户有权访问的设计版本。
- 恢复版本会更新当前设计并新增 restore 版本。
- 复制版本会创建新设计且不影响原设计。

前端：

- 本地草稿 key 按用户和设计隔离。
- 损坏草稿不会阻塞页面加载。
- 有更新草稿时显示恢复选择。
- 版本历史组件能渲染版本列表并触发恢复/复制动作。

## 分阶段交付顺序

### Milestone 1：权限服务化

- 新增后端服务和权益快照。
- 迁移设计、自定义障碍、协作、个人中心关键调用点。
- 前端统一权益类型和用户 store。
- 补齐权限边界测试。

### Milestone 2：规则检查面板

- 扩展后端规则检查结构化输出。
- 新增路线校验 API。
- 新增前端规则检查面板。
- 支持点击定位与画布高亮。

### Milestone 3：版本历史与恢复

- 新增服务端版本模型与 API。
- 升级本地自动保存分桶策略。
- 新增版本时间线组件。
- 支持恢复、复制和草稿冲突选择。

## 风险与缓解

- 权限服务重构影响面广：先用现有测试和新增边界测试锁定行为，再逐入口迁移。
- 路线规则可能误报：先展示建议和警告，不自动强制修改用户设计。
- 服务端版本可能占用存储：第一版只保留结构化数据和必要文件引用，后续再加版本保留策略。
- 自动保存恢复可能覆盖用户内容：所有覆盖动作必须经过用户确认，默认不静默覆盖。

## 验收标准

- 每个阶段都能独立通过后端测试与前端类型检查。
- 权限相关用户可见字段在个人中心、设计创建、自定义障碍、协作入口一致。
- 路线规则检查面板可以定位至少三类问题：距离、边界、高度。
- 用户能从本地草稿恢复未保存设计，并能从服务端版本恢复或复制历史版本。
- 所有新增业务逻辑都有先失败再通过的回归测试。
