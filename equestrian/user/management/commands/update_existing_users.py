from django.core.management.base import BaseCommand
from django.contrib.auth.models import User, Group


class Command(BaseCommand):
    help = '更新现有用户的后台访问权限并添加到普通用户组'

    def handle(self, *args, **options):
        # 确保普通用户组存在
        normal_group, created = Group.objects.get_or_create(name='普通用户组')
        if created:
            self.stdout.write(self.style.SUCCESS('创建普通用户组成功'))

        # 更新所有用户
        users = User.objects.filter(is_superuser=False)  # 排除超级用户
        for user in users:
            # 设置后台访问权限
            if not user.is_staff:
                user.is_staff = True
                user.save()

            # 添加到普通用户组
            if normal_group not in user.groups.all():
                user.groups.add(normal_group)

            self.stdout.write(self.style.SUCCESS(f'更新用户 {user.username} 成功'))
