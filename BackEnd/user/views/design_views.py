"""设计管理视图：设计的CRUD、点赞、分享、下载。"""

import logging

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from django.db.models import F

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
from .user_views import check_and_update_membership

logger = logging.getLogger(__name__)


class DesignViewSet(viewsets.ModelViewSet):
    """设计视图集"""

    queryset = Design.objects.all()
    serializer_class = DesignSerializer
    parser_classes = (MultiPartParser, FormParser)

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
            file_type = request.query_params.get("type", "json").lower()
            if file_type not in ["json", "png", "pdf"]:
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

            # 检查是否有下载文件
            if not design.download and file_type == "json":
                return error_response(
                    "该设计没有可下载的JSON文件", status.HTTP_404_NOT_FOUND
                )

            # 检查是否有图片文件
            if not design.image and file_type == "png":
                return error_response(
                    "该设计没有可下载的PNG图片", status.HTTP_404_NOT_FOUND
                )

            # 增加下载计数
            Design.objects.filter(pk=pk).update(
                downloads_count=F("downloads_count") + 1
            )
            design.refresh_from_db()

            # 根据文件类型返回不同的下载URL
            if file_type == "json":
                download_url = get_absolute_media_url(design.download.url)
                filename = f"{design.title}.json"
            elif file_type == "png":
                download_url = get_absolute_media_url(design.image.url)
                filename = f"{design.title}.png"
            elif file_type == "pdf":
                # 这里需要实现PDF生成逻辑，暂时返回错误
                return error_response(
                    "PDF下载功能正在开发中，敬请期待", status.HTTP_501_NOT_IMPLEMENTED
                )

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

        check_and_update_membership(user)

        try:
            profile = user.profile
        except UserProfile.DoesNotExist:
            profile = UserProfile.objects.create(user=user)

        # 获取用户的设计数量
        user_designs_count = Design.objects.filter(author=user).count()

        # 检查是否超出存储限制
        storage_limit = profile.get_storage_limit()
        if user_designs_count >= storage_limit:
            return error_response(
                f"您已达到存储限制（{storage_limit}个设计）。升级为会员可获得更多存储空间！",
                status.HTTP_403_FORBIDDEN,
                {
                    "is_limit_reached": True,
                    "current_count": user_designs_count,
                    "limit": storage_limit,
                    "is_premium": profile.is_premium,
                    "is_premium_active": profile.is_premium_active(),
                },
            )

        # 继续正常的创建流程
        return super().create(request, *args, **kwargs)
