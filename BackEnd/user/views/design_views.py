"""设计管理视图：设计的CRUD、点赞、分享、下载。"""

import logging
from io import BytesIO

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db.models import F
from django.utils.text import get_valid_filename
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response
from PIL import Image

from ..models import (
    Design,
    DesignLike,
    UserProfile,
)
from ..serializers import (
    DesignSerializer,
    DesignListSerializer,
)
from ..utils import get_absolute_media_url, success_response, error_response
from ..route_validator import RouteValidator
from .user_views import check_and_update_membership
from ..services.membership_access import MembershipAccessError, assert_design_capacity

logger = logging.getLogger(__name__)

SUPPORTED_DOWNLOAD_TYPES = ("json", "png", "pdf")


def _stored_file_exists(field_file):
    """校验文件字段有值且存储中实际存在该文件。"""
    if not field_file:
        return False
    return field_file.storage.exists(field_file.name)


def _build_download_filename(title, file_type):
    """生成浏览器下载文件名，避免标题中的路径字符污染文件名。"""
    filename = get_valid_filename(f"{title}.{file_type}")
    return filename or f"design.{file_type}"


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
        # 默认只返回当前用户的设计
        return Design.objects.filter(author=self.request.user).select_related('author')

    def perform_create(self, serializer):
        """保存时自动设置作者为当前用户"""
        serializer.save(author=self.request.user)

    def perform_update(self, serializer):
        """更新设计时保留原作者"""
        # 获取原设计对象
        instance = self.get_object()
        logger.info(
            "更新设计: ID=%s, 标题=%s, 作者=%s",
            instance.id,
            instance.title,
            instance.author,
        )

        # 确保更新时保留原作者
        try:
            serializer.save(author=instance.author)
            logger.info("设计更新成功: ID=%s", instance.id)
        except Exception as e:
            logger.exception("设计更新失败: ID=%s", instance.id)
            raise


    @action(detail=False, methods=["post"], url_path="validate-course")
    def validate_course(self, request):
        """校验当前路线并返回结构化规则检查结果。"""
        obstacles = request.data.get("obstacles") or []
        field_width = float(request.data.get("field_width") or request.data.get("fieldWidth") or 90)
        field_height = float(request.data.get("field_height") or request.data.get("fieldHeight") or 60)
        difficulty = request.data.get("difficulty") or "medium"

        validator = RouteValidator(field_width=field_width, field_height=field_height)
        return Response(validator.validate_course_structure(obstacles, difficulty))

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

    @action(detail=True, methods=["post"], url_path="like")
    def like_design(self, request, pk=None):
        """点赞设计"""
        # 直接获取设计，不使用self.get_object()，允许点赞任何共享的设计
        try:
            # 先尝试获取指定ID的设计，不考虑作者限制
            design = Design.objects.get(pk=pk)

            # 如果不是自己的设计，检查是否已共享
            if design.author != request.user and not design.is_shared:
                return error_response(
                    "您无权点赞未共享的设计", status.HTTP_403_FORBIDDEN
                )

            user = request.user

            # 检查是否已点赞
            like_exists = DesignLike.objects.filter(design=design, user=user).exists()

            if like_exists:
                # 如果已点赞，则取消点赞
                DesignLike.objects.filter(design=design, user=user).delete()
                # 减少点赞数
                Design.objects.filter(pk=pk).update(likes_count=F("likes_count") - 1)
                design.refresh_from_db()
                return success_response(
                    "取消点赞成功",
                    {"likes_count": design.likes_count, "is_liked": False},
                )
            else:
                # 如果未点赞，则添加点赞
                DesignLike.objects.create(design=design, user=user)
                # 增加点赞数
                Design.objects.filter(pk=pk).update(likes_count=F("likes_count") + 1)
                design.refresh_from_db()
                return success_response(
                    "点赞成功", {"likes_count": design.likes_count, "is_liked": True}
                )
        except Design.DoesNotExist:
            return error_response("设计不存在", status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=["post"], url_path="share")
    def share_design(self, request, pk=None):
        """分享/取消分享设计"""
        design = self.get_object()

        # 切换分享状态
        design.is_shared = not design.is_shared
        design.save()

        return success_response("分享状态已更新", {"is_shared": design.is_shared})

    @action(detail=True, methods=["post"], url_path="toggle-share")
    def toggle_design_sharing(self, request, pk=None):
        """切换设计的分享状态"""
        design = self.get_object()

        # 切换分享状态
        design.is_shared = not design.is_shared
        design.save()

        return success_response(
            "设计已分享" if design.is_shared else "设计已取消分享",
            {"is_shared": design.is_shared},
        )

    @action(detail=True, methods=["get"], url_path="download")
    def download_design(self, request, pk=None):
        """下载设计并增加下载计数"""
        try:
            # 获取下载类型参数，默认为json
            file_type = request.query_params.get("type", "json").strip().lower()
            if file_type not in SUPPORTED_DOWNLOAD_TYPES:
                return error_response(
                    "不支持的文件类型，支持的类型有：json, png, pdf",
                    status.HTTP_400_BAD_REQUEST,
                )

            # 直接获取设计，不使用self.get_object()，允许下载任何共享的设计
            design = Design.objects.get(pk=pk)

            # 如果不是自己的设计，检查是否已共享
            if design.author != request.user and not design.is_shared:
                return error_response(
                    "您无权下载未共享的设计", status.HTTP_403_FORBIDDEN
                )

            # 根据文件类型返回不同的下载URL
            if file_type == "json":
                if not _stored_file_exists(design.download):
                    return error_response(
                        "该设计没有可下载的JSON文件", status.HTTP_404_NOT_FOUND
                    )
                download_url = get_absolute_media_url(design.download.url)
            elif file_type == "png":
                if not _stored_file_exists(design.image):
                    return error_response(
                        "该设计没有可下载的PNG图片", status.HTTP_404_NOT_FOUND
                    )
                download_url = get_absolute_media_url(design.image.url)
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

                download_url = get_absolute_media_url(
                    default_storage.url(relative_pdf_path)
                )
            filename = _build_download_filename(design.title, file_type)

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
            assert_design_capacity(user)
        except MembershipAccessError as exc:
            return error_response(exc.message, exc.status_code, exc.data)

        # 继续正常的创建流程
        return super().create(request, *args, **kwargs)
