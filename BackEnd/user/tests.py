import io
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
