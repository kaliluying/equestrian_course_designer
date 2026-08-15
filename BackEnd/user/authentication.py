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
        cookies = request.COOKIES

        # Try to get token from cookie first
        access_token = cookies.get("access_token")

        if access_token:
            try:
                # Validate the token
                validated_token = self.get_validated_token(access_token)

                # Get the user from the validated token
                user = self.get_user(validated_token)

                # Return the authentication tuple
                return (user, validated_token)
            except (InvalidToken, TokenError, InvalidTokenError) as e:
                logger.warning("Cookie token validation failed")
                # If cookie token fails, fall through to header-based auth
                pass

        # Fall back to header-based auth (for backwards compatibility)
        return super().authenticate(request)

    def get_validated_token(self, raw_token):
        """
        Validate the raw token and return the validated token.
        """
        validated_token = super().get_validated_token(raw_token)
        return validated_token
