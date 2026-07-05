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
    Design,
    MembershipPlan,
    MembershipOrder,
)


class AIGenerationQuotaTest(TestCase):
    """AI生成配额测试"""

    def setUp(self):
        self.user = User.objects.create_user('testuser', 'test@example.com', 'password123')
        self.profile, _ = UserProfile.objects.get_or_create(user=self.user)

    def test_ai_generation_quota_creation(self):
        """测试AI生成配额模型创建 - 信号会自动创建，检查已存在的配额"""
        quota = AIGenerationQuota.objects.get(user_profile=self.profile)
        # 新用户默认有3次免费配额
        self.assertEqual(quota.free_quota, 3)
        self.assertEqual(quota.purchased_quota, 0)

    def test_ai_generation_quota_deduction(self):
        """测试配额扣减"""
        quota = AIGenerationQuota.objects.get(user_profile=self.profile)
        # 更新已存在的配额
        quota.free_quota = 10
        quota.save()
        quota.refresh_from_db()
        self.assertEqual(quota.remaining_quota, 10)

    def test_ai_generation_history_creation(self):
        """测试历史记录创建"""
        history = AIGenerationHistory.objects.create(
            user_profile=self.profile,
            prompt='测试提示词',
            status='success'
        )
        self.assertEqual(history.status, 'success')


class LLMProviderTest(TestCase):
    """LLM提供商测试"""

    def test_openai_provider_initialization(self):
        """测试 OpenAI 提供商初始化"""
        from user.llm_providers import OpenAIProvider
        provider = OpenAIProvider(api_key="test-key", model="gpt-4o")
        self.assertEqual(provider.model, "gpt-4o")

    def test_get_llm_provider(self):
        """测试获取提供商"""
        from user.llm_providers import get_llm_provider, OpenAIProvider
        import os
        # 设置临时环境变量
        old_env = os.environ.get('OPENAI_API_KEY')
        os.environ['OPENAI_API_KEY'] = 'test-key'
        try:
            provider = get_llm_provider("openai")
            self.assertIsInstance(provider, OpenAIProvider)
        finally:
            if old_env is not None:
                os.environ['OPENAI_API_KEY'] = old_env
            else:
                os.environ.pop('OPENAI_API_KEY', None)


class RouteGeneratorTest(TestCase):
    """路线生成器测试"""

    def test_route_generator_basic(self):
        """测试路线生成器基本功能"""
        from user.route_generator import RouteGenerator, RouteConfig

        generator = RouteGenerator()
        config = RouteConfig(obstacle_count=10)
        result = generator.generate(config)

        self.assertEqual(len(result['obstacles']), 10)
        self.assertTrue(result['path']['visible'])
        self.assertGreater(result['difficulty_score'], 0)

    def test_obstacle_spacing(self):
        """测试障碍物间距"""
        import math
        from user.route_generator import RouteGenerator, RouteConfig

        generator = RouteGenerator()
        config = RouteConfig(obstacle_count=8)
        result = generator.generate(config)

        obstacles = result['obstacles']
        for i in range(len(obstacles)):
            for j in range(i + 1, len(obstacles)):
                dist = math.sqrt(
                    (obstacles[i]['position']['x'] - obstacles[j]['position']['x'])**2 +
                    (obstacles[i]['position']['y'] - obstacles[j]['position']['y'])**2
                )
                self.assertGreaterEqual(dist, 6.0, f"障碍物间距不足: {dist}")


class AuthCookieTest(TestCase):
    """认证 cookie 测试"""

    def test_register_sets_auth_cookies(self):
        """注册成功后应立即写入认证 cookies，支持自动登录"""
        response = self.client.post(
            reverse("register"),
            data={
                "username": "cookie_register_user",
                "email": "cookie_register_user@example.com",
                "password": "CookieTest2026",
                "confirmPassword": "CookieTest2026",
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("access_token", response.cookies)
        self.assertIn("refresh_token", response.cookies)
        self.assertTrue(response.cookies["access_token"]["httponly"])
        self.assertTrue(response.cookies["refresh_token"]["httponly"])


class DesignDownloadAPITest(TestCase):
    """设计下载接口测试"""

    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.override = override_settings(
            MEDIA_ROOT=self.media_root,
            SITE_DOMAIN="localhost:8000",
            USE_HTTPS=False,
        )
        self.override.enable()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="download_user",
            email="download@example.com",
            password="Password123",
        )
        UserProfile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    def _create_png_bytes(self):
        image = Image.new("RGB", (160, 120), "white")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    def _create_design(self, title="下载测试设计", author=None, is_shared=True):
        design = Design(title=title, author=author or self.user, is_shared=is_shared)
        design.image.save(
            "design.png",
            ContentFile(self._create_png_bytes()),
            save=False,
        )
        design.download.save(
            "design.json",
            ContentFile(f'{{"name": "{title}"}}'.encode("utf-8")),
            save=False,
        )
        design.save()
        return design

    def test_download_json_returns_saved_file_url(self):
        """JSON 下载应返回已保存的设计数据文件"""
        design = self._create_design(title="JSON测试设计")

        response = self.client.get(f"/user/designs/{design.id}/download/?type=json")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["file_type"], "json")
        self.assertEqual(data["filename"], "JSON测试设计.json")
        self.assertIn("/media/", data["download_url"])
        self.assertEqual(data["downloads_count"], 1)

    def test_download_png_returns_saved_image_url(self):
        """PNG 下载应返回已保存的设计图片"""
        design = self._create_design(title="PNG测试设计")

        response = self.client.get(f"/user/designs/{design.id}/download/?type=png")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["file_type"], "png")
        self.assertEqual(data["filename"], "PNG测试设计.png")
        self.assertIn("/media/", data["download_url"])
        self.assertEqual(data["downloads_count"], 1)

    def test_download_pdf_generates_file(self):
        """PDF 下载应基于设计图片生成 PDF 文件"""
        design = self._create_design(title="PDF测试设计")

        response = self.client.get(f"/user/designs/{design.id}/download/?type=%20PDF%20")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["file_type"], "pdf")
        self.assertEqual(data["filename"], "PDF测试设计.pdf")
        self.assertIn("/media/", data["download_url"])
        self.assertEqual(data["downloads_count"], 1)

        expected_pdf = os.path.join(
            self.media_root,
            f"user_{self.user.id}",
            "designs",
            str(design.id),
            "design.pdf",
        )
        self.assertTrue(os.path.exists(expected_pdf))

    def test_download_missing_json_does_not_increment_count(self):
        """缺少 JSON 文件时应返回错误且不增加下载次数"""
        design = Design(title="缺JSON设计", author=self.user, is_shared=True)
        design.image.save(
            "design.png",
            ContentFile(self._create_png_bytes()),
            save=False,
        )
        design.save()

        response = self.client.get(f"/user/designs/{design.id}/download/?type=json")

        self.assertEqual(response.status_code, 404)
        self.assertFalse(response.json()["success"])
        design.refresh_from_db()
        self.assertEqual(design.downloads_count, 0)

    def test_download_private_design_owned_by_other_user_is_forbidden(self):
        """非作者不能下载未共享设计"""
        other_user = User.objects.create_user(
            username="download_owner",
            email="download_owner@example.com",
            password="Password123",
        )
        design = self._create_design(
            title="未共享设计",
            author=other_user,
            is_shared=False,
        )

        response = self.client.get(f"/user/designs/{design.id}/download/?type=png")

        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.json()["success"])
        design.refresh_from_db()
        self.assertEqual(design.downloads_count, 0)


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


class AIGenerationFallbackAPITest(TestCase):
    """AI 生成兜底测试"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="ai_user",
            email="ai@example.com",
            password="Password123",
        )
        self.profile, _ = UserProfile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)

    @patch.dict(os.environ, {"API_KEY": "", "MODEL": "", "BASE_URL": ""})
    def test_generate_route_falls_back_to_rule_engine(self):
        """LLM 配置缺失时应回退到本地规则引擎"""
        response = self.client.post(
            "/user/ai/generate/",
            data={
                "prompt": "生成一条中级路线",
                "config": {
                    "field_width": 90,
                    "field_height": 60,
                    "obstacle_count": 8,
                    "difficulty": "medium",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(len(data["obstacles"]), 8)
        self.assertIn("规则引擎兜底", data["explanation"])

        history = AIGenerationHistory.objects.get(id=data["history_id"])
        self.assertEqual(history.status, "success")
        self.assertEqual(history.token_used, 0)

    def test_generate_route_returns_validation_feedback_for_non_standard_llm_json(self):
        """LLM 返回带说明文字的 JSON 时，应稳定解析并返回校验反馈"""
        from user.llm_providers import LLMResponse

        content = """
        下面是路线设计：
        ```json
        {
          "obstacles": [
            {
              "id": "obs_1",
              "type": "SINGLE",
              "position": {"x": -20, "y": 10},
              "rotation": 45,
              "number": "1",
              "poles": [{"height": 2.1, "width": 3.5, "color": "#8B4513"}]
            },
            {
              "id": "obs_2",
              "type": "DOUBLE",
              "position": {"x": 12, "y": 10},
              "rotation": 90,
              "number": "2",
              "poles": [{"height": 0.5, "width": 3.5, "color": "#8B4513"}]
            }
          ],
          "difficulty": "medium",
          "field_width": 90,
          "field_height": 60,
          "design_notes": "测试路线"
        }
        ```
        可根据需要微调。
        """
        provider = Mock()
        provider.generate.return_value = LLMResponse(
            content=content,
            token_used=321,
            model="test-model",
        )

        with patch("user.ai_views.get_llm_provider", return_value=provider):
            response = self.client.post(
                "/user/ai/generate/",
                data={
                    "prompt": "生成一条需要修正的路线",
                    "config": {
                        "field_width": 90,
                        "field_height": 60,
                        "obstacle_count": 8,
                        "difficulty": "medium",
                    },
                },
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertIn("validation", data)
        self.assertIn("auto_fixed", data["validation"])
        self.assertGreater(len(data["validation"]["auto_fixed"]), 0)
        self.assertEqual(data["validation"]["source"], "llm")
        self.assertEqual(data["validation"]["fallback_reason"], "")

    @patch.dict(os.environ, {"API_KEY": "", "MODEL": "", "BASE_URL": ""})
    def test_generate_route_returns_validation_feedback_for_rule_fallback(self):
        """LLM 不可用时，规则兜底原因应进入结构化校验反馈"""
        response = self.client.post(
            "/user/ai/generate/",
            data={
                "prompt": "生成一条初级路线",
                "config": {
                    "field_width": 90,
                    "field_height": 60,
                    "obstacle_count": 8,
                    "difficulty": "easy",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        validation = response.json()["data"]["validation"]
        self.assertEqual(validation["source"], "fallback")
        self.assertNotEqual(validation["fallback_reason"], "")

    def test_generate_route_returns_400_for_empty_prompt(self):
        """空提示词应返回稳定的 400 异常响应"""
        response = self.client.post(
            "/user/ai/generate/",
            data={"prompt": "   ", "config": {}},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], 400)
        self.assertEqual(response.json()["message"], "请输入设计需求描述")


class APIDocumentationTest(TestCase):
    """API 文档端点测试"""

    def test_openapi_schema_endpoint_available(self):
        """OpenAPI Schema 应可访问"""
        response = self.client.get("/api/schema/", HTTP_ACCEPT="application/json")

        self.assertEqual(response.status_code, 200)
        self.assertIn("openapi", response.json())

    def test_login_sets_auth_cookies(self):
        """登录成功后应写入认证 cookies"""
        user = User.objects.create_user(
            username="cookie_login_user",
            email="cookie_login_user@example.com",
            password="CookieTest2026",
        )
        UserProfile.objects.get_or_create(user=user)

        response = self.client.post(
            reverse("login"),
            data={
                "username": "cookie_login_user",
                "password": "CookieTest2026",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access_token", response.cookies)
        self.assertIn("refresh_token", response.cookies)
        self.assertTrue(response.cookies["access_token"]["httponly"])
        self.assertTrue(response.cookies["refresh_token"]["httponly"])


class RouteValidationPanelAPITest(TestCase):
    """路线规则检查接口测试"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="route_validation_user",
            email="route_validation@example.com",
            password="Password123",
        )
        UserProfile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)

    def test_validate_course_returns_invalid_for_empty_route(self):
        """空路线应返回 invalid 和结构化错误"""
        response = self.client.post(
            "/user/designs/validate-course/",
            data={"obstacles": [], "field_width": 90, "field_height": 60, "difficulty": "medium"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["is_valid"])
        self.assertEqual(data["issues"][0]["code"], "EMPTY_ROUTE")
        self.assertEqual(data["issues"][0]["severity"], "error")

    def test_validate_course_returns_structured_distance_issue(self):
        """障碍物距离过近应返回结构化距离错误"""
        response = self.client.post(
            "/user/designs/validate-course/",
            data={
                "field_width": 90,
                "field_height": 60,
                "difficulty": "medium",
                "obstacles": [
                    {"id": "obs-1", "number": "1", "type": "SINGLE", "position": {"x": 10, "y": 10}, "poles": [{"height": 1.1, "width": 3.5}]},
                    {"id": "obs-2", "number": "2", "type": "SINGLE", "position": {"x": 12, "y": 10}, "poles": [{"height": 1.1, "width": 3.5}]},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        issue = response.json()["issues"][0]
        self.assertEqual(issue["code"], "MIN_DISTANCE")
        self.assertEqual(issue["severity"], "error")
        self.assertEqual(issue["obstacle_ids"], ["obs-1", "obs-2"])
        self.assertTrue(issue["auto_fixable"])

    def test_validate_course_reports_boundary_and_height_findings(self):
        """边界和高度问题应进入结构化反馈"""
        response = self.client.post(
            "/user/designs/validate-course/",
            data={
                "field_width": 90,
                "field_height": 60,
                "difficulty": "easy",
                "obstacles": [
                    {"id": "obs-1", "number": "1", "type": "SINGLE", "position": {"x": 1, "y": 2}, "poles": [{"height": 1.5, "width": 3.5}]},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        codes = {item["code"] for item in response.json()["issues"] + response.json()["warnings"]}
        self.assertIn("BOUNDARY_DISTANCE", codes)
        self.assertIn("HEIGHT_RANGE", codes)


    def test_validate_course_reports_turn_radius_route_flow_and_sequence(self):
        """急转弯、路线流畅度和编号顺序异常应进入结构化反馈"""
        response = self.client.post(
            "/user/designs/validate-course/",
            data={
                "field_width": 90,
                "field_height": 60,
                "difficulty": "medium",
                "path": {
                    "startPoint": {"x": 10, "y": 10, "rotation": 180},
                    "endPoint": {"x": 16, "y": 16, "rotation": 0},
                },
                "obstacles": [
                    {"id": "obs-1", "number": "2", "type": "SINGLE", "position": {"x": 10, "y": 10}, "poles": [{"height": 1.1, "width": 3.5}]},
                    {"id": "obs-2", "number": "1", "type": "SINGLE", "position": {"x": 16, "y": 10}, "poles": [{"height": 1.1, "width": 3.5}]},
                    {"id": "obs-3", "number": "3", "type": "SINGLE", "position": {"x": 16, "y": 16}, "poles": [{"height": 1.1, "width": 3.5}]},
                    {"id": "obs-4", "number": "4", "type": "SINGLE", "position": {"x": 22, "y": 16}, "poles": [{"height": 1.1, "width": 3.5}]},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        codes = {item["code"] for item in response.json()["issues"] + response.json()["warnings"]}
        self.assertIn("TURN_RADIUS", codes)
        self.assertIn("ROUTE_FLOW", codes)
        self.assertIn("OBSTACLE_SEQUENCE", codes)
        self.assertIn("START_END_DIRECTION", codes)

    def test_validate_course_reports_combination_spacing(self):
        """组合障碍间距异常应进入结构化反馈"""
        response = self.client.post(
            "/user/designs/validate-course/",
            data={
                "field_width": 90,
                "field_height": 60,
                "difficulty": "medium",
                "obstacles": [
                    {
                        "id": "combo-1",
                        "number": "1",
                        "type": "COMBINATION",
                        "position": {"x": 20, "y": 20},
                        "poles": [
                            {"height": 1.1, "width": 3.5, "spacing": 1.4},
                            {"height": 1.1, "width": 3.5, "spacing": 0.2},
                            {"height": 1.1, "width": 3.5},
                        ],
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        codes = {item["code"] for item in response.json()["issues"] + response.json()["warnings"]}
        self.assertIn("COMBINATION_SPACING", codes)

    def test_fix_course_returns_patches_and_updated_obstacles(self):
        """一键修复应返回补丁说明、更新后的障碍物和重新评分"""
        response = self.client.post(
            "/user/designs/fix-course/",
            data={
                "field_width": 90,
                "field_height": 60,
                "difficulty": "easy",
                "obstacles": [
                    {"id": "obs-1", "number": "1", "type": "SINGLE", "position": {"x": 1, "y": 2}, "poles": [{"height": 1.5, "width": 3.5}]},
                    {"id": "obs-2", "number": "2", "type": "SINGLE", "position": {"x": 2, "y": 2}, "poles": [{"height": 1.5, "width": 3.5}]},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("patches", data)
        self.assertIn("updated_obstacles", data)
        self.assertIn("validation", data)
        self.assertGreater(len(data["patches"]), 0)
        first = data["updated_obstacles"][0]
        self.assertGreaterEqual(first["position"]["x"], 3)
        self.assertLessEqual(first["poles"][0]["height"], 1.0)


class DesignVersionHistoryAPITest(TestCase):
    """设计版本历史接口测试"""

    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.media_root)
        self.override.enable()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="version_user",
            email="version@example.com",
            password="Password123",
        )
        UserProfile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    def _png_file(self, name="design.png"):
        image = Image.new("RGB", (160, 120), "white")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return ContentFile(buffer.getvalue(), name=name)

    def _json_file(self, payload=None, name="design.json"):
        payload = payload or {"obstacles": [{"id": "obs-1"}]}
        return ContentFile(json.dumps(payload).encode("utf-8"), name=name)

    def _create_design(self, title="版本测试设计", payload=None):
        design = Design(title=title, author=self.user, description="初始描述")
        design.image.save("design.png", self._png_file(), save=False)
        design.download.save("design.json", self._json_file(payload), save=False)
        design.save()
        return design

    def test_design_create_api_creates_initial_version(self):
        """创建设计接口应创建初始版本快照"""
        response = self.client.post(
            "/user/designs/",
            data={
                "title": "API版本设计",
                "description": "首次保存",
                "image": self._png_file(),
                "download": self._json_file({"obstacles": []}),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        design_id = response.json()["id"]
        versions_response = self.client.get(f"/user/designs/{design_id}/versions/")
        self.assertEqual(versions_response.status_code, 200)
        versions = versions_response.json()
        self.assertEqual(len(versions), 1)
        self.assertEqual(versions[0]["version_number"], 1)
        self.assertEqual(versions[0]["source"], "manual")

    def test_restore_version_updates_design_and_creates_restore_version(self):
        """恢复版本应更新当前设计并新增 restore 版本"""
        design = self._create_design(title="当前标题", payload={"obstacles": [{"id": "old"}]})
        from user.models import DesignVersion

        version = DesignVersion.objects.create(
            design=design,
            author=self.user,
            version_number=1,
            source="manual",
            title="历史标题",
            description="历史描述",
            course_data={"obstacles": [{"id": "history"}]},
        )

        response = self.client.post(f"/user/designs/{design.id}/versions/{version.id}/restore/")

        self.assertEqual(response.status_code, 200)
        design.refresh_from_db()
        self.assertEqual(design.title, "历史标题")
        self.assertEqual(design.description, "历史描述")
        self.assertEqual(DesignVersion.objects.filter(design=design).count(), 2)
        self.assertTrue(DesignVersion.objects.filter(design=design, source="restore").exists())

    def test_copy_version_creates_new_design(self):
        """复制版本应创建新设计且不影响原设计"""
        design = self._create_design(title="原设计")
        from user.models import DesignVersion

        version = DesignVersion.objects.create(
            design=design,
            author=self.user,
            version_number=1,
            source="manual",
            title="历史副本",
            description="历史描述",
            course_data={"obstacles": [{"id": "copy"}]},
        )

        response = self.client.post(f"/user/designs/{design.id}/versions/{version.id}/copy/")

        self.assertEqual(response.status_code, 201)
        new_design_id = response.json()["id"]
        self.assertNotEqual(new_design_id, design.id)
        self.assertTrue(Design.objects.filter(id=new_design_id, title__contains="历史副本").exists())


    def test_update_version_remark_and_title(self):
        """版本详情应支持备注和标题更新"""
        design = self._create_design(title="备注设计")
        from user.models import DesignVersion

        version = DesignVersion.objects.create(
            design=design,
            author=self.user,
            version_number=1,
            source="manual",
            title="旧版本名",
            description="历史描述",
            course_data={"obstacles": []},
        )

        response = self.client.patch(
            f"/user/designs/{design.id}/versions/{version.id}/",
            data={"title": "新版本名", "remark": "赛前调整版本"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        version.refresh_from_db()
        self.assertEqual(version.title, "新版本名")
        self.assertEqual(version.remark, "赛前调整版本")
        self.assertEqual(response.json()["remark"], "赛前调整版本")

    def test_version_detail_is_private_to_owner(self):
        """其他用户不能访问版本详情"""
        design = self._create_design(title="私有版本设计")
        from user.models import DesignVersion

        version = DesignVersion.objects.create(
            design=design,
            author=self.user,
            version_number=1,
            source="manual",
            title="私有版本",
            course_data={"obstacles": []},
        )
        other = User.objects.create_user("other_version_user", "other@example.com", "Password123")
        self.client.force_authenticate(user=other)

        response = self.client.get(f"/user/designs/{design.id}/versions/{version.id}/")

        self.assertIn(response.status_code, [403, 404])

    def test_version_retention_keeps_latest_50_versions(self):
        """保存新版本时应只保留最近 50 个版本"""
        design = self._create_design(title="保留策略设计")
        from user.models import DesignVersion
        from user.services.design_version import create_design_version

        for index in range(55):
            DesignVersion.objects.create(
                design=design,
                author=self.user,
                version_number=index + 1,
                source="manual",
                title=f"版本{index + 1}",
                course_data={"index": index + 1},
            )

        create_design_version(design, source="manual")

        versions = DesignVersion.objects.filter(design=design).order_by("version_number")
        self.assertEqual(versions.count(), 50)
        self.assertEqual(versions.first().version_number, 7)
        self.assertEqual(versions.last().version_number, 56)


class CourseTemplateMarketAPITest(TestCase):
    """路线模板库与公开模板市场测试"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="template_user",
            email="template@example.com",
            password="Password123",
        )
        self.other_user = User.objects.create_user(
            username="template_other",
            email="template_other@example.com",
            password="Password123",
        )
        UserProfile.objects.get_or_create(user=self.user)
        UserProfile.objects.get_or_create(user=self.other_user)
        self.client.force_authenticate(user=self.user)

    def _template_payload(self, title="标准训练模板", is_public=True, is_official=False):
        return {
            "title": title,
            "description": "适合标准训练的路线模板",
            "difficulty": "medium",
            "field_width": 90,
            "field_height": 60,
            "obstacle_count": 8,
            "course_data": {
                "obstacles": [
                    {"id": "obs-1", "number": "1", "type": "SINGLE", "position": {"x": 20, "y": 20}, "poles": [{"height": 1.1, "width": 3.5}]}
                ]
            },
            "is_public": is_public,
            "is_official": is_official,
        }

    def test_create_and_list_public_template(self):
        """用户可发布公开模板，模板市场可按难度筛选"""
        response = self.client.post("/user/templates/", data=self._template_payload(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["title"], "标准训练模板")

        list_response = self.client.get("/user/templates/?difficulty=medium")
        self.assertEqual(list_response.status_code, 200)
        data = list_response.json()
        results = data.get("results", data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["difficulty"], "medium")

    def test_private_template_is_not_visible_to_other_users(self):
        """私有模板不能被其他用户访问"""
        create_response = self.client.post(
            "/user/templates/",
            data=self._template_payload(title="私有模板", is_public=False),
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        template_id = create_response.json()["id"]

        self.client.force_authenticate(user=self.other_user)
        detail_response = self.client.get(f"/user/templates/{template_id}/")
        self.assertEqual(detail_response.status_code, 404)

    def test_create_design_from_template(self):
        """用户可从模板复制为新设计"""
        create_response = self.client.post(
            "/user/templates/",
            data=self._template_payload(title="复制模板"),
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        template_id = create_response.json()["id"]

        copy_response = self.client.post(f"/user/templates/{template_id}/create-design/")

        self.assertEqual(copy_response.status_code, 201)
        self.assertIn("复制模板", copy_response.json()["title"])
        self.assertEqual(copy_response.json()["template_id"], template_id)

    def test_template_favorite_and_copy_count(self):
        """模板支持收藏并统计复制次数"""
        create_response = self.client.post(
            "/user/templates/",
            data=self._template_payload(title="收藏模板"),
            format="json",
        )
        template_id = create_response.json()["id"]

        favorite_response = self.client.post(f"/user/templates/{template_id}/favorite/")
        self.assertEqual(favorite_response.status_code, 200)
        self.assertTrue(favorite_response.json()["is_favorited"])

        self.client.post(f"/user/templates/{template_id}/create-design/")
        detail_response = self.client.get(f"/user/templates/{template_id}/")
        self.assertEqual(detail_response.json()["copy_count"], 1)
        self.assertTrue(detail_response.json()["is_favorited"])

    def test_user_cannot_edit_other_users_template(self):
        """用户不能编辑他人模板"""
        create_response = self.client.post(
            "/user/templates/",
            data=self._template_payload(title="他人不可编辑模板"),
            format="json",
        )
        template_id = create_response.json()["id"]
        self.client.force_authenticate(user=self.other_user)

        response = self.client.patch(
            f"/user/templates/{template_id}/",
            data={"title": "非法编辑"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)


class AICourseEditingAPITest(TestCase):
    """AI 二次编辑和教练说明测试"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="ai_edit_user",
            email="ai_edit@example.com",
            password="Password123",
        )
        self.profile, _ = UserProfile.objects.get_or_create(user=self.user)
        quota = AIGenerationQuota.objects.get(user_profile=self.profile)
        quota.free_quota = 10
        quota.used_quota = 0
        quota.save()
        self.client.force_authenticate(user=self.user)
        self.course = {
            "field_width": 90,
            "field_height": 60,
            "difficulty": "medium",
            "obstacles": [
                {"id": "obs-1", "number": "1", "type": "SINGLE", "position": {"x": 10, "y": 10}, "rotation": 0, "poles": [{"height": 1.2, "width": 3.5}]},
                {"id": "obs-2", "number": "2", "type": "SINGLE", "position": {"x": 20, "y": 10}, "rotation": 0, "poles": [{"height": 1.2, "width": 3.5}]},
                {"id": "obs-3", "number": "3", "type": "DOUBLE", "position": {"x": 30, "y": 10}, "rotation": 0, "poles": [{"height": 1.2, "width": 3.5}, {"height": 1.25, "width": 3.5}]},
            ],
        }

    def test_edit_course_can_lower_difficulty_with_rule_fallback(self):
        """AI 不可用时，二次编辑应通过规则引擎降低难度并返回修改摘要"""
        response = self.client.post(
            "/user/ai/edit-course/",
            data={"instruction": "降低难度", "course": self.course},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(data["source"], "fallback")
        self.assertGreater(len(data["change_summary"]), 0)
        self.assertTrue(all(pole["height"] <= 1.0 for obs in data["obstacles"] for pole in obs.get("poles", [])))
        self.assertIn("validation", data)

    def test_edit_course_can_change_obstacle_count_and_keep_field_size(self):
        """二次编辑应支持修改障碍数量且保持场地尺寸"""
        response = self.client.post(
            "/user/ai/edit-course/",
            data={"instruction": "改成5道障碍，保持当前场地尺寸不变", "course": self.course},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(len(data["obstacles"]), 5)
        self.assertEqual(data["field_width"], 90)
        self.assertEqual(data["field_height"], 60)

    def test_coach_notes_returns_rule_based_notes_without_ai_config(self):
        """无 AI 配置时，教练说明应返回规则模板说明"""
        response = self.client.post(
            "/user/ai/coach-notes/",
            data={"course": self.course, "validation": {"issues": [], "warnings": ["障碍物2转弯较急"]}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertIn("training_goals", data)
        self.assertIn("rhythm_advice", data)
        self.assertIn("common_mistakes", data)
        self.assertIn("coach_commands", data)
        self.assertIn("risk_focus", data)
        self.assertGreater(len(data["training_goals"]), 0)


class CollaborationEnhancementAPITest(TestCase):
    """协作评论、角色权限和协作历史测试"""

    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user("collab_owner", "owner@example.com", "Password123")
        self.editor = User.objects.create_user("collab_editor", "editor@example.com", "Password123")
        UserProfile.objects.get_or_create(user=self.owner)
        UserProfile.objects.get_or_create(user=self.editor)
        self.design = Design.objects.create(title="协作设计", author=self.owner, is_shared=True)
        self.client.force_authenticate(user=self.owner)

    def test_create_and_resolve_design_comment(self):
        """用户可在设计上创建并解决评论"""
        response = self.client.post(
            f"/user/designs/{self.design.id}/comments/",
            data={"content": "这里转弯需要更平顺", "obstacle_id": "obs-1", "x": 12.5, "y": 18.0},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        comment_id = response.json()["id"]
        self.assertFalse(response.json()["is_resolved"])

        resolve_response = self.client.post(f"/user/designs/{self.design.id}/comments/{comment_id}/resolve/")
        self.assertEqual(resolve_response.status_code, 200)
        self.assertTrue(resolve_response.json()["is_resolved"])

    def test_share_link_contains_role_and_password_options(self):
        """分享链接支持角色、过期时间和密码选项"""
        response = self.client.post(
            f"/user/designs/{self.design.id}/share-link/",
            data={"role": "commenter", "expires_in_seconds": 7200, "password": "abc123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(data["role"], "commenter")
        self.assertTrue(data["passwordProtected"])
        self.assertIn("shareToken", data)

    def test_collaboration_event_list_records_actions(self):
        """协作事件接口应返回设计活动时间线"""
        from user.models import CollaborationEvent

        CollaborationEvent.objects.create(
            design=self.design,
            user=self.owner,
            event_type="move_obstacle",
            object_id="obs-1",
            payload={"x": 20, "y": 30},
        )

        response = self.client.get(f"/user/designs/{self.design.id}/collaboration-events/")

        self.assertEqual(response.status_code, 200)
        events = response.json()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["event_type"], "move_obstacle")
        self.assertEqual(events[0]["object_id"], "obs-1")

    def test_viewer_role_cannot_edit_but_commenter_can_comment(self):
        """协作角色应区分查看、评论和编辑权限"""
        from user.models import CollaborationRole

        viewer = CollaborationRole.objects.create(design=self.design, user=self.editor, role="viewer")
        self.assertFalse(viewer.can_edit)
        self.assertFalse(viewer.can_comment)
        viewer.role = "commenter"
        viewer.save()
        self.assertFalse(viewer.can_edit)
        self.assertTrue(viewer.can_comment)
        viewer.role = "editor"
        viewer.save()
        self.assertTrue(viewer.can_edit)
        self.assertTrue(viewer.can_comment)


class ProfessionalExportAndSharePermissionTest(TestCase):
    """专业导出、批量导出与分享链接权限测试"""

    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.override = override_settings(
            MEDIA_ROOT=self.media_root,
            SITE_DOMAIN="localhost:8000",
            USE_HTTPS=False,
        )
        self.override.enable()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="export_user",
            email="export@example.com",
            password="Password123",
        )
        UserProfile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    def _png_bytes(self):
        image = Image.new("RGB", (160, 120), "white")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    def _create_design(self):
        design = Design(title="专业导出设计", author=self.user, description="报告描述", is_shared=True)
        design.image.save("design.png", ContentFile(self._png_bytes()), save=False)
        design.download.save(
            "design.json",
            ContentFile(json.dumps({"obstacles": [{"id": "obs-1", "number": "1"}]}).encode("utf-8")),
            save=False,
        )
        design.save()
        return design

    def test_download_report_pdf_returns_professional_report(self):
        """report 下载应生成专业 PDF 报告"""
        design = self._create_design()

        response = self.client.get(f"/user/designs/{design.id}/download/?type=report")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["file_type"], "report")
        self.assertTrue(data["filename"].endswith(".pdf"))
        self.assertIn("/media/", data["download_url"])

    def test_download_zip_returns_batch_package(self):
        """zip 下载应生成包含多格式资产的批量导出包"""
        design = self._create_design()

        response = self.client.get(f"/user/designs/{design.id}/download/?type=zip")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["file_type"], "zip")
        self.assertTrue(data["filename"].endswith(".zip"))
        zip_path = os.path.join(self.media_root, f"user_{self.user.id}", "designs", str(design.id), "export.zip")
        self.assertTrue(os.path.exists(zip_path))

    def test_share_link_can_be_revoked(self):
        """分享链接应支持撤销"""
        design = self._create_design()

        response = self.client.delete(f"/user/designs/{design.id}/share-link/")

        self.assertEqual(response.status_code, 200)
        design.refresh_from_db()
        self.assertFalse(design.is_shared)

    def test_password_protected_share_token_requires_matching_password(self):
        """带密码分享令牌应校验访问密码"""
        from user.consumers import validate_share_token, CLOSE_CODE_INVALID_SHARE_TOKEN
        from django.core import signing
        import hashlib

        token = signing.dumps(
            {
                "design_id": 99,
                "scope": "collaboration:join",
                "role": "viewer",
                "password_hash": hashlib.sha256("secret".encode("utf-8")).hexdigest(),
                "exp": int((timezone.now() + timezone.timedelta(hours=1)).timestamp()),
            },
            salt="collab-share",
        )

        invalid, code, _ = validate_share_token(token, 99, password="wrong")
        self.assertFalse(invalid)
        self.assertEqual(code, CLOSE_CODE_INVALID_SHARE_TOKEN)

        valid, code, reason = validate_share_token(token, 99, password="secret")
        self.assertTrue(valid)
        self.assertIsNone(code)
        self.assertIsNone(reason)


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
