from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from user.models import UserProfile


class Command(BaseCommand):
    help = '为所有没有用户资料的用户创建用户资料'

    def handle(self, *args, **options):
        # 获取所有用户
        all_users = User.objects.all()
        count = 0

        for user in all_users:
            # 尝试获取用户资料，如果不存在则创建
            try:
                UserProfile.objects.get(user=user)
                self.stdout.write(f'用户 {user.username} 已有资料，跳过')
            except UserProfile.DoesNotExist:
                UserProfile.objects.create(user=user)
                count += 1
                self.stdout.write(f'为用户 {user.username} 创建了资料')

        self.stdout.write(
            self.style.SUCCESS(f'成功为 {count} 个用户创建了用户资料')
        )
