from django.test import TestCase
from django.urls import reverse
from django.contrib.auth.models import User
from user.models import UserProfile, AIGenerationQuota, AIGenerationHistory


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
