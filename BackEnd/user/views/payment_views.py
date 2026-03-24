"""支付相关视图：订单创建、支付宝回调、会员状态更新。"""

import logging
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from django.views.generic import TemplateView
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.db.models import F

from ..models import (
    MembershipPlan,
    MembershipOrder,
    UserProfile,
    AIGenerationQuota,
)
from ..serializers import (
    MembershipOrderSerializer,
    CreateMembershipOrderSerializer,
)
from ..utils import (
    create_alipay_order,
    verify_alipay_callback,
    query_alipay_order,
    success_response,
    error_response,
)
from .obstacle_views import StandardResultsSetPagination

logger = logging.getLogger(__name__)

# AI 配额金额映射（与 ai_views.py 中的价格保持一致）
AI_QUOTA_AMOUNT_MAP = {
    Decimal("9.90"): 10,
    Decimal("24.90"): 30,
    Decimal("69.90"): 100,
}


def _resolve_ai_quota_amount(order_amount):
    """
    根据订单金额推断 AI 配额数量。
    规则：
    1. 命中标准套餐价时返回对应套餐次数；
    2. 否则按 1 元=1 次向下取整，至少 1 次。
    """
    if order_amount is None:
        return 1

    normalized = Decimal(order_amount).quantize(Decimal("0.01"))
    if normalized in AI_QUOTA_AMOUNT_MAP:
        return AI_QUOTA_AMOUNT_MAP[normalized]

    return max(1, int(normalized))


def settle_paid_order(order):
    """
    订单支付成功后的统一落账入口：
    - 会员订单：更新会员状态
    - AI 配额订单（membership_plan=None）：增加 AI 可用次数
    """
    if order.membership_plan is None:
        quota_amount = _resolve_ai_quota_amount(order.amount)
        profile = order.user.profile
        quota, _ = AIGenerationQuota.objects.get_or_create(user_profile=profile)
        quota.purchased_quota = F("purchased_quota") + quota_amount
        quota.save(update_fields=["purchased_quota"])
        logger.info(
            "AI 配额订单落账成功: order_id=%s, user=%s, quota=+%s",
            order.order_id,
            order.user.username,
            quota_amount,
        )
        return

    update_user_membership(order.user, order)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_membership_order(request):
    """创建会员订单并返回支付链接"""
    serializer = CreateMembershipOrderSerializer(data=request.data)
    if serializer.is_valid():
        # 获取会员计划
        plan = MembershipPlan.objects.get(id=serializer.validated_data["plan_id"])
        # 获取用户
        user = request.user

        # 创建订单
        order = MembershipOrder(
            user=user,
            membership_plan=plan,
            amount=serializer.validated_data["amount"],
            billing_cycle=serializer.validated_data["billing_cycle"],
            payment_channel="alipay",
            status="pending",
        )
        order.save()

        # 创建支付链接
        subject = f"{order.get_billing_cycle_display()}-{plan.name}"
        # 生成支付宝订单
        try:
            pay_url = create_alipay_order(
                order_id=order.order_id,
                subject=subject,
                total_amount=float(order.amount),
            )
            # 保存支付链接
            order.payment_url = pay_url
            order.save()

            # 返回订单信息和支付链接
            return success_response(
                "订单创建成功",
                {
                    "order": MembershipOrderSerializer(order).data,
                    "payment_url": pay_url,
                },
            )
        except Exception as e:
            # 记录错误并返回
            logger.error(f"创建支付宝订单失败: {str(e)}")
            order.status = "failed"
            order.save()
            return error_response(
                f"创建支付订单失败: {str(e)}", status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    else:
        return error_response(serializer.errors, status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_user_orders(request):
    """获取用户的所有订单"""
    # 创建分页器实例
    paginator = StandardResultsSetPagination()

    # 获取查询参数
    status = request.query_params.get("status")
    start_date = request.query_params.get("start_date")
    end_date = request.query_params.get("end_date")

    # 构建查询集
    orders = MembershipOrder.objects.filter(user=request.user).order_by("-created_at")

    # 应用过滤条件
    if status:
        orders = orders.filter(status=status)
    if start_date:
        orders = orders.filter(created_at__gte=start_date)
    if end_date:
        orders = orders.filter(created_at__lte=end_date)

    # 执行分页
    page = paginator.paginate_queryset(orders, request)

    # 序列化数据
    serializer = MembershipOrderSerializer(page, many=True)

    # 返回分页响应
    return paginator.get_paginated_response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_order_status(request, order_id):
    """查询订单状态"""
    try:
        order = MembershipOrder.objects.get(order_id=order_id, user=request.user)
    except MembershipOrder.DoesNotExist:
        return error_response("订单不存在", status.HTTP_404_NOT_FOUND)

    # 如果订单已经支付完成，直接返回状态
    if order.status == "paid":
        return success_response(
            "查询成功", {"order": MembershipOrderSerializer(order).data}
        )

    # 如果未支付，查询支付宝订单状态
    try:
        query_result = query_alipay_order(order.order_id)
        logger.info(f"支付宝查询结果: {query_result}")

        # 处理查询结果
        if query_result.get("trade_status") == "TRADE_SUCCESS":
            # 更新订单状态
            order.status = "paid"
            order.trade_no = query_result.get("trade_no")
            order.payment_time = timezone.now()
            order.save()

            # 统一订单落账（会员/AI 配额）
            settle_paid_order(order)

            return success_response(
                "支付成功", {"order": MembershipOrderSerializer(order).data}
            )
        else:
            return success_response(
                "订单未支付或支付处理中",
                {
                    "order": MembershipOrderSerializer(order).data,
                    "alipay_status": query_result.get("trade_status"),
                },
            )
    except Exception as e:
        logger.error(f"查询支付宝订单状态失败: {str(e)}")
        return error_response(
            f"查询订单状态失败: {str(e)}",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            {"order": MembershipOrderSerializer(order).data},
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def alipay_notify(request):
    """支付宝异步通知处理"""
    # 获取所有参数
    data = request.data.dict() if hasattr(request.data, "dict") else request.data
    signature = data.pop("sign", None)

    try:
        # 验证签名
        if not signature or not verify_alipay_callback(data, signature):
            logger.warning(f"支付宝回调签名验证失败: {data}")
            return Response({"message": "FAIL", "detail": "签名验证失败"})

        # 验证接收的信息
        out_trade_no = data.get("out_trade_no")
        trade_status = data.get("trade_status")

        if not out_trade_no or not trade_status:
            return Response({"message": "FAIL", "detail": "参数不完整"})

        # 查找订单
        try:
            order = MembershipOrder.objects.get(order_id=out_trade_no)
        except MembershipOrder.DoesNotExist:
            logger.warning(f"支付宝回调：找不到订单 {out_trade_no}")
            return Response({"message": "FAIL", "detail": "订单不存在"})

        # 处理不同的交易状态
        if trade_status == "TRADE_SUCCESS" or trade_status == "TRADE_FINISHED":
            # 如果订单已处理，防止重复更新
            if order.status == "paid":
                return Response({"message": "SUCCESS", "detail": "订单已处理"})

            # 更新订单状态
            order.status = "paid"
            order.trade_no = data.get("trade_no")
            order.payment_time = timezone.now()
            order.save()

            # 统一订单落账（会员/AI 配额）
            settle_paid_order(order)

            logger.info(f"订单 {out_trade_no} 支付成功，交易号: {data.get('trade_no')}")
            return Response({"message": "SUCCESS"})
        else:
            # 其他状态不处理
            return Response({"message": "SUCCESS", "detail": "等待交易完成"})
    except Exception as e:
        logger.error(f"处理支付宝回调时出错: {str(e)}")
        return Response({"message": "FAIL", "detail": str(e)})


def update_user_membership(user, order):
    """更新用户会员状态"""
    # 获取用户资料
    profile = user.profile

    # 获取当前时间
    now = timezone.now()

    # AI 配额等非会员订单不应触发会员状态变更
    if order.membership_plan is None:
        logger.info(
            "订单 %s 非会员订单，跳过会员状态更新",
            getattr(order, "order_id", "unknown"),
        )
        return profile

    # 会员计划等级映射（数字越大等级越高）
    plan_level = {
        "standard": 1,
        "premium": 2,
        # 未来可能添加的其他计划
    }

    # 设置会员到期时间
    if order.billing_cycle == "month":
        duration = timedelta(days=30)
    else:  # year
        duration = timedelta(days=365)

    # 判断是否已经是会员
    if profile.is_premium_active():
        current_plan_code = (
            profile.membership_plan.code if profile.membership_plan else "free"
        )
        new_plan_code = order.membership_plan.code if order.membership_plan else "free"

        # 获取当前和新计划的等级
        current_level = plan_level.get(current_plan_code, 0)
        new_level = plan_level.get(new_plan_code, 0)

        # 1. 升级会员（立即生效，重置到期时间）
        if new_level > current_level:
            logger.info(
                f"用户 {user.username} 升级会员: {current_plan_code} -> {new_plan_code}"
            )
            profile.membership_plan = order.membership_plan
            profile.premium_expire_date = now + duration

        # 2. 同等级续费（延长到期时间）
        elif new_level == current_level:
            logger.info(f"用户 {user.username} 续费相同等级会员: {current_plan_code}")
            # 从当前到期时间起延长
            if profile.premium_expire_date and profile.premium_expire_date > now:
                profile.premium_expire_date = profile.premium_expire_date + duration
            else:
                profile.premium_expire_date = now + duration

        # 3. 降级会员（当前会员到期后生效）
        else:
            logger.info(
                f"用户 {user.username} 降级会员: {current_plan_code} -> {new_plan_code}，将在当前会员到期后生效"
            )

            # 存储降级信息，但暂不更新当前会员
            profile.pending_membership_plan = order.membership_plan
            profile.pending_membership_start_date = profile.premium_expire_date
            profile.pending_membership_expire_date = (
                profile.premium_expire_date + duration
            )

            # 注意：此处不修改当前会员计划和到期时间
            # 需要添加一个定时任务或登录检查来处理会员到期后的降级
    else:
        # 用户之前不是会员，直接激活
        logger.info(f"用户 {user.username} 首次开通会员: {order.membership_plan.name}")
        profile.membership_plan = order.membership_plan
        profile.premium_expire_date = now + duration
        profile.is_premium = True

    # 更新存储限制
    if order.membership_plan:
        # 如果是降级但还没生效，不降低存储限制
        if (
            not hasattr(profile, "pending_membership_plan")
            or profile.pending_membership_plan is None
        ):
            profile.storage_limit = order.membership_plan.storage_limit

    # 保存更改
    profile.save()

    logger.info(
        f"用户 {user.username} 的会员状态已更新，当前会员类型：{profile.membership_plan.name if profile.membership_plan else '无'}"
    )

    # 返回更新后的用户资料
    return profile


# 支付成功页面重定向


class PaymentSuccessView(TemplateView):
    template_name = "payment_success.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        order_id = self.request.GET.get("out_trade_no")
        if order_id:
            try:
                order = MembershipOrder.objects.get(order_id=order_id)
                context["order"] = order
            except MembershipOrder.DoesNotExist:
                pass
        return context
