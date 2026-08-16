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
from rest_framework import serializers
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
from user.serializers import _validate_image_upload


class ImageUploadValidationTest(TestCase):
    """图片校验必须把 Pillow 的炸弹异常转换成业务校验错误。"""

    def test_decompression_bomb_is_rejected_as_validation_error(self):
        upload = ContentFile(b"not-used", name="bomb.png")

        with patch(
            "user.serializers.Image.open",
            side_effect=Image.DecompressionBombError("too many pixels"),
        ):
            with self.assertRaises(serializers.ValidationError):
                _validate_image_upload(upload, "设计图片")

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
        self.assertIn(f"/user/designs/{design.id}/asset/", data["download_url"])
        self.assertIn("type=json", data["download_url"])
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
        self.assertIn(f"/user/designs/{design.id}/asset/", data["download_url"])
        self.assertIn("type=png", data["download_url"])
        self.assertEqual(data["downloads_count"], 1)

    def test_asset_image_type_returns_authorized_image(self):
        """序列化器返回的 image 资源地址应能被授权后直接读取"""
        design = self._create_design(title="图片资源设计")

        response = self.client.get(f"/user/designs/{design.id}/asset/?type=image")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertTrue(b"".join(response.streaming_content).startswith(b"\x89PNG"))

    def test_asset_private_design_is_not_readable_by_other_user(self):
        """未共享设计的资源接口不能被其他用户读取"""
        owner = self.user
        other_user = User.objects.create_user(
            username="asset_other_user",
            email="asset_other@example.com",
            password="Password123",
        )
        design = self._create_design(
            title="私有图片资源",
            author=owner,
            is_shared=False,
        )
        self.client.force_authenticate(user=other_user)

        response = self.client.get(f"/user/designs/{design.id}/asset/?type=image")

        self.assertEqual(response.status_code, 404)

    def test_download_pdf_generates_file(self):
        """PDF 下载应基于设计图片生成 PDF 文件"""
        design = self._create_design(title="PDF测试设计")

        response = self.client.get(f"/user/designs/{design.id}/download/?type=%20PDF%20")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["file_type"], "pdf")
        self.assertEqual(data["filename"], "PDF测试设计.pdf")
        self.assertIn(f"/user/designs/{design.id}/asset/", data["download_url"])
        self.assertIn("type=pdf", data["download_url"])
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

        self.assertEqual(response.status_code, 404)
        self.assertFalse(response.json()["success"])
        design.refresh_from_db()
        self.assertEqual(design.downloads_count, 0)


class DesignCollaborationCRUDAPITest(TestCase):
    """标准设计 CRUD 必须遵守显式协作角色。"""

    def setUp(self):
        from user.models import CollaborationRole

        self.client = APIClient()
        self.owner = User.objects.create_user("crud_owner", password="Password123")
        self.editor = User.objects.create_user("crud_editor", password="Password123")
        self.viewer = User.objects.create_user("crud_viewer", password="Password123")
        for user in (self.owner, self.editor, self.viewer):
            UserProfile.objects.get_or_create(user=user)
        self.design = Design.objects.create(
            title="协作 CRUD 设计",
            author=self.owner,
            description="初始描述",
            is_shared=False,
        )
        CollaborationRole.objects.create(design=self.design, user=self.editor, role="editor")
        CollaborationRole.objects.create(design=self.design, user=self.viewer, role="viewer")

    def test_editor_can_use_standard_retrieve_and_update(self):
        self.client.force_authenticate(user=self.editor)

        retrieve_response = self.client.get(f"/user/designs/{self.design.id}/")
        self.assertEqual(retrieve_response.status_code, 200)

        update_response = self.client.patch(
            f"/user/designs/{self.design.id}/",
            data={"title": "编辑者更新标题"},
            format="json",
        )
        self.assertEqual(update_response.status_code, 200)
        self.design.refresh_from_db()
        self.assertEqual(self.design.title, "编辑者更新标题")

    def test_editor_cannot_change_or_toggle_sharing(self):
        self.client.force_authenticate(user=self.editor)

        update_response = self.client.patch(
            f"/user/designs/{self.design.id}/",
            data={"is_shared": True},
            format="json",
        )
        self.assertEqual(update_response.status_code, 403)

        share_response = self.client.post(f"/user/designs/{self.design.id}/share/")
        toggle_response = self.client.post(
            f"/user/designs/{self.design.id}/toggle-share/"
        )
        self.assertEqual(share_response.status_code, 403)
        self.assertEqual(toggle_response.status_code, 403)
        self.design.refresh_from_db()
        self.assertFalse(self.design.is_shared)

    def test_viewer_cannot_update_or_delete_via_standard_crud(self):
        self.client.force_authenticate(user=self.viewer)

        update_response = self.client.patch(
            f"/user/designs/{self.design.id}/",
            data={"title": "越权标题"},
            format="json",
        )
        self.assertEqual(update_response.status_code, 403)

        delete_response = self.client.delete(f"/user/designs/{self.design.id}/")
        self.assertEqual(delete_response.status_code, 403)
        self.assertTrue(Design.objects.filter(pk=self.design.id).exists())

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

    def test_design_update_rolls_back_storage_files_when_version_creation_fails(self):
        """版本创建失败时数据库旧文件必须保留，新文件不得成为孤儿文件。"""
        design = self._create_design(title="文件一致性设计")
        old_image_name = design.image.name
        old_image_path = os.path.join(self.media_root, old_image_name)

        self.client.raise_request_exception = False
        with patch(
            "user.views.design_views.create_design_version",
            side_effect=RuntimeError("version creation failed"),
        ):
            response = self.client.patch(
                f"/user/designs/{design.id}/",
                data={"image": self._png_file("changed.png")},
                format="multipart",
            )

        self.assertEqual(response.status_code, 500)
        design.refresh_from_db()
        self.assertEqual(design.image.name, old_image_name)
        self.assertTrue(os.path.exists(old_image_path))
        design_dir = os.path.dirname(old_image_path)
        self.assertEqual(
            sorted(os.listdir(design_dir)),
            [os.path.basename(old_image_path)],
        )

    def test_metadata_update_failure_keeps_existing_storage_files(self):
        """仅更新元数据失败时不能删除仍被数据库引用的旧文件。"""
        design = self._create_design(title="元数据回滚设计")
        old_image_path = os.path.join(self.media_root, design.image.name)
        old_download_path = os.path.join(self.media_root, design.download.name)

        self.client.raise_request_exception = False
        with patch(
            "user.views.design_views.create_design_version",
            side_effect=RuntimeError("version creation failed"),
        ):
            response = self.client.patch(
                f"/user/designs/{design.id}/",
                data={"title": "不会保存的新标题"},
                format="json",
            )

        self.assertEqual(response.status_code, 500)
        design.refresh_from_db()
        self.assertEqual(design.title, "元数据回滚设计")
        self.assertTrue(os.path.exists(old_image_path))
        self.assertTrue(os.path.exists(old_download_path))

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
        version.image_snapshot.save("history.png", self._png_file("history.png"), save=True)

        response = self.client.post(f"/user/designs/{design.id}/versions/{version.id}/restore/")

        self.assertEqual(response.status_code, 200)
        design.refresh_from_db()
        self.assertEqual(design.title, "历史标题")
        self.assertEqual(design.description, "历史描述")
        self.assertEqual(DesignVersion.objects.filter(design=design).count(), 2)
        self.assertTrue(DesignVersion.objects.filter(design=design, source="restore").exists())

    def test_restore_version_restores_image_snapshot(self):
        """恢复版本时应同时恢复版本保存的图片快照。"""
        from user.models import DesignVersion
        from user.services.design_version import create_design_version

        design = self._create_design(title="图片版本设计")
        initial_version = create_design_version(design, source="manual")
        with design.image.open("rb") as image_file:
            initial_image = image_file.read()

        design.image.save("changed.png", self._png_file(), save=True)
        self.client.post(
            f"/user/designs/{design.id}/versions/{initial_version.id}/restore/"
        )

        design.refresh_from_db()
        with design.image.open("rb") as image_file:
            self.assertEqual(image_file.read(), initial_image)
        self.assertTrue(
            DesignVersion.objects.filter(design=design, source="restore").exists()
        )

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
        version.image_snapshot.save("copy.png", self._png_file("copy.png"), save=True)

        response = self.client.post(f"/user/designs/{design.id}/versions/{version.id}/copy/")

        self.assertEqual(response.status_code, 201)
        new_design_id = response.json()["id"]
        self.assertNotEqual(new_design_id, design.id)
        self.assertTrue(Design.objects.filter(id=new_design_id, title__contains="历史副本").exists())

    def test_copy_version_uses_request_user_and_copies_image_content(self):
        """复制版本的作者应是发起者，图片也必须是独立副本。"""
        from user.models import CollaborationRole, DesignVersion

        design = self._create_design(title="跨用户复制")
        version = DesignVersion.objects.create(
            design=design,
            author=self.user,
            version_number=1,
            source="manual",
            title="跨用户版本",
            description="历史描述",
            course_data={"obstacles": [{"id": "copy-image"}]},
        )
        version.image_snapshot.save("copy-image.png", self._png_file("copy-image.png"), save=True)
        other_user = User.objects.create_user(
            "version_copy_user", "version_copy@example.com", "Password123"
        )
        UserProfile.objects.get_or_create(user=other_user)
        CollaborationRole.objects.create(design=design, user=other_user, role="editor")
        self.client.force_authenticate(user=other_user)

        response = self.client.post(
            f"/user/designs/{design.id}/versions/{version.id}/copy/"
        )

        self.assertEqual(response.status_code, 201)
        copied = Design.objects.get(pk=response.json()["id"])
        self.assertEqual(copied.author_id, other_user.id)
        self.assertNotEqual(copied.image.name, design.image.name)
        with design.image.open("rb") as source_file, copied.image.open("rb") as copied_file:
            self.assertEqual(source_file.read(), copied_file.read())


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

    def test_restore_and_copy_reject_version_without_image_snapshot(self):
        """缺失图片快照时不得把历史路线与当前图片混合。"""
        from user.models import DesignVersion

        design = self._create_design(title="缺快照版本")
        version = DesignVersion.objects.create(
            design=design,
            author=self.user,
            version_number=1,
            source="manual",
            title="缺快照历史",
            course_data={"obstacles": [{"id": "missing-snapshot"}]},
        )

        restore_response = self.client.post(
            f"/user/designs/{design.id}/versions/{version.id}/restore/"
        )
        self.assertEqual(restore_response.status_code, 409)

        copy_response = self.client.post(
            f"/user/designs/{design.id}/versions/{version.id}/copy/"
        )
        self.assertEqual(copy_response.status_code, 409)

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

    def test_version_snapshot_is_removed_when_database_step_fails(self):
        """版本数据库步骤失败时不能遗留新写入的图片文件。"""
        from user.services.design_version import create_design_version

        design = self._create_design(title="快照回滚设计")
        snapshot_dir = os.path.join(self.media_root, "design_versions", str(design.id))

        with patch(
            "user.services.design_version._prune_old_versions",
            side_effect=RuntimeError("database step failed"),
        ), self.assertRaises(RuntimeError):
            create_design_version(design, source="manual")

        self.assertFalse(os.path.isdir(snapshot_dir) and os.listdir(snapshot_dir))

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

    def test_template_numeric_filters_reject_invalid_values(self):
        response = self.client.get("/user/templates/?obstacle_count=not-a-number")

        self.assertEqual(response.status_code, 400)

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
        copied_design = Design.objects.get(pk=copy_response.json()["id"])
        self.assertEqual(copied_design.versions.count(), 1)

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
        self.assertIn(f"/user/designs/{design.id}/asset/", data["download_url"])
        self.assertIn("type=report", data["download_url"])

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
        from user.models import CollaborationShareLink

        design = self._create_design()
        self.client.post(f"/user/designs/{design.id}/share-link/")

        response = self.client.delete(f"/user/designs/{design.id}/share-link/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(CollaborationShareLink.objects.filter(
            design=design, is_revoked=False
        ).exists())

    def test_password_protected_share_token_requires_matching_password(self):
        """带密码分享令牌应校验访问密码"""
        from user.consumers import validate_share_token, CLOSE_CODE_INVALID_SHARE_TOKEN
        from user.services.collaboration_share_links import create_share_link

        share_link, token = create_share_link(
            design=self._create_design(),
            created_by=self.user,
            role="viewer",
            expires_in_seconds=3600,
            password="secret",
        )

        invalid, code, _ = validate_share_token(token, share_link.design_id, password="wrong")
        self.assertFalse(invalid)
        self.assertEqual(code, CLOSE_CODE_INVALID_SHARE_TOKEN)

        valid, code, reason = validate_share_token(token, share_link.design_id, password="secret")
        self.assertTrue(valid)
        self.assertIsNone(code)
        self.assertIsNone(reason)
