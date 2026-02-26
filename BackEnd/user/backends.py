"""
Custom Django authentication backends for cookie-based JWT authentication.
"""

from django.contrib.auth.backends import ModelBackend
from django.contrib.auth.models import User
from rest_framework_simplejwt.tokens import AccessToken
from jwt.exceptions import InvalidTokenError


class CookieAuthBackend(ModelBackend):
    """
    Django authentication backend that authenticates from JWT cookie.

    This backend is used by django.contrib.auth for request.user authentication.
    It reads the JWT token from the 'access_token' cookie and authenticates the user.
    """

    def authenticate(self, request, **kwargs):
        """
        Authenticate the user based on the JWT token in the cookie.

        Args:
            request: The HTTP request object
            **kwargs: Additional keyword arguments

        Returns:
            User object if authentication succeeds, None otherwise
        """
        if request is None:
            return None

        # Try to get token from cookie
        access_token = request.COOKIES.get("access_token")

        if not access_token:
            return None

        try:
            # Decode and validate the token
            token = AccessToken(access_token)
            user_id = token.get("user_id")

            if not user_id:
                return None

            # Get the user from the database
            user = User.objects.get(id=user_id)

            # Check if user is active
            if not user.is_active:
                return None

            return user

        except (InvalidTokenError, KeyError, User.DoesNotExist):
            return None
