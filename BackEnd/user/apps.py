from django.apps import AppConfig
from django.conf import settings


class UserConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'user'
    verbose_name = '用户管理'

    def ready(self):
        # 加载 drf-spectacular 认证扩展
        from . import schema  # noqa: F401

        # django-simpleui 在 AppConfig.ready() 中会主动移除 Django 的
        # XFrameOptionsMiddleware。恢复该中间件，确保 Admin 和其它 HTML
        # 响应仍然带有 X-Frame-Options，避免点击劫持。
        frame_middleware = "django.middleware.clickjacking.XFrameOptionsMiddleware"
        if frame_middleware not in settings.MIDDLEWARE:
            settings.MIDDLEWARE = [*settings.MIDDLEWARE, frame_middleware]
