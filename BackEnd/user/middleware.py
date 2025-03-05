from django.contrib.auth import login
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from django.http import HttpResponseRedirect
from jwt.exceptions import InvalidTokenError
from rest_framework_simplejwt.exceptions import TokenError


class TokenAuthenticationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 只处理admin路径的请求
        if request.path.startswith('/admin/'):
            token = request.GET.get('token')
            if token:
                try:
                    # 验证 token
                    print(f"Received token: {token}")  # 调试信息
                    access_token = AccessToken(token)
                    print(f"Decoded token: {access_token}")  # 调试信息
                    user_id = access_token['user_id']
                    print(f"User ID: {user_id}")  # 调试信息
                    user = User.objects.get(id=user_id)
                    print(f"Found user: {user.username}")  # 调试信息

                    # 如果用户有效且有后台访问权限
                    if user.is_active and user.is_staff:
                        # 登录用户
                        login(request, user)
                        # 调试信息
                        print(f"User logged in successfully: {user.username}")

                        # 重定向到不带token的URL
                        clean_path = request.get_full_path().split('?')[0]
                        return HttpResponseRedirect(clean_path)

                except TokenError as e:
                    print(f"TokenError: {str(e)}")  # 调试信息
                    # 如果 access token 过期，尝试从 cookie 获取 refresh token
                    refresh_token = request.COOKIES.get('refresh_token')
                    if refresh_token:
                        try:
                            # 使用 refresh token 获取新的 access token
                            refresh = RefreshToken(refresh_token)
                            access_token = str(refresh.access_token)

                            # 验证新的 access token
                            new_token = AccessToken(access_token)
                            user_id = new_token['user_id']
                            user = User.objects.get(id=user_id)

                            if user.is_active and user.is_staff:
                                login(request, user)
                                # 调试信息
                                print(
                                    f"User logged in with refresh token: {user.username}")

                                # 重定向到不带token的URL，但带上新的access token
                                clean_path = request.get_full_path().split('?')[
                                    0]
                                response = HttpResponseRedirect(
                                    f"{clean_path}?token={access_token}")
                                return response
                        except (TokenError, User.DoesNotExist) as e:
                            print(f"Refresh token error: {str(e)}")  # 调试信息
                            pass
                except (InvalidTokenError, User.DoesNotExist) as e:
                    print(f"Invalid token or user error: {str(e)}")  # 调试信息
                    pass

        return self.get_response(request)
