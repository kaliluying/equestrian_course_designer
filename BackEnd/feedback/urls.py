from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FeedbackViewSet

# 创建路由器
router = DefaultRouter()
router.register(r'', FeedbackViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
