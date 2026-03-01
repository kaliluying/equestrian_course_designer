from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import F
from django.db import transaction
import logging
import json
import re
import random
import time

from .models import AIGenerationQuota, AIGenerationHistory, MembershipOrder
from .llm_providers import get_llm_provider
from .route_generator import RouteGenerator, RouteConfig

logger = logging.getLogger(__name__)

# 价格配置
AI_QUOTA_PRICES = {
    10: 9.90,
    30: 24.90,
    100: 69.90
}

# 配置常量
MAX_PROMPT_LENGTH = 500
MAX_LIMIT = 100
VALID_DIFFICULTIES = {'easy', 'medium', 'hard'}


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def generate_route(request):
    """AI 生成路线"""
    # 1. 获取用户资料和配额（使用 select_for_update 锁定行）
    profile = request.user.userprofile

    try:
        quota = AIGenerationQuota.objects.select_for_update().get(user_profile=profile)
    except AIGenerationQuota.DoesNotExist:
        quota = AIGenerationQuota.objects.create(
            user_profile=profile,
            free_quota=3
        )

    # 2. 检查配额
    if quota.remaining_quota <= 0:
        return Response({
            'code': status.HTTP_403_FORBIDDEN,
            'message': '配额不足，请购买后再试'
        })

    # 3. 获取用户输入并验证
    prompt = request.data.get('prompt', '')[:MAX_PROMPT_LENGTH]
    config_data = request.data.get('config', {}) or {}

    if not prompt or not prompt.strip():
        return Response({
            'code': status.HTTP_400_BAD_REQUEST,
            'message': '请输入设计需求描述'
        })

    # 4. 创建历史记录
    history = AIGenerationHistory.objects.create(
        user_profile=profile,
        prompt=prompt,
        status='pending'
    )

    try:
        # 5. 调用 LLM 解析意图
        provider = get_llm_provider()
        system_prompt = """你是一个马术障碍赛路线设计助手。
根据用户的描述，提取以下参数并以JSON格式返回：
{
    "obstacle_count": 数字(8-15),
    "difficulty": "easy"或"medium"或"hard",
    "field_width": 数字(默认90),
    "field_height": 数字(默认60),
    "include_combinations": true或false
}
只返回JSON，不要其他内容。"""

        llm_response = provider.generate(prompt, system_prompt=system_prompt)

        # 解析LLM返回的参数
        try:
            json_match = re.search(r'\{.*\}', llm_response.content, re.DOTALL)
            if json_match:
                params = json.loads(json_match.group())
            else:
                params = {}
        except (json.JSONDecodeError, AttributeError):
            params = {}

        # 6. 合并用户配置和LLM解析结果，并验证参数范围
        route_config = RouteConfig(
            field_width=min(max(params.get('field_width', 90), 30), 150),
            field_height=min(max(params.get('field_height', 60), 30), 150),
            obstacle_count=min(max(params.get('obstacle_count', 12), 8), 20),
            difficulty=params.get('difficulty', 'medium') if params.get('difficulty') in VALID_DIFFICULTIES else 'medium',
            include_combinations=params.get('include_combinations', True)
        )

        # 7. 调用规则引擎生成路线
        generator = RouteGenerator()
        result = generator.generate(route_config)

        # 8. 更新历史记录
        history.result = result
        history.token_used = llm_response.token_used
        history.status = 'success'
        history.save()

        # 9. 原子扣减配额
        quota.used_quota = F('used_quota') + 1
        quota.save()
        quota.refresh_from_db()

        # 10. 返回结果
        return Response({
            'code': status.HTTP_200_OK,
            'message': '生成成功',
            'data': {
                'history_id': history.id,
                'obstacles': result['obstacles'],
                'path': result['path'],
                'difficulty_score': result['difficulty_score'],
                'estimated_time': result['estimated_time'],
                'explanation': result['explanation'],
                'teaching_notes': result['teaching_notes'],
                'remaining_quota': quota.remaining_quota
            }
        })

    except Exception as e:
        logger.error(f"AI生成失败: {str(e)}", exc_info=True)
        history.status = 'failed'
        history.error_message = '生成失败，请稍后重试'
        history.save()

        return Response({
            'code': status.HTTP_500_INTERNAL_SERVER_ERROR,
            'message': '生成失败，请稍后重试'
        })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_ai_quota(request):
    """获取 AI 配额信息"""
    profile = request.user.userprofile
    quota, _ = AIGenerationQuota.objects.get_or_create(user_profile=profile)

    return Response({
        'code': status.HTTP_200_OK,
        'data': {
            'free_quota': quota.free_quota,
            'purchased_quota': quota.purchased_quota,
            'used_quota': quota.used_quota,
            'remaining_quota': quota.remaining_quota
        }
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def purchase_ai_quota(request):
    """购买 AI 配额"""
    quota_amount = request.data.get('quota', 10)

    # 验证配额数量
    try:
        quota_amount = int(quota_amount)
        if quota_amount <= 0 or quota_amount > 1000:
            raise ValueError("Invalid quota amount")
    except (ValueError, TypeError):
        return Response({
            'code': status.HTTP_400_BAD_REQUEST,
            'message': '购买数量无效'
        })

    price = AI_QUOTA_PRICES.get(quota_amount, quota_amount * 1.0)

    # 创建订单
    order = MembershipOrder.objects.create(
        user=request.user,
        order_id=f"AI{int(time.time())}{random.randint(1000,9999)}",
        membership_plan=None,
        amount=price,
        payment_channel='alipay',
        status='pending',
        billing_cycle='one_time',
        note=f"AI生成次数 x {quota_amount}"
    )

    return Response({
        'code': status.HTTP_200_OK,
        'message': '订单创建成功',
        'data': {
            'order_id': order.order_id,
            'amount': str(price),
            'quota_count': quota_amount
        }
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_ai_history(request):
    """获取 AI 生成历史"""
    profile = request.user.userprofile
    limit = request.query_params.get('limit', 20)

    try:
        limit = min(int(limit), MAX_LIMIT)
    except (ValueError, TypeError):
        limit = 20

    histories = AIGenerationHistory.objects.filter(
        user_profile=profile
    ).order_by('-created_at')[:limit]

    return Response({
        'code': status.HTTP_200_OK,
        'data': {
            'histories': [
                {
                    'id': h.id,
                    'prompt': h.prompt,
                    'status': h.status,
                    'token_used': h.token_used,
                    'created_at': h.created_at.isoformat() if h.created_at else None
                }
                for h in histories
            ]
        }
    })
