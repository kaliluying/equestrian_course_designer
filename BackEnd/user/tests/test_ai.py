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
