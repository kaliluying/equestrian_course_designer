from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import RegisterView, LoginView, DesignViewSet, ForgotPasswordView, ResetPasswordView, CSRFTokenView, UserViewSet, CustomObstacleViewSet

# 创建路由器并注册视图集
router = DefaultRouter()
router.register(r'designs', DesignViewSet)
router.register(r'users', UserViewSet)
router.register(r'obstacles', CustomObstacleViewSet, basename='obstacle')

urlpatterns = [
    # CSRF令牌
    path('csrf/', CSRFTokenView.as_view(), name='csrf_token'),
    # 用户注册和登录
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    # 忘记密码和重置密码
    path('forgot-password/', ForgotPasswordView.as_view(), name='forgot_password'),
    path('reset-password/', ResetPasswordView.as_view(), name='reset_password'),
    # JWT token刷新
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('', include(router.urls)),  # 包含自动生成的路由
]
