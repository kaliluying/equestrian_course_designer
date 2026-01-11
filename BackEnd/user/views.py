from django.shortcuts import render, get_object_or_404
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from django.contrib.auth.models import User, Group
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import UserRegisterSerializer, UserLoginSerializer, ForgotPasswordSerializer, ResetPasswordSerializer
from rest_framework import serializers
from rest_framework import viewsets
from rest_framework.parsers import MultiPartParser, FormParser
from .models import Design, PasswordResetToken, DesignLike, UserProfile, MembershipPlan, CustomObstacle, MembershipOrder
from .serializers import DesignSerializer, DesignListSerializer, CustomObstacleSerializer, MembershipOrderSerializer, CreateMembershipOrderSerializer
import uuid
from django.core.mail import send_mail
from django.conf import settings
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta, datetime
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework.decorators import action, api_view, permission_classes
from django.db.models import F
from .utils import get_absolute_media_url, create_alipay_order, verify_alipay_callback, query_alipay_order, success_response, error_response
from rest_framework.exceptions import PermissionDenied
from django.views.generic import TemplateView
import logging
from django.contrib.auth import authenticate
from rest_framework.pagination import PageNumberPagination

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
    普通用户注册视图，用户注册后没有后台访问权限
    """
    permission_classes = [AllowAny]

    def post(self, request):
        """
        用户注册
        """
        # 打印请求信息，便于调试
        print(f"注册请求: {request.data}")
        print(f"请求头: {request.headers}")

        serializer = UserRegisterSerializer(data=request.data)
        try:
            if serializer.is_valid(raise_exception=True):
                user = serializer.save()

                # 取消后台访问权限
                user.is_staff = False
                user.save()

                refresh = RefreshToken.for_user(user)
                return success_response('注册成功', {
                    'user_id': user.id,
                    'username': user.username,
                    'access_token': str(refresh.access_token),
                    'refresh_token': str(refresh)
                }, status.HTTP_201_CREATED)
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

            return error_response(error_messages, status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # 处理其他异常
            return error_response({'non_field_errors': ['服务器内部错误，请稍后重试'], 'error': str(e)}, status.HTTP_500_INTERNAL_SERVER_ERROR)


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

            # 添加会员状态检查
            self.check_and_update_membership(user)

            refresh = RefreshToken.for_user(user)
            return success_response('登录成功', {
                'user_id': user.id,
                'username': user.username,
                'access_token': str(refresh.access_token),
                'refresh_token': str(refresh)
            })
        return error_response(serializer.errors, status.HTTP_400_BAD_REQUEST)

    def check_and_update_membership(self, user):
        """检查并更新用户的会员状态"""
        try:
            profile = user.profile
            now = timezone.now()

            # 检查会员是否已过期
            if profile.is_premium and profile.premium_expire_date and profile.premium_expire_date <= now:
                logger.info(f"用户 {user.username} 的会员已过期，检查是否有待生效的会员计划")

                # 检查是否有待生效的会员计划
                if profile.pending_membership_plan:
                    logger.info(f"用户 {user.username} 有待生效的会员计划，将其激活")

                    # 激活待生效的会员计划
                    profile.membership_plan = profile.pending_membership_plan
                    profile.premium_expire_date = profile.pending_membership_expire_date

                    # 更新存储限制
                    if profile.membership_plan and profile.membership_plan.storage_limit:
                        profile.storage_limit = profile.membership_plan.storage_limit

                    # 清除待生效的会员计划信息
                    profile.pending_membership_plan = None
                    profile.pending_membership_start_date = None
                    profile.pending_membership_expire_date = None

                    profile.save()
                    logger.info(
                        f"用户 {user.username} 的待生效会员计划已激活，新会员类型：{profile.membership_plan.name}")

                elif not profile.is_premium_active():  # 调用方法而不是访问属性
                    # 会员已过期且没有待生效的计划，重置会员状态
                    logger.info(
                        f"用户 {user.username} 的会员已过期，没有待生效的会员计划，重置为非会员状态")
                    # 不重置会员计划，保留历史信息，只通过is_premium_active判断会员状态

            return True
        except Exception as e:
            logger.error(f"检查用户会员状态时出错: {str(e)}")
            return False


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

                return success_response('密码重置邮件已发送，请检查您的邮箱')
            except User.DoesNotExist:
                # 这种情况不应该发生，因为序列化器已经验证了用户存在
                # 但为了安全起见，仍然返回成功消息
                return success_response('如果该用户名和邮箱匹配，我们将发送密码重置邮件')

        return error_response(serializer.errors, status.HTTP_400_BAD_REQUEST)


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

                return success_response('密码已成功重置')
            except PasswordResetToken.DoesNotExist:
                return error_response('无效或已过期的重置令牌', status.HTTP_400_BAD_REQUEST)

        return error_response(serializer.errors, status.HTTP_400_BAD_REQUEST)


class DesignViewSet(viewsets.ModelViewSet):
    """
    设计视图集
    """
    queryset = Design.objects.all()
    serializer_class = DesignSerializer
    parser_classes = (MultiPartParser, FormParser)

    def get_serializer_class(self):
        """根据不同的操作返回不同的序列化器"""
        if self.action == 'shared_designs':
            return DesignListSerializer
        return DesignSerializer

    def get_queryset(self):
        """根据不同的操作返回不同的查询集"""
        if self.action == 'shared_designs':
            # 公开分享的设计
            return Design.objects.filter(is_shared=True)
        # 默认只返回当前用户的设计
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

    @action(detail=False, methods=['get'], url_path='shared')
    def shared_designs(self, request):
        """获取所有公开分享的设计"""
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='my')
    def my_designs(self, request):
        """获取当前用户的所有设计"""
        queryset = Design.objects.filter(author=request.user)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='like')
    def like_design(self, request, pk=None):
        """点赞设计"""
        # 直接获取设计，不使用self.get_object()，允许点赞任何共享的设计
        try:
            # 先尝试获取指定ID的设计，不考虑作者限制
            design = Design.objects.get(pk=pk)

            # 如果不是自己的设计，检查是否已共享
            if design.author != request.user and not design.is_shared:
                return error_response('您无权点赞未共享的设计', status.HTTP_403_FORBIDDEN)

            user = request.user

            # 检查是否已点赞
            like_exists = DesignLike.objects.filter(
                design=design, user=user).exists()

            if like_exists:
                # 如果已点赞，则取消点赞
                DesignLike.objects.filter(design=design, user=user).delete()
                # 减少点赞数
                Design.objects.filter(pk=pk).update(likes_count=F('likes_count') - 1)
                design.refresh_from_db()
                return success_response('取消点赞成功', {
                    'likes_count': design.likes_count,
                    'is_liked': False
                })
            else:
                # 如果未点赞，则添加点赞
                DesignLike.objects.create(design=design, user=user)
                # 增加点赞数
                Design.objects.filter(pk=pk).update(likes_count=F('likes_count') + 1)
                design.refresh_from_db()
                return success_response('点赞成功', {
                    'likes_count': design.likes_count,
                    'is_liked': True
                })
        except Design.DoesNotExist:
            return error_response('设计不存在', status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'], url_path='share')
    def share_design(self, request, pk=None):
        """分享/取消分享设计"""
        design = self.get_object()

        # 切换分享状态
        design.is_shared = not design.is_shared
        design.save()

        return success_response('分享状态已更新', {
            'is_shared': design.is_shared
        })

    @action(detail=True, methods=['post'], url_path='toggle-share')
    def toggle_design_sharing(self, request, pk=None):
        """切换设计的分享状态"""
        design = self.get_object()

        # 切换分享状态
        design.is_shared = not design.is_shared
        design.save()

        return success_response('设计已分享' if design.is_shared else '设计已取消分享', {
            'is_shared': design.is_shared
        })

    @action(detail=True, methods=['get'], url_path='download')
    def download_design(self, request, pk=None):
        """下载设计并增加下载计数"""
        try:
            # 获取下载类型参数，默认为json
            file_type = request.query_params.get('type', 'json').lower()
            if file_type not in ['json', 'png', 'pdf']:
                return error_response('不支持的文件类型，支持的类型有：json, png, pdf', status.HTTP_400_BAD_REQUEST)

            # 直接获取设计，不使用self.get_object()，允许下载任何共享的设计
            design = Design.objects.get(pk=pk)

            # 如果不是自己的设计，检查是否已共享
            if design.author != request.user and not design.is_shared:
                return error_response('您无权下载未共享的设计', status.HTTP_403_FORBIDDEN)

            # 检查是否有下载文件
            if not design.download and file_type == 'json':
                return error_response('该设计没有可下载的JSON文件', status.HTTP_404_NOT_FOUND)

            # 检查是否有图片文件
            if not design.image and file_type == 'png':
                return error_response('该设计没有可下载的PNG图片', status.HTTP_404_NOT_FOUND)

            # 增加下载计数
            Design.objects.filter(pk=pk).update(downloads_count=F('downloads_count') + 1)
            design.refresh_from_db()

            # 根据文件类型返回不同的下载URL
            if file_type == 'json':
                download_url = get_absolute_media_url(design.download.url)
                filename = f"{design.title}.json"
            elif file_type == 'png':
                download_url = get_absolute_media_url(design.image.url)
                filename = f"{design.title}.png"
            elif file_type == 'pdf':
                # 这里需要实现PDF生成逻辑，暂时返回错误
                return error_response('PDF下载功能正在开发中，敬请期待', status.HTTP_501_NOT_IMPLEMENTED)

            # 返回下载URL和文件名
            return success_response('下载成功', {
                'download_url': download_url,
                'filename': filename,
                'file_type': file_type,
                'downloads_count': design.downloads_count
            })

        except Design.DoesNotExist:
            return error_response('设计不存在', status.HTTP_404_NOT_FOUND)

    def create(self, request, *args, **kwargs):
        """创建设计前检查存储限制"""
        # 获取用户当前的设计数量
        user = request.user
        try:
            profile = user.profile
        except UserProfile.DoesNotExist:
            # 如果用户资料不存在，创建一个
            profile = UserProfile.objects.create(user=user)

        # 获取用户的设计数量
        user_designs_count = Design.objects.filter(author=user).count()

        # 检查是否超出存储限制
        storage_limit = profile.get_storage_limit()
        if user_designs_count >= storage_limit:
            return error_response(
                f'您已达到存储限制（{storage_limit}个设计）。升级为会员可获得更多存储空间！',
                status.HTTP_403_FORBIDDEN,
                {
                    'is_limit_reached': True,
                    'current_count': user_designs_count,
                    'limit': storage_limit,
                    'is_premium': profile.is_premium,
                    'is_premium_active': profile.is_premium_active()
                }
            )

        # 继续正常的创建流程
        return super().create(request, *args, **kwargs)


# 用户视图集
class UserViewSet(viewsets.ModelViewSet):
    """
    用户管理视图集，提供用户相关的API
    """
    queryset = User.objects.all()
    serializer_class = UserRegisterSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """
        根据不同的操作设置不同的权限
        """
        if self.action == 'create':
            return [AllowAny()]
        elif self.action in ['set_premium', 'list', 'retrieve', 'update', 'partial_update', 'destroy']:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    @action(detail=True, methods=['post'], permission_classes=[IsAdminUser])
    def set_premium(self, request, pk=None):
        """设置用户的会员状态"""
        try:
            user = User.objects.get(pk=pk)
            profile, created = UserProfile.objects.get_or_create(user=user)

            # 获取请求参数
            is_premium = request.data.get('is_premium', False)
            duration_days = request.data.get('duration_days', 30)  # 默认30天
            membership_plan_id = request.data.get('membership_plan_id')

            # 获取会员计划
            membership_plan = None
            if membership_plan_id:
                try:
                    membership_plan = MembershipPlan.objects.get(
                        id=membership_plan_id, is_active=True)
                except MembershipPlan.DoesNotExist:
                    return error_response("指定的会员计划不存在或未激活", status.HTTP_400_BAD_REQUEST)

            # 设置会员状态
            profile.is_premium = is_premium
            profile.membership_plan = membership_plan if is_premium else None

            # 如果是会员，设置到期时间
            if is_premium:
                if profile.premium_expiry and profile.premium_expiry > timezone.now():
                    # 如果当前会员未过期，则在当前到期时间基础上增加时间
                    profile.premium_expiry = profile.premium_expiry + \
                        timedelta(days=duration_days)
                else:
                    # 如果当前不是会员或已过期，则从现在开始计算
                    profile.premium_expiry = timezone.now() + timedelta(days=duration_days)

            profile.save()

            return success_response(f"用户 {user.username} 的会员状态已更新", {
                'is_premium': profile.is_premium,
                'premium_expiry': profile.premium_expiry,
                'membership_plan': membership_plan.name if membership_plan else None,
                'design_storage_limit': profile.get_storage_limit()
            })
        except User.DoesNotExist:
            return error_response("用户不存在", status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return error_response(f"设置会员状态失败: {str(e)}", status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def check_premium(self, request):
        """检查用户会员状态（轻量级接口）"""
        user = request.user
        profile, created = UserProfile.objects.get_or_create(user=user)
        
        return success_response('查询成功', {
            'is_premium_active': profile.is_premium_active()
        })

    @action(detail=False, methods=['get'])
    def my_profile(self, request):
        """获取当前用户资料"""
        user = request.user
        # 获取或创建用户资料
        profile, created = UserProfile.objects.get_or_create(user=user)

        # 获取用户设计数量
        design_count = Design.objects.filter(author=user).count()

        # 获取可用的会员计划
        plans = MembershipPlan.objects.filter(is_active=True)

        # 构建响应数据
        data = {
            'success': True,
            'username': user.username,
            'email': user.email,
            'is_premium': profile.is_premium,
            'is_premium_active': profile.is_premium_active(),
            'design_count': design_count,
            'design_storage_limit': profile.storage_limit,
            'available_plans': [],
        }

        # 添加当前会员计划
        if profile.membership_plan:
            data['membership_plan'] = {
                'id': profile.membership_plan.id,
                'name': profile.membership_plan.name,
                'code': profile.membership_plan.code,
                'monthly_price': float(profile.membership_plan.monthly_price),
                'yearly_price': float(profile.membership_plan.yearly_price),
                'storage_limit': profile.membership_plan.storage_limit
            }
            data['premium_expire_date'] = profile.premium_expire_date

        # 添加待生效的会员计划信息
        if profile.pending_membership_plan:
            data['pending_membership_plan'] = {
                'id': profile.pending_membership_plan.id,
                'name': profile.pending_membership_plan.name,
                'code': profile.pending_membership_plan.code,
                'monthly_price': float(profile.pending_membership_plan.monthly_price),
                'yearly_price': float(profile.pending_membership_plan.yearly_price),
                'storage_limit': profile.pending_membership_plan.storage_limit,
                'start_date': profile.pending_membership_start_date,
                'expire_date': profile.pending_membership_expire_date
            }

        # 添加可用的会员计划
        for plan in plans:
            data['available_plans'].append({
                'id': plan.id,
                'name': plan.name,
                'code': plan.code,
                'monthly_price': float(plan.monthly_price),
                'yearly_price': float(plan.yearly_price),
                'storage_limit': plan.storage_limit,
                'description': plan.description
            })

        return Response(data)

    @action(detail=False, methods=['post'])
    def change_password(self, request):
        """修改用户密码"""
        user = request.user
        if not user.is_authenticated:
            return error_response("用户未登录", status.HTTP_401_UNAUTHORIZED)

        old_password = request.data.get('old_password')
        new_password = request.data.get('new_password')
        confirm_password = request.data.get('confirm_password')

        # 验证数据
        if not old_password or not new_password or not confirm_password:
            return error_response("所有字段都是必填的", status.HTTP_400_BAD_REQUEST)

        if new_password != confirm_password:
            return error_response("两次输入的新密码不一致", status.HTTP_400_BAD_REQUEST)

        # 验证旧密码
        if not user.check_password(old_password):
            return error_response("旧密码不正确", status.HTTP_400_BAD_REQUEST)

        # 设置新密码
        user.set_password(new_password)
        user.save()

        # 更新令牌
        refresh = RefreshToken.for_user(user)

        return success_response("密码修改成功", {
            'refresh': str(refresh),
            'access': str(refresh.access_token)
        })

    @action(detail=False, methods=['post'])
    def change_email(self, request):
        """修改用户邮箱"""
        user = request.user
        if not user.is_authenticated:
            return error_response("用户未登录", status.HTTP_401_UNAUTHORIZED)

        password = request.data.get('password')
        new_email = request.data.get('new_email')

        # 验证数据
        if not password or not new_email:
            return error_response("所有字段都是必填的", status.HTTP_400_BAD_REQUEST)

        # 验证密码
        if not user.check_password(password):
            return error_response("密码不正确", status.HTTP_400_BAD_REQUEST)

        # 检查邮箱是否已被使用
        if User.objects.filter(email=new_email).exclude(id=user.id).exists():
            return error_response("该邮箱已被其他用户使用", status.HTTP_400_BAD_REQUEST)

        # 更新邮箱
        user.email = new_email
        user.save()

        return success_response("邮箱修改成功", {
            'email': new_email
        })


class CustomObstacleViewSet(viewsets.ModelViewSet):
    """
    自定义障碍物视图集
    提供自定义障碍物的CRUD操作
    """
    serializer_class = CustomObstacleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        获取当前用户的自定义障碍物
        """
        user = self.request.user
        return CustomObstacle.objects.filter(user=user)

    def perform_create(self, serializer):
        """
        创建自定义障碍物时，自动关联当前用户
        """
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        """
        更新自定义障碍物
        """
        instance = self.get_object()
        # 确保用户只能更新自己的障碍物
        if instance.user != self.request.user:
            raise PermissionDenied("您无权修改此障碍物")
        serializer.save()

    def perform_destroy(self, instance):
        """
        删除自定义障碍物
        """
        # 确保用户只能删除自己的障碍物
        if instance.user != self.request.user:
            raise PermissionDenied("您无权删除此障碍物")
        instance.delete()

    @action(detail=False, methods=['get'], url_path='count')
    def get_obstacle_count(self, request):
        """
        获取用户自定义障碍物数量和限制
        """
        user = request.user
        count = CustomObstacle.objects.filter(user=user).count()

        # 获取用户限制
        max_count = 20  # 默认限制
        if hasattr(user, 'profile') and user.profile.is_premium_active():
            max_count = 100  # 会员用户限制

        return Response({
            'count': count,
            'max_count': max_count,
            'is_premium': hasattr(user, 'profile') and user.profile.is_premium_active()
        })

    @action(detail=False, methods=['get'], url_path='shared')
    def get_shared_obstacles(self, request):
        """
        获取其他用户共享的障碍物
        """
        # 获取所有标记为共享的障碍物，但排除当前用户的
        shared_obstacles = CustomObstacle.objects.filter(
            is_shared=True
        )

        serializer = self.get_serializer(shared_obstacles, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='toggle-share')
    def toggle_share(self, request, pk=None):
        """
        切换障碍物的共享状态
        """
        obstacle = self.get_object()

        # 确保用户只能操作自己的障碍物
        if obstacle.user != request.user:
            raise PermissionDenied("您无权修改此障碍物的共享状态")

        # 切换共享状态
        obstacle.is_shared = not obstacle.is_shared
        obstacle.save()

        return Response({
            'id': obstacle.id,
            'name': obstacle.name,
            'is_shared': obstacle.is_shared
        })


# 支付相关视图
logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_membership_order(request):
    """创建会员订单并返回支付链接"""
    serializer = CreateMembershipOrderSerializer(data=request.data)
    if serializer.is_valid():
        # 获取会员计划
        plan = MembershipPlan.objects.get(
            id=serializer.validated_data['plan_id'])
        # 获取用户
        user = request.user

        # 创建订单
        order = MembershipOrder(
            user=user,
            membership_plan=plan,
            amount=serializer.validated_data['amount'],
            billing_cycle=serializer.validated_data['billing_cycle'],
            payment_channel='alipay',
            status='pending'
        )
        order.save()

        # 创建支付链接
        subject = f"{order.get_billing_cycle_display()}-{plan.name}"
        # 生成支付宝订单
        try:
            pay_url = create_alipay_order(
                order_id=order.order_id,
                subject=subject,
                total_amount=float(order.amount)
            )
            # 保存支付链接
            order.payment_url = pay_url
            order.save()

            # 返回订单信息和支付链接
            return success_response('订单创建成功', {
                'order': MembershipOrderSerializer(order).data,
                'payment_url': pay_url
            })
        except Exception as e:
            # 记录错误并返回
            logger.error(f"创建支付宝订单失败: {str(e)}")
            order.status = 'failed'
            order.save()
            return error_response(f'创建支付订单失败: {str(e)}', status.HTTP_500_INTERNAL_SERVER_ERROR)
    else:
        return error_response(serializer.errors, status.HTTP_400_BAD_REQUEST)


class StandardResultsSetPagination(PageNumberPagination):
    """标准分页器"""
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_orders(request):
    """获取用户的所有订单"""
    # 创建分页器实例
    paginator = StandardResultsSetPagination()

    # 获取查询参数
    status = request.query_params.get('status')
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')

    # 构建查询集
    orders = MembershipOrder.objects.filter(
        user=request.user).order_by('-created_at')

    # 应用过滤条件
    if status:
        orders = orders.filter(status=status)
    if start_date:
        orders = orders.filter(created_at__gte=start_date)
    if end_date:
        orders = orders.filter(created_at__lte=end_date)

    # 执行分页
    page = paginator.paginate_queryset(orders, request)

    # 序列化数据
    serializer = MembershipOrderSerializer(page, many=True)

    # 返回分页响应
    return paginator.get_paginated_response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_order_status(request, order_id):
    """查询订单状态"""
    try:
        order = MembershipOrder.objects.get(
            order_id=order_id, user=request.user)
    except MembershipOrder.DoesNotExist:
        return error_response('订单不存在', status.HTTP_404_NOT_FOUND)

    # 如果订单已经支付完成，直接返回状态
    if order.status == 'paid':
        return success_response('查询成功', {
            'order': MembershipOrderSerializer(order).data
        })

    # 如果未支付，查询支付宝订单状态
    try:
        query_result = query_alipay_order(order.order_id)
        logger.info(f"支付宝查询结果: {query_result}")

        # 处理查询结果
        if query_result.get('trade_status') == 'TRADE_SUCCESS':
            # 更新订单状态
            order.status = 'paid'
            order.trade_no = query_result.get('trade_no')
            order.payment_time = datetime.now()
            order.save()

            # 更新用户会员状态
            update_user_membership(request.user, order)

            return success_response('支付成功', {
                'order': MembershipOrderSerializer(order).data
            })
        else:
            return success_response('订单未支付或支付处理中', {
                'order': MembershipOrderSerializer(order).data,
                'alipay_status': query_result.get('trade_status')
            })
    except Exception as e:
        logger.error(f"查询支付宝订单状态失败: {str(e)}")
        return error_response(f'查询订单状态失败: {str(e)}', status.HTTP_500_INTERNAL_SERVER_ERROR, {
            'order': MembershipOrderSerializer(order).data
        })


@api_view(['POST'])
@permission_classes([AllowAny])
def alipay_notify(request):
    """支付宝异步通知处理"""
    # 获取所有参数
    data = request.data.dict() if hasattr(request.data, 'dict') else request.data
    signature = data.pop('sign', None)

    try:
        # 验证签名
        if not signature or not verify_alipay_callback(data, signature):
            logger.warning(f"支付宝回调签名验证失败: {data}")
            return Response({'message': 'FAIL', 'detail': '签名验证失败'})

        # 验证接收的信息
        out_trade_no = data.get('out_trade_no')
        trade_status = data.get('trade_status')

        if not out_trade_no or not trade_status:
            return Response({'message': 'FAIL', 'detail': '参数不完整'})

        # 查找订单
        try:
            order = MembershipOrder.objects.get(order_id=out_trade_no)
        except MembershipOrder.DoesNotExist:
            logger.warning(f"支付宝回调：找不到订单 {out_trade_no}")
            return Response({'message': 'FAIL', 'detail': '订单不存在'})

        # 处理不同的交易状态
        if trade_status == 'TRADE_SUCCESS' or trade_status == 'TRADE_FINISHED':
            # 如果订单已处理，防止重复更新
            if order.status == 'paid':
                return Response({'message': 'SUCCESS', 'detail': '订单已处理'})

            # 更新订单状态
            order.status = 'paid'
            order.trade_no = data.get('trade_no')
            order.payment_time = datetime.now()
            order.save()

            # 更新用户会员状态
            update_user_membership(order.user, order)

            logger.info(f"订单 {out_trade_no} 支付成功，交易号: {data.get('trade_no')}")
            return Response({'message': 'SUCCESS'})
        else:
            # 其他状态不处理
            return Response({'message': 'SUCCESS', 'detail': '等待交易完成'})
    except Exception as e:
        logger.error(f"处理支付宝回调时出错: {str(e)}")
        return Response({'message': 'FAIL', 'detail': str(e)})


def update_user_membership(user, order):
    """更新用户会员状态"""
    # 获取用户资料
    profile = user.profile

    # 获取当前时间
    now = datetime.now()

    # 会员计划等级映射（数字越大等级越高）
    plan_level = {
        'standard': 1,
        'premium': 2,
        # 未来可能添加的其他计划
    }

    # 设置会员到期时间
    if order.billing_cycle == 'month':
        duration = timedelta(days=30)
    else:  # year
        duration = timedelta(days=365)

    # 判断是否已经是会员
    if profile.is_premium_active():
        current_plan_code = profile.membership_plan.code if profile.membership_plan else 'free'
        new_plan_code = order.membership_plan.code if order.membership_plan else 'free'

        # 获取当前和新计划的等级
        current_level = plan_level.get(current_plan_code, 0)
        new_level = plan_level.get(new_plan_code, 0)

        # 1. 升级会员（立即生效，重置到期时间）
        if new_level > current_level:
            logger.info(
                f"用户 {user.username} 升级会员: {current_plan_code} -> {new_plan_code}")
            profile.membership_plan = order.membership_plan
            profile.premium_expire_date = now + duration

        # 2. 同等级续费（延长到期时间）
        elif new_level == current_level:
            logger.info(f"用户 {user.username} 续费相同等级会员: {current_plan_code}")
            # 从当前到期时间起延长
            if profile.premium_expire_date and profile.premium_expire_date > now:
                profile.premium_expire_date = profile.premium_expire_date + duration
            else:
                profile.premium_expire_date = now + duration

        # 3. 降级会员（当前会员到期后生效）
        else:
            logger.info(
                f"用户 {user.username} 降级会员: {current_plan_code} -> {new_plan_code}，将在当前会员到期后生效")

            # 创建会员变更记录(可选，如果需要记录变更历史)
            # MembershipChangeLog.objects.create(...)

            # 存储降级信息，但暂不更新当前会员
            profile.pending_membership_plan = order.membership_plan
            profile.pending_membership_start_date = profile.premium_expire_date
            profile.pending_membership_expire_date = profile.premium_expire_date + duration

            # 注意：此处不修改当前会员计划和到期时间
            # 需要添加一个定时任务或登录检查来处理会员到期后的降级
    else:
        # 用户之前不是会员，直接激活
        logger.info(f"用户 {user.username} 首次开通会员: {order.membership_plan.name}")
        profile.membership_plan = order.membership_plan
        profile.premium_expire_date = now + duration
        profile.is_premium = True

    # 更新存储限制
    if order.membership_plan:
        # 如果是降级但还没生效，不降低存储限制
        if not hasattr(profile, 'pending_membership_plan') or profile.pending_membership_plan is None:
            profile.storage_limit = order.membership_plan.storage_limit

    # 保存更改
    profile.save()

    logger.info(
        f"用户 {user.username} 的会员状态已更新，当前会员类型：{profile.membership_plan.name if profile.membership_plan else '无'}")

    # 返回更新后的用户资料
    return profile

# 支付成功页面重定向


class PaymentSuccessView(TemplateView):
    template_name = 'payment_success.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        order_id = self.request.GET.get('out_trade_no')
        if order_id:
            try:
                order = MembershipOrder.objects.get(order_id=order_id)
                context['order'] = order
            except MembershipOrder.DoesNotExist:
                pass
        return context
