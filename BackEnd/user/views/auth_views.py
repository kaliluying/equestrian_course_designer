"""认证相关视图：注册、登录、登出、Token刷新、密码重置。"""

import uuid
import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.middleware.csrf import get_token
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.utils.html import strip_tags
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema

from ..models import PasswordResetToken
from ..serializers import (
    UserRegisterSerializer,
    UserLoginSerializer,
    ForgotPasswordSerializer,
    ResetPasswordSerializer,
)
from ..utils import success_response, error_response
from .user_views import check_and_update_membership

logger = logging.getLogger(__name__)


def _set_auth_cookies(response, access_token, refresh_token):
    """
    为认证响应写入 JWT cookies。
    注册与登录共用同一套 cookie 策略，避免前后端鉴权状态不一致。
    """
    is_production = not settings.DEBUG

    response.set_cookie(
        "access_token",
        access_token,
        max_age=7 * 24 * 60 * 60,
        httponly=True,
        secure=is_production,
        samesite="None" if is_production else "Lax",
        path="/",
    )

    response.set_cookie(
        "refresh_token",
        refresh_token,
        max_age=30 * 24 * 60 * 60,
        httponly=True,
        secure=is_production,
        samesite="None" if is_production else "Lax",
        path="/",
    )

    return response


class CSRFTokenView(APIView):
    """获取CSRF令牌的视图"""

    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT, summary="获取 CSRF Token")
    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        """获取CSRF令牌"""
        csrf_token = get_token(request)
        logger.info("生成CSRF令牌")
        response = Response({"csrfToken": csrf_token})
        return response


@method_decorator(csrf_exempt, name="dispatch")
class RegisterView(APIView):
    """普通用户注册视图，用户注册后没有后台访问权限"""

    permission_classes = [AllowAny]

    @extend_schema(
        request=UserRegisterSerializer,
        responses=OpenApiTypes.OBJECT,
        summary="用户注册",
    )
    def post(self, request):
        """用户注册"""
        logger.info("收到用户注册请求")

        serializer = UserRegisterSerializer(data=request.data)
        try:
            if serializer.is_valid(raise_exception=True):
                user = serializer.save()

                # 取消后台访问权限
                user.is_staff = False
                user.save()

                refresh = RefreshToken.for_user(user)
                response = success_response(
                    "注册成功",
                    {
                        "user_id": user.id,
                        "username": user.username,
                    },
                    status.HTTP_201_CREATED,
                )
                response = _set_auth_cookies(
                    response,
                    str(refresh.access_token),
                    str(refresh),
                )
                logger.info(f"用户 {user.username} 注册成功，已设置 httpOnly cookies")
                return response
        except serializers.ValidationError as e:
            # 处理验证错误
            error_messages = {}
            if hasattr(e.detail, "items"):  # 处理字典类型的错误
                for field, errors in e.detail.items():
                    if isinstance(errors, list):
                        error_messages[field] = errors
                    else:
                        error_messages[field] = [str(errors)]
            else:  # 处理非字典类型的错误
                error_messages["non_field_errors"] = [str(e.detail)]

            return error_response(error_messages, status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # 处理其他异常
            return error_response(
                {"non_field_errors": ["服务器内部错误，请稍后重试"], "error": str(e)},
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@method_decorator(csrf_exempt, name="dispatch")
class LoginView(APIView):
    """
    用户登录视图
    Security fix: JWT tokens are now set as httpOnly cookies
    """

    permission_classes = [AllowAny]

    @extend_schema(
        request=UserLoginSerializer,
        responses=OpenApiTypes.OBJECT,
        summary="用户登录",
    )
    def post(self, request):
        """用户登录 - 设置 httpOnly cookies"""
        logger.info("收到用户登录请求")

        serializer = UserLoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data["user"]

            # 添加会员状态检查
            check_and_update_membership(user)

            # 生成 tokens
            refresh = RefreshToken.for_user(user)
            access_token = str(refresh.access_token)
            refresh_token = str(refresh)

            # 创建响应
            response = success_response(
                "登录成功",
                {
                    "user_id": user.id,
                    "username": user.username,
                },
            )
            response = _set_auth_cookies(response, access_token, refresh_token)

            logger.info(f"用户 {user.username} 登录成功，已设置 httpOnly cookies")

            # Debug: Log cookie info
            cookie_names = [morsel.key for morsel in response.cookies.values()]
            logger.info(f"[LOGIN DEBUG] Response cookies: {cookie_names}")
            logger.info(
                f"[LOGIN DEBUG] access_token set: {'access_token' in cookie_names}"
            )

            return response

        logger.warning(f"登录失败: {serializer.errors}")
        return error_response(serializer.errors, status.HTTP_400_BAD_REQUEST)


class CookieTokenRefreshView(APIView):
    """
    Custom token refresh view that reads refresh token from cookie.

    Security fix: JWT tokens are stored in httpOnly cookies,
    so refresh token is read from the cookie instead of request body.
    """

    permission_classes = [AllowAny]

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT, summary="刷新 Token")
    def post(self, request):
        """Refresh access token using refresh token from cookie."""
        # Debug: log cookie info
        logger.info(f"[TOKEN_REFRESH] Request cookies: {list(request.COOKIES.keys())}")
        logger.info(f"[TOKEN_REFRESH] refresh_token present: {'refresh_token' in request.COOKIES}")

        # Get refresh token from cookie
        refresh_token = request.COOKIES.get("refresh_token")

        if not refresh_token:
            logger.warning("[TOKEN_REFRESH] No refresh_token cookie found")
            return error_response(
                {"refresh_token": ["Refresh token not found in cookie"]},
                status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Create new refresh token object
            token = RefreshToken(refresh_token)

            # Generate new access token
            access_token = str(token.access_token)

            # Create response with new access token cookie
            response = success_response(
                "Token刷新成功",
                {
                    "access_token": access_token,
                },
            )

            # Set new access token cookie (same expiration as login)
            is_production = not settings.DEBUG
            response.set_cookie(
                "access_token",
                access_token,
                max_age=7 * 24 * 60 * 60,  # 7 days
                httponly=True,
                secure=is_production,
                samesite="None" if is_production else "Lax",
                path="/",
            )

            logger.info("Token刷新成功，已设置新的access_token cookie")
            return response

        except Exception as e:
            logger.error(f"Token刷新失败: {str(e)}")
            return error_response(
                {"detail": "Token刷新失败，请重新登录"}, status.HTTP_401_UNAUTHORIZED
            )


@method_decorator(csrf_exempt, name="dispatch")
class LogoutView(APIView):
    """
    用户登出视图
    清除服务端设置的 httpOnly token cookies。
    """

    permission_classes = [AllowAny]

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT, summary="用户登出")
    def post(self, request):
        response = success_response("登出成功")
        response.delete_cookie("access_token", path="/")
        response.delete_cookie("refresh_token", path="/")
        return response


class ForgotPasswordView(APIView):
    """忘记密码视图"""

    permission_classes = [AllowAny]

    @extend_schema(
        request=ForgotPasswordSerializer,
        responses=OpenApiTypes.OBJECT,
        summary="发送密码重置邮件",
    )
    def post(self, request):
        """发送密码重置邮件"""
        serializer = ForgotPasswordSerializer(data=request.data)
        if serializer.is_valid():
            username = serializer.validated_data["username"]
            email = serializer.validated_data["email"]

            try:
                # 由于在序列化器中已经验证了用户名和邮箱的匹配，这里可以直接获取用户
                user = User.objects.get(username=username, email=email)

                # 创建或更新重置令牌
                token, created = PasswordResetToken.objects.update_or_create(
                    user=user,
                    defaults={
                        "token": str(uuid.uuid4()),
                        "expires_at": timezone.now() + timedelta(hours=24),
                        "is_used": False,
                    },
                )

                # 构建重置链接
                reset_url = (
                    f"{settings.FRONTEND_URL}/reset-password?token={token.token}"
                )

                # 准备邮件内容
                context = {"user": user, "reset_url": reset_url}
                html_message = render_to_string("password_reset_email.html", context)
                plain_message = strip_tags(html_message)

                # 发送邮件
                send_mail(
                    "密码重置请求",
                    plain_message,
                    settings.DEFAULT_FROM_EMAIL,
                    [email],
                    html_message=html_message,
                    fail_silently=False,
                )

                return success_response("密码重置邮件已发送，请检查您的邮箱")
            except User.DoesNotExist:
                # 这种情况不应该发生，因为序列化器已经验证了用户存在
                # 但为了安全起见，仍然返回成功消息
                return success_response(
                    "如果该用户名和邮箱匹配，我们将发送密码重置邮件"
                )

        return error_response(serializer.errors, status.HTTP_400_BAD_REQUEST)


class ResetPasswordView(APIView):
    """重置密码视图"""

    permission_classes = [AllowAny]

    @extend_schema(
        request=ResetPasswordSerializer,
        responses=OpenApiTypes.OBJECT,
        summary="重置密码",
    )
    def post(self, request):
        """使用令牌重置密码"""
        serializer = ResetPasswordSerializer(data=request.data)
        if serializer.is_valid():
            token_str = serializer.validated_data["token"]
            password = serializer.validated_data["password"]

            try:
                # 查找有效的令牌
                token = PasswordResetToken.objects.get(
                    token=token_str, expires_at__gt=timezone.now(), is_used=False
                )

                # 更新用户密码
                user = token.user
                user.set_password(password)
                user.save()

                # 标记令牌为已使用
                token.is_used = True
                token.save()

                return success_response("密码已成功重置")
            except PasswordResetToken.DoesNotExist:
                return error_response(
                    "无效或已过期的重置令牌", status.HTTP_400_BAD_REQUEST
                )

        return error_response(serializer.errors, status.HTTP_400_BAD_REQUEST)
