from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView,
    LoginView,
    DesignViewSet,
    ForgotPasswordView,
    ResetPasswordView,
    CSRFTokenView,
    UserViewSet,
    CustomObstacleViewSet,
    create_membership_order,
    get_user_orders,
    get_order_status,
    alipay_notify,
    PaymentSuccessView,
    LogoutView,
)
from .share_link_view import ShareLinkView
from .views import CookieTokenRefreshView
from . import ai_views
from .views.template_views import CourseTemplateViewSet

# 创建路由器并注册视图集
router = DefaultRouter()
router.register(r"designs", DesignViewSet)
router.register(r"users", UserViewSet)
router.register(r"obstacles", CustomObstacleViewSet, basename="obstacle")
router.register(r"templates", CourseTemplateViewSet, basename="template")

urlpatterns = [
    # CSRF令牌
    path("csrf/", CSRFTokenView.as_view(), name="csrf_token"),
    # 用户注册和登录
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    # 忘记密码和重置密码
    path("forgot-password/", ForgotPasswordView.as_view(), name="forgot_password"),
    path("reset-password/", ResetPasswordView.as_view(), name="reset_password"),
    # JWT token刷新 (使用自定义视图从cookie读取refresh token)
    path("token/refresh/", CookieTokenRefreshView.as_view(), name="token_refresh"),
    # Share link for collaboration
    path(
        "designs/<int:design_id>/share-link/",
        ShareLinkView.as_view(),
        name="share_link",
    ),
    path("", include(router.urls)),  # 包含自动生成的路由
    # 支付相关路由
    path(
        "api/payment/create-order/",
        create_membership_order,
        name="create_membership_order",
    ),
    path("api/payment/orders/", get_user_orders, name="get_user_orders"),
    path(
        "api/payment/order-status/<str:order_id>/",
        get_order_status,
        name="get_order_status",
    ),
    path("api/payment/alipay/notify/", alipay_notify, name="alipay_notify"),
    path("payment/success/", PaymentSuccessView.as_view(), name="payment_success"),
    # AI 生成相关
    path("ai/generate/", ai_views.generate_route, name="ai_generate"),
    path("ai/edit-course/", ai_views.edit_course, name="ai_edit_course"),
    path("ai/coach-notes/", ai_views.coach_notes, name="ai_coach_notes"),
    path("ai/quota/", ai_views.get_ai_quota, name="ai_quota"),
    path("ai/purchase/", ai_views.purchase_ai_quota, name="ai_purchase"),
    path("ai/history/", ai_views.get_ai_history, name="ai_history"),
]
