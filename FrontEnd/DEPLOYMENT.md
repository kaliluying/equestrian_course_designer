# 部署配置指南

本文档提供了如何在不同环境中部署本应用的指南，特别是关于如何调整API接口和WebSocket连接。

## 配置文件位置

所有需要根据环境调整的接口和配置项都集中在一个配置文件中：

```
FrontEnd/src/config/api.ts
```

## 配置项说明

配置文件中主要包含以下部分需要根据部署环境进行调整：

### 1. 基础URL配置

```typescript
// 基础配置
const BASE_CONFIG = {
  // 开发环境配置
  development: {
    // 后端API基础URL
    apiBaseUrl: 'http://localhost:8000/api',
    
    // WebSocket基础URL
    wsBaseUrl: 'ws://localhost:8000/ws',
    
    // 前端应用URL（用于生成邀请链接等）
    appBaseUrl: 'http://localhost:5173',
  },
  
  // 生产环境配置 - 部署时需要修改这部分
  production: {
    // 部署时修改为实际的后端API地址
    apiBaseUrl: 'https://your-production-api.com/api',
    
    // 部署时修改为实际的WebSocket地址
    wsBaseUrl: 'wss://your-production-api.com/ws',
    
    // 部署时修改为实际的前端应用地址
    appBaseUrl: 'https://your-production-app.com',
  },
  
  // 预发布环境配置 - 用于测试生产环境前的验证
  staging: {
    // 预发布环境的后端API地址
    apiBaseUrl: 'https://staging-api.your-domain.com/api',
    
    // 预发布环境的WebSocket地址
    wsBaseUrl: 'wss://staging-api.your-domain.com/ws',
    
    // 预发布环境的前端应用地址
    appBaseUrl: 'https://staging.your-domain.com',
  },
  
  // 测试环境配置
  test: {
    // 测试环境的配置
    apiBaseUrl: 'https://your-test-api.com/api',
    wsBaseUrl: 'wss://your-test-api.com/ws',
    appBaseUrl: 'https://your-test-app.com',
  },
}
```

## 支持的环境类型

系统目前支持以下环境类型：

1. `development` - 开发环境，用于本地开发
2. `production` - 生产环境，用于正式部署
3. `staging` - 预发布环境，用于在正式发布前进行测试
4. `test` - 测试环境，用于自动化测试和QA测试

## 部署步骤

### 1. 修改目标环境配置

在部署到目标环境之前，请修改配置文件中对应环境部分：

1. 修改`apiBaseUrl`为目标环境的后端API地址
2. 修改`wsBaseUrl`为目标环境的WebSocket地址（注意生产和预发布环境应使用`wss://`协议以确保安全连接）
3. 修改`appBaseUrl`为目标环境的前端应用地址

### 2. 确认环境变量

确保在构建时设置了正确的`NODE_ENV`环境变量：

```bash
# 生产环境构建
NODE_ENV=production npm run build

# 预发布环境构建
NODE_ENV=staging npm run build

# 测试环境构建
NODE_ENV=test npm run build
```

或者在部署服务器上设置环境变量：

```bash
# 设置为生产环境
export NODE_ENV=production

# 设置为预发布环境
export NODE_ENV=staging
```

### 3. 端口问题解决

如果遇到端口绑定错误（如`EACCES: permission denied`），可以尝试以下解决方案：

1. 使用更高的端口号（>1024）避免权限问题
2. 使用管理员/root权限运行
3. 修改配置文件中的端口设置：

```bash
# 在package.json中修改
"scripts": {
  "dev": "vite --port 8080",  # 使用不同端口
}
```

或者在环境变量中设置端口：

```bash
export PORT=8080
```

### 4. WebSocket连接问题

如果WebSocket连接失败，请检查：

1. 确认后端WebSocket服务正在运行
2. 确认URL格式正确
3. 确认没有防火墙阻止WebSocket连接
4. 在生产环境中使用`wss://`协议而非`ws://`
5. 如果使用反向代理（如Nginx），确保正确配置WebSocket代理

## Nginx配置示例

如果使用Nginx部署，以下是一个基本的配置示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端应用
    location / {
        root /path/to/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API请求代理
    location /api/ {
        proxy_pass http://backend-server:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket代理
    location /ws/ {
        proxy_pass http://backend-server:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## 跨域问题

如果遇到跨域问题，请确保后端配置了正确的CORS头：

```python
# Django示例
CORS_ALLOWED_ORIGINS = [
    "https://your-frontend-domain.com",
]

# 或允许所有源（不推荐用于生产环境）
CORS_ALLOW_ALL_ORIGINS = True
```

## 缓存问题

如果在部署新版本后遇到缓存问题，可以：

1. 在构建过程中添加版本哈希到文件名
2. 设置适当的缓存控制头
3. 要求用户清除浏览器缓存或强制刷新

## 环境检查

部署后，可以使用以下方法验证环境配置是否正确：

1. 打开浏览器控制台，查看当前环境和API基础URL
2. 检查网络请求，确认它们指向正确的服务器
3. 尝试一个基本功能，例如用户登录，确认API通信正常
4. 测试协作功能，确认WebSocket连接正常工作

## 媒体文件URL配置

系统中的图片和下载文件URL通过后端中的`SITE_DOMAIN`和`USE_HTTPS`环境变量控制。为确保在生产环境中返回正确的图片和文件URL，请按以下步骤配置：

### 1. 设置后端环境变量

在部署后端服务器时，设置以下环境变量：

```bash
# 设置服务器域名（不含协议）
export SITE_DOMAIN=your-production-domain.com

# 设置是否使用HTTPS（生产环境建议使用HTTPS）
export USE_HTTPS=True
```

### 2. 手动修改Django配置

如果无法使用环境变量，可以直接修改Django配置文件(`BackEnd/equestrian/settings.py`)中的以下设置：

```python
# 站点域名配置，用于媒体文件URL生成
SITE_DOMAIN = 'your-production-domain.com'  # 替换为实际域名
USE_HTTPS = True  # 生产环境建议使用HTTPS
```

### 3. 验证媒体URL配置

部署后，请执行以下测试以确保媒体URL正确：

1. 上传一个新设计
2. 查看设计详情页面的图片
3. 尝试下载设计文件
4. 检查URL是否包含正确的域名（而不是127.0.0.1）

如果图片或下载URL仍然使用本地地址，请检查上述配置并重新部署。

如有任何问题，请联系技术支持团队。 