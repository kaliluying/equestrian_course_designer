"""
ASGI config for equestrian project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.1/howto/deployment/asgi/
"""

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator
import user.routing
import os
# 确保在导入任何其他模块前设置环境变量
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'equestrian.settings')


application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(
                user.routing.websocket_urlpatterns
            )
        )
    ),
})
