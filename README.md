# 马术障碍赛路线设计器

一个用于设计马术障碍赛路线的 Web 应用程序，支持在线设计、保存和分享路线图。

## 技术栈

### 后端
- Python 3.8+
- Django 5.1.3
- Django REST framework
- SimpleUI (Django Admin 美化)
- MySQL 8.0+
- JWT 认证

### 前端
- Vue 3
- TypeScript
- Element Plus
- Pinia 状态管理
- Axios HTTP 客户端

## 功能特点

- 用户认证与授权
  - 用户注册/登录
  - JWT Token 认证
  - 基于角色的权限控制

- 路线设计
  - 可视化路线编辑
  - 障碍物放置与调整
  - 路线自动生成
  - 实时预览

- 设计管理
  - 设计保存与加载
  - 图片导出
  - 数据导出
  - 在线分享

- 后台管理
  - 用户管理
  - 设计作品管理
  - 数据统计

## 安装说明

1. 克隆项目
```bash
git clone [项目地址]
cd equestrian_course_designer
```

2. 后端设置
```bash
# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows 使用: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 创建数据库
mysql -u root -p
CREATE DATABASE equestrian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# 配置数据库
# 编辑 equestrian/settings.py 中的数据库配置

# 创建目录
mkdir -p equestrian/static equestrian/media equestrian/staticfiles

# 迁移数据库
python manage.py makemigrations
python manage.py migrate

# 创建超级用户
python manage.py createsuperuser

# 收集静态文件
python manage.py collectstatic
```

3. 前端设置
```bash
cd equestrian-course-designer

# 安装依赖
npm install

# 开发环境运行
npm run dev

# 构建生产环境
npm run build
```

## 运行项目

1. 启动后端服务
```bash
cd equestrian
python manage.py runserver
```

2. 启动前端开发服务器
```bash
cd equestrian-course-designer
npm run dev
```

## 目录结构

```
equestrian_course_designer/
├── equestrian/              # Django 后端项目
│   ├── equestrian/         # 项目配置
│   ├── user/               # 用户应用
│   ├── static/             # 静态文件
│   ├── media/             # 媒体文件
│   └── manage.py
│
└── equestrian-course-designer/  # Vue 前端项目
    ├── src/
    ├── public/
    └── package.json
```

## 配置说明

### 后端配置

主要配置文件：`equestrian/settings.py`

- 数据库配置
- 媒体文件配置
- JWT 配置
- 跨域配置

### 前端配置

主要配置文件：`equestrian-course-designer/.env`

- API 地址配置
- 其他环境变量

## 使用说明

1. 用户注册/登录
   - 访问首页进行注册或登录
   - 登录后可访问所有功能

2. 设计路线
   - 使用工具栏添加障碍物
   - 拖拽调整位置
   - 设置起点和终点
   - 自动生成路线

3. 保存和分享
   - 保存设计到个人账户
   - 导出图片或数据
   - 分享给其他用户

4. 后台管理
   - 访问 `/admin` 进入管理后台
   - 管理用户和设计作品

## 开发说明

### API 文档

API 文档位于 `/api/docs/`，包含所有接口的详细说明。

### 开发规范

- 代码风格遵循 PEP 8
- 使用 TypeScript 类型检查
- 组件化开发
- 统一的错误处理

## 许可证

MIT License 