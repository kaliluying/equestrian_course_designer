"""
障碍物API错误处理工具
用于生成与前端兼容的错误响应格式
"""
from enum import Enum
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone


class ErrorCode(str, Enum):
    """错误代码枚举，与前端保持一致"""
    # 通用错误
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
    NETWORK_ERROR = 'NETWORK_ERROR'
    VALIDATION_ERROR = 'VALIDATION_ERROR'
    SERVER_ERROR = 'SERVER_ERROR'
    UNAUTHORIZED = 'UNAUTHORIZED'
    FORBIDDEN = 'FORBIDDEN'

    # 障碍物相关错误
    OBSTACLE_NAME_EXISTS = 'OBSTACLE_NAME_EXISTS'
    OBSTACLE_NOT_FOUND = 'OBSTACLE_NOT_FOUND'
    OBSTACLE_LIMIT_REACHED = 'OBSTACLE_LIMIT_REACHED'
    OBSTACLE_DATA_INVALID = 'OBSTACLE_DATA_INVALID'
    LOAD_OBSTACLE_FAILED = 'LOAD_OBSTACLE_FAILED'
    SAVE_OBSTACLE_FAILED = 'SAVE_OBSTACLE_FAILED'
    DELETE_OBSTACLE_FAILED = 'DELETE_OBSTACLE_FAILED'
    LOAD_SHARED_OBSTACLE_FAILED = 'LOAD_SHARED_OBSTACLE_FAILED'
    TOGGLE_SHARING_FAILED = 'TOGGLE_SHARING_FAILED'

    # 用户相关错误
    USER_NOT_LOGGED_IN = 'USER_NOT_LOGGED_IN'
    USER_LIMIT_EXCEEDED = 'USER_LIMIT_EXCEEDED'

    # 权限相关错误
    PREMIUM_REQUIRED = 'PREMIUM_REQUIRED'


class ErrorSeverity(str, Enum):
    """错误严重程度枚举，与前端保持一致"""
    INFO = 'info'      # 提示性错误，不影响主要功能
    WARNING = 'warning'  # 警告性错误，可能影响部分功能
    ERROR = 'error'     # 严重错误，影响主要功能
    FATAL = 'fatal'     # 致命错误，完全无法使用


def create_error_response(
    code: ErrorCode,
    message: str,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    details: str = None,
    solutions: list = None,
    field: str = None
) -> Response:
    """
    创建标准错误响应对象，与前端错误处理兼容

    参数:
        code: 错误代码
        message: 用户友好的错误消息
        severity: 错误严重程度
        status_code: HTTP状态码
        details: 详细错误信息
        solutions: 可能的解决方案列表
        field: 出错的字段名

    返回:
        DRF Response对象，包含标准错误结构
    """
    error_data = {
        'code': code,
        'message': message,
        'severity': severity,
        'timestamp': int(timezone.now().timestamp() * 1000)
    }

    # 添加可选字段
    if details:
        error_data['details'] = details
    if solutions:
        error_data['solutions'] = solutions
    if field:
        error_data['field'] = field

    return Response(error_data, status=status_code)


# 常见错误的快捷函数

def name_exists_error(name: str) -> Response:
    """障碍物名称已存在错误"""
    return create_error_response(
        code=ErrorCode.OBSTACLE_NAME_EXISTS,
        message=f'障碍物名称"{name}"已存在，请使用其他名称',
        severity=ErrorSeverity.WARNING,
        field='name',
        solutions=['使用一个不同的、唯一的障碍物名称']
    )


def obstacle_not_found_error(obstacle_id: str) -> Response:
    """障碍物不存在错误"""
    return create_error_response(
        code=ErrorCode.OBSTACLE_NOT_FOUND,
        message=f'障碍物(ID: {obstacle_id})不存在或已被删除',
        severity=ErrorSeverity.WARNING,
        status_code=status.HTTP_404_NOT_FOUND
    )


def premium_required_error() -> Response:
    """需要会员错误"""
    return create_error_response(
        code=ErrorCode.PREMIUM_REQUIRED,
        message='此功能需要会员资格',
        severity=ErrorSeverity.WARNING,
        status_code=status.HTTP_403_FORBIDDEN,
        solutions=['升级为高级会员以使用此功能']
    )


def user_limit_exceeded_error(limit: int) -> Response:
    """用户数量限制错误"""
    return create_error_response(
        code=ErrorCode.USER_LIMIT_EXCEEDED,
        message=f'普通用户最多创建{limit}个自定义障碍，请升级会员享受无限创建特权',
        severity=ErrorSeverity.WARNING,
        solutions=[
            '删除一些不需要的障碍物以释放空间',
            '升级为会员，享受无限创建特权'
        ]
    )


def validation_error(errors: dict) -> Response:
    """验证错误，处理DRF验证错误字典"""
    # 获取第一个错误字段及错误消息
    field = next(iter(errors))
    message = errors[field][0] if isinstance(
        errors[field], list) else str(errors[field])

    return create_error_response(
        code=ErrorCode.VALIDATION_ERROR,
        message=f'{field}: {message}',
        severity=ErrorSeverity.WARNING,
        field=field,
        details=str(errors)
    )


def unauthorized_error() -> Response:
    """未授权错误"""
    return create_error_response(
        code=ErrorCode.UNAUTHORIZED,
        message='请先登录后再操作',
        severity=ErrorSeverity.WARNING,
        status_code=status.HTTP_401_UNAUTHORIZED
    )


def forbidden_error() -> Response:
    """禁止访问错误"""
    return create_error_response(
        code=ErrorCode.FORBIDDEN,
        message='您没有权限执行此操作',
        severity=ErrorSeverity.WARNING,
        status_code=status.HTTP_403_FORBIDDEN
    )


def server_error(details: str = None) -> Response:
    """服务器错误"""
    return create_error_response(
        code=ErrorCode.SERVER_ERROR,
        message='服务器错误，请稍后再试',
        severity=ErrorSeverity.ERROR,
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        details=details
    )
