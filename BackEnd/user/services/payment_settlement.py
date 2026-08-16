"""支付订单的事务化、幂等落账服务。"""

from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import logging

from django.conf import settings
from django.db import transaction
from django.utils.dateparse import parse_datetime
from django.utils import timezone

from user.models import AIGenerationQuota, MembershipOrder, UserProfile

logger = logging.getLogger(__name__)


class PaymentSettlementError(ValueError):
    """支付回调不满足订单落账条件。"""


def _normalize_payment_time(value):
    """将支付宝支付时间转换为带时区的 datetime。"""
    if value is None:
        return timezone.now()
    if isinstance(value, str):
        value = parse_datetime(value)
    if not isinstance(value, datetime):
        raise PaymentSettlementError("支付时间格式无效")
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value


AI_QUOTA_AMOUNT_MAP = {
    Decimal("9.90"): 10,
    Decimal("24.90"): 30,
    Decimal("69.90"): 100,
}


def _normalize_amount(value) -> Decimal:
    """将第三方金额转换为两位小数的 Decimal。"""
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise PaymentSettlementError("支付金额格式无效") from exc
    if not amount.is_finite():
        raise PaymentSettlementError("支付金额格式无效")
    if amount < 0:
        raise PaymentSettlementError("支付金额不能为负数")
    return amount


def validate_alipay_business_payload(
    data: dict,
    order: MembershipOrder,
    *,
    require_app_id: bool = False,
    require_seller_id: bool = False,
) -> Decimal:
    """校验支付宝回调/查询结果与本地订单的业务归属。

    签名校验只证明参数来自支付宝，还必须验证应用、订单号、金额和交易号。
    """
    expected_app_id = getattr(settings, "ALIPAY_APPID", "")
    received_app_id = str(data.get("app_id") or "").strip()
    if require_app_id and (not expected_app_id or received_app_id != expected_app_id):
        raise PaymentSettlementError("支付宝应用不匹配")
    if received_app_id and expected_app_id and received_app_id != expected_app_id:
        raise PaymentSettlementError("支付宝应用不匹配")

    expected_seller_id = str(getattr(settings, "ALIPAY_SELLER_ID", "") or "").strip()
    received_seller_id = str(data.get("seller_id") or "").strip()
    if not expected_seller_id or (
        require_seller_id and not received_seller_id
    ) or (
        received_seller_id and received_seller_id != expected_seller_id
    ):
        raise PaymentSettlementError("支付宝商户不匹配")

    if order.payment_channel != "alipay":
        raise PaymentSettlementError("订单支付渠道不支持支付宝结算")

    if data.get("out_trade_no") != order.order_id:
        raise PaymentSettlementError("支付宝订单号不匹配")

    total_amount = _normalize_amount(data.get("total_amount"))
    if total_amount != order.amount.quantize(Decimal("0.01")):
        raise PaymentSettlementError("支付宝支付金额与订单金额不匹配")

    trade_no = str(data.get("trade_no") or "").strip()
    if not trade_no:
        raise PaymentSettlementError("支付宝交易号缺失")
    if len(trade_no) > 64:
        raise PaymentSettlementError("支付宝交易号格式无效")

    return total_amount


def resolve_ai_quota_amount(order_amount) -> int:
    """根据已支付订单金额解析 AI 配额数量。"""
    normalized = _normalize_amount(order_amount)
    if normalized in AI_QUOTA_AMOUNT_MAP:
        return AI_QUOTA_AMOUNT_MAP[normalized]
    return max(1, int(normalized))


@transaction.atomic
def settle_paid_order(
    *,
    order_id: str,
    trade_no: str,
    total_amount,
    source: str,
    payment_time=None,
) -> tuple[MembershipOrder, bool]:
    """在单一事务中完成订单状态和会员/AI 权益落账。

    返回值为 ``(订单, 是否本次首次落账)``。订单行锁保证回调与轮询并发时只
    有一个请求发放权益；同一订单重复通知只返回已处理结果。
    """
    order = (
        MembershipOrder.objects.select_for_update()
        .select_related("user", "membership_plan")
        .get(order_id=order_id)
    )
    if order.payment_channel != "alipay":
        raise PaymentSettlementError("订单支付渠道不支持支付宝结算")
    normalized_amount = _normalize_amount(total_amount)
    if normalized_amount != order.amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP):
        raise PaymentSettlementError("支付金额与订单金额不匹配")
    expected_trade_no = str(trade_no or "").strip()
    if not expected_trade_no or len(expected_trade_no) > 64:
        raise PaymentSettlementError("支付宝交易号无效")

    if order.status == "paid":
        if order.trade_no and order.trade_no != expected_trade_no:
            raise PaymentSettlementError("已支付订单的交易号不一致")
        if not order.trade_no:
            order.trade_no = expected_trade_no
            order.save(update_fields=["trade_no", "updated_at"])
        return order, False

    if order.status != "pending":
        raise PaymentSettlementError(f"订单当前状态不可落账: {order.status}")

    normalized_payment_time = _normalize_payment_time(payment_time)

    profile, _ = UserProfile.objects.get_or_create(user=order.user)
    profile = UserProfile.objects.select_for_update().select_related(
        "membership_plan", "pending_membership_plan"
    ).get(pk=profile.pk)

    order.status = "paid"
    order.trade_no = expected_trade_no
    order.payment_time = normalized_payment_time
    order.save(update_fields=["status", "trade_no", "payment_time", "updated_at"])

    if order.membership_plan is None:
        quota, _ = AIGenerationQuota.objects.get_or_create(user_profile=profile)
        quota = AIGenerationQuota.objects.select_for_update().get(pk=quota.pk)
        quota.purchased_quota += resolve_ai_quota_amount(order.amount)
        quota.save(update_fields=["purchased_quota", "updated_at"])
    else:
        from user.views.payment_views import update_user_membership

        update_user_membership(order.user, order, profile=profile)

    logger.info(
        "支付订单完成事务化落账: order_id=%s, source=%s, membership=%s",
        order.order_id,
        source,
        bool(order.membership_plan),
    )

    return order, True
