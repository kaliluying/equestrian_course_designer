"""支付相关视图：订单创建、支付宝回调、会员状态更新。"""

import logging
from datetime import timedelta
from django.utils import timezone
from django.http import HttpResponse
from django.views.generic import TemplateView
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema

from ..models import (
    MembershipPlan,
    MembershipOrder,
    UserProfile,
    MembershipInvoice,
)
from ..serializers import (
    MembershipOrderSerializer,
    CreateMembershipOrderSerializer,
    MembershipInvoiceSerializer,
    InvoiceIssueSerializer,
)
from ..utils import (
    create_alipay_order,
    verify_alipay_callback,
    query_alipay_order,
    success_response,
    error_response,
    ExternalServiceConfigError,
)
from ..services.payment_settlement import (
    PaymentSettlementError,
    resolve_ai_quota_amount,
    settle_paid_order,
    validate_alipay_business_payload,
)
from ..throttles import PaymentQueryRateThrottle
from .obstacle_views import StandardResultsSetPagination

logger = logging.getLogger(__name__)

# AI 配额金额解析兼容入口
def _clear_pending_membership(profile):
    """清理待生效会员计划字段。"""
    profile.pending_membership_plan = None
    profile.pending_membership_start_date = None
    profile.pending_membership_expire_date = None


def _resolve_ai_quota_amount(order_amount):
    """兼容旧调用方，统一委托给支付结算服务。"""
    return resolve_ai_quota_amount(order_amount)


def _scalarize_payment_payload(raw_data):
    """把支付宝表单 QueryDict 的列表值还原为签名使用的标量值。"""
    if hasattr(raw_data, "lists"):
        return {
            str(key): values[-1]
            for key, values in raw_data.lists()
            if values
        }

    data = dict(raw_data or {})
    return {
        str(key): value[-1] if isinstance(value, (list, tuple)) and value else value
        for key, value in data.items()
    }


def _alipay_notify_response(success: bool) -> HttpResponse:
    """返回支付宝要求的纯文本回执，避免 JSON 回执被判定为失败。"""
    return HttpResponse("success" if success else "fail", content_type="text/plain")


@extend_schema(
    request=CreateMembershipOrderSerializer,
    responses=OpenApiTypes.OBJECT,
    summary="创建会员订单",
)
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
        except ExternalServiceConfigError as e:
            logger.warning("支付宝配置不可用: reason=%s", type(e).__name__)
            order.status = "failed"
            order.save(update_fields=["status", "updated_at"])
            return error_response(
                "支付功能暂不可用，请稍后重试",
                status.HTTP_503_SERVICE_UNAVAILABLE,
                {"order": MembershipOrderSerializer(order).data},
            )
        except Exception:
            logger.exception("创建支付宝订单失败")
            return error_response(
                "创建支付订单失败，请稍后重试",
                status.HTTP_503_SERVICE_UNAVAILABLE,
                {"order": MembershipOrderSerializer(order).data},
            )

        try:
            # 保存支付链接；第三方订单可能已经存在，失败时必须保留 pending。
            order.payment_url = pay_url
            order.save(update_fields=["payment_url", "updated_at"])
        except Exception:
            logger.exception("保存支付宝订单链接失败")
            return error_response(
                "支付订单已创建，但本地状态暂未保存，请稍后查询订单",
                status.HTTP_503_SERVICE_UNAVAILABLE,
                {"order": MembershipOrderSerializer(order).data},
            )

        return success_response(
            "订单创建成功",
            {
                "order": MembershipOrderSerializer(order).data,
                "payment_url": pay_url,
            },
        )
    else:
        return error_response(serializer.errors, status.HTTP_400_BAD_REQUEST)


@extend_schema(
    responses=MembershipOrderSerializer(many=True),
    summary="获取当前用户订单",
)
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


@extend_schema(responses=OpenApiTypes.OBJECT, summary="获取订单详情")
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_order_detail(request, order_id):
    """获取当前用户订单详情。"""
    try:
        order = MembershipOrder.objects.get(order_id=order_id, user=request.user)
    except MembershipOrder.DoesNotExist:
        return error_response("订单不存在", status.HTTP_404_NOT_FOUND)
    return success_response("查询成功", {"order": MembershipOrderSerializer(order).data})


@extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT, summary="提交订单发票")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_order_invoice(request, order_id):
    """用户提交订单发票信息。"""
    try:
        order = MembershipOrder.objects.get(order_id=order_id, user=request.user)
    except MembershipOrder.DoesNotExist:
        return error_response("订单不存在", status.HTTP_404_NOT_FOUND)

    if order.status != "paid":
        return error_response(
            "只有已支付订单可以申请发票",
            status.HTTP_400_BAD_REQUEST,
        )

    existing_invoice = MembershipInvoice.objects.filter(order=order).first()
    if existing_invoice and existing_invoice.status == "issued":
        return error_response(
            "发票已开具，不能重复修改",
            status.HTTP_409_CONFLICT,
        )

    request_data = request.data.copy()
    request_data.setdefault("email", request.user.email or "")
    serializer = MembershipInvoiceSerializer(data=request_data)
    if not serializer.is_valid():
        return error_response(serializer.errors, status.HTTP_400_BAD_REQUEST)

    invoice, _ = MembershipInvoice.objects.update_or_create(
        order=order,
        defaults={**serializer.validated_data, "status": "submitted"},
    )
    return success_response(
        "发票信息提交成功",
        {"invoice": MembershipInvoiceSerializer(invoice).data},
        status.HTTP_201_CREATED,
    )


@extend_schema(request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT, summary="标记发票已开具")
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_invoice_issued(request, order_id):
    """后台标记发票已开具。"""
    if not request.user.is_staff:
        return error_response("无权限", status.HTTP_403_FORBIDDEN)
    try:
        order = MembershipOrder.objects.get(order_id=order_id)
        invoice = order.invoice
    except (MembershipOrder.DoesNotExist, MembershipInvoice.DoesNotExist):
        return error_response("发票不存在", status.HTTP_404_NOT_FOUND)

    serializer = InvoiceIssueSerializer(data=request.data)
    if not serializer.is_valid():
        return error_response(serializer.errors, status.HTTP_400_BAD_REQUEST)
    invoice.status = "issued"
    invoice.invoice_number = (
        serializer.validated_data.get("invoice_number") or invoice.invoice_number
    )
    invoice.save(update_fields=["status", "invoice_number", "updated_at"])
    return success_response(
        "发票已标记为已开具",
        {"invoice": MembershipInvoiceSerializer(invoice).data},
    )


@extend_schema(
    responses=OpenApiTypes.OBJECT,
    summary="查询订单状态",
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
@throttle_classes([PaymentQueryRateThrottle])
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
        logger.info(
            "支付宝订单查询: order_id=%s, status=%s",
            order.order_id,
            query_result.get("trade_status"),
        )

        # 处理查询结果
        if query_result.get("trade_status") in {"TRADE_SUCCESS", "TRADE_FINISHED"}:
            validate_alipay_business_payload(query_result, order)
            order, _ = settle_paid_order(
                order_id=order.order_id,
                trade_no=query_result["trade_no"],
                total_amount=query_result["total_amount"],
                source="query",
                payment_time=query_result.get("send_pay_date")
                or query_result.get("gmt_payment"),
            )

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
    except (ExternalServiceConfigError, PaymentSettlementError) as e:
        logger.warning("支付宝订单查询未完成: reason=%s", type(e).__name__)
        return error_response(
            "支付状态暂时无法确认，请稍后重试",
            status.HTTP_503_SERVICE_UNAVAILABLE,
            {"order": MembershipOrderSerializer(order).data},
        )
    except Exception:
        logger.exception("查询支付宝订单状态失败")
        return error_response(
            "查询订单状态失败，请稍后重试",
            status.HTTP_503_SERVICE_UNAVAILABLE,
            {"order": MembershipOrderSerializer(order).data},
        )


@extend_schema(
    request=OpenApiTypes.OBJECT,
    responses=OpenApiTypes.OBJECT,
    summary="支付宝异步通知",
)
@api_view(["POST"])
@permission_classes([AllowAny])
def alipay_notify(request):
    """支付宝异步通知处理"""
    # 支付宝以 application/x-www-form-urlencoded 发送 QueryDict；直接调用
    # dict(QueryDict) 会把每个标量变成列表，导致签名和业务校验全部失败。
    data = _scalarize_payment_payload(request.data)
    signature = data.pop("sign", None)

    try:
        # 验证签名
        if not signature or not verify_alipay_callback(data, signature):
            logger.warning("支付宝回调签名验证失败")
            return _alipay_notify_response(False)

        # 验证接收的信息
        out_trade_no = data.get("out_trade_no")
        trade_status = data.get("trade_status")

        if not out_trade_no or not trade_status:
            return _alipay_notify_response(False)

        # 查找订单
        try:
            order = MembershipOrder.objects.get(order_id=out_trade_no)
        except MembershipOrder.DoesNotExist:
            logger.warning("支付宝回调找不到订单: order_id=%s", out_trade_no)
            return _alipay_notify_response(False)

        # 处理不同的交易状态
        if trade_status == "TRADE_SUCCESS" or trade_status == "TRADE_FINISHED":
            validate_alipay_business_payload(
                data,
                order,
                require_app_id=True,
                require_seller_id=True,
            )
            _, settled_now = settle_paid_order(
                order_id=order.order_id,
                trade_no=data["trade_no"],
                total_amount=data["total_amount"],
                source="notify",
                payment_time=data.get("gmt_payment") or data.get("notify_time"),
            )

            logger.info(
                "订单支付回调处理完成: order_id=%s, newly_settled=%s",
                out_trade_no,
                settled_now,
            )
            return _alipay_notify_response(True)
        else:
            # 其他状态不处理
            return _alipay_notify_response(True)
    except (ExternalServiceConfigError, PaymentSettlementError) as e:
        logger.warning("支付宝回调处理失败: reason=%s", type(e).__name__)
        return _alipay_notify_response(False)
    except Exception:
        logger.exception("处理支付宝回调时出错")
        return _alipay_notify_response(False)


def update_user_membership(user, order, profile=None):
    """更新用户会员状态"""
    # 获取用户资料
    profile = profile or UserProfile.objects.get_or_create(user=user)[0]

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
            profile.is_premium = True
            _clear_pending_membership(profile)

        # 2. 同等级续费（延长到期时间）
        elif new_level == current_level:
            logger.info(f"用户 {user.username} 续费相同等级会员: {current_plan_code}")
            # 从当前到期时间起延长
            if profile.premium_expire_date and profile.premium_expire_date > now:
                profile.premium_expire_date = profile.premium_expire_date + duration
            else:
                profile.premium_expire_date = now + duration
            _clear_pending_membership(profile)

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
        _clear_pending_membership(profile)

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
        if order_id and self.request.user.is_authenticated:
            try:
                order = MembershipOrder.objects.select_related("membership_plan").get(
                    order_id=order_id,
                    user=self.request.user,
                    status="paid",
                )
                context["order"] = order
            except MembershipOrder.DoesNotExist:
                pass
        return context
