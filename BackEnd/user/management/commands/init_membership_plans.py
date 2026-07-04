"""初始化会员计划。"""

from decimal import Decimal

from django.core.management.base import BaseCommand

from user.models import MembershipPlan


DEFAULT_PLANS = [
    {
        "code": "free",
        "name": "免费用户",
        "monthly_price": Decimal("0.00"),
        "yearly_price": Decimal("0.00"),
        "storage_limit": 5,
        "custom_obstacle_limit": 10,
        "description": "免费用户计划，限制存储5个设计和10个自定义障碍物",
    },
    {
        "code": "standard",
        "name": "标准会员",
        "monthly_price": Decimal("15.00"),
        "yearly_price": Decimal("150.00"),
        "storage_limit": 100,
        "custom_obstacle_limit": 50,
        "description": "标准会员计划，适合常规路线设计和自定义障碍物管理",
    },
    {
        "code": "premium",
        "name": "高级会员",
        "monthly_price": Decimal("30.00"),
        "yearly_price": Decimal("300.00"),
        "storage_limit": 500,
        "custom_obstacle_limit": None,
        "description": "高级会员计划，提供更高存储空间和不限量自定义障碍物",
    },
]


class Command(BaseCommand):
    """创建或更新默认会员计划。"""

    help = "初始化默认会员计划"

    def handle(self, *args, **options):
        for plan_data in DEFAULT_PLANS:
            plan, created = MembershipPlan.objects.update_or_create(
                code=plan_data["code"],
                defaults={
                    **plan_data,
                    "is_active": True,
                },
            )
            action = "创建" if created else "更新"
            self.stdout.write(self.style.SUCCESS(f"{action}会员计划: {plan.name}"))
