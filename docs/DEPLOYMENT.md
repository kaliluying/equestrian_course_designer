# 部署指南

本文档描述当前代码库的最小可用生产部署流程。生产环境必须先完成密钥轮换和 `.env` 配置。

## 依赖服务

- Python 3.12+
- Node.js 22+
- MySQL 8+
- Redis 6+
- Nginx 或等价反向代理

## 后端部署

1. 准备环境变量：

   ```bash
   cd BackEnd
   cp .env.example .env
   ```

   生产环境至少配置：

   - `DJANGO_DEBUG=false`
   - `DJANGO_SECRET_KEY`
   - `DJANGO_ALLOWED_HOSTS`
   - `CORS_ALLOWED_ORIGINS`
   - `CSRF_TRUSTED_ORIGINS`
   - `DB_*`
   - `REDIS_URL`
   - `CACHE_REDIS_URL`
   - `SITE_DOMAIN`
   - `USE_HTTPS=true`

2. 安装依赖：

   ```bash
   uv sync
   ```

   或：

   ```bash
   pip install -r requirements.txt
   ```

3. 初始化数据库：

   ```bash
   uv run python manage.py migrate
   uv run python manage.py init_membership_plans
   uv run python manage.py collectstatic --noinput
   uv run python manage.py check_local_setup --strict
   ```

4. 启动 ASGI 服务：

   ```bash
   uv run daphne -b 0.0.0.0 -p 8000 equestrian.asgi:application
   ```

   项目使用 Django Channels，生产环境必须使用 ASGI 服务，不能只用 WSGI。

## 前端部署

1. 准备环境变量：

   ```bash
   cd FrontEnd
   cp .env.example .env
   ```

2. 安装依赖并构建：

   ```bash
   pnpm install
   npm run build
   ```

3. 将 `FrontEnd/dist` 部署到静态站点目录，或由 Nginx 直接服务。

## Nginx 示例

```nginx
server {
    listen 80;
    server_name equestrian.top;

    root /srv/equestrian/FrontEnd/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /user/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 上传文件不作为公共目录暴露。图片、JSON 和导出文件统一通过
    # /user/designs/<id>/asset/ 由 Django 完成 Cookie 鉴权和对象授权。
    location /media/ {
        return 404;
    }

    location /static/ {
        alias /srv/equestrian/BackEnd/staticfiles/;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 支付宝密钥

真实密钥不要提交到仓库。部署时放置：

- `BackEnd/equestrian/keys/app_private_key.pem`
- `BackEnd/equestrian/keys/alipay_public_key.pem`

缺少密钥时，支付接口返回 `503`，不影响设计、导出、AI 规则兜底等功能。

## 验证命令

```bash
cd BackEnd
uv run python manage.py check
uv run python manage.py test
uv run python manage.py check_local_setup --strict

cd ../FrontEnd
npm run test:run
npm run build
```

## 上线前检查

- 已轮换历史泄露的 Cookie 和密钥
- `DJANGO_DEBUG=false`
- Redis、MySQL 均为生产实例
- `ALLOWED_HOSTS`、CORS、CSRF 只包含可信域名
- 支付宝回调 URL 可从公网访问
- WebSocket `/ws/` 可升级连接
- `media/` 目录不对公网提供静态映射，只有后端资源接口可读取；`staticfiles/` 目录权限正确
- 日志目录可写
