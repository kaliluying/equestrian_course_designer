from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FeedbackViewSet, FeedbackIndexView

# 创建路由器
router = DefaultRouter()
router.register(r'', FeedbackViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path("dashboard", FeedbackIndexView.as_view(), name="admin_dashboard"),
]
