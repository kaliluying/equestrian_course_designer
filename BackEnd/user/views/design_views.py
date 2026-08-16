"""设计管理视图：设计的CRUD、点赞、分享、下载。"""

import logging
import os
import zipfile
from io import BytesIO

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import F, Q
from django.http import FileResponse
from django.urls import reverse
from django.utils.text import get_valid_filename
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from PIL import Image

from ..models import (
    CollaborationEvent,
    CollaborationRole,
    Design,
    DesignComment,
    DesignLike,
    DesignVersion,
    UserProfile,
)
from ..serializers import (
    CollaborationEventSerializer,
    DesignCommentSerializer,
    DesignResponseEnvelopeSerializer,
    DesignSerializer,
    DesignListSerializer,
    DesignVersionSerializer,
    DesignVersionUpdateSerializer,
    RouteFixResponseSerializer,
    RouteValidationRequestSerializer,
    RouteValidationResponseSerializer,
)
from ..utils import success_response, error_response
from ..route_validator import RouteValidationInputError, RouteValidator
from .user_views import check_and_update_membership
from ..services.membership_access import MembershipAccessError, assert_design_capacity
from ..services.design_version import (
    DesignVersionSnapshotError,
    copy_design_version,
    create_design_version,
    restore_design_version,
)
from ..throttles import ExportRateThrottle

logger = logging.getLogger(__name__)

SUPPORTED_DOWNLOAD_TYPES = ("image", "json", "png", "pdf", "report", "zip")
IMAGE_CONTENT_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}


def _stored_file_exists(field_file):
    """校验文件字段有值且存储中实际存在该文件。"""
    if not field_file:
        return False
    return field_file.storage.exists(field_file.name)


def _capture_design_files(design):
    """记录设计当前写入的文件，供事务回滚时清理新文件。"""
    files = {}
    for field_name in ('image', 'download'):
        field_file = getattr(design, field_name, None)
        if field_file and field_file.name:
            files[field_name] = (field_file.storage, field_file.name)
    return files


def _delete_design_files(files):
    """清理事务失败后新写入的设计文件。"""
    for field_name, (storage, name) in files.items():
        try:
            storage.delete(name)
        except Exception:
            logger.exception("清理事务回滚文件失败: field=%s, name=%s", field_name, name)


def _parse_route_request(data):
    """规范化路线接口请求，并复用统一的体积、深度和字段校验。"""
    if not hasattr(data, 'get'):
        return None, {'request': ['路线请求必须是 JSON 对象']}
    payload = data.copy() if hasattr(data, 'copy') else dict(data)
    if 'field_width' not in payload and 'fieldWidth' in payload:
        payload['field_width'] = payload['fieldWidth']
    if 'field_height' not in payload and 'fieldHeight' in payload:
        payload['field_height'] = payload['fieldHeight']
    serializer = RouteValidationRequestSerializer(data=payload)
    if not serializer.is_valid():
        return None, serializer.errors
    return serializer.validated_data, None


def _build_download_filename(title, file_type):
    """生成浏览器下载文件名，避免标题中的路径字符污染文件名。"""
    filename = get_valid_filename(f"{title}.{file_type}")
    return filename or f"design.{file_type}"


def _image_download_metadata(field_file):
    """根据已验证的图片文件名返回扩展名和 MIME 类型。"""
    extension = os.path.splitext(field_file.name or "")[1].lower().lstrip(".")
    if extension not in IMAGE_CONTENT_TYPES:
        extension = "png"
    return extension, IMAGE_CONTENT_TYPES[extension]


def _generate_design_pdf(design):
    """基于设计图片生成 PDF，并返回存储路径。"""
    relative_pdf_path = f"user_{design.author.id}/designs/{design.id}/design.pdf"
    pdf_buffer = BytesIO()

    with design.image.open("rb") as image_file:
        with Image.open(image_file) as image:
            if image.mode in ("RGBA", "LA"):
                background = Image.new("RGB", image.size, "white")
                background.paste(image, mask=image.getchannel("A"))
                pdf_image = background
            else:
                pdf_image = image.convert("RGB")

            try:
                pdf_image.save(pdf_buffer, "PDF", resolution=100.0)
            finally:
                if pdf_image is not image:
                    pdf_image.close()

    if default_storage.exists(relative_pdf_path):
        default_storage.delete(relative_pdf_path)
    default_storage.save(relative_pdf_path, ContentFile(pdf_buffer.getvalue()))

    return relative_pdf_path


def _generate_design_report_pdf(design):
    """生成专业 PDF 报告，并返回存储路径。"""
    # 当前报告第一版复用路线图 PDF 生成能力，文件名独立，后续可继续扩展封面、清单、规则检查与教练说明页。
    relative_pdf_path = f"user_{design.author.id}/designs/{design.id}/report.pdf"
    pdf_buffer = BytesIO()

    with design.image.open("rb") as image_file:
        with Image.open(image_file) as image:
            if image.mode in ("RGBA", "LA"):
                background = Image.new("RGB", image.size, "white")
                background.paste(image, mask=image.getchannel("A"))
                pdf_image = background
            else:
                pdf_image = image.convert("RGB")

            try:
                pdf_image.save(pdf_buffer, "PDF", resolution=100.0)
            finally:
                if pdf_image is not image:
                    pdf_image.close()

    if default_storage.exists(relative_pdf_path):
        default_storage.delete(relative_pdf_path)
    default_storage.save(relative_pdf_path, ContentFile(pdf_buffer.getvalue()))
    return relative_pdf_path


def _generate_design_zip(design):
    """生成包含 JSON、PNG 和专业报告 PDF 的批量导出 ZIP。"""
    relative_zip_path = f"user_{design.author.id}/designs/{design.id}/export.zip"
    report_path = _generate_design_report_pdf(design)
    zip_buffer = BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        if _stored_file_exists(design.download):
            with design.download.open("rb") as file_obj:
                archive.writestr(_build_download_filename(design.title, "json"), file_obj.read())
        if _stored_file_exists(design.image):
            with design.image.open("rb") as file_obj:
                archive.writestr(_build_download_filename(design.title, "png"), file_obj.read())
        with default_storage.open(report_path, "rb") as file_obj:
            archive.writestr(_build_download_filename(f"{design.title}-专业报告", "pdf"), file_obj.read())

    if default_storage.exists(relative_zip_path):
        default_storage.delete(relative_zip_path)
    default_storage.save(relative_zip_path, ContentFile(zip_buffer.getvalue()))
    return relative_zip_path


class DesignViewSet(viewsets.ModelViewSet):
    """设计视图集"""

    queryset = Design.objects.all()
    serializer_class = DesignSerializer
    parser_classes = (JSONParser, MultiPartParser, FormParser)

    def get_serializer_class(self):
        """根据不同的操作返回不同的序列化器"""
        if self.action == "shared_designs":
            return DesignListSerializer
        return DesignSerializer

    def get_queryset(self):
        """根据不同的操作返回不同的查询集"""
        if self.action == "shared_designs":
            # 公开分享的设计，预加载作者避免 N+1
            return Design.objects.filter(is_shared=True).select_related('author')
        user = getattr(self.request, "user", None)
        if user is None or not user.is_authenticated:
            return Design.objects.none()

        # 列表仍然只展示本人设计；详情和标准 CRUD 则允许显式协作者
        # 找到对象，后续由 perform_update/perform_destroy 再做写权限判断。
        if self.action in {
            "retrieve",
            "update",
            "partial_update",
            "destroy",
            "share_design",
            "toggle_design_sharing",
        }:
            return (
                Design.objects.filter(
                    Q(author=user) | Q(collaboration_roles__user=user)
                )
                .select_related("author")
                .distinct()
            )
        return Design.objects.filter(author=user).select_related("author")

    def _get_authorized_design(self, pk, *, allow_public=False):
        """按作者、显式协作角色或公开状态检查设计访问权限。"""
        try:
            design = Design.objects.select_related("author").get(pk=pk)
        except Design.DoesNotExist:
            return None

        user = self.request.user
        if user.is_authenticated and design.author_id == user.id:
            return design
        if allow_public and design.is_shared and user.is_authenticated:
            return design
        if user.is_authenticated and CollaborationRole.objects.filter(
            design=design,
            user=user,
        ).exists():
            return design
        return None

    def _get_collaboration_context(self, pk):
        """返回设计及当前用户的显式协作角色。"""
        design = self._get_authorized_design(pk)
        if design is None:
            return None, None
        if design.author_id == self.request.user.id:
            return design, "owner"
        role = CollaborationRole.objects.filter(
            design=design,
            user=self.request.user,
        ).values_list("role", flat=True).first()
        return design, role

    def perform_create(self, serializer):
        """保存时自动设置作者为当前用户并创建版本快照"""
        design = None
        try:
            with transaction.atomic():
                # 先处理已到期的会员降级，再在同一事务内检查容量并创建设计。
                check_and_update_membership(self.request.user)
                assert_design_capacity(self.request.user)
                design = serializer.save(author=self.request.user)
                create_design_version(design, source="manual")
        except Exception:
            if design is not None:
                _delete_design_files(_capture_design_files(design))
            raise

    def perform_update(self, serializer):
        """更新设计时保留原作者"""
        # 获取原设计对象
        instance = self.get_object()
        previous_files = _capture_design_files(instance)
        if instance.author_id != self.request.user.id:
            if "is_shared" in self.request.data:
                raise PermissionDenied("只有设计作者可以修改分享状态")
            role = CollaborationRole.objects.filter(
                design=instance,
                user=self.request.user,
            ).values_list("role", flat=True).first()
            if role != "editor":
                raise PermissionDenied("当前协作角色无权编辑设计")
        logger.info(
            "更新设计: ID=%s, 标题=%s, 作者=%s",
            instance.id,
            instance.title,
            instance.author,
        )

        # 确保更新时保留原作者
        design = None
        try:
            with transaction.atomic():
                design = serializer.save(author=instance.author)
                create_design_version(design, source="manual")
            logger.info("设计更新成功: ID=%s", instance.id)
        except Exception:
            if design is not None:
                current_files = _capture_design_files(design)
                new_files = {
                    field_name: file_info
                    for field_name, file_info in current_files.items()
                    if field_name not in previous_files
                    or file_info[1] != previous_files[field_name][1]
                }
                _delete_design_files(new_files)
            logger.exception("设计更新失败: ID=%s", instance.id)
            raise

    def perform_destroy(self, instance):
        """仅允许设计作者删除设计，协作者不能通过标准 DELETE 越权。"""
        if instance.author_id != self.request.user.id:
            raise PermissionDenied("只有设计作者可以删除设计")
        instance.delete()

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="type",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                enum=SUPPORTED_DOWNLOAD_TYPES,
                required=False,
            )
        ],
        responses={
            (
                200,
                "application/json",
                "image/png",
                "image/jpeg",
                "image/webp",
                "application/pdf",
                "application/zip",
            ): OpenApiTypes.BINARY,
        },
    )
    @action(
        detail=True,
        methods=["get"],
        url_path="asset",
        throttle_classes=[ExportRateThrottle],
    )
    def asset(self, request, pk=None):
        """在完成对象级授权后返回设计文件，避免公开暴露 MEDIA_ROOT。"""
        design = self._get_authorized_design(pk, allow_public=True)
        if design is None:
            return error_response("设计不存在或您无权访问", status.HTTP_404_NOT_FOUND)

        file_type = request.query_params.get("type", "image").strip().lower()
        if file_type not in SUPPORTED_DOWNLOAD_TYPES:
            return error_response("不支持的文件类型", status.HTTP_400_BAD_REQUEST)

        try:
            if file_type == "json":
                if not _stored_file_exists(design.download):
                    return error_response("该设计没有可下载的JSON文件", status.HTTP_404_NOT_FOUND)
                file_obj = design.download.open("rb")
                filename = _build_download_filename(design.title, "json")
                content_type = "application/json"
                as_attachment = True
            elif file_type in {"image", "png"}:
                if not _stored_file_exists(design.image):
                    return error_response("该设计没有可下载的图片", status.HTTP_404_NOT_FOUND)
                file_obj = design.image.open("rb")
                extension, content_type = _image_download_metadata(design.image)
                filename = _build_download_filename(design.title, extension)
                as_attachment = False
            else:
                if not _stored_file_exists(design.image):
                    return error_response("该设计没有可用于导出的图片", status.HTTP_404_NOT_FOUND)
                generator = {
                    "pdf": _generate_design_pdf,
                    "report": _generate_design_report_pdf,
                    "zip": _generate_design_zip,
                }[file_type]
                relative_path = generator(design)
                file_obj = default_storage.open(relative_path, "rb")
                extension = "pdf" if file_type == "report" else file_type
                filename = _build_download_filename(design.title, extension)
                content_type = {
                    "pdf": "application/pdf",
                    "report": "application/pdf",
                    "zip": "application/zip",
                }[file_type]
                as_attachment = True
        except Exception:
            logger.exception("读取设计资源失败: design_id=%s, type=%s", design.id, file_type)
            return error_response("读取设计资源失败，请稍后重试", status.HTTP_500_INTERNAL_SERVER_ERROR)

        return FileResponse(
            file_obj,
            as_attachment=as_attachment,
            filename=filename,
            content_type=content_type,
        )


    @extend_schema(
        request=RouteValidationRequestSerializer,
        responses={200: RouteValidationResponseSerializer},
    )
    @action(detail=False, methods=["post"], url_path="validate-course")
    def validate_course(self, request):
        """校验当前路线并返回结构化规则检查结果。"""
        route_data, errors = _parse_route_request(request.data)
        if errors:
            return error_response(errors, status.HTTP_400_BAD_REQUEST)

        validator = RouteValidator(
            field_width=route_data['field_width'],
            field_height=route_data['field_height'],
        )
        try:
            validation = validator.validate_course_structure(
                route_data['obstacles'],
                route_data['difficulty'],
                path=route_data['path'] or {},
            )
            return Response(
                {
                    "success": True,
                    "message": "路线校验完成",
                    "data": validation,
                }
            )
        except (RouteValidationInputError, TypeError, ValueError, KeyError, OverflowError) as exc:
            return error_response(str(exc), status.HTTP_400_BAD_REQUEST)


    @extend_schema(
        request=RouteValidationRequestSerializer,
        responses={200: RouteFixResponseSerializer},
    )
    @action(detail=False, methods=["post"], url_path="fix-course")
    def fix_course(self, request):
        """自动修复当前路线中的可修复规则问题。"""
        route_data, errors = _parse_route_request(request.data)
        if errors:
            return error_response(errors, status.HTTP_400_BAD_REQUEST)

        validator = RouteValidator(
            field_width=route_data['field_width'],
            field_height=route_data['field_height'],
        )
        try:
            fixed = validator.fix_course_structure(
                route_data['obstacles'],
                route_data['difficulty'],
                path=route_data['path'] or {},
            )
            return Response(
                {
                    "success": True,
                    "message": "路线自动修复完成",
                    "data": fixed,
                }
            )
        except (RouteValidationInputError, TypeError, ValueError, KeyError, OverflowError) as exc:
            return error_response(str(exc), status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"], url_path="shared")
    def shared_designs(self, request):
        """获取所有公开分享的设计"""
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="my")
    def my_designs(self, request):
        """获取当前用户的所有设计"""
        queryset = Design.objects.filter(author=request.user).select_related('author')
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)



    @action(detail=True, methods=["get", "post"], url_path="comments")
    def list_comments(self, request, pk=None):
        """获取或创建设计评论。"""
        design, role = self._get_collaboration_context(pk)
        if design is None:
            return error_response("设计不存在或您无权访问", status.HTTP_404_NOT_FOUND)
        if request.method == "GET":
            serializer = DesignCommentSerializer(DesignComment.objects.filter(design=design), many=True)
            return Response(serializer.data)

        if role not in {"owner", "editor", "commenter"}:
            return error_response("当前协作角色无权发表评论", status.HTTP_403_FORBIDDEN)

        serializer = DesignCommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(design=design, user=request.user)
        CollaborationEvent.objects.create(
            design=design,
            user=request.user,
            event_type="comment_created",
            object_id=str(comment.id),
            payload={"content": comment.content, "obstacle_id": comment.obstacle_id},
        )
        return Response(DesignCommentSerializer(comment).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="comment_id",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.PATH,
            )
        ],
        operation_id="design_comment_resolve",
    )
    @action(detail=True, methods=["post"], url_path=r"comments/(?P<comment_id>[^/.]+)/resolve")
    def resolve_comment(self, request, pk=None, comment_id=None):
        """解决或取消解决设计评论。"""
        design, role = self._get_collaboration_context(pk)
        if design is None:
            return error_response("设计不存在或您无权访问", status.HTTP_404_NOT_FOUND)
        if role not in {"owner", "editor"}:
            return error_response("当前协作角色无权处理评论", status.HTTP_403_FORBIDDEN)
        try:
            comment = DesignComment.objects.get(id=comment_id, design=design)
        except DesignComment.DoesNotExist:
            return error_response("评论不存在", status.HTTP_404_NOT_FOUND)
        comment.is_resolved = not comment.is_resolved
        comment.save(update_fields=["is_resolved", "updated_at"])
        CollaborationEvent.objects.create(
            design=design,
            user=request.user,
            event_type="comment_resolved" if comment.is_resolved else "comment_unresolved",
            object_id=str(comment.id),
            payload={"is_resolved": comment.is_resolved},
        )
        return Response(DesignCommentSerializer(comment).data)

    @action(detail=True, methods=["get"], url_path="collaboration-events")
    def collaboration_events(self, request, pk=None):
        """获取设计协作活动时间线。"""
        design, role = self._get_collaboration_context(pk)
        if design is None:
            return error_response("设计不存在或您无权访问", status.HTTP_404_NOT_FOUND)
        user_id = request.query_params.get("user")
        events = CollaborationEvent.objects.filter(design=design).select_related("user")
        if user_id:
            try:
                user_id = int(user_id)
            except (TypeError, ValueError):
                return error_response(
                    {"user": ["必须是有效的用户 ID"]},
                    status.HTTP_400_BAD_REQUEST,
                )
            if user_id < 1:
                return error_response(
                    {"user": ["必须是有效的用户 ID"]},
                    status.HTTP_400_BAD_REQUEST,
                )
            events = events.filter(user_id=user_id)
        return Response(CollaborationEventSerializer(events, many=True).data)

    @extend_schema(
        operation_id="design_versions_list",
        request=None,
        responses={200: DesignVersionSerializer(many=True)},
    )
    @action(detail=True, methods=["get"], url_path="versions", pagination_class=None)
    def list_versions(self, request, pk=None):
        """获取设计版本列表。"""
        design, role = self._get_collaboration_context(pk)
        if design is None:
            return error_response("设计不存在或您无权访问", status.HTTP_404_NOT_FOUND)
        versions = DesignVersion.objects.filter(design=design)
        serializer = DesignVersionSerializer(versions, many=True)
        return Response(serializer.data)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="version_id",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.PATH,
            )
        ],
    )
    @extend_schema(
        methods=["GET"],
        request=None,
        responses={200: DesignVersionSerializer},
        operation_id="design_version_retrieve",
    )
    @extend_schema(
        methods=["PATCH"],
        request=DesignVersionUpdateSerializer,
        responses={200: DesignVersionSerializer},
        operation_id="design_version_update",
    )
    @action(detail=True, methods=["get", "patch"], url_path=r"versions/(?P<version_id>[^/.]+)")
    def retrieve_version(self, request, pk=None, version_id=None):
        """获取或更新设计版本详情。"""
        design, role = self._get_collaboration_context(pk)
        if design is None:
            return error_response("设计不存在或您无权访问", status.HTTP_404_NOT_FOUND)
        if request.method == "PATCH" and role not in {"owner", "editor"}:
            return error_response("当前协作角色无权修改版本", status.HTTP_403_FORBIDDEN)
        try:
            version = DesignVersion.objects.get(id=version_id, design=design)
        except DesignVersion.DoesNotExist:
            return error_response("版本不存在", status.HTTP_404_NOT_FOUND)

        if request.method == "PATCH":
            version_serializer = DesignVersionUpdateSerializer(data=request.data)
            if not version_serializer.is_valid():
                return error_response(version_serializer.errors, status.HTTP_400_BAD_REQUEST)
            update_data = version_serializer.validated_data
            if "title" in update_data:
                version.title = update_data["title"]
            if "remark" in update_data:
                version.remark = update_data["remark"]
            version.save(update_fields=["title", "remark"])

        return Response(DesignVersionSerializer(version).data)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="version_id",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.PATH,
            )
        ],
        request=None,
        responses={200: DesignResponseEnvelopeSerializer},
        operation_id="design_version_restore",
    )
    @action(detail=True, methods=["post"], url_path=r"versions/(?P<version_id>[^/.]+)/restore")
    def restore_version(self, request, pk=None, version_id=None):
        """恢复设计版本。"""
        design, role = self._get_collaboration_context(pk)
        if design is None:
            return error_response("设计不存在或您无权访问", status.HTTP_404_NOT_FOUND)
        if role not in {"owner", "editor"}:
            return error_response("当前协作角色无权恢复版本", status.HTTP_403_FORBIDDEN)
        try:
            version = DesignVersion.objects.get(id=version_id, design=design)
        except DesignVersion.DoesNotExist:
            return error_response("版本不存在", status.HTTP_404_NOT_FOUND)
        try:
            restore_design_version(design, version)
        except DesignVersionSnapshotError as exc:
            return error_response(str(exc), status.HTTP_409_CONFLICT)
        design.refresh_from_db()
        return Response(
            {
                "success": True,
                "message": "版本已恢复",
                "data": DesignSerializer(design, context={"request": request}).data,
            }
        )

    @extend_schema(
        request=None,
        responses={201: DesignSerializer},
        parameters=[
            OpenApiParameter(
                name="version_id",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.PATH,
            )
        ],
        operation_id="design_version_copy",
    )
    @action(detail=True, methods=["post"], url_path=r"versions/(?P<version_id>[^/.]+)/copy")
    def copy_version(self, request, pk=None, version_id=None):
        """复制设计版本为新设计。"""
        design, role = self._get_collaboration_context(pk)
        if design is None:
            return error_response("设计不存在或您无权访问", status.HTTP_404_NOT_FOUND)
        if role not in {"owner", "editor"}:
            return error_response("当前协作角色无权复制版本", status.HTTP_403_FORBIDDEN)
        try:
            version = DesignVersion.objects.get(id=version_id, design=design)
        except DesignVersion.DoesNotExist:
            return error_response("版本不存在", status.HTTP_404_NOT_FOUND)
        try:
            with transaction.atomic():
                assert_design_capacity(request.user)
                new_design = copy_design_version(version, author=request.user)
        except MembershipAccessError as exc:
            return error_response(exc.message, exc.status_code, exc.data)
        except DesignVersionSnapshotError as exc:
            return error_response(str(exc), status.HTTP_409_CONFLICT)
        return Response(DesignSerializer(new_design, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="like")
    def like_design(self, request, pk=None):
        """点赞设计"""
        # 锁定设计行，确保“检查—创建/删除—计数”在并发请求下保持一致。
        try:
            with transaction.atomic():
                design = Design.objects.select_for_update().get(pk=pk)
                if design.author != request.user and not design.is_shared:
                    return error_response(
                        "您无权点赞未共享的设计", status.HTTP_403_FORBIDDEN
                    )

                like = DesignLike.objects.filter(design=design, user=request.user).first()
                if like:
                    like.delete()
                    design.likes_count = max(0, design.likes_count - 1)
                    design.save(update_fields=["likes_count", "update_time"])
                    return success_response(
                        "取消点赞成功",
                        {"likes_count": design.likes_count, "is_liked": False},
                    )

                DesignLike.objects.create(design=design, user=request.user)
                design.likes_count += 1
                design.save(update_fields=["likes_count", "update_time"])
                return success_response(
                    "点赞成功", {"likes_count": design.likes_count, "is_liked": True}
                )
        except Design.DoesNotExist:
            return error_response("设计不存在", status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=["post"], url_path="share")
    def share_design(self, request, pk=None):
        """分享/取消分享设计"""
        design = self.get_object()
        if design.author_id != request.user.id:
            raise PermissionDenied("只有设计作者可以修改分享状态")

        # 切换分享状态
        design.is_shared = not design.is_shared
        design.save()

        return success_response("分享状态已更新", {"is_shared": design.is_shared})

    @action(detail=True, methods=["post"], url_path="toggle-share")
    def toggle_design_sharing(self, request, pk=None):
        """切换设计的分享状态"""
        design = self.get_object()
        if design.author_id != request.user.id:
            raise PermissionDenied("只有设计作者可以修改分享状态")

        # 切换分享状态
        design.is_shared = not design.is_shared
        design.save()

        return success_response(
            "设计已分享" if design.is_shared else "设计已取消分享",
            {"is_shared": design.is_shared},
        )

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="type",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                enum=SUPPORTED_DOWNLOAD_TYPES,
                required=False,
            )
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(
        detail=True,
        methods=["get"],
        url_path="download",
        throttle_classes=[ExportRateThrottle],
    )
    def download_design(self, request, pk=None):
        """下载设计并增加下载计数"""
        try:
            # 获取下载类型参数，默认为json
            file_type = request.query_params.get("type", "json").strip().lower()
            if file_type not in SUPPORTED_DOWNLOAD_TYPES:
                return error_response(
                    "不支持的文件类型，支持的类型有：image, json, png, pdf, report, zip",
                    status.HTTP_400_BAD_REQUEST,
                )

            design = self._get_authorized_design(pk, allow_public=True)
            if design is None:
                return error_response(
                    "设计不存在或您无权下载", status.HTTP_404_NOT_FOUND
                )

            # 根据文件类型返回不同的下载URL
            if file_type == "json":
                if not _stored_file_exists(design.download):
                    return error_response(
                        "该设计没有可下载的JSON文件", status.HTTP_404_NOT_FOUND
                    )
                download_url = request.build_absolute_uri(
                    f"{reverse('design-asset', kwargs={'pk': design.pk})}?type=json"
                )
            elif file_type in {"image", "png"}:
                if not _stored_file_exists(design.image):
                    return error_response("该设计没有可下载的图片", status.HTTP_404_NOT_FOUND)
                download_url = request.build_absolute_uri(
                    f"{reverse('design-asset', kwargs={'pk': design.pk})}?type={file_type}"
                )
            elif file_type == "pdf":
                if not _stored_file_exists(design.image):
                    return error_response(
                        "该设计没有可用于生成PDF的图片",
                        status.HTTP_404_NOT_FOUND,
                    )

                try:
                    relative_pdf_path = _generate_design_pdf(design)
                except Exception:
                    logger.exception("生成设计PDF失败: ID=%s", design.id)
                    return error_response(
                        "PDF生成失败，请稍后重试",
                        status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )

                download_url = request.build_absolute_uri(
                    f"{reverse('design-asset', kwargs={'pk': design.pk})}?type=pdf"
                )
            elif file_type == "report":
                if not _stored_file_exists(design.image):
                    return error_response(
                        "该设计没有可用于生成报告的图片",
                        status.HTTP_404_NOT_FOUND,
                    )
                try:
                    relative_report_path = _generate_design_report_pdf(design)
                except Exception:
                    logger.exception("生成设计报告失败: ID=%s", design.id)
                    return error_response(
                        "报告生成失败，请稍后重试",
                        status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
                download_url = request.build_absolute_uri(
                    f"{reverse('design-asset', kwargs={'pk': design.pk})}?type=report"
                )
            elif file_type == "zip":
                if not _stored_file_exists(design.image):
                    return error_response(
                        "该设计没有可用于批量导出的图片",
                        status.HTTP_404_NOT_FOUND,
                    )
                try:
                    relative_zip_path = _generate_design_zip(design)
                except Exception:
                    logger.exception("生成设计ZIP失败: ID=%s", design.id)
                    return error_response(
                        "批量导出失败，请稍后重试",
                        status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
                download_url = request.build_absolute_uri(
                    f"{reverse('design-asset', kwargs={'pk': design.pk})}?type=zip"
                )
            if file_type in {"image", "png"}:
                extension, _ = _image_download_metadata(design.image)
            else:
                extension = "pdf" if file_type == "report" else file_type
            filename = _build_download_filename(design.title, extension)

            # 文件准备成功后再增加下载计数
            Design.objects.filter(pk=pk).update(
                downloads_count=F("downloads_count") + 1
            )
            design.refresh_from_db()

            # 返回下载URL和文件名
            return success_response(
                "下载成功",
                {
                    "download_url": download_url,
                    "filename": filename,
                    "file_type": file_type,
                    "downloads_count": design.downloads_count,
                },
            )

        except Design.DoesNotExist:
            return error_response("设计不存在", status.HTTP_404_NOT_FOUND)

    def create(self, request, *args, **kwargs):
        """创建设计前检查存储限制"""
        user = request.user

        try:
            with transaction.atomic():
                UserProfile.objects.select_for_update().get_or_create(user=user)
                assert_design_capacity(user)
                return super().create(request, *args, **kwargs)
        except MembershipAccessError as exc:
            return error_response(exc.message, exc.status_code, exc.data)
