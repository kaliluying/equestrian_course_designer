# 马术障碍赛路线设计器

一个专业的马术障碍赛路线设计 Web 应用程序，支持在线设计、保存和分享路线图。

## 项目特点

- 专业的马术障碍赛路线设计工具
- 实时协作与分享功能
- 用户友好的界面设计
- 完整的后台管理系统
- 支持多种导出格式

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
- Vite 构建工具

## 主要功能

### 用户系统
- 用户注册与登录
- JWT Token 认证
- 基于角色的权限控制
- 个人中心管理

### 路线设计
- 可视化路线编辑器
- 障碍物库管理
- 智能路线生成
- 实时预览功能
- 路线评分系统

### 设计管理
- 设计作品保存
- 多格式导出（图片、PDF）
- 在线分享功能
- 版本控制
- 设计模板管理

### 后台管理
- 用户管理
- 设计作品管理
- 障碍物库管理
- 数据统计分析
- 系统配置管理

## 项目结构

```
equestrian_course_designer/
├── FrontEnd/                # Vue 前端项目
│   ├── src/                # 源代码
│   ├── public/             # 静态资源
│   ├── docs/               # 文档
│   └── package.json        # 项目配置
│
└── BackEnd/                # Django 后端项目
    ├── equestrian/         # 项目配置
    ├── user/               # 用户模块
    ├── obstacles/          # 障碍物模块
    ├── feedback/           # 反馈模块
    ├── static/             # 静态文件
    ├── media/              # 媒体文件
    └── manage.py           # 管理脚本
```

## 快速开始

### 环境要求
- Python 3.8+
- Node.js 16+
- MySQL 8.0+

### 后端设置
```bash
# 进入后端目录
cd BackEnd

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows 使用: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置数据库
# 编辑 equestrian/settings.py 中的数据库配置

# 创建目录
mkdir -p static media staticfiles

# 迁移数据库
python manage.py makemigrations
python manage.py migrate

# 创建超级用户
python manage.py createsuperuser

# 收集静态文件
python manage.py collectstatic
```

### 前端设置
```bash
# 进入前端目录
cd FrontEnd

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
cd BackEnd
python manage.py runserver
```

2. 启动前端开发服务器
```bash
cd FrontEnd
npm run dev
```

## 配置说明

### 后端配置
主要配置文件：`BackEnd/equestrian/settings.py`
- 数据库配置
- 媒体文件配置
- JWT 配置
- 跨域配置

### 前端配置
主要配置文件：`FrontEnd/.env.example`
- API 地址配置
- 环境变量配置

## 使用说明

1. 用户系统
   - 注册新账户
   - 登录系统
   - 管理个人信息

2. 路线设计
   - 创建新设计
   - 添加障碍物
   - 调整路线
   - 保存设计

3. 设计管理
   - 查看设计列表
   - 导出设计
   - 分享设计
   - 使用模板

4. 后台管理
   - 访问 `/admin` 进入管理后台
   - 管理用户和内容
   - 查看统计数据

## 开发指南

### API 文档
API 文档位于 `/api/docs/`，包含所有接口的详细说明。

### 开发规范
- 后端代码遵循 PEP 8 规范
- 前端使用 TypeScript 进行类型检查
- 组件化开发
- 统一的错误处理机制


## 许可证

MIT License 