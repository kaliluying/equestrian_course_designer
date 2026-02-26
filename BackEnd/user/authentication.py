"""
Custom DRF authentication that reads JWT from httpOnly cookies.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from django.contrib.auth.models import User
from jwt.exceptions import InvalidTokenError
import logging

logger = logging.getLogger(__name__)


class CookieJWTAuthentication(JWTAuthentication):
    """
    Custom authentication class that reads JWT from httpOnly cookies.

    This class extends JWTAuthentication to:
    1. First try to get the JWT token from the 'access_token' cookie
    2. Fall back to the Authorization header for backwards compatibility
    """

    def authenticate(self, request):
        """
        Authenticate the request based on the token in the cookie or header.
        """
        # Debug: log all cookies
        cookies = request.COOKIES
        logger.info(f"[AUTH] Request cookies: {list(cookies.keys())}")
        logger.info(f"[AUTH] access_token present: {'access_token' in cookies}")

        # Try to get token from cookie first
        access_token = cookies.get("access_token")

        if access_token:
            logger.info(
                f"[AUTH] Found access_token cookie, length: {len(access_token)}"
            )
            try:
                # Validate the token
                validated_token = self.get_validated_token(access_token)

                # Get the user from the validated token
                user = self.get_user(validated_token)

                logger.info(
                    f"[AUTH] Cookie-based auth successful for user: {user.username}"
                )
                # Return the authentication tuple
                return (user, validated_token)
            except (InvalidToken, TokenError, InvalidTokenError) as e:
                logger.warning(f"[AUTH] Cookie token validation failed: {e}")
                # If cookie token fails, fall through to header-based auth
                pass
        else:
            logger.info("[AUTH] No access_token cookie found")

        # Fall back to header-based auth (for backwards compatibility)
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        logger.info(
            f"[AUTH] Falling back to header auth: {auth_header[:20] if auth_header else 'None'}..."
        )
        return super().authenticate(request)

    def get_validated_token(self, raw_token):
        """
        Validate the raw token and return the validated token.
        """
        validated_token = super().get_validated_token(raw_token)
        return validated_token
