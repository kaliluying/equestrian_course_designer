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
        self.assertNotIn("shareToken", response.json())

    def test_share_link_lifecycle_does_not_change_public_share_state(self):
        """协作链接生命周期不应改动设计的公开展示状态。"""
        from user.models import Design

        design = Design.objects.create(title="状态同步设计", author=self.owner, is_shared=False)
        response = self.client.post(f"/user/designs/{design.id}/share-link/", format="json")
        self.assertEqual(response.status_code, 200)
        design.refresh_from_db()
        self.assertFalse(design.is_shared)

        design.is_shared = True
        design.save(update_fields=["is_shared"])

        response = self.client.delete(f"/user/designs/{design.id}/share-link/")
        self.assertEqual(response.status_code, 200)
        design.refresh_from_db()
        self.assertTrue(design.is_shared)

    def test_share_link_rejects_password_longer_than_websocket_limit(self):
        """创建阶段必须拒绝 WebSocket 无法认证的超长密码。"""
        response = self.client.post(
            f"/user/designs/{self.design.id}/share-link/",
            data={"password": "x" * 129},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

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
