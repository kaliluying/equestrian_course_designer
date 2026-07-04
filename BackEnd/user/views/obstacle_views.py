"""自定义障碍物管理视图。"""

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import CustomObstacle
from ..serializers import CustomObstacleSerializer
from ..services.membership_access import (
    MembershipAccessError,
    assert_custom_obstacle_capacity,
    get_entitlements,
)


class StandardResultsSetPagination(PageNumberPagination):
    """标准分页器"""

    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100


class CustomObstacleViewSet(viewsets.ModelViewSet):
    """
    自定义障碍物视图集
    提供自定义障碍物的CRUD操作
    支持分页、搜索和排序
    """

    queryset = CustomObstacle.objects.all()
    serializer_class = CustomObstacleSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        """
        获取当前用户的自定义障碍物
        支持搜索和排序
        """
        user = self.request.user
        queryset = CustomObstacle.objects.filter(user=user)

        # 支持搜索（按名称）
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)

        # 支持排序
        ordering = self.request.query_params.get("ordering", "-created_at")
        # 验证排序字段，防止SQL注入
        valid_ordering_fields = [
            "created_at",
            "-created_at",
            "updated_at",
            "-updated_at",
            "name",
            "-name",
        ]
        if ordering in valid_ordering_fields:
            queryset = queryset.order_by(ordering)
        else:
            queryset = queryset.order_by("-created_at")

        return queryset

    def perform_create(self, serializer):
        """创建自定义障碍物时，自动关联当前用户"""
        try:
            assert_custom_obstacle_capacity(self.request.user)
        except MembershipAccessError as exc:
            raise ValidationError(exc.message)
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        """更新自定义障碍物"""
        instance = self.get_object()
        # 确保用户只能更新自己的障碍物
        if instance.user != self.request.user:
            raise PermissionDenied("您无权修改此障碍物")
        serializer.save()

    def perform_destroy(self, instance):
        """删除自定义障碍物"""
        # 确保用户只能删除自己的障碍物
        if instance.user != self.request.user:
            raise PermissionDenied("您无权删除此障碍物")
        instance.delete()

    @action(detail=False, methods=["get"], url_path="count")
    def get_obstacle_count(self, request):
        """获取用户自定义障碍物数量和限制"""
        user = request.user
        snapshot = get_entitlements(user)

        return Response(
            {
                "count": snapshot.custom_obstacle_count,
                "max_count": snapshot.custom_obstacle_limit,
                "is_unlimited": snapshot.custom_obstacle_unlimited,
                "is_premium": snapshot.is_premium_active,
                "plan_code": snapshot.plan_code,
            }
        )

    @action(detail=False, methods=["get"], url_path="shared")
    def get_shared_obstacles(self, request):
        """
        获取其他用户共享的障碍物
        支持分页、搜索和排序
        """
        # 获取所有标记为共享的障碍物，排除当前用户的
        shared_obstacles = CustomObstacle.objects.filter(is_shared=True).exclude(
            user=request.user
        )

        # 支持搜索（按名称）
        search = request.query_params.get("search")
        if search:
            shared_obstacles = shared_obstacles.filter(name__icontains=search)

        # 支持排序
        ordering = request.query_params.get("ordering", "-created_at")
        # 验证排序字段，防止SQL注入
        valid_ordering_fields = [
            "created_at",
            "-created_at",
            "updated_at",
            "-updated_at",
            "name",
            "-name",
        ]
        if ordering in valid_ordering_fields:
            shared_obstacles = shared_obstacles.order_by(ordering)
        else:
            shared_obstacles = shared_obstacles.order_by("-created_at")

        # 分页
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(shared_obstacles, request)

        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = self.get_serializer(shared_obstacles, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="toggle-share")
    def toggle_share(self, request, pk=None):
        """切换障碍物的共享状态"""
        obstacle = self.get_object()

        # 确保用户只能操作自己的障碍物
        if obstacle.user != request.user:
            raise PermissionDenied("您无权修改此障碍物的共享状态")

        # 切换共享状态
        obstacle.is_shared = not obstacle.is_shared
        obstacle.save()

        return Response(
            {"id": obstacle.id, "name": obstacle.name, "is_shared": obstacle.is_shared}
        )
