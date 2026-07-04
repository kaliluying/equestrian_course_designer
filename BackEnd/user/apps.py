from django.apps import AppConfig


class UserConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'user'
    verbose_name = '用户管理'

    def ready(self):
        # 加载 drf-spectacular 认证扩展
        from . import schema  # noqa: F401
