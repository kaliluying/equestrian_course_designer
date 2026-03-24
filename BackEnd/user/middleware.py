import logging

from django.contrib.auth import login
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from django.http import HttpResponseRedirect
from jwt.exceptions import InvalidTokenError
from rest_framework_simplejwt.exceptions import TokenError

from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from jwt.exceptions import DecodeError
from django.contrib.auth import get_user_model
from urllib.parse import parse_qs
from http.cookies import SimpleCookie

User = get_user_model()
logger = logging.getLogger(__name__)


class JWTAuthMiddleware(BaseMiddleware):
    """
    自定义JWT认证中间件，用于WebSocket连接
    """
    async def __call__(self, scope, receive, send):
        # 从查询参数或 cookie 中获取 token
        token = self._get_query_token(scope)
        if not token:
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

    def _get_query_token(self, scope):
        query_string = scope.get('query_string', b'').decode('utf-8')
        params = parse_qs(query_string)
        token_values = params.get('token', [])
        return token_values[0] if token_values else None

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
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return AnonymousUser()


class TokenAuthenticationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 只处理admin路径的请求
        if request.path.startswith('/admin/'):
            token = request.GET.get('token')
            if token:
                try:
                    access_token = AccessToken(token)
                    user_id = access_token['user_id']
                    user = User.objects.get(id=user_id)

                    # 如果用户有效且有后台访问权限
                    if user.is_active and user.is_staff:
                        login(request, user)
                        logger.debug("Admin token auth: user %s logged in", user.username)

                        # 重定向到不带token的URL（避免token留在URL中）
                        clean_path = request.get_full_path().split('?')[0]
                        response = HttpResponseRedirect(clean_path)
                        # 通过cookie传递新token，而非URL query string
                        response.set_cookie(
                            'access_token', str(access_token),
                            max_age=7 * 24 * 60 * 60,
                            httponly=True,
                            samesite='Lax',
                            path='/',
                        )
                        return response

                except TokenError as e:
                    logger.debug("Admin token auth failed: %s", str(e))
                    # 如果 access token 过期，尝试从 cookie 获取 refresh token
                    refresh_token = request.COOKIES.get('refresh_token')
                    if refresh_token:
                        try:
                            refresh = RefreshToken(refresh_token)
                            new_access = str(refresh.access_token)
                            new_token = AccessToken(new_access)
                            user_id = new_token['user_id']
                            user = User.objects.get(id=user_id)

                            if user.is_active and user.is_staff:
                                login(request, user)
                                logger.debug("Admin refresh token auth: user %s", user.username)

                                clean_path = request.get_full_path().split('?')[0]
                                response = HttpResponseRedirect(clean_path)
                                response.set_cookie(
                                    'access_token', new_access,
                                    max_age=7 * 24 * 60 * 60,
                                    httponly=True,
                                    samesite='Lax',
                                    path='/',
                                )
                                return response
                        except (TokenError, User.DoesNotExist) as e:
                            logger.debug("Admin refresh token failed: %s", str(e))
                except (InvalidTokenError, User.DoesNotExist) as e:
                    logger.debug("Admin token invalid: %s", str(e))

        return self.get_response(request)
