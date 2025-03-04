from django.shortcuts import render
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from django.contrib.auth.models import User, Group
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import UserRegisterSerializer, UserLoginSerializer, ForgotPasswordSerializer, ResetPasswordSerializer
from rest_framework import serializers
from rest_framework import viewsets
from rest_framework.parsers import MultiPartParser, FormParser
from .models import Design, PasswordResetToken
from .serializers import DesignSerializer
import uuid
from django.core.mail import send_mail
from django.conf import settings
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.utils.decorators import method_decorator

# Create your views here.

# 添加CSRF令牌视图


class CSRFTokenView(APIView):
    """
    获取CSRF令牌的视图
    """
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        """
        获取CSRF令牌
        """
        csrf_token = get_token(request)
        # 打印日志，便于调试
        print(f"生成CSRF令牌: {csrf_token}")
        # 设置响应头，允许跨域
        response = Response({'csrfToken': csrf_token})
        response["Access-Control-Allow-Origin"] = "http://localhost:5173"
        response["Access-Control-Allow-Credentials"] = "true"
        return response


@method_decorator(csrf_exempt, name='dispatch')
class RegisterView(APIView):
    """
    普通用户注册视图
    """
    permission_classes = [AllowAny]

    def post(self, request):
        """
        用户注册，自动设置后台访问权限并加入普通用户
        """
        # 打印请求信息，便于调试
        print(f"注册请求: {request.data}")
        print(f"请求头: {request.headers}")

        serializer = UserRegisterSerializer(data=request.data)
        try:
            if serializer.is_valid(raise_exception=True):
                user = serializer.save()

                # 设置后台访问权限
                user.is_staff = True
                user.save()

                # 添加到普通用户组
                try:
                    normal_group = Group.objects.get(name='普通用户')
                    user.groups.add(normal_group)
                except Group.DoesNotExist:
                    # 如果组不存在，创建并添加用户
                    normal_group = Group.objects.create(name='普通用户')
                    user.groups.add(normal_group)

                refresh = RefreshToken.for_user(user)
                return Response({
                    'message': '注册成功',
                    'user_id': user.id,
                    'username': user.username,
                    'access_token': str(refresh.access_token),
                    'refresh_token': str(refresh)
                }, status=status.HTTP_201_CREATED)
        except serializers.ValidationError as e:
            # 处理验证错误
            error_messages = {}
            if hasattr(e.detail, 'items'):  # 处理字典类型的错误
                for field, errors in e.detail.items():
                    if isinstance(errors, list):
                        error_messages[field] = errors
                    else:
                        error_messages[field] = [str(errors)]
            else:  # 处理非字典类型的错误
                error_messages['non_field_errors'] = [str(e.detail)]

            return Response({
                'code': status.HTTP_400_BAD_REQUEST,
                'message': error_messages
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # 处理其他异常
            return Response({
                'code': status.HTTP_500_INTERNAL_SERVER_ERROR,
                'message': {'non_field_errors': ['服务器内部错误，请稍后重试'], 'error': str(e)}
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@method_decorator(csrf_exempt, name='dispatch')
class LoginView(APIView):
    """
    用户登录视图
    """
    permission_classes = [AllowAny]

    def post(self, request):
        """
        用户登录
        """
        # 打印请求信息，便于调试
        print(f"登录请求: {request.data}")
        print(f"请求头: {request.headers}")

        serializer = UserLoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            refresh = RefreshToken.for_user(user)
            return Response({
                'message': '登录成功',
                'user_id': user.id,
                'username': user.username,
                'access_token': str(refresh.access_token),
                'refresh_token': str(refresh)
            })
        return Response({'code': 400, 'message': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


class ForgotPasswordView(APIView):
    """
    忘记密码视图
    """
    permission_classes = [AllowAny]

    def post(self, request):
        """
        发送密码重置邮件
        """
        serializer = ForgotPasswordSerializer(data=request.data)
        if serializer.is_valid():
            username = serializer.validated_data['username']
            email = serializer.validated_data['email']

            try:
                # 由于在序列化器中已经验证了用户名和邮箱的匹配，这里可以直接获取用户
                user = User.objects.get(username=username, email=email)

                # 创建或更新重置令牌
                token, created = PasswordResetToken.objects.update_or_create(
                    user=user,
                    defaults={
                        'token': str(uuid.uuid4()),
                        'expires_at': timezone.now() + timedelta(hours=24),
                        'is_used': False
                    }
                )

                # 构建重置链接
                reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token.token}"

                # 准备邮件内容
                context = {
                    'user': user,
                    'reset_url': reset_url
                }
                html_message = render_to_string(
                    'password_reset_email.html', context)
                plain_message = strip_tags(html_message)

                # 发送邮件
                send_mail(
                    '密码重置请求',
                    plain_message,
                    settings.DEFAULT_FROM_EMAIL,
                    [email],
                    html_message=html_message,
                    fail_silently=False,
                )

                return Response({'message': '密码重置邮件已发送，请检查您的邮箱'}, status=status.HTTP_200_OK)
            except User.DoesNotExist:
                # 这种情况不应该发生，因为序列化器已经验证了用户存在
                # 但为了安全起见，仍然返回成功消息
                return Response({'message': '如果该用户名和邮箱匹配，我们将发送密码重置邮件'}, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ResetPasswordView(APIView):
    """
    重置密码视图
    """
    permission_classes = [AllowAny]

    def post(self, request):
        """
        使用令牌重置密码
        """
        serializer = ResetPasswordSerializer(data=request.data)
        if serializer.is_valid():
            token_str = serializer.validated_data['token']
            password = serializer.validated_data['password']

            try:
                # 查找有效的令牌
                token = PasswordResetToken.objects.get(
                    token=token_str,
                    expires_at__gt=timezone.now(),
                    is_used=False
                )

                # 更新用户密码
                user = token.user
                user.set_password(password)
                user.save()

                # 标记令牌为已使用
                token.is_used = True
                token.save()

                return Response({'message': '密码已成功重置'}, status=status.HTTP_200_OK)
            except PasswordResetToken.DoesNotExist:
                return Response({'message': '无效或已过期的重置令牌'}, status=status.HTTP_400_BAD_REQUEST)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DesignViewSet(viewsets.ModelViewSet):
    """
    设计视图集
    """
    queryset = Design.objects.all()
    serializer_class = DesignSerializer
    parser_classes = (MultiPartParser, FormParser)

    def get_queryset(self):
        """只返回当前用户的设计"""
        return Design.objects.filter(author=self.request.user)

    def perform_create(self, serializer):
        """保存时自动设置作者为当前用户"""
        serializer.save(author=self.request.user)

    def perform_update(self, serializer):
        """更新设计时保留原作者"""
        # 获取原设计对象
        instance = self.get_object()
        print(
            f"更新设计: ID={instance.id}, 标题={instance.title}, 作者={instance.author}")

        # 确保更新时保留原作者
        try:
            serializer.save(author=instance.author)
            print(f"设计更新成功: ID={instance.id}")
        except Exception as e:
            print(f"设计更新失败: ID={instance.id}, 错误={str(e)}")
            raise
