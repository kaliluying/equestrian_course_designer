"""用户管理视图：个人资料、密码修改、会员状态检查。"""

import logging
from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from ..models import (
    Design,
    UserProfile,
    MembershipPlan,
)
from ..serializers import UserRegisterSerializer
from ..utils import success_response, error_response

logger = logging.getLogger(__name__)


def _clear_user_profile_cache(user):
    """清理用户资料关系缓存，确保同一次请求后续读取到最新会员状态。"""
    user._state.fields_cache.pop("profile", None)


def _get_or_create_free_plan():
    """获取或创建免费会员计划。"""
    try:
        return MembershipPlan.objects.get(code="free")
    except MembershipPlan.DoesNotExist:
        return MembershipPlan.objects.create(
            name="免费用户",
            code="free",
            monthly_price=0,
            yearly_price=0,
            storage_limit=5,
            custom_obstacle_limit=10,
            description="免费用户计划，限制存储5个设计",
        )


def _reset_to_free_membership(profile):
    """将资料重置为免费计划并清理待生效计划。"""
    free_plan = _get_or_create_free_plan()
    profile.is_premium = False
    profile.membership_plan = free_plan
    profile.premium_expire_date = None
    profile.storage_limit = free_plan.storage_limit
    profile.pending_membership_plan = None
    profile.pending_membership_start_date = None
    profile.pending_membership_expire_date = None


def _activate_pending_membership(profile):
    """激活待生效计划并清理 pending 字段。"""
    profile.membership_plan = profile.pending_membership_plan
    profile.premium_expire_date = profile.pending_membership_expire_date
    profile.is_premium = True
    if profile.membership_plan:
        profile.storage_limit = profile.membership_plan.storage_limit
    profile.pending_membership_plan = None
    profile.pending_membership_start_date = None
    profile.pending_membership_expire_date = None


def check_and_update_membership(user):
    """检查并更新用户的会员状态。"""
    try:
        profile, _ = UserProfile.objects.get_or_create(user=user)
        now = timezone.now()

        if not (
            profile.is_premium
            and profile.premium_expire_date
            and profile.premium_expire_date <= now
        ):
            return True

        logger.info(f"用户 {user.username} 的会员已过期，检查是否有待生效的会员计划")

        if profile.pending_membership_plan:
            if (
                profile.pending_membership_expire_date
                and profile.pending_membership_expire_date > now
            ):
                logger.info(f"用户 {user.username} 有待生效的会员计划，将其激活")
                _activate_pending_membership(profile)
                profile.save(
                    update_fields=[
                        "is_premium",
                        "membership_plan",
                        "premium_expire_date",
                        "storage_limit",
                        "pending_membership_plan",
                        "pending_membership_start_date",
                        "pending_membership_expire_date",
                    ]
                )
                logger.info(
                    f"用户 {user.username} 的待生效会员计划已激活，新会员类型：{profile.membership_plan.name}"
                )
                _clear_user_profile_cache(user)
                return True

            logger.info(f"用户 {user.username} 的待生效会员计划也已失效，重置为免费用户")
        else:
            logger.info(f"用户 {user.username} 的会员已过期，没有待生效的会员计划，重置为免费用户")

        _reset_to_free_membership(profile)
        profile.save(
            update_fields=[
                "is_premium",
                "membership_plan",
                "premium_expire_date",
                "storage_limit",
                "pending_membership_plan",
                "pending_membership_start_date",
                "pending_membership_expire_date",
            ]
        )
        logger.info(f"用户 {user.username} 的会员状态已重置为免费用户")
        _clear_user_profile_cache(user)
        return True
    except Exception as e:
        logger.error(f"检查用户会员状态时出错: {str(e)}")
        return False


class UserViewSet(viewsets.ModelViewSet):
    """用户管理视图集，提供用户相关的API"""

    queryset = User.objects.all()
    serializer_class = UserRegisterSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        """根据不同的操作设置不同的权限"""
        if self.action == "create":
            return [AllowAny()]
        elif self.action in [
            "set_premium",
            "list",
            "retrieve",
            "update",
            "partial_update",
            "destroy",
        ]:
            return [IsAdminUser()]
        return [IsAuthenticated()]

    @action(detail=True, methods=["post"], permission_classes=[IsAdminUser])
    def set_premium(self, request, pk=None):
        """设置用户的会员状态"""
        try:
            user = User.objects.get(pk=pk)
            profile, created = UserProfile.objects.get_or_create(user=user)

            # 获取请求参数
            is_premium = request.data.get("is_premium", False)
            duration_days = request.data.get("duration_days", 30)  # 默认30天
            membership_plan_id = request.data.get("membership_plan_id")

            # 获取会员计划
            membership_plan = None
            if membership_plan_id:
                try:
                    membership_plan = MembershipPlan.objects.get(
                        id=membership_plan_id, is_active=True
                    )
                except MembershipPlan.DoesNotExist:
                    return error_response(
                        "指定的会员计划不存在或未激活", status.HTTP_400_BAD_REQUEST
                    )

            # 设置会员状态
            profile.is_premium = is_premium
            profile.membership_plan = membership_plan if is_premium else None

            # 如果是会员，设置到期时间
            if is_premium:
                if profile.premium_expire_date and profile.premium_expire_date > timezone.now():
                    # 如果当前会员未过期，则在当前到期时间基础上增加时间
                    profile.premium_expire_date = profile.premium_expire_date + timedelta(
                        days=duration_days
                    )
                else:
                    # 如果当前不是会员或已过期，则从现在开始计算
                    profile.premium_expire_date = timezone.now() + timedelta(
                        days=duration_days
                    )

            profile.save()

            return success_response(
                f"用户 {user.username} 的会员状态已更新",
                {
                    "is_premium": profile.is_premium,
                    "premium_expire_date": profile.premium_expire_date,
                    "membership_plan": membership_plan.name
                    if membership_plan
                    else None,
                    "design_storage_limit": profile.get_storage_limit(),
                },
            )
        except User.DoesNotExist:
            return error_response("用户不存在", status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return error_response(
                f"设置会员状态失败: {str(e)}", status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=["get"])
    def check_premium(self, request):
        """检查用户会员状态（轻量级接口）"""
        user = request.user

        check_and_update_membership(user)

        profile, created = UserProfile.objects.get_or_create(user=user)

        return success_response(
            "查询成功", {"is_premium_active": profile.is_premium_active()}
        )

    @action(detail=False, methods=["get"])
    def my_profile(self, request):
        """获取当前用户资料"""
        user = request.user

        check_and_update_membership(user)

        # 获取或创建用户资料
        profile, created = UserProfile.objects.get_or_create(user=user)

        # 获取用户设计数量
        design_count = Design.objects.filter(author=user).count()

        from ..services.membership_access import get_entitlements

        entitlements = get_entitlements(user)

        # 获取可用的会员计划
        plans = MembershipPlan.objects.filter(is_active=True)

        # 构建响应数据
        data = {
            "success": True,
            "username": user.username,
            "email": user.email,
            "is_premium": profile.is_premium,
            "is_premium_active": profile.is_premium_active(),
            "design_count": design_count,
            "design_storage_limit": profile.storage_limit,
            "entitlements": entitlements.to_dict(),
            "available_plans": [],
        }

        # 添加当前会员计划
        if profile.membership_plan:
            data["membership_plan"] = {
                "id": profile.membership_plan.id,
                "name": profile.membership_plan.name,
                "code": profile.membership_plan.code,
                "monthly_price": float(profile.membership_plan.monthly_price),
                "yearly_price": float(profile.membership_plan.yearly_price),
                "storage_limit": profile.membership_plan.storage_limit,
            }
            data["premium_expire_date"] = profile.premium_expire_date

        # 添加待生效的会员计划信息
        if profile.pending_membership_plan:
            data["pending_membership_plan"] = {
                "id": profile.pending_membership_plan.id,
                "name": profile.pending_membership_plan.name,
                "code": profile.pending_membership_plan.code,
                "monthly_price": float(profile.pending_membership_plan.monthly_price),
                "yearly_price": float(profile.pending_membership_plan.yearly_price),
                "storage_limit": profile.pending_membership_plan.storage_limit,
                "start_date": profile.pending_membership_start_date,
                "expire_date": profile.pending_membership_expire_date,
            }

        # 添加可用的会员计划
        for plan in plans:
            data["available_plans"].append(
                {
                    "id": plan.id,
                    "name": plan.name,
                    "code": plan.code,
                    "monthly_price": float(plan.monthly_price),
                    "yearly_price": float(plan.yearly_price),
                    "storage_limit": plan.storage_limit,
                    "description": plan.description,
                }
            )

        return Response(data)

    @action(detail=False, methods=["post"])
    def change_password(self, request):
        """修改用户密码"""
        user = request.user
        if not user.is_authenticated:
            return error_response("用户未登录", status.HTTP_401_UNAUTHORIZED)

        old_password = request.data.get("old_password")
        new_password = request.data.get("new_password")
        confirm_password = request.data.get("confirm_password")

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

        return success_response(
            "密码修改成功",
            {"refresh": str(refresh), "access": str(refresh.access_token)},
        )

    @action(detail=False, methods=["post"])
    def change_email(self, request):
        """修改用户邮箱"""
        user = request.user
        if not user.is_authenticated:
            return error_response("用户未登录", status.HTTP_401_UNAUTHORIZED)

        password = request.data.get("password")
        new_email = request.data.get("new_email")

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

        return success_response("邮箱修改成功", {"email": new_email})
