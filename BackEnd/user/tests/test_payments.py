"""支付结算的金额校验、事务和幂等回归测试。"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from decimal import Decimal
import threading
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from user.models import AIGenerationQuota, MembershipOrder, MembershipPlan, UserProfile
from user.services.payment_settlement import (
    PaymentSettlementError,
    settle_paid_order,
    validate_alipay_business_payload,
)


class PaymentSettlementTests(TestCase):
    """支付回调和轮询必须共享同一个一次性落账语义。"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="settlement_user",
            email="settlement@example.com",
            password="Password123",
        )
        self.profile, _ = UserProfile.objects.get_or_create(user=self.user)

    def test_repeated_ai_settlement_grants_quota_once(self):
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("24.90"),
            billing_cycle="month",
            status="pending",
        )

        settled, first = settle_paid_order(
            order_id=order.order_id,
            trade_no="TRADE-ONCE",
            total_amount="24.90",
            source="notify",
        )
        repeated, second = settle_paid_order(
            order_id=order.order_id,
            trade_no="TRADE-ONCE",
            total_amount="24.90",
            source="query",
        )

        quota = AIGenerationQuota.objects.get(user_profile=self.profile)
        self.assertTrue(first)
        self.assertFalse(second)
        self.assertEqual(settled.status, "paid")
        self.assertEqual(repeated.trade_no, "TRADE-ONCE")
        self.assertEqual(quota.purchased_quota, 30)

    def test_unknown_ai_order_amount_is_rejected(self):
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("11.00"),
            billing_cycle="month",
            status="pending",
        )

        with self.assertRaises(PaymentSettlementError):
            settle_paid_order(
                order_id=order.order_id,
                trade_no="TRADE-UNKNOWN-QUOTA",
                total_amount="11.00",
                source="notify",
            )

        order.refresh_from_db()
        self.assertEqual(order.status, "pending")
        quota = AIGenerationQuota.objects.get(user_profile=self.profile)
        self.assertEqual(quota.purchased_quota, 0)

    def test_amount_mismatch_does_not_change_order_or_quota(self):
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("9.90"),
            billing_cycle="month",
            status="pending",
        )

        with self.assertRaises(PaymentSettlementError):
            settle_paid_order(
                order_id=order.order_id,
                trade_no="TRADE-MISMATCH",
                total_amount="99.90",
                source="notify",
            )

        order.refresh_from_db()
        quota = AIGenerationQuota.objects.get(user_profile=self.profile)
        self.assertEqual(order.status, "pending")
        self.assertEqual(quota.purchased_quota, 0)

    def test_non_finite_amount_is_rejected(self):
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("9.90"),
            billing_cycle="month",
            status="pending",
        )

        with self.assertRaises(PaymentSettlementError):
            settle_paid_order(
                order_id=order.order_id,
                trade_no="TRADE-NAN",
                total_amount="NaN",
                source="notify",
            )

    def test_settlement_records_gateway_payment_time(self):
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("9.90"),
            billing_cycle="month",
            status="pending",
        )
        payment_time = timezone.make_aware(
            datetime(2026, 8, 16, 12, 34, 56),
            timezone.get_current_timezone(),
        )

        settled, _ = settle_paid_order(
            order_id=order.order_id,
            trade_no="TRADE-TIME",
            total_amount="9.90",
            source="notify",
            payment_time=payment_time,
        )

        self.assertEqual(settled.payment_time, payment_time)

    @override_settings(ALIPAY_APPID="app-test", ALIPAY_SELLER_ID="seller-test")
    def test_alipay_payload_requires_app_order_amount_and_trade_identity(self):
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("9.90"),
            billing_cycle="month",
            status="pending",
        )
        payload = {
            "app_id": "app-test",
            "seller_id": "seller-test",
            "out_trade_no": order.order_id,
            "total_amount": "9.90",
            "trade_no": "TRADE-VALID",
        }

        self.assertEqual(validate_alipay_business_payload(payload, order), Decimal("9.90"))
        payload["total_amount"] = "0.90"
        with self.assertRaises(PaymentSettlementError):
            validate_alipay_business_payload(payload, order)

    @override_settings(ALIPAY_APPID="app-test", ALIPAY_SELLER_ID="seller-test")
    def test_alipay_payload_rejects_missing_or_wrong_seller(self):
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("9.90"),
            billing_cycle="month",
            status="pending",
        )
        payload = {
            "app_id": "app-test",
            "out_trade_no": order.order_id,
            "total_amount": "9.90",
            "trade_no": "TRADE-SELLER",
        }

        self.assertEqual(
            validate_alipay_business_payload(payload, order),
            Decimal("9.90"),
        )

        with self.assertRaises(PaymentSettlementError):
            validate_alipay_business_payload(
                payload,
                order,
                require_seller_id=True,
            )

        payload["seller_id"] = "another-seller"
        with self.assertRaises(PaymentSettlementError):
            validate_alipay_business_payload(payload, order)

    @override_settings(ALIPAY_APPID="app-test", ALIPAY_SELLER_ID="seller-test")
    def test_notify_payload_requires_app_and_seller_identity(self):
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("9.90"),
            billing_cycle="month",
            status="pending",
        )
        payload = {
            "out_trade_no": order.order_id,
            "total_amount": "9.90",
            "trade_no": "TRADE-NOTIFY",
        }

        with self.assertRaises(PaymentSettlementError):
            validate_alipay_business_payload(
                payload,
                order,
                require_app_id=True,
                require_seller_id=True,
            )

    def test_settlement_rejects_non_alipay_order(self):
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("9.90"),
            billing_cycle="month",
            payment_channel="wechat",
            status="pending",
        )

        with self.assertRaises(PaymentSettlementError):
            settle_paid_order(
                order_id=order.order_id,
                trade_no="TRADE-WECHAT",
                total_amount="9.90",
                source="notify",
            )


class PaymentSettlementConcurrencyTests(TransactionTestCase):
    """并发回调和轮询必须只发放一次权益。"""

    reset_sequences = True

    def setUp(self):
        self.user = User.objects.create_user(
            username="concurrent_settlement_user",
            email="concurrent-settlement@example.com",
            password="Password123",
        )
        UserProfile.objects.create(user=self.user)

    @staticmethod
    def _settle(order_id, source, barrier):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            _, first = settle_paid_order(
                order_id=order_id,
                trade_no="TRADE-CONCURRENT",
                total_amount="24.90",
                source=source,
            )
            return first
        finally:
            close_old_connections()

    def test_concurrent_notify_and_query_settle_once(self):
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("24.90"),
            billing_cycle="month",
            status="pending",
        )
        barrier = threading.Barrier(2)

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(self._settle, order.order_id, "notify", barrier),
                executor.submit(self._settle, order.order_id, "query", barrier),
            ]
            first_flags = [future.result(timeout=30) for future in futures]

        order.refresh_from_db()
        quota = AIGenerationQuota.objects.get(user_profile__user=self.user)
        self.assertCountEqual(first_flags, [True, False])
        self.assertEqual(order.status, "paid")
        self.assertEqual(quota.purchased_quota, 30)


class PaymentOrderStatusAPITests(TestCase):
    """订单轮询必须覆盖支付宝终态并只落账一次。"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="status_user",
            email="status@example.com",
            password="Password123",
        )
        self.profile, _ = UserProfile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)

    @patch(
        "user.views.payment_views.query_alipay_order",
        return_value={
            "trade_status": "TRADE_FINISHED",
            "out_trade_no": "placeholder",
            "total_amount": "24.90",
            "trade_no": "TRADE-FINISHED",
        },
    )
    @override_settings(ALIPAY_SELLER_ID="seller-test")
    def test_trade_finished_settles_ai_order(self, query_order):
        order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("24.90"),
            billing_cycle="month",
            status="pending",
        )
        query_order.return_value["out_trade_no"] = order.order_id

        response = self.client.get(
            f"/user/api/payment/order-status/{order.order_id}/"
        )

        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, "paid")
        self.assertEqual(
            AIGenerationQuota.objects.get(user_profile=self.profile).purchased_quota,
            30,
        )


class PaymentOrderListAPITests(TestCase):
    """订单日期筛选必须把非法输入转换为客户端错误。"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="order_list_user",
            email="order-list@example.com",
            password="Password123",
        )
        UserProfile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)

    def test_invalid_date_filter_returns_bad_request(self):
        response = self.client.get(
            "/user/api/payment/orders/?start_date=not-a-date"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("start_date", response.json()["message"])


class PaymentOrderCreationTests(TestCase):
    """第三方订单已创建时，本地链接落库失败不能伪造失败状态。"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="creation_user",
            email="creation@example.com",
            password="Password123",
        )
        UserProfile.objects.get_or_create(user=self.user)
        self.client.force_authenticate(user=self.user)
        self.plan = MembershipPlan.objects.create(
            name="创建测试会员",
            code="creation-test",
            monthly_price=19,
            yearly_price=190,
            storage_limit=20,
            custom_obstacle_limit=10,
        )

    @patch(
        "user.views.payment_views.create_alipay_order",
        return_value="https://pay.example.com/order",
    )
    def test_payment_url_save_failure_keeps_order_pending(self, _):
        original_save = MembershipOrder.save

        def fail_payment_url_save(instance, *args, **kwargs):
            if "payment_url" in (kwargs.get("update_fields") or []):
                raise RuntimeError("storage unavailable")
            return original_save(instance, *args, **kwargs)

        with patch.object(MembershipOrder, "save", autospec=True, side_effect=fail_payment_url_save):
            response = self.client.post(
                "/user/api/payment/create-order/",
                data={"plan_id": self.plan.id, "billing_cycle": "month"},
            )

        self.assertEqual(response.status_code, 503)
        order = MembershipOrder.objects.get(user=self.user)
        self.assertEqual(order.status, "pending")


class PaymentSuccessViewTests(TestCase):
    """支付同步返回页只能显示当前已认证用户自己的已支付订单。"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="payment_page_user",
            email="payment_page@example.com",
            password="Password123",
        )
        self.other_user = User.objects.create_user(
            username="payment_page_other",
            email="payment_page_other@example.com",
            password="Password123",
        )
        self.plan = MembershipPlan.objects.create(
            name="支付页计划",
            code="payment-page-plan",
            monthly_price=19,
            yearly_price=190,
            storage_limit=20,
            custom_obstacle_limit=10,
        )
        self.order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=self.plan,
            amount=Decimal("19.00"),
            billing_cycle="month",
            status="paid",
        )

    def test_anonymous_page_does_not_disclose_order(self):
        response = self.client.get(
            f"/user/payment/success/?out_trade_no={self.order.order_id}"
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, self.order.order_id)
        self.assertNotContains(response, "19.00")

    def test_authenticated_owner_can_view_own_paid_order(self):
        self.client.force_login(self.user)

        response = self.client.get(
            f"/user/payment/success/?out_trade_no={self.order.order_id}"
        )

        self.assertContains(response, self.order.order_id)
        self.assertContains(response, "支付页计划")

    def test_authenticated_other_user_cannot_view_order(self):
        self.client.force_login(self.other_user)

        response = self.client.get(
            f"/user/payment/success/?out_trade_no={self.order.order_id}"
        )

        self.assertNotContains(response, self.order.order_id)
