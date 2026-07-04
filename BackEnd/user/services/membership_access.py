"""会员权益与容量检查服务。"""

from dataclasses import dataclass
from typing import Optional

from django.contrib.auth.models import User
from rest_framework import status

from user.models import AIGenerationQuota, CustomObstacle, Design, UserProfile
from user.views.user_views import check_and_update_membership


@dataclass(frozen=True)
class PlanSummary:
    """会员计划摘要。"""

    id: int
    name: str
    code: str
    storage_limit: int
    custom_obstacle_limit: Optional[int]


@dataclass(frozen=True)
class EntitlementSnapshot:
    """当前用户权益快照。"""

    user_id: int
    plan_code: str
    plan_name: str
    is_premium_active: bool
    design_count: int
    design_limit: int
    custom_obstacle_count: int
    custom_obstacle_limit: Optional[int]
    custom_obstacle_unlimited: bool
    ai_remaining_quota: int
    can_collaborate: bool
    pending_plan: Optional[PlanSummary]

    def to_dict(self):
        """转换为接口响应字典。"""
        return {
            "user_id": self.user_id,
            "plan_code": self.plan_code,
            "plan_name": self.plan_name,
            "is_premium_active": self.is_premium_active,
            "design_count": self.design_count,
            "design_limit": self.design_limit,
            "custom_obstacle_count": self.custom_obstacle_count,
            "custom_obstacle_limit": self.custom_obstacle_limit,
            "custom_obstacle_unlimited": self.custom_obstacle_unlimited,
            "ai_remaining_quota": self.ai_remaining_quota,
            "can_collaborate": self.can_collaborate,
            "pending_plan": None if self.pending_plan is None else self.pending_plan.__dict__,
        }


class MembershipAccessError(Exception):
    """会员权益检查失败。"""

    def __init__(self, message: str, status_code=status.HTTP_403_FORBIDDEN, data=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.data = data or {}


def _plan_summary(plan):
    if plan is None:
        return None
    return PlanSummary(
        id=plan.id,
        name=plan.name,
        code=plan.code,
        storage_limit=plan.storage_limit,
        custom_obstacle_limit=plan.custom_obstacle_limit,
    )


def get_entitlements(user: User) -> EntitlementSnapshot:
    """获取用户当前权益快照。"""
    check_and_update_membership(user)
    profile, _ = UserProfile.objects.select_related(
        "membership_plan", "pending_membership_plan"
    ).get_or_create(user=user)

    is_active = profile.is_premium_active()
    plan = profile.membership_plan
    plan_code = plan.code if plan else "free"
    plan_name = plan.name if plan else "免费用户"
    design_limit = profile.get_storage_limit()
    custom_limit = 10
    custom_unlimited = False
    if plan and plan.custom_obstacle_limit is None and is_active:
        custom_limit = None
        custom_unlimited = True
    elif plan and plan.custom_obstacle_limit is not None:
        custom_limit = plan.custom_obstacle_limit

    quota, _ = AIGenerationQuota.objects.get_or_create(user_profile=profile)
    can_collaborate = is_active and plan_code == "premium"

    return EntitlementSnapshot(
        user_id=user.id,
        plan_code=plan_code,
        plan_name=plan_name,
        is_premium_active=is_active,
        design_count=Design.objects.filter(author=user).count(),
        design_limit=design_limit,
        custom_obstacle_count=CustomObstacle.objects.filter(user=user).count(),
        custom_obstacle_limit=custom_limit,
        custom_obstacle_unlimited=custom_unlimited,
        ai_remaining_quota=quota.remaining_quota,
        can_collaborate=can_collaborate,
        pending_plan=_plan_summary(profile.pending_membership_plan),
    )



def assert_design_capacity(user: User) -> EntitlementSnapshot:
    """检查用户是否还能创建设计。"""
    snapshot = get_entitlements(user)
    if snapshot.design_count >= snapshot.design_limit:
        raise MembershipAccessError(
            f"您已达到存储限制（{snapshot.design_limit}个设计）。升级为会员可获得更多存储空间！",
            data={
                "is_limit_reached": True,
                "current_count": snapshot.design_count,
                "limit": snapshot.design_limit,
                "plan_code": snapshot.plan_code,
                "is_premium_active": snapshot.is_premium_active,
            },
        )
    return snapshot
