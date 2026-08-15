import logging
from http.cookies import SimpleCookie

from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from django.middleware.csrf import CsrfViewMiddleware
from jwt.exceptions import DecodeError, InvalidTokenError
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

User = get_user_model()
logger = logging.getLogger(__name__)


class EnforceCSRFMiddleware:
    """为 DRF API 强制执行 Django CSRF 校验。

    DRF 的 APIView 默认标记为 ``csrf_exempt``，而本项目使用 Cookie JWT，
    因此不能仅依赖 Django 的常规 CsrfViewMiddleware。该中间件复用 Django
    的官方校验逻辑，对所有非安全方法执行校验，仅放行显式配置的 webhook。
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.csrf_middleware = CsrfViewMiddleware(get_response)

    def __call__(self, request):
        return self.get_response(request)

    def process_view(self, request, callback, callback_args, callback_kwargs):
        """在视图执行前拒绝缺少有效 CSRF token 的修改请求。"""
        if request.method in {"GET", "HEAD", "OPTIONS", "TRACE"}:
            return None

        exempt_paths = set(getattr(settings, "CSRF_EXEMPT_PATHS", ()))
        if request.path in exempt_paths:
            return None

        # 使用一个没有 csrf_exempt 标记的占位 callback，避免 DRF 的包装器
        # 让官方中间件提前跳过校验。
        def protected_callback(_request, *_args, **_kwargs):
            return None

        return self.csrf_middleware.process_view(
            request,
            protected_callback,
            callback_args,
            callback_kwargs,
        )


class JWTAuthMiddleware(BaseMiddleware):
    """
    自定义JWT认证中间件，用于WebSocket连接
    """
    async def __call__(self, scope, receive, send):
        # 只从 HttpOnly cookie 读取 JWT，避免 token 出现在 URL、历史记录和
        # 反向代理访问日志中。
        cookies = self._get_cookies(scope)
        token = cookies.get('access_token')
        
        # 如果找到token，验证并获取用户
        if token:
            try:
                # 验证token
                access_token = AccessToken(token)
                user_id = access_token['user_id']
                scope['user'] = await self.get_user(user_id)
            except (InvalidTokenError, TokenError, DecodeError):
                scope['user'] = AnonymousUser()
        else:
            scope['user'] = AnonymousUser()
        
        return await super().__call__(scope, receive, send)

    def _get_cookies(self, scope):
        """
        Channels 在未使用 CookieMiddlewareStack 时不一定包含 scope['cookies']。
        因此这里兜底从 headers 中手动解析 cookie。
        """
        cookies = scope.get('cookies')
        if isinstance(cookies, dict):
            return cookies

        parsed = {}
        for key, value in scope.get('headers', []):
            if key == b'cookie':
                cookie = SimpleCookie()
                cookie.load(value.decode('utf-8', errors='ignore'))
                for name, morsel in cookie.items():
                    parsed[name] = morsel.value
                break
        return parsed
    
    @database_sync_to_async
    def get_user(self, user_id):
        try:
            return User.objects.get(id=user_id, is_active=True)
        except User.DoesNotExist:
            return AnonymousUser()


class TokenAuthenticationMiddleware:
    """保留中间件插槽，不再接受 URL query 参数中的管理后台 token。

    管理后台应使用 Django 自带的 session 登录。把 JWT 放入 URL 会进入
    浏览器历史、代理访问日志和 Referer，无法满足生产环境的凭据保护要求。
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)
