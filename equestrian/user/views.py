from django.shortcuts import render
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from django.contrib.auth.models import User, Group
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import UserRegisterSerializer, UserLoginSerializer
from rest_framework import serializers
from rest_framework import viewsets
from rest_framework.parsers import MultiPartParser, FormParser
from .models import Design
from .serializers import DesignSerializer

# Create your views here.


class RegisterView(APIView):
    """
    普通用户注册视图
    """
    permission_classes = [AllowAny]

    def post(self, request):
        """
        用户注册，自动设置后台访问权限并加入普通用户
        """
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
                'message': {'non_field_errors': ['服务器内部错误，请稍后重试']}
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class LoginView(APIView):
    """
    用户登录视图
    """
    permission_classes = [AllowAny]

    def post(self, request):
        """
        用户登录
        """
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
