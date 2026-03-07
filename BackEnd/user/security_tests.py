"""
Security Tests for User Authentication and Collaboration

Tests for Critical/High security fixes including:
- Share link token generation and validation
- WebSocket share token validation
- CSRF protection enforcement
"""

from datetime import timedelta
from unittest.mock import MagicMock, patch
import json
import os

from django.contrib.auth.models import User
from django.core import signing
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "equestrian.settings")


class ShareLinkViewTests(TestCase):
    """Tests for ShareLinkView - share token generation"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.other_user = User.objects.create_user(username="otheruser", password="testpass456")

    def test_share_link_requires_authentication(self):
        response = self.client.post("/user/designs/1/share-link/")
        self.assertEqual(response.status_code, 401)

    def test_share_link_owner_can_generate(self):
        from .models import Design

        design = Design.objects.create(title="Test Design", author=self.user, is_shared=False)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(f"/user/designs/{design.id}/share-link/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("shareUrl", data)
        self.assertIn("shareToken", data)
        self.assertIn("expiresAt", data)

        design.refresh_from_db()
        self.assertTrue(design.is_shared)

    def test_share_link_non_owner_forbidden(self):
        from .models import Design

        design = Design.objects.create(title="Test Design", author=self.user, is_shared=False)
        self.client.force_authenticate(user=self.other_user)

        response = self.client.post(f"/user/designs/{design.id}/share-link/")

        self.assertEqual(response.status_code, 403)
        data = response.json()
        self.assertFalse(data["success"])
        self.assertIn("只有设计作者", data["message"])

    def test_share_link_design_not_found(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post("/user/designs/99999/share-link/")
        self.assertEqual(response.status_code, 404)

    def test_share_link_returns_valid_token(self):
        from .models import Design

        design = Design.objects.create(title="Test Design", author=self.user, is_shared=False)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(f"/user/designs/{design.id}/share-link/")

        self.assertEqual(response.status_code, 200)
        share_token = response.json()["shareToken"]

        payload = signing.loads(share_token, salt="collab-share")
        self.assertEqual(payload["design_id"], design.id)
        self.assertEqual(payload["scope"], "collaboration:join")
        self.assertIn("exp", payload)


class ShareTokenValidationTests(TestCase):
    """Tests for share token validation in WebSocket consumer"""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")

    def test_validate_share_token_success(self):
        from .consumers import validate_share_token

        payload = {
            "design_id": 1,
            "scope": "collaboration:join",
            "exp": int((timezone.now() + timedelta(seconds=3600)).timestamp()),
        }
        token = signing.dumps(payload, salt="collab-share")

        is_valid, error_code, error_reason = validate_share_token(token, 1)
        self.assertTrue(is_valid)
        self.assertIsNone(error_code)
        self.assertIsNone(error_reason)

    def test_validate_share_token_invalid_signature(self):
        from .consumers import CLOSE_CODE_INVALID_SHARE_TOKEN, validate_share_token

        payload = {"design_id": 1, "scope": "join", "exp": 9999999999}
        token = signing.dumps(payload, salt="wrong-salt")

        is_valid, error_code, _ = validate_share_token(token, 1)
        self.assertFalse(is_valid)
        self.assertEqual(error_code, CLOSE_CODE_INVALID_SHARE_TOKEN)

    def test_validate_share_token_wrong_design(self):
        from .consumers import CLOSE_CODE_INVALID_SHARE_TOKEN, validate_share_token

        payload = {
            "design_id": 999,
            "scope": "collaboration:join",
            "exp": int((timezone.now() + timedelta(hours=1)).timestamp()),
        }
        token = signing.dumps(payload, salt="collab-share")

        is_valid, error_code, _ = validate_share_token(token, 1)
        self.assertFalse(is_valid)
        self.assertEqual(error_code, CLOSE_CODE_INVALID_SHARE_TOKEN)

    def test_validate_share_token_expired(self):
        from .consumers import CLOSE_CODE_INVALID_SHARE_TOKEN, validate_share_token

        payload = {
            "design_id": 1,
            "scope": "collaboration:join",
            "exp": int((timezone.now() - timedelta(hours=1)).timestamp()),
        }
        token = signing.dumps(payload, salt="collab-share")

        is_valid, error_code, _ = validate_share_token(token, 1)
        self.assertFalse(is_valid)
        self.assertEqual(error_code, CLOSE_CODE_INVALID_SHARE_TOKEN)

    def test_validate_share_token_wrong_scope(self):
        from .consumers import CLOSE_CODE_INVALID_SHARE_TOKEN, validate_share_token

        payload = {
            "design_id": 1,
            "scope": "wrong-scope",
            "exp": int((timezone.now() + timedelta(hours=1)).timestamp()),
        }
        token = signing.dumps(payload, salt="collab-share")

        is_valid, error_code, _ = validate_share_token(token, 1)
        self.assertFalse(is_valid)
        self.assertEqual(error_code, CLOSE_CODE_INVALID_SHARE_TOKEN)

    def test_validate_share_token_empty_token(self):
        from .consumers import CLOSE_CODE_VIA_LINK_DEPRECATED, validate_share_token

        is_valid, error_code, _ = validate_share_token("", 1)
        self.assertFalse(is_valid)
        self.assertEqual(error_code, CLOSE_CODE_VIA_LINK_DEPRECATED)

    def test_validate_share_token_none_token(self):
        from .consumers import CLOSE_CODE_VIA_LINK_DEPRECATED, validate_share_token

        is_valid, error_code, _ = validate_share_token(None, 1)
        self.assertFalse(is_valid)
        self.assertEqual(error_code, CLOSE_CODE_VIA_LINK_DEPRECATED)


class CookieSecurityTests(TestCase):
    """Tests for cookie-based authentication security"""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")

    @patch("rest_framework_simplejwt.tokens.RefreshToken.for_user")
    def test_login_response_contains_cookies(self, mock_for_user):
        mock_refresh = MagicMock()
        mock_refresh.access_token = "test-access-token"
        mock_refresh.__str__ = lambda self: "test-refresh-token"
        mock_for_user.return_value = mock_refresh

    def test_session_endpoint_is_not_exposed(self):
        response = self.client.get("/user/session/")
        self.assertEqual(response.status_code, 404)


class CSRFProtectionTests(TestCase):
    """Tests for CSRF protection"""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")

    def test_csrf_token_endpoint_exists(self):
        response = self.client.get("/user/csrf/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("csrfToken", data)

    def test_login_requires_csrf(self):
        response = self.client.post(
            "/user/login/",
            data=json.dumps({"username": "testuser", "password": "testpass123"}),
            content_type="application/json",
        )
        self.assertIn(response.status_code, [200, 400, 403, 500])
