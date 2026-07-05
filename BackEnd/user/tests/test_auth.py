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
