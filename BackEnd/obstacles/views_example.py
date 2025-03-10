"""
示例视图，展示如何使用统一的错误处理
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.db import IntegrityError

from .models import CustomObstacle  # 假设存在此模型
from .serializers import ObstacleSerializer  # 假设存在此序列化器
from .utils import (
    ErrorCode, ErrorSeverity, create_error_response,
    name_exists_error, obstacle_not_found_error, premium_required_error,
    user_limit_exceeded_error, validation_error, unauthorized_error
)


class ObstacleDetailView(APIView):
    """
    障碍物详情视图 - 示例如何使用统一错误处理
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, obstacle_id):
        """获取单个障碍物"""
        try:
            # 尝试获取障碍物
            obstacle = CustomObstacle.objects.filter(id=obstacle_id).first()

            # 检查障碍物是否存在
            if not obstacle:
                return obstacle_not_found_error(obstacle_id)

            # 检查用户是否有权限访问
            if obstacle.user != request.user and not obstacle.is_shared:
                return create_error_response(
                    code=ErrorCode.FORBIDDEN,
                    message="您无权访问此障碍物",
                    severity=ErrorSeverity.WARNING,
                    status_code=status.HTTP_403_FORBIDDEN
                )

            # 正常返回数据
            serializer = ObstacleSerializer(obstacle)
            return Response(serializer.data)

        except Exception as e:
            # 处理未知错误
            return create_error_response(
                code=ErrorCode.UNKNOWN_ERROR,
                message="获取障碍物时发生错误",
                severity=ErrorSeverity.ERROR,
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                details=str(e)
            )

    def put(self, request, obstacle_id):
        """更新障碍物 - 示例错误处理"""
        try:
            # 获取障碍物
            obstacle = CustomObstacle.objects.filter(id=obstacle_id).first()

            # 检查障碍物是否存在
            if not obstacle:
                return obstacle_not_found_error(obstacle_id)

            # 检查权限
            if obstacle.user != request.user:
                return create_error_response(
                    code=ErrorCode.FORBIDDEN,
                    message="您无权修改此障碍物",
                    severity=ErrorSeverity.WARNING,
                    status_code=status.HTTP_403_FORBIDDEN
                )

            # 验证数据
            serializer = ObstacleSerializer(
                obstacle, data=request.data, partial=True)
            if not serializer.is_valid():
                return validation_error(serializer.errors)

            # 保存数据
            serializer.save()
            return Response(serializer.data)

        except IntegrityError as e:
            # 处理名称重复等完整性错误
            if 'unique constraint' in str(e).lower() and 'name' in str(e).lower():
                return name_exists_error(request.data.get('name', ''))
            return create_error_response(
                code=ErrorCode.SAVE_OBSTACLE_FAILED,
                message="保存障碍物失败，请重试",
                severity=ErrorSeverity.ERROR,
                details=str(e)
            )
        except Exception as e:
            # 处理其他未知错误
            return create_error_response(
                code=ErrorCode.UNKNOWN_ERROR,
                message="更新障碍物时发生错误",
                severity=ErrorSeverity.ERROR,
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                details=str(e)
            )


class ObstacleListView(APIView):
    """障碍物列表视图 - 示例创建时的错误处理"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """创建障碍物"""
        try:
            # 检查用户的障碍物数量上限
            obstacle_count = CustomObstacle.objects.filter(
                user=request.user).count()

            # 非会员用户限制为10个
            if not request.user.is_premium_active and obstacle_count >= 10:
                return user_limit_exceeded_error(10)

            # 验证数据
            serializer = ObstacleSerializer(data=request.data)
            if not serializer.is_valid():
                return validation_error(serializer.errors)

            # 保存数据，设置用户
            obstacle = serializer.save(user=request.user)
            return Response(
                ObstacleSerializer(obstacle).data,
                status=status.HTTP_201_CREATED
            )

        except IntegrityError as e:
            # 处理名称重复等完整性错误
            if 'unique constraint' in str(e).lower() and 'name' in str(e).lower():
                return name_exists_error(request.data.get('name', ''))
            return create_error_response(
                code=ErrorCode.SAVE_OBSTACLE_FAILED,
                message="保存障碍物失败，请重试",
                severity=ErrorSeverity.ERROR,
                details=str(e)
            )
        except Exception as e:
            # 处理其他未知错误
            return create_error_response(
                code=ErrorCode.UNKNOWN_ERROR,
                message="创建障碍物时发生错误",
                severity=ErrorSeverity.ERROR,
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                details=str(e)
            )
