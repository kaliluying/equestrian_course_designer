from datetime import date, datetime
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from user.models import MembershipOrder


class FeedbackDashboardTests(TestCase):
    def test_month_boundaries_include_full_days_without_crossing_months(self):
        staff = User.objects.create_user("dashboard-admin", is_staff=True)
        MembershipOrder.objects.create(
            user=staff,
            amount="10.00",
            status="paid",
            payment_time=timezone.make_aware(datetime(2026, 8, 31, 23, 59, 59)),
        )
        MembershipOrder.objects.create(
            user=staff,
            amount="20.00",
            status="paid",
            payment_time=timezone.make_aware(datetime(2026, 9, 1, 0, 0, 0)),
        )

        self.client.force_login(staff)
        with patch("feedback.views.timezone.localdate", return_value=date(2026, 8, 16)):
            response = self.client.get("/api/feedback/dashboard")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["monthly_income"], 10)
        self.assertEqual(response.context["income_months"][-1], "2026-08")
        self.assertEqual(response.context["income_data"][-1], 10.0)
