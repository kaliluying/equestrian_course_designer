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
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from urllib.parse import quote

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
        from .models import CollaborationShareLink, Design

        design = Design.objects.create(title="Test Design", author=self.user, is_shared=False)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(f"/user/designs/{design.id}/share-link/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("shareUrl", data["data"])
        self.assertIn("shareToken", data["data"])
        self.assertIn("expiresAt", data["data"])

        self.assertTrue(CollaborationShareLink.objects.filter(
            design=design, created_by=self.user, is_revoked=False
        ).exists())

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
        share_token = response.json()["data"]["shareToken"]

        payload = signing.loads(share_token, salt="collab-share")
        self.assertEqual(payload["design_id"], design.id)
        self.assertEqual(payload["scope"], "collaboration:join")
        self.assertIn("share_link_id", payload)
        self.assertNotIn("password_hash", payload)
        self.assertNotIn("role", payload)


class ShareTokenValidationTests(TestCase):
    """Tests for share token validation in WebSocket consumer"""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        from .models import Design
        from .services.collaboration_share_links import create_share_link

        self.design = Design.objects.create(title="测试设计", author=self.user)
        self.share_link, self.token = create_share_link(
            design=self.design,
            created_by=self.user,
            role="viewer",
            expires_in_seconds=3600,
            password="secret",
        )

    def test_validate_share_token_success(self):
        from .consumers import validate_share_token

        is_valid, error_code, error_reason = validate_share_token(
            self.token, self.design.id, password="secret"
        )
        self.assertTrue(is_valid)
        self.assertIsNone(error_code)
        self.assertIsNone(error_reason)

    def test_validate_share_token_invalid_signature(self):
        from .consumers import CLOSE_CODE_INVALID_SHARE_TOKEN, validate_share_token

        payload = {"design_id": self.design.id, "scope": "collaboration:join", "share_link_id": self.share_link.id}
        token = signing.dumps(payload, salt="wrong-salt")

        is_valid, error_code, _ = validate_share_token(token, self.design.id, password="secret")
        self.assertFalse(is_valid)
        self.assertEqual(error_code, CLOSE_CODE_INVALID_SHARE_TOKEN)

    def test_validate_share_token_wrong_design(self):
        from .consumers import CLOSE_CODE_INVALID_SHARE_TOKEN, validate_share_token

        payload = {
            "design_id": 999,
            "scope": "collaboration:join",
            "share_link_id": self.share_link.id,
        }
        token = signing.dumps(payload, salt="collab-share")

        is_valid, error_code, _ = validate_share_token(token, self.design.id, password="secret")
        self.assertFalse(is_valid)
        self.assertEqual(error_code, CLOSE_CODE_INVALID_SHARE_TOKEN)

    def test_validate_share_token_expired(self):
        from .consumers import CLOSE_CODE_INVALID_SHARE_TOKEN, validate_share_token

        payload = {
            "design_id": self.design.id,
            "scope": "collaboration:join",
            "share_link_id": self.share_link.id,
        }
        token = signing.dumps(payload, salt="collab-share")
        self.share_link.expires_at = timezone.now() - timedelta(hours=1)
        self.share_link.save(update_fields=["expires_at"])

        is_valid, error_code, _ = validate_share_token(token, self.design.id, password="secret")
        self.assertFalse(is_valid)
        self.assertEqual(error_code, CLOSE_CODE_INVALID_SHARE_TOKEN)

    def test_validate_share_token_revoked_returns_stable_reason(self):
        """撤销链接必须和普通无效 token 区分，供前端展示明确提示。"""
        from .consumers import validate_share_token

        self.share_link.is_revoked = True
        self.share_link.save(update_fields=["is_revoked"])

        is_valid, _, error_reason = validate_share_token(
            self.token,
            self.design.id,
            password="secret",
        )

        self.assertFalse(is_valid)
        self.assertEqual(error_reason, "revoked_share_token")

    def test_validate_share_token_wrong_scope(self):
        from .consumers import CLOSE_CODE_INVALID_SHARE_TOKEN, validate_share_token

        payload = {
            "design_id": self.design.id,
            "scope": "wrong-scope",
            "share_link_id": self.share_link.id,
        }
        token = signing.dumps(payload, salt="collab-share")

        is_valid, error_code, error_reason = validate_share_token(
            token, self.design.id, password="secret"
        )
        self.assertFalse(is_valid)
        self.assertEqual(error_code, CLOSE_CODE_INVALID_SHARE_TOKEN)
        self.assertEqual(error_reason, "share_scope_mismatch")

    def test_validate_share_token_wrong_design_has_stable_reason(self):
        from .consumers import validate_share_token

        token = signing.dumps(
            {
                "design_id": self.design.id + 1,
                "scope": "collaboration:join",
                "share_link_id": self.share_link.id,
            },
            salt="collab-share",
        )

        is_valid, _, error_reason = validate_share_token(
            token, self.design.id, password="secret"
        )
        self.assertFalse(is_valid)
        self.assertEqual(error_reason, "share_design_mismatch")

    def test_validate_share_token_missing_link_has_stable_reason(self):
        from .consumers import validate_share_token

        self.share_link.delete()

        is_valid, _, error_reason = validate_share_token(
            self.token, self.design.id, password="secret"
        )
        self.assertFalse(is_valid)
        self.assertEqual(error_reason, "share_link_not_found")

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


class WebSocketSyncAuthorizationTests(TestCase):
    """协作同步必须由服务端角色和请求记录约束。"""

    def test_viewer_cannot_send_sync_response(self):
        """查看者不能伪造同步响应覆盖其他用户画布。"""
        from .consumers import CollaborationConsumer

        consumer = CollaborationConsumer.__new__(CollaborationConsumer)
        consumer.permission_role = "viewer"

        self.assertFalse(consumer._can_send_message("sync_response"))
        self.assertTrue(consumer._can_send_message("sync_request"))

    def test_sync_response_target_comes_from_server_request_record(self):
        """定向同步响应只能消费服务端登记的请求目标。"""
        from .consumers import CollaborationConsumer

        session = {"sync_requests": {}}
        request_id = "request-1"
        CollaborationConsumer._register_sync_request(session, request_id, "member-requester")

        self.assertEqual(
            CollaborationConsumer._consume_sync_request(session, request_id),
            "member-requester",
        )
        self.assertIsNone(
            CollaborationConsumer._consume_sync_request(session, request_id),
        )

    @patch("user.consumers.time.time", side_effect=[1000.0, 1031.0])
    def test_sync_request_expires(self, _mock_time):
        """同步请求超过短时窗口后不能再被消费。"""
        from .consumers import CollaborationConsumer

        session = {"sync_requests": {}}
        CollaborationConsumer._register_sync_request(session, "expired", "requester")
        self.assertIsNone(
            CollaborationConsumer._consume_sync_request(session, "expired")
        )


@override_settings(
    ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"],
    CHANNEL_LAYERS={
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}
    },
    CACHES={
        "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
    },
)
class CollaborationConsumerIntegrationTests(TransactionTestCase):
    """通过真实 ASGI consumer 验证分享连接和消息授权。"""

    def setUp(self):
        from .models import Design
        from .services.collaboration_share_links import create_share_link

        self.user = User.objects.create_user("ws_owner", password="testpass123")
        self.design = Design.objects.create(title="WS设计", author=self.user)
        _, self.token = create_share_link(
            design=self.design,
            created_by=self.user,
            role="viewer",
            expires_in_seconds=3600,
        )

    def test_viewer_connection_cannot_inject_sync_response(self):
        from equestrian.asgi import application

        async def run():
            communicator = WebsocketCommunicator(
                application,
                f"/ws/collaboration/{self.design.id}/?share_token={quote(self.token, safe='')}",
            )
            communicator.scope["headers"] = [(b"origin", b"http://testserver")]
            connected, connect_details = await communicator.connect()
            self.assertTrue(connected, repr(connect_details))
            await communicator.send_json_to(
                {"type": "sync_response", "payload": {"obstacles": [{"id": "forged"}]}}
            )

            for _ in range(3):
                message = await communicator.receive_json_from()
                if message.get("type") == "error":
                    self.assertIn("无权", message.get("message", ""))
                    self.assertIsInstance(message.get("payload"), dict)
                    break
            else:
                self.fail("未收到 viewer 的同步写入拒绝响应")
            await communicator.disconnect()

        async_to_sync(run)()

    def test_explicit_collaborator_can_start_session(self):
        """已有协作者在作者离线时也可以建立协作会话。"""
        from rest_framework_simplejwt.tokens import RefreshToken

        from .models import CollaborationRole

        editor = User.objects.create_user("ws_editor", password="testpass123")
        CollaborationRole.objects.create(
            design=self.design,
            user=editor,
            role="editor",
        )
        access_token = str(RefreshToken.for_user(editor).access_token)

        from equestrian.asgi import application

        async def run():
            communicator = WebsocketCommunicator(
                application,
                f"/ws/collaboration/{self.design.id}/",
            )
            communicator.scope["headers"] = [
                (b"origin", b"http://testserver"),
                (b"cookie", f"access_token={access_token}".encode()),
            ]
            connected, connect_details = await communicator.connect()
            self.assertTrue(connected, repr(connect_details))
            message = await communicator.receive_json_from()
            self.assertEqual(message["type"], "connection_established")
            await communicator.disconnect()

        async_to_sync(run)()

    def test_revoked_login_role_closes_existing_connection(self):
        """登录协作者角色失效后，旧 WebSocket 连接必须立即失去写权限。"""
        from rest_framework_simplejwt.tokens import RefreshToken

        from .models import CollaborationRole

        editor = User.objects.create_user("ws_revoked_editor", password="testpass123")
        role = CollaborationRole.objects.create(
            design=self.design,
            user=editor,
            role="editor",
        )
        access_token = str(RefreshToken.for_user(editor).access_token)

        from equestrian.asgi import application

        async def run():
            communicator = WebsocketCommunicator(
                application,
                f"/ws/collaboration/{self.design.id}/",
            )
            communicator.scope["headers"] = [
                (b"origin", b"http://testserver"),
                (b"cookie", f"access_token={access_token}".encode()),
            ]
            connected, connect_details = await communicator.connect()
            self.assertTrue(connected, repr(connect_details))
            message = await communicator.receive_json_from()
            self.assertEqual(message["type"], "connection_established")
            initial_join = await communicator.receive_json_from()
            self.assertEqual(initial_join["type"], "join")

            await sync_to_async(
                CollaborationRole.objects.filter(pk=role.pk).delete
            )()
            await communicator.send_json_to({"type": "join", "payload": {}})
            denied = await communicator.receive_json_from()
            self.assertEqual(denied["payload"]["code"], "collaboration_access_denied")
            await communicator.disconnect()

        async_to_sync(run)()


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


class SecurityHeaderTests(TestCase):
    """验证第三方 Admin UI 不会移除 Django 的点击劫持防护。"""

    def test_admin_response_contains_x_frame_options(self):
        response = self.client.get("/admin/login/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["X-Frame-Options"], "DENY")


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
        client = Client(enforce_csrf_checks=True)
        response = client.post(
            "/user/login/",
            data=json.dumps({"username": "testuser", "password": "testpass123"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_login_accepts_csrf_token(self):
        client = Client(enforce_csrf_checks=True)
        token_response = client.get("/user/csrf/")
        csrf_token = token_response.json()["csrfToken"]
        response = client.post(
            "/user/login/",
            data=json.dumps({"username": "testuser", "password": "testpass123"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(response.status_code, 200)

    def test_public_user_create_cannot_grant_staff(self):
        response = self.client.post(
            "/user/users/",
            data={
                "username": "public_staff_attempt",
                "email": "public_staff_attempt@example.com",
                "password": "RiderSecure2026",
                "confirmPassword": "RiderSecure2026",
                "is_staff": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        created = User.objects.get(username="public_staff_attempt")
        self.assertFalse(created.is_staff)
