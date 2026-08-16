import io
import json
import os
import shutil
import tempfile
from unittest.mock import Mock, patch

from django.core.files.base import ContentFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from django.urls import reverse
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from PIL import Image

from user.models import (
    UserProfile,
    AIGenerationQuota,
    AIGenerationHistory,
    CourseTemplate,
    Design,
    MembershipPlan,
    MembershipOrder,
)

class MembershipAccessServiceTest(TestCase):
    """会员权益服务测试"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="access_user",
            email="access@example.com",
            password="Password123",
        )
        self.free_plan = MembershipPlan.objects.create(
            name="免费用户",
            code="free",
            monthly_price=0,
            yearly_price=0,
            storage_limit=5,
            custom_obstacle_limit=10,
        )
        self.standard_plan = MembershipPlan.objects.create(
            name="标准会员",
            code="standard",
            monthly_price=15,
            yearly_price=150,
            storage_limit=100,
            custom_obstacle_limit=50,
        )
        self.premium_plan = MembershipPlan.objects.create(
            name="高级会员",
            code="premium",
            monthly_price=30,
            yearly_price=300,
            storage_limit=500,
            custom_obstacle_limit=None,
        )
        self.profile, _ = UserProfile.objects.get_or_create(user=self.user)

    def test_free_user_entitlement_snapshot_uses_free_limits(self):
        """免费用户权益快照应返回免费额度和无协作权限"""
        from user.services.membership_access import get_entitlements

        self.profile.is_premium = False
        self.profile.membership_plan = self.free_plan
        self.profile.storage_limit = self.free_plan.storage_limit
        self.profile.save()

        snapshot = get_entitlements(self.user)

        self.assertEqual(snapshot.plan_code, "free")
        self.assertFalse(snapshot.is_premium_active)
        self.assertEqual(snapshot.design_limit, 5)
        self.assertEqual(snapshot.custom_obstacle_limit, 10)
        self.assertFalse(snapshot.custom_obstacle_unlimited)
        self.assertFalse(snapshot.can_collaborate)

    def test_premium_user_entitlement_snapshot_has_unlimited_obstacles_and_collaboration(self):
        """高级会员权益快照应包含无限自定义障碍和协作权限"""
        from user.services.membership_access import get_entitlements

        self.profile.is_premium = True
        self.profile.membership_plan = self.premium_plan
        self.profile.premium_expire_date = timezone.now() + timezone.timedelta(days=30)
        self.profile.storage_limit = self.premium_plan.storage_limit
        self.profile.save()

        snapshot = get_entitlements(self.user)

        self.assertEqual(snapshot.plan_code, "premium")
        self.assertTrue(snapshot.is_premium_active)
        self.assertEqual(snapshot.design_limit, 500)
        self.assertIsNone(snapshot.custom_obstacle_limit)
        self.assertTrue(snapshot.custom_obstacle_unlimited)
        self.assertTrue(snapshot.can_collaborate)

    def test_expired_premium_with_pending_standard_snapshot_activates_pending_plan(self):
        """权益快照读取应触发待生效计划并返回更新后的统一权益"""
        from user.services.membership_access import get_entitlements

        expired_at = timezone.now() - timezone.timedelta(minutes=1)
        self.profile.is_premium = True
        self.profile.membership_plan = self.premium_plan
        self.profile.premium_expire_date = expired_at
        self.profile.storage_limit = self.premium_plan.storage_limit
        self.profile.pending_membership_plan = self.standard_plan
        self.profile.pending_membership_start_date = expired_at
        self.profile.pending_membership_expire_date = expired_at + timezone.timedelta(days=30)
        self.profile.save()

        snapshot = get_entitlements(self.user)

        self.assertEqual(snapshot.plan_code, "standard")
        self.assertTrue(snapshot.is_premium_active)
        self.assertEqual(snapshot.design_limit, 100)
        self.assertEqual(snapshot.custom_obstacle_limit, 50)
        self.assertFalse(snapshot.can_collaborate)
        self.profile.refresh_from_db()
        self.assertIsNone(self.profile.pending_membership_plan)

    def test_inconsistent_premium_without_expiry_resets_to_free_entitlements(self):
        """没有到期时间的异常会员状态不能继续暴露非免费权益。"""
        from user.services.membership_access import get_entitlements

        self.profile.is_premium = True
        self.profile.membership_plan = self.standard_plan
        self.profile.premium_expire_date = None
        self.profile.storage_limit = self.standard_plan.storage_limit
        self.profile.save()

        snapshot = get_entitlements(self.user)

        self.assertFalse(snapshot.is_premium_active)
        self.assertEqual(snapshot.plan_code, "free")
        self.assertEqual(snapshot.custom_obstacle_limit, 10)
        self.assertEqual(snapshot.ai_monthly_quota, 0)
        self.assertEqual(snapshot.template_publish_limit, 3)
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.is_premium)
        self.assertEqual(self.profile.membership_plan, self.free_plan)

    @patch("user.services.membership_access.check_and_update_membership", return_value=False)
    def test_membership_check_failure_does_not_grant_entitlements(self, _check_membership):
        """会员状态无法确认时必须拒绝继续计算权益。"""
        from user.services.membership_access import MembershipAccessError, get_entitlements

        with self.assertRaises(MembershipAccessError) as context:
            get_entitlements(self.user)

        self.assertEqual(context.exception.status_code, 503)

    @patch("user.services.membership_access.check_and_update_membership", return_value=False)
    def test_membership_api_returns_service_unavailable_on_check_failure(self, _check_membership):
        """会员状态检查失败时相关接口必须返回统一的 503 响应。"""
        client = APIClient()
        client.force_authenticate(user=self.user)

        for path in ("/user/users/check_premium/", "/user/users/my_profile/"):
            with self.subTest(path=path):
                response = client.get(path)

                self.assertEqual(response.status_code, 503)
                self.assertFalse(response.json()["success"])


    def test_assert_design_capacity_raises_unified_error_when_limit_reached(self):
        """设计数量达到额度时应抛出统一容量错误"""
        from user.services.membership_access import (
            MembershipAccessError,
            assert_design_capacity,
        )

        self.profile.is_premium = False
        self.profile.membership_plan = self.free_plan
        self.profile.storage_limit = self.free_plan.storage_limit
        self.profile.save()
        for index in range(5):
            Design.objects.create(author=self.user, title=f"设计{index}")

        with self.assertRaises(MembershipAccessError) as context:
            assert_design_capacity(self.user)

        self.assertEqual(context.exception.status_code, 403)
        self.assertTrue(context.exception.data["is_limit_reached"])
        self.assertEqual(context.exception.data["current_count"], 5)
        self.assertEqual(context.exception.data["limit"], 5)
        self.assertEqual(context.exception.data["plan_code"], "free")


    def test_assert_custom_obstacle_capacity_uses_standard_limit(self):
        """标准会员自定义障碍容量检查应使用统一权益服务"""
        from user.models import CustomObstacle
        from user.services.membership_access import (
            MembershipAccessError,
            assert_custom_obstacle_capacity,
        )

        self.profile.is_premium = True
        self.profile.membership_plan = self.standard_plan
        self.profile.premium_expire_date = timezone.now() + timezone.timedelta(days=30)
        self.profile.storage_limit = self.standard_plan.storage_limit
        self.profile.save()
        for index in range(50):
            CustomObstacle.objects.create(
                user=self.user,
                name=f"障碍{index}",
                obstacle_data={"type": "vertical", "poles": [], "width": 1, "height": 1},
            )

        with self.assertRaises(MembershipAccessError) as context:
            assert_custom_obstacle_capacity(self.user)

        self.assertEqual(context.exception.data["current_count"], 50)
        self.assertEqual(context.exception.data["limit"], 50)
        self.assertEqual(context.exception.data["plan_code"], "standard")

    def test_assert_custom_obstacle_capacity_allows_premium_unlimited(self):
        """高级会员自定义障碍无限制"""
        from user.models import CustomObstacle
        from user.services.membership_access import assert_custom_obstacle_capacity

        self.profile.is_premium = True
        self.profile.membership_plan = self.premium_plan
        self.profile.premium_expire_date = timezone.now() + timezone.timedelta(days=30)
        self.profile.storage_limit = self.premium_plan.storage_limit
        self.profile.save()
        for index in range(60):
            CustomObstacle.objects.create(
                user=self.user,
                name=f"高级障碍{index}",
                obstacle_data={"type": "vertical", "poles": [], "width": 1, "height": 1},
            )

        snapshot = assert_custom_obstacle_capacity(self.user)

        self.assertTrue(snapshot.custom_obstacle_unlimited)
        self.assertIsNone(snapshot.custom_obstacle_limit)


    def test_my_profile_includes_entitlement_snapshot(self):
        """个人中心应返回统一权益快照"""
        client = APIClient()
        client.force_authenticate(user=self.user)
        self.profile.is_premium = True
        self.profile.membership_plan = self.standard_plan
        self.profile.premium_expire_date = timezone.now() + timezone.timedelta(days=30)
        self.profile.storage_limit = self.standard_plan.storage_limit
        self.profile.save()

        response = client.get("/user/users/my_profile/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("entitlements", data)
        self.assertEqual(data["entitlements"]["plan_code"], "standard")
        self.assertEqual(data["entitlements"]["design_limit"], 100)
        self.assertEqual(data["entitlements"]["custom_obstacle_limit"], 50)
        self.assertFalse(data["entitlements"]["can_collaborate"])


class SetPremiumAdminAPITest(TestCase):
    """管理员会员状态接口必须保持计划、期限和存储额度一致。"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="premium_target",
            email="premium-target@example.com",
            password="Password123",
        )
        self.admin = User.objects.create_user(
            username="premium_admin",
            email="premium-admin@example.com",
            password="Password123",
            is_staff=True,
        )
        self.free_plan = MembershipPlan.objects.create(
            name="免费用户",
            code="free",
            monthly_price=0,
            yearly_price=0,
            storage_limit=5,
            custom_obstacle_limit=10,
        )
        self.standard_plan = MembershipPlan.objects.create(
            name="标准会员",
            code="standard",
            monthly_price=15,
            yearly_price=150,
            storage_limit=100,
            custom_obstacle_limit=50,
        )
        self.profile, _ = UserProfile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.admin)

    def test_string_false_disables_membership_and_clears_state(self):
        """表单字符串 false 不能被当作真值，并且应清理全部会员字段。"""
        self.profile.is_premium = True
        self.profile.membership_plan = self.standard_plan
        self.profile.premium_expire_date = timezone.now() + timezone.timedelta(days=10)
        self.profile.storage_limit = self.standard_plan.storage_limit
        self.profile.pending_membership_plan = self.standard_plan
        self.profile.pending_membership_start_date = timezone.now()
        self.profile.pending_membership_expire_date = timezone.now() + timezone.timedelta(days=40)
        self.profile.save()

        response = self.client.post(
            f"/user/users/{self.user.id}/set_premium/",
            data={"is_premium": "false"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.is_premium)
        self.assertEqual(self.profile.membership_plan, self.free_plan)
        self.assertIsNone(self.profile.premium_expire_date)
        self.assertEqual(self.profile.storage_limit, self.free_plan.storage_limit)
        self.assertIsNone(self.profile.pending_membership_plan)
        self.assertIsNone(self.profile.pending_membership_start_date)
        self.assertIsNone(self.profile.pending_membership_expire_date)

    def test_enabling_membership_requires_plan_and_positive_duration(self):
        """启用会员必须指定有效计划，期限必须是正整数。"""
        missing_plan = self.client.post(
            f"/user/users/{self.user.id}/set_premium/",
            data={"is_premium": True},
            format="json",
        )
        invalid_duration = self.client.post(
            f"/user/users/{self.user.id}/set_premium/",
            data={
                "is_premium": True,
                "duration_days": 0,
                "membership_plan_id": self.standard_plan.id,
            },
            format="json",
        )

        self.assertEqual(missing_plan.status_code, 400)
        self.assertEqual(invalid_duration.status_code, 400)
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.is_premium)

    def test_enabling_free_plan_cannot_mark_user_premium(self):
        """免费计划不能与有效会员状态同时存在。"""
        response = self.client.post(
            f"/user/users/{self.user.id}/set_premium/",
            data={
                "is_premium": True,
                "membership_plan_id": self.free_plan.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.is_premium)

    def test_enabling_membership_uses_plan_storage_limit(self):
        """管理员开通会员时，存储额度必须来自计划而不是客户端字段。"""
        response = self.client.post(
            f"/user/users/{self.user.id}/set_premium/",
            data={
                "is_premium": True,
                "duration_days": 2,
                "membership_plan_id": self.standard_plan.id,
                "storage_limit": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.is_premium)
        self.assertEqual(self.profile.membership_plan, self.standard_plan)
        self.assertEqual(self.profile.storage_limit, self.standard_plan.storage_limit)
        self.assertIsNotNone(self.profile.premium_expire_date)

class MembershipDowngradeActivationTest(TestCase):
    """会员降级到期生效回归测试"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="downgrade_user",
            email="downgrade@example.com",
            password="Password123",
        )
        self.free_plan = MembershipPlan.objects.create(
            name="免费用户",
            code="free",
            monthly_price=0,
            yearly_price=0,
            storage_limit=5,
            custom_obstacle_limit=20,
        )
        self.standard_plan = MembershipPlan.objects.create(
            name="标准会员",
            code="standard",
            monthly_price=15,
            yearly_price=150,
            storage_limit=100,
            custom_obstacle_limit=50,
        )
        self.premium_plan = MembershipPlan.objects.create(
            name="高级会员",
            code="premium",
            monthly_price=30,
            yearly_price=300,
            storage_limit=500,
            custom_obstacle_limit=None,
        )
        self.profile, _ = UserProfile.objects.get_or_create(user=self.user)

    def _prepare_expired_premium_with_pending_standard(self):
        expired_at = timezone.now() - timezone.timedelta(minutes=1)
        pending_expire_at = expired_at + timezone.timedelta(days=30)
        self.profile.is_premium = True
        self.profile.membership_plan = self.premium_plan
        self.profile.premium_expire_date = expired_at
        self.profile.storage_limit = self.premium_plan.storage_limit
        self.profile.pending_membership_plan = self.standard_plan
        self.profile.pending_membership_start_date = expired_at
        self.profile.pending_membership_expire_date = pending_expire_at
        self.profile.save()
        return pending_expire_at

    def test_profile_read_activates_pending_plan_and_clears_pending_fields(self):
        """个人资料读取时，过期高级会员应自动切换到待生效标准会员"""
        pending_expire_at = self._prepare_expired_premium_with_pending_standard()
        self.client.force_authenticate(user=self.user)

        response = self.client.get("/user/users/my_profile/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["is_premium"])
        self.assertTrue(data["is_premium_active"])
        self.assertEqual(data["membership_plan"]["code"], "standard")
        self.assertEqual(data["design_storage_limit"], self.standard_plan.storage_limit)
        self.assertNotIn("pending_membership_plan", data)

        self.profile.refresh_from_db()
        self.assertEqual(self.profile.membership_plan, self.standard_plan)
        self.assertEqual(self.profile.storage_limit, self.standard_plan.storage_limit)
        self.assertEqual(self.profile.premium_expire_date, pending_expire_at)
        self.assertIsNone(self.profile.pending_membership_plan)
        self.assertIsNone(self.profile.pending_membership_start_date)
        self.assertIsNone(self.profile.pending_membership_expire_date)

    def test_login_activates_pending_plan_before_returning_success(self):
        """登录时应触发待生效会员计划，保证后续权限立即一致"""
        self._prepare_expired_premium_with_pending_standard()

        response = self.client.post(
            reverse("login"),
            data={"username": "downgrade_user", "password": "Password123"},
        )

        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.is_premium_active())
        self.assertEqual(self.profile.membership_plan, self.standard_plan)
        self.assertEqual(self.profile.storage_limit, self.standard_plan.storage_limit)
        self.assertIsNone(self.profile.pending_membership_plan)

    def test_design_creation_uses_activated_pending_plan_storage_limit(self):
        """创建设计前应先激活待生效计划，避免仍按旧状态或免费额度判断"""
        self._prepare_expired_premium_with_pending_standard()
        self.client.force_authenticate(user=self.user)
        for index in range(5):
            Design.objects.create(author=self.user, title=f"历史设计{index}")

        response = self.client.post(
            "/user/designs/",
            data={
                "title": "降级后新设计",
                "description": "验证存储额度",
                "course_data": {"obstacles": []},
            },
            format="json",
        )

        self.assertNotEqual(response.status_code, 403)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.membership_plan, self.standard_plan)
        self.assertEqual(self.profile.storage_limit, self.standard_plan.storage_limit)
        self.assertIsNone(self.profile.pending_membership_plan)



    def test_obstacle_count_activates_pending_plan_permission_limit(self):
        """自定义障碍数量接口应先激活待生效计划，确保会员权限限制一致"""
        self._prepare_expired_premium_with_pending_standard()
        self.client.force_authenticate(user=self.user)

        response = self.client.get("/user/obstacles/count/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["is_premium"])
        self.assertEqual(data["max_count"], self.standard_plan.custom_obstacle_limit)
        self.assertFalse(data["is_unlimited"])
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.membership_plan, self.standard_plan)
        self.assertIsNone(self.profile.pending_membership_plan)

    def test_obstacle_create_activates_pending_plan_before_permission_check(self):
        """创建自定义障碍前应先激活待生效计划，避免沿用过期高级权限"""
        self._prepare_expired_premium_with_pending_standard()
        self.client.force_authenticate(user=self.user)
        for index in range(self.standard_plan.custom_obstacle_limit):
            from user.models import CustomObstacle

            CustomObstacle.objects.create(
                user=self.user,
                name=f"历史障碍{index}",
                obstacle_data={
                    "type": "vertical",
                    "poles": [],
                    "width": 1,
                    "height": 1,
                },
            )

        response = self.client.post(
            "/user/obstacles/",
            data={
                "name": "超过标准额度的障碍",
                "obstacle_data": {
                    "type": "vertical",
                    "poles": [],
                    "width": 1,
                    "height": 1,
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn(str(self.standard_plan.custom_obstacle_limit), str(response.data))
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.membership_plan, self.standard_plan)
        self.assertIsNone(self.profile.pending_membership_plan)

    def test_paid_downgrade_order_keeps_current_plan_until_expiry(self):
        """支付降级订单后，到期前仍保持当前高级会员权限和额度"""
        from user.views.payment_views import update_user_membership

        future_expire_at = timezone.now() + timezone.timedelta(days=10)
        self.profile.is_premium = True
        self.profile.membership_plan = self.premium_plan
        self.profile.premium_expire_date = future_expire_at
        self.profile.storage_limit = self.premium_plan.storage_limit
        self.profile.save()
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=self.standard_plan,
            amount=self.standard_plan.monthly_price,
            billing_cycle="month",
            status="paid",
        )

        update_user_membership(self.user, order)

        self.profile.refresh_from_db()
        self.assertEqual(self.profile.membership_plan, self.premium_plan)
        self.assertEqual(self.profile.storage_limit, self.premium_plan.storage_limit)
        self.assertEqual(self.profile.pending_membership_plan, self.standard_plan)
        self.assertEqual(self.profile.pending_membership_start_date, future_expire_at)
        self.assertEqual(
            self.profile.pending_membership_expire_date,
            future_expire_at + timezone.timedelta(days=30),
        )

    def test_settlement_activates_pending_plan_before_new_membership_order(self):
        """新支付结算不能覆盖已付且待生效的会员权益。"""
        from user.services.payment_settlement import settle_paid_order

        pending_expire_at = self._prepare_expired_premium_with_pending_standard()
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=self.premium_plan,
            amount=self.premium_plan.monthly_price,
            billing_cycle="month",
            status="pending",
        )

        _, settled_now = settle_paid_order(
            order_id=order.order_id,
            trade_no="TRADE-PENDING-MEMBERSHIP",
            total_amount=order.amount,
            source="notify",
        )

        self.assertTrue(settled_now)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.membership_plan, self.premium_plan)
        self.assertEqual(
            self.profile.premium_expire_date,
            pending_expire_at + timezone.timedelta(days=30),
        )
        self.assertIsNone(self.profile.pending_membership_plan)

    def test_repeated_downgrade_orders_extend_pending_period(self):
        """连续购买同一降级计划不能覆盖之前已支付的待生效期限。"""
        from user.views.payment_views import update_user_membership

        future_expire_at = timezone.now() + timezone.timedelta(days=10)
        self.profile.is_premium = True
        self.profile.membership_plan = self.premium_plan
        self.profile.premium_expire_date = future_expire_at
        self.profile.storage_limit = self.premium_plan.storage_limit
        self.profile.save()

        for index in range(2):
            order = MembershipOrder.objects.create(
                user=self.user,
                membership_plan=self.standard_plan,
                amount=self.standard_plan.monthly_price,
                billing_cycle="month",
                status="paid",
            )
            update_user_membership(self.user, order)

        self.profile.refresh_from_db()
        self.assertEqual(self.profile.pending_membership_plan, self.standard_plan)
        self.assertEqual(
            self.profile.pending_membership_expire_date,
            future_expire_at + timezone.timedelta(days=60),
        )

    def test_custom_plan_change_is_deferred_instead_of_treated_as_renewal(self):
        """未配置等级的自定义计划不能被错误地判定为同等级续费。"""
        from user.views.payment_views import update_user_membership

        current_plan = MembershipPlan.objects.create(
            name="团队当前计划",
            code="team-current",
            monthly_price=20,
            yearly_price=200,
            storage_limit=25,
            custom_obstacle_limit=12,
        )
        new_plan = MembershipPlan.objects.create(
            name="团队新计划",
            code="team-new",
            monthly_price=40,
            yearly_price=400,
            storage_limit=300,
            custom_obstacle_limit=None,
        )
        future_expire_at = timezone.now() + timezone.timedelta(days=10)
        self.profile.is_premium = True
        self.profile.membership_plan = current_plan
        self.profile.premium_expire_date = future_expire_at
        self.profile.storage_limit = current_plan.storage_limit
        self.profile.save()
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=new_plan,
            amount=new_plan.monthly_price,
            billing_cycle="month",
            status="paid",
        )

        update_user_membership(self.user, order)

        self.profile.refresh_from_db()
        self.assertEqual(self.profile.membership_plan, current_plan)
        self.assertEqual(self.profile.pending_membership_plan, new_plan)
        self.assertEqual(self.profile.storage_limit, current_plan.storage_limit)

class PaymentFallbackAPITest(TestCase):
    """支付缺配置降级测试"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="payment_user",
            email="payment@example.com",
            password="Password123",
        )
        UserProfile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)
        self.plan = MembershipPlan.objects.create(
            name="标准会员",
            code="standard",
            monthly_price=15,
            yearly_price=150,
            storage_limit=100,
            custom_obstacle_limit=50,
        )

    @override_settings(ALIPAY_APPID="")
    def test_membership_order_returns_503_when_alipay_missing(self):
        """支付宝未配置时，创建会员订单应返回 503"""
        response = self.client.post(
            "/user/api/payment/create-order/",
            data={"plan_id": self.plan.id, "billing_cycle": "month"},
        )

        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()["success"])

class CommercialOperationsAPITest(TestCase):
    """商业化后台、订单发票、AI 明细和运营看板测试"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="commerce_user",
            email="commerce@example.com",
            password="Password123",
        )
        self.staff = User.objects.create_user(
            username="commerce_staff",
            email="commerce_staff@example.com",
            password="Password123",
            is_staff=True,
        )
        self.profile, _ = UserProfile.objects.get_or_create(user=self.user)
        self.plan = MembershipPlan.objects.create(
            name="运营会员",
            code="commerce",
            monthly_price=19,
            yearly_price=190,
            storage_limit=25,
            custom_obstacle_limit=12,
        )
        self.client.force_authenticate(user=self.user)

    def test_membership_plan_entitlement_config_is_returned_in_profile(self):
        """会员权益配置应进入统一权益快照"""
        self.plan.can_collaborate = True
        self.plan.ai_monthly_quota = 20
        self.plan.template_publish_limit = 7
        self.plan.save()
        self.profile.is_premium = True
        self.profile.membership_plan = self.plan
        self.profile.premium_expire_date = timezone.now() + timezone.timedelta(days=30)
        self.profile.storage_limit = self.plan.storage_limit
        self.profile.save()

        response = self.client.get("/user/users/my_profile/")

        self.assertEqual(response.status_code, 200)
        entitlements = response.json()["entitlements"]
        self.assertTrue(entitlements["can_collaborate"])
        self.assertEqual(entitlements["ai_monthly_quota"], 20)
        self.assertEqual(entitlements["template_publish_limit"], 7)

    def test_invoice_can_be_submitted_and_marked_issued(self):
        """用户可提交发票信息，后台可标记已开具"""
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=self.plan,
            amount=19,
            status="paid",
            billing_cycle="month",
            trade_no="TRADE123",
            payment_time=timezone.now(),
        )

        response = self.client.post(
            f"/user/api/payment/orders/{order.order_id}/invoice/",
            data={"title": "马术俱乐部", "tax_number": "TAX123", "email": "invoice@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["success"])
        self.assertEqual(response.json()["invoice"]["title"], "马术俱乐部")
        self.client.force_authenticate(user=self.staff)
        issue_response = self.client.post(
            f"/user/api/payment/orders/{order.order_id}/invoice/mark-issued/",
            data={"invoice_number": "INV-001"},
            format="json",
        )
        self.assertEqual(issue_response.status_code, 200)
        self.assertTrue(issue_response.json()["success"])
        self.assertEqual(issue_response.json()["invoice"]["status"], "issued")

    def test_invoice_requires_paid_order_and_valid_fields(self):
        """未支付订单不能开票，发票字段必须经过序列化器校验。"""
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=self.plan,
            amount=19,
            status="pending",
            billing_cycle="month",
        )

        unpaid_response = self.client.post(
            f"/user/api/payment/orders/{order.order_id}/invoice/",
            data={"title": "俱乐部", "email": "invoice@example.com"},
            format="json",
        )
        self.assertEqual(unpaid_response.status_code, 400)
        self.assertIn("已支付", unpaid_response.json()["message"])

        order.status = "paid"
        order.save(update_fields=["status", "updated_at"])
        invalid_response = self.client.post(
            f"/user/api/payment/orders/{order.order_id}/invoice/",
            data={"title": "", "email": "not-an-email"},
            format="json",
        )
        self.assertEqual(invalid_response.status_code, 400)
        self.assertIn("title", invalid_response.json()["message"])
        self.assertIn("email", invalid_response.json()["message"])

    def test_order_detail_includes_refund_and_invoice_fields(self):
        """订单详情应展示退款状态和发票信息"""
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=self.plan,
            amount=19,
            status="paid",
            refund_status="requested",
            billing_cycle="month",
            trade_no="TRADE456",
            payment_time=timezone.now(),
        )

        response = self.client.get(f"/user/api/payment/orders/{order.order_id}/")

        self.assertEqual(response.status_code, 200)
        data = response.json()["order"]
        self.assertEqual(data["refund_status"], "requested")
        self.assertEqual(data["trade_no"], "TRADE456")
        self.assertEqual(data["billing_cycle"], "month")

    def test_ai_history_filters_and_includes_details(self):
        """AI 历史应支持状态筛选并返回消耗、失败原因和模型"""
        AIGenerationHistory.objects.create(
            user_profile=self.profile,
            prompt="成功生成",
            status="success",
            token_used=321,
            model_name="test-model",
            quota_used=1,
        )
        AIGenerationHistory.objects.create(
            user_profile=self.profile,
            prompt="失败生成",
            status="failed",
            error_message="模型不可用",
            model_name="fallback",
            quota_used=0,
        )

        response = self.client.get("/user/ai/history/?status=failed")

        self.assertEqual(response.status_code, 200)
        histories = response.json()["data"]["histories"]
        self.assertEqual(len(histories), 1)
        self.assertEqual(histories[0]["status"], "failed")
        self.assertEqual(histories[0]["error_message"], "模型不可用")
        self.assertEqual(histories[0]["model_name"], "fallback")
        self.assertEqual(histories[0]["quota_used"], 0)

    def test_ai_history_rejects_invalid_date_and_normalizes_negative_limit(self):
        invalid_date_response = self.client.get(
            "/user/ai/history/?start_date=not-a-date"
        )

        self.assertEqual(invalid_date_response.status_code, 400)
        self.assertIn("start_date", invalid_date_response.json()["data"])

        negative_limit_response = self.client.get("/user/ai/history/?limit=-1")

        self.assertEqual(negative_limit_response.status_code, 200)
        self.assertEqual(negative_limit_response.json()["data"]["histories"], [])

    def test_admin_analytics_dashboard_returns_core_metrics(self):
        """运营看板应返回用户、设计、导出、AI、会员和模板指标"""
        Design.objects.create(title="运营设计", author=self.user, downloads_count=3)
        CourseTemplate.objects.create(
            title="运营模板",
            author=self.user,
            difficulty="medium",
            obstacle_count=8,
            course_data={"obstacles": []},
            copy_count=2,
        )
        AIGenerationHistory.objects.create(user_profile=self.profile, prompt="统计", status="success", quota_used=1)
        self.client.force_authenticate(user=self.staff)

        response = self.client.get("/user/admin/analytics/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertGreaterEqual(data["users"], 2)
        self.assertEqual(data["designs"], 1)
        self.assertEqual(data["exports"], 3)
        self.assertEqual(data["ai_usage"], 1)
        self.assertIn("membership_conversion_rate", data)
        self.assertEqual(data["template_copies"], 2)

class MembershipPlanCommandTest(TestCase):
    """会员计划初始化命令测试"""

    def test_init_membership_plans_creates_default_plans(self):
        """初始化命令应创建默认会员计划并支持重复执行"""
        call_command("init_membership_plans", verbosity=0)
        call_command("init_membership_plans", verbosity=0)

        plans = {
            plan.code: plan
            for plan in MembershipPlan.objects.filter(
                code__in=["free", "standard", "premium"]
            )
        }

        self.assertEqual(set(plans.keys()), {"free", "standard", "premium"})
        self.assertEqual(plans["free"].storage_limit, 5)
        self.assertEqual(plans["standard"].monthly_price, 15)
        self.assertIsNone(plans["premium"].custom_obstacle_limit)
