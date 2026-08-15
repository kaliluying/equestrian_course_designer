"""接口和 WebSocket 的轻量限流实现。"""

from rest_framework.throttling import SimpleRateThrottle


class _EndpointRateThrottle(SimpleRateThrottle):
    """按用户或客户端地址区分接口限流键。"""

    scope = ""
    user_scoped = False

    def get_cache_key(self, request, view):
        if self.user_scoped and request.user.is_authenticated:
            ident = f"user:{request.user.pk}"
        else:
            ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class LoginRateThrottle(_EndpointRateThrottle):
    """限制登录尝试。"""

    scope = "login"


class RegisterRateThrottle(_EndpointRateThrottle):
    """限制注册请求。"""

    scope = "register"


class PasswordResetRateThrottle(_EndpointRateThrottle):
    """限制忘记密码请求。"""

    scope = "password_reset"


class AIRateThrottle(_EndpointRateThrottle):
    """按用户限制 AI 外部调用。"""

    scope = "ai"
    user_scoped = True


class PaymentQueryRateThrottle(_EndpointRateThrottle):
    """按用户限制支付状态查询。"""

    scope = "payment_query"
    user_scoped = True


class FeedbackRateThrottle(_EndpointRateThrottle):
    """限制匿名反馈提交。"""

    scope = "feedback"


class ShareLinkRateThrottle(_EndpointRateThrottle):
    """限制分享链接生成。"""

    scope = "share_link"
    user_scoped = True


class ExportRateThrottle(_EndpointRateThrottle):
    """按用户限制同步导出和图片处理请求。"""

    scope = "export"
    user_scoped = True
