from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import RegisterView, LoginView, DesignViewSet

# 创建路由器并注册视图集
router = DefaultRouter()
router.register(r'designs', DesignViewSet)

urlpatterns = [
    # 用户注册和登录
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    # JWT token刷新
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('', include(router.urls)),  # 包含自动生成的路由
]
