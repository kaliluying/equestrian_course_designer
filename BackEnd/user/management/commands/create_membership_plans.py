from django.core.management.base import BaseCommand
from user.models import MembershipPlan


class Command(BaseCommand):
    help = '创建默认的会员计划'

    def handle(self, *args, **options):
        # 创建免费计划
        free_plan, created = MembershipPlan.objects.get_or_create(
            code='free',
            defaults={
                'name': '免费用户',
                'monthly_price': 0.00,
                'yearly_price': 0.00,
                'storage_limit': 5,
                'description': '免费用户计划，提供5个设计存储空间'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'成功创建免费计划: {free_plan}'))
        else:
            self.stdout.write(self.style.WARNING(f'免费计划已存在: {free_plan}'))

        # 创建标准会员计划
        standard_plan, created = MembershipPlan.objects.get_or_create(
            code='standard',
            defaults={
                'name': '标准会员',
                'monthly_price': 15.00,
                'yearly_price': 150.00,
                'storage_limit': 100,
                'description': '标准会员计划，提供100个设计存储空间'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(
                f'成功创建标准会员计划: {standard_plan}'))
        else:
            self.stdout.write(self.style.WARNING(
                f'标准会员计划已存在: {standard_plan}'))

        # 创建高级会员计划
        premium_plan, created = MembershipPlan.objects.get_or_create(
            code='premium',
            defaults={
                'name': '高级会员',
                'monthly_price': 30.00,
                'yearly_price': 300.00,
                'storage_limit': 500,
                'description': '高级会员计划，提供500个设计存储空间和优先支持'
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(
                f'成功创建高级会员计划: {premium_plan}'))
        else:
            self.stdout.write(self.style.WARNING(f'高级会员计划已存在: {premium_plan}'))

        self.stdout.write(self.style.SUCCESS('会员计划初始化完成！'))
