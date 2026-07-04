"""OpenAPI schema 扩展。"""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class CookieJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    """声明 httpOnly Cookie JWT 认证方案。"""

    target_class = "user.authentication.CookieJWTAuthentication"
    name = "CookieJWTAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "cookie",
            "name": "access_token",
            "description": "登录后由后端写入的 httpOnly JWT Cookie",
        }
