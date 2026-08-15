# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

马术障碍赛路线设计器 - 一个支持在线设计、保存和分享马术障碍赛路线的 Web 应用。前后端分离单仓库（`FrontEnd/` + `BackEnd/`），含实时协作（WebSocket）与 AI 路线生成。

## 常用命令

### 前端（Vue 3 + TypeScript + Vite，包管理器为 pnpm）

```bash
cd FrontEnd

pnpm install              # 安装依赖（也可用 npm install）
pnpm dev                  # 开发服务器（vite --host 0.0.0.0）
pnpm build                # 生产构建（先跑 type-check 再 vite build）
pnpm preview              # 预览构建产物
pnpm test                 # vitest 监听模式
pnpm test:run             # vitest 单次运行
npx vitest run src/utils/__tests__/jsonExportEngine.test.ts   # 运行单个测试文件

# 前后端类型契约：从后端 OpenAPI schema 生成前端 TS 类型
pnpm api-types:generate   # 读取 ../BackEnd/openapi.json，写入 src/types/generated-api.ts
pnpm api-types:check      # 仅校验生成产物是否与 schema 一致（CI 用）
```

> 改动后端接口后，记得重新跑 `pnpm api-types:generate` 同步前端类型，否则 `src/types/generated-api.ts` 会与后端漂移。

### 后端（Django 5.2 + DRF，Python 3.12+，依赖管理用 uv）

```bash
cd BackEnd

uv sync                   # 按 pyproject.toml / uv.lock 安装依赖（也可 pip install -r requirements.txt）
python manage.py runserver
python manage.py makemigrations
python manage.py migrate
python manage.py makemigrations <app_name>   # 仅指定 app
python manage.py createsuperuser
python manage.py collectstatic
python manage.py check_local_setup           # 本地环境自检：数据库/Redis/AI/支付配置是否就绪
python manage.py test                        # 跑全部测试
python manage.py test user.tests.<模块名>     # 跑指定测试模块
```

数据库为 MySQL 8.0+，实时协作依赖 Redis（Channel Layers + 缓存）。

## 架构概览

### 前端结构（`FrontEnd/src/`）

- **路由**：`router/index.ts`（Vue Router SPA）
- **状态管理**：`stores/`（Pinia 模块化）——`course`（画布/路线状态）、`history`（撤销重做）、`obstacle`、`user`、`theme`、`websocket`（协作）
- **API 层**：`api/`（Axios 封装，按域拆分：`user`/`design`/`obstacle`/`order`/`template`/`feedback`/`ai`），统一在 `utils/request.ts` 处理拦截、错误、token 刷新
- **类型**：`types/` 手写接口 + `types/generated-api.ts`（由后端 OpenAPI 自动生成，**勿手改**）
- **导出引擎**：`utils/` 下按格式分文件——`jsonExportEngine`/`pdfExportEngine`/`pngExportEngine`，以及多层 canvas 渲染降级链（`canvasRenderer` → `canvasFallbackRenderer` → `backupCanvasRenderer`/`canvasBackupRenderer`）和 SVG→Canvas 转换（`svgToCanvasConverter` 等）。导出相关改动先看 `utils/README.md`、`utils/API_CACHE_GUIDE.md`
- **视图/组件**：`views/`（页面级）、`components/`（可复用）

### 后端结构（`BackEnd/`）

- **主项目配置**：`equestrian/`（`settings.py` 含 DRF、JWT、Channels、Redis、CORS 配置）
- **user 应用**（核心域，功能远多于“用户”）：按域拆分视图到 `user/views/`——`auth_views`、`design_views`、`obstacle_views`、`payment_views`、`template_views`、`user_views`，外加顶层 `ai_views.py`（AI 路线生成/教练笔记/配额）、`share_link_view.py`（协作分享）
- **领域逻辑**：`user/route_generator.py`、`route_validator.py`（路线生成与校验）、`user/llm_providers.py`（LLM 供应商抽象）、`user/services/`（`design_version` 版本管理、`membership_access` 会员权限）
- **实时协作**：`user/consumers.py` + `user/routing.py`（Django Channels WebSocket）
- **其他应用**：`obstacles/`（障碍物库）、`feedback/`（用户反馈）
- **测试**：`user/tests/` 按域拆分（与视图拆分对应）

### 认证机制（重要）

JWT 认证基于 `djangorestframework-simplejwt`，但**自定义了 Cookie 模式**：

- `user/authentication.py` 的 `CookieJWTAuthentication`：从 HTTP-only cookie 读取 access token
- `CookieTokenRefreshView`：刷新 token 也从 cookie 读取，而非请求体
- 标准 `JWTAuthentication` 作为兜底
- 前端通过 `/user/csrf/` 获取 CSRF token（写操作需携带）

改动认证流程时需同时考虑 cookie 写入/清除与 CSRF。

### API 路由前缀（注意：非 `/api/v1/`）

- 用户/设计/自定义障碍物/会员支付/AI/模板：`/user/`（见 `user/urls.py`，ViewSet 自动路由 + 函数视图混合）
- 反馈：`/api/feedback/`
- 实时协作：`/ws/collaboration/<design_id>/`
- Django Admin：`/admin/`
- 支付回调等少数内部路由在 `/user/api/payment/...` 下

> README 中历史遗留的 `/api/v1/` 前缀**已失效**，不代表当前代码。完整接口见 `docs/API.md` 与 `BackEnd/openapi.json`。

## 关键约定

1. **语言**：所有代码、注释、文档使用中文
2. **导入顺序**：前端 `外部包 → @/ 别名 → 相对路径`；后端 `标准库 → 第三方 → 本地应用`
3. **类型**：禁止 `any`；可选值用 `null` 不用 `undefined`
4. **组件命名**：PascalCase（如 `CourseCanvas.vue`）
5. **后端错误响应格式**：
   ```python
   Response({
       'code': status.HTTP_400_BAD_REQUEST,
       'message': {'field': ['错误信息']},
   }, status=status.HTTP_400_BAD_REQUEST)
   ```
6. **前端 API 响应**：统一信封（success/data/message），由 `utils/request.ts` 拦截器归一化
7. **不可变更新**：状态变更返回新对象，不原地 mutate（Pinia store 尤需注意）

## 相关文档

- `AGENTS.md` - 同等内容的开发规范（Codex 用，与本文保持同步）
- `README.md` - 项目介绍与快速开始
- `docs/API.md` - 完整接口清单
- `docs/plans/` - 功能实现计划文档
- `BackEnd/openapi.json` - 后端 OpenAPI schema（前端类型生成来源，勿手改）
