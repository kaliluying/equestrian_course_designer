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
        self.assertTrue(data["success"])
        route_data = data["data"]
        self.assertFalse(route_data["is_valid"])
        self.assertEqual(route_data["issues"][0]["code"], "EMPTY_ROUTE")
        self.assertEqual(route_data["issues"][0]["severity"], "error")

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
        issue = response.json()["data"]["issues"][0]
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
        route_data = response.json()["data"]
        codes = {item["code"] for item in route_data["issues"] + route_data["warnings"]}
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
        route_data = response.json()["data"]
        codes = {item["code"] for item in route_data["issues"] + route_data["warnings"]}
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
        route_data = response.json()["data"]
        codes = {item["code"] for item in route_data["issues"] + route_data["warnings"]}
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
        data = response.json()["data"]
        self.assertIn("patches", data)
        self.assertIn("updated_obstacles", data)
        self.assertIn("validation", data)
        self.assertGreater(len(data["patches"]), 0)
        first = data["updated_obstacles"][0]
        self.assertGreaterEqual(first["position"]["x"], 3)
        self.assertLessEqual(first["poles"][0]["height"], 1.0)

    def test_fix_course_rebuilds_path_after_obstacle_movement(self):
        """障碍物位置修复后，返回的路径点必须同步更新。"""
        response = self.client.post(
            "/user/designs/fix-course/",
            data={
                "field_width": 90,
                "field_height": 60,
                "difficulty": "medium",
                "path": {
                    "visible": True,
                    "points": [{"x": 1, "y": 2}, {"x": 2, "y": 2}],
                },
                "obstacles": [
                    {"id": "obs-1", "number": "1", "type": "SINGLE", "position": {"x": 1, "y": 2}, "rotation": 0, "poles": [{"height": 1.1}]},
                    {"id": "obs-2", "number": "2", "type": "SINGLE", "position": {"x": 12, "y": 20}, "rotation": 90, "poles": [{"height": 1.1}]},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        updated_path = response.json()["data"]["updated_path"]
        self.assertTrue(updated_path["visible"])
        self.assertNotEqual(updated_path["points"], [{"x": 1, "y": 2}, {"x": 2, "y": 2}])
        self.assertEqual(updated_path["points"][3]["x"], 3.0)

    def test_route_endpoints_reject_invalid_obstacle_numeric_fields(self):
        """属性对象、编号和横杆字段异常时必须稳定返回 400。"""
        invalid_routes = [
            {
                "number": "1",
                "type": "WALL",
                "position": {"x": 10, "y": 10},
                "poles": [{"height": 1.1}],
                "wallProperties": {"height": "bad", "width": 3.5},
            },
            {
                "number": "abc",
                "type": "SINGLE",
                "position": {"x": 10, "y": 10},
                "poles": [{"height": 1.1}],
            },
            {
                "number": "1",
                "type": "SINGLE",
                "position": {"x": 10, "y": 10},
                "poles": [{}],
            },
            {
                "number": "1",
                "type": "WALL",
                "position": {"x": 10, "y": 10},
                "poles": [{"height": 1.1}],
                "wallProperties": {"height": None},
            },
        ]
        for endpoint in ("validate-course", "fix-course"):
            response = self.client.post(
                f"/user/designs/{endpoint}/",
                data={"obstacles": invalid_routes},
                format="json",
            )
            self.assertEqual(response.status_code, 400, endpoint)

    def test_route_endpoints_reject_oversized_or_deep_json(self):
        """路线请求必须遵守统一体积和嵌套深度限制。"""
        nested = "value"
        for _ in range(13):
            nested = {"nested": nested}
        payload = {
            "obstacles": [
                {
                    "number": "1",
                    "type": "SINGLE",
                    "position": {"x": 10, "y": 10},
                    "poles": [{"height": 1.1}],
                    "metadata": nested,
                }
            ]
        }
        for endpoint in ("validate-course", "fix-course"):
            response = self.client.post(
                f"/user/designs/{endpoint}/",
                data=payload,
                format="json",
            )
            self.assertEqual(response.status_code, 400, endpoint)

    def test_route_endpoints_reject_oversized_unknown_fields(self):
        """未知字段也不能绕过路线请求的整体体积限制。"""
        payload = {"padding": "x" * (512 * 1024)}
        for endpoint in ("validate-course", "fix-course"):
            response = self.client.post(
                f"/user/designs/{endpoint}/",
                data=payload,
                format="json",
            )
            self.assertEqual(response.status_code, 400, endpoint)
