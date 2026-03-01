# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

马术障碍赛路线设计器 - 一个支持在线设计、保存和分享马术障碍赛路线的 Web 应用。

## 常用命令

### 前端

```bash
cd FrontEnd

# 开发服务器
npm run dev

# 生产构建（包含类型检查）
npm run build

# 预览构建
npm run preview

# 测试（监听模式）
npm run test

# 测试（单次运行）
npm run test:run

# 运行单个测试文件
npx vitest run src/utils/__tests__/jsonExportEngine.test.ts
```

### 后端

```bash
cd BackEnd

# 开发服务器
python manage.py runserver

# 数据库迁移
python manage.py makemigrations
python manage.py migrate

# 创建超级用户
python manage.py createsuperuser

# 运行测试
python manage.py test

# 创建迁移文件并应用
python manage.py makemigrations <app_name>
python manage.py migrate <app_name>
```

## 架构概览

### 前端架构 (Vue 3 + TypeScript)

- **路由**：`src/router/index.ts` - Vue Router SPA 导航
- **状态管理**：`src/stores/` - Pinia 模块化存储
- **API 层**：`src/api/` - Axios HTTP 客户端封装
- **类型定义**：`src/types/` - TypeScript 接口定义
- **工具函数**：`src/utils/` - 导出引擎（PDF/PNG/JSON）、SVG 转换等
- **视图**：`src/views/` - 页面级组件
- **组件**：`src/components/` - 可复用组件

### 后端架构 (Django + DRF)

- **主项目**：`BackEnd/equestrian/` - Django 项目配置
- **用户模块**：`BackEnd/user/` - 用户、会员、订单、路线设计
- **障碍物模块**：`BackEnd/obstacles/` - 障碍物管理
- **反馈模块**：`BackEnd/feedback/` - 用户反馈
- **认证**：使用 `djangorestframework-simplejwt` 的 JWT Token 认证
- **API 路由**：`/api/v1/` 前缀

### 实时协作

- 使用 Django Channels 和 WebSocket (`src/stores/websocket.ts`)

## 关键约定

1. **语言**：所有代码、注释、文档使用中文
2. **导入顺序**：
   - 前端：外部包 → 内部别名 (`@/`) → 相对路径
   - 后端：标准库 → 第三方库 → 本地应用
3. **类型**：禁止使用 `any`，可选值使用 `null` 而非 `undefined`
4. **组件命名**：PascalCase（`CourseCanvas.vue`）
5. **错误响应格式**：
   ```python
   Response({
       'code': status.HTTP_400_BAD_REQUEST,
       'message': {'field': ['错误信息']},
   }, status=status.HTTP_400_BAD_REQUEST)
   ```

## 相关文档

- `AGENTS.md` - 详细的开发规范和命令
- `.cursor/rules/eq.mdc` - Cursor IDE 规则
- `README.md` - 项目介绍和快速开始
- `docs/plans/` - 功能实现计划文档
