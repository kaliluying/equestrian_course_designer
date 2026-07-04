# API 接口文档

本文档按当前代码实现整理。默认后端地址为 `http://localhost:8000`，前端通过 httpOnly Cookie 携带 JWT，非 GET 请求需要先获取 CSRF Token。

机器可读文档：

- OpenAPI Schema：`GET /api/schema/`
- Swagger UI：`GET /api/docs/`
- Redoc：`GET /api/redoc/`

## 认证

### 获取 CSRF

- `GET /user/csrf/`
- 权限：公开
- 返回：`{ "csrfToken": "..." }`

### 注册

- `POST /user/register/`
- 权限：公开
- Body：
  ```json
  {
    "username": "demo",
    "email": "demo@example.com",
    "password": "Password123",
    "confirmPassword": "Password123"
  }
  ```
- 成功后写入 `access_token`、`refresh_token` httpOnly Cookie。

### 登录

- `POST /user/login/`
- 权限：公开
- Body：
  ```json
  {
    "username": "demo",
    "password": "Password123"
  }
  ```

### 登出

- `POST /user/logout/`
- 权限：公开
- 清除认证 Cookie。

### 刷新 Token

- `POST /user/token/refresh/`
- 权限：公开
- 从 `refresh_token` Cookie 读取刷新令牌。

### 忘记密码

- `POST /user/forgot-password/`
- 权限：公开

### 重置密码

- `POST /user/reset-password/`
- 权限：公开

## 用户

### 当前用户资料

- `GET /user/users/my_profile/`
- 权限：登录

### 修改密码

- `POST /user/users/change_password/`
- 权限：登录

### 修改邮箱

- `POST /user/users/change_email/`
- 权限：登录

## 设计

### 创建设计

- `POST /user/designs/`
- 权限：登录
- Content-Type：`multipart/form-data`
- 字段：`title`、`image`、`download`、`description`、`is_shared`

### 更新设计

- `PUT /user/designs/{id}/`
- 权限：登录，作者本人
- Content-Type：`multipart/form-data`

### 我的设计

- `GET /user/designs/my/?page=1`
- 权限：登录

### 共享设计

- `GET /user/designs/shared/?page=1`
- 权限：登录

### 设计详情

- `GET /user/designs/{id}/`
- 权限：登录，默认查询当前用户设计

### 切换分享

- `POST /user/designs/{id}/toggle-share/`
- 权限：登录，作者本人

### 点赞/取消点赞

- `POST /user/designs/{id}/like/`
- 权限：登录

### 下载

- `GET /user/designs/{id}/download/?type=json|png|pdf`
- 权限：登录；非作者只能下载共享设计
- PDF 会由后端基于保存的设计图片即时生成。

## 自定义障碍物

### 列表/创建

- `GET /user/obstacles/`
- `POST /user/obstacles/`
- 权限：登录

### 详情/更新/删除

- `GET /user/obstacles/{id}/`
- `PUT /user/obstacles/{id}/`
- `DELETE /user/obstacles/{id}/`
- 权限：登录，作者本人

### 数量限制

- `GET /user/obstacles/count/`
- 权限：登录

### 共享障碍物

- `GET /user/obstacles/shared/`
- 权限：登录

### 切换共享

- `POST /user/obstacles/{id}/toggle-share/`
- 权限：登录，作者本人

## AI 生成

### 生成路线

- `POST /user/ai/generate/`
- 权限：登录
- Body：
  ```json
  {
    "prompt": "设计一条适合中级骑手的路线",
    "config": {
      "field_width": 90,
      "field_height": 60,
      "obstacle_count": 12,
      "difficulty": "medium"
    }
  }
  ```
- 当 `API_KEY`、`MODEL`、`BASE_URL` 未配置或 LLM 不可用时，会回退到本地规则引擎生成。

### 查询配额

- `GET /user/ai/quota/`
- 权限：登录

### 购买配额

- `POST /user/ai/purchase/`
- 权限：登录
- 支付宝未配置时返回 `503`。

### 生成历史

- `GET /user/ai/history/?limit=20`
- 权限：登录

## 会员与支付

### 创建会员订单

- `POST /user/api/payment/create-order/`
- 权限：登录
- 支付宝未配置时返回 `503`。

### 我的订单

- `GET /user/api/payment/orders/`
- 权限：登录

### 查询订单状态

- `GET /user/api/payment/order-status/{order_id}/`
- 权限：登录

### 支付宝异步通知

- `POST /user/api/payment/alipay/notify/`
- 权限：公开，由支付宝服务器调用

### 支付成功页

- `GET /user/payment/success/`

## 反馈

### 提交反馈

- `POST /api/feedback/`
- 权限：公开

### 管理反馈

- `GET /api/feedback/`
- `GET /api/feedback/{id}/`
- `PUT /api/feedback/{id}/`
- `DELETE /api/feedback/{id}/`
- 权限：管理员

### 管理仪表盘

- `GET /api/feedback/dashboard`
- 权限：管理员 Session 登录

## WebSocket 协作

### 协作连接

- `ws://localhost:8000/ws/collaboration/{design_id}/`
- 认证：JWT Cookie
- 分享链接加入时可带 `share_token`。

常见消息类型包括障碍物更新、路径更新、同步请求、同步响应、协作者加入和离开。具体消息结构以 `BackEnd/user/consumers.py` 与 `FrontEnd/src/stores/websocket.ts` 为准。
