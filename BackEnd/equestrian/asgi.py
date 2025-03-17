"""
ASGI config for equestrian project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.1/howto/deployment/asgi/
"""
import user.routing
from channels.security.websocket import AllowedHostsOriginValidator
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
import django
import os
from user.middleware import JWTAuthMiddleware  # 导入自定义中间件
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'equestrian.settings')

# 强制初始化 Django
django.setup()


application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AllowedHostsOriginValidator(
        JWTAuthMiddleware(  # 使用自定义JWT中间件替代AuthMiddlewareStack
            URLRouter(
                user.routing.websocket_urlpatterns
            )
        )
    ),
})
