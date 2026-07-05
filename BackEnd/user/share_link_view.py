"""
Share Link View for WebSocket Collaboration

This module provides the ShareLinkView class for generating share tokens
that allow anonymous users to join collaboration sessions via share links.
"""

from datetime import timedelta
import hashlib
import logging

from django.conf import settings
from django.core import signing
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema

from .models import Design
from .utils import error_response, success_response

logger = logging.getLogger(__name__)


class ShareLinkView(APIView):
    """生成协作分享链接视图。"""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT, summary="生成协作分享链接")
    def post(self, request, design_id):
        try:
            design = get_object_or_404(Design, id=design_id)

            if design.author != request.user:
                logger.warning(
                    f"用户 {request.user.username} 尝试为非自己的设计生成分享链接: design_id={design_id}"
                )
                return error_response("只有设计作者才能生成分享链接", status.HTTP_403_FORBIDDEN)

            ttl_seconds = int(request.data.get("expires_in_seconds") or getattr(settings, "COLLAB_SHARE_TOKEN_TTL_SECONDS", 3600))
            role = request.data.get("role") or "editor"
            if role not in {"editor", "viewer", "commenter"}:
                role = "editor"
            password = request.data.get("password") or ""
            password_hash = hashlib.sha256(password.encode("utf-8")).hexdigest() if password else ""
            expires_at = timezone.now() + timedelta(seconds=ttl_seconds)
            payload = {
                "design_id": design_id,
                "scope": "collaboration:join",
                "role": role,
                "password_hash": password_hash,
                "exp": int(expires_at.timestamp()),
            }
            share_token = signing.dumps(payload, salt="collab-share")

            design.is_shared = True
            design.save(update_fields=["is_shared"])

            host = request.get_host()
            ws_protocol = "wss" if request.is_secure() else "ws"
            share_url = f"{ws_protocol}://{host}/ws/collaboration/{design_id}/?share_token={share_token}"

            logger.info(
                f"用户 {request.user.username} 生成了设计 {design_id} 的分享链接，过期时间: {expires_at.isoformat()}"
            )

            return Response(
                {
                    "success": True,
                    "message": "分享链接已生成",
                    "data": {
                        "shareUrl": share_url,
                        "shareToken": share_token,
                        "expiresAt": expires_at.isoformat(),
                        "ttlSeconds": ttl_seconds,
                        "role": role,
                        "passwordProtected": bool(password),
                    },
                }
            )
        except Http404:
            return error_response("设计不存在", status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"生成分享链接时出错: {str(e)}")
            return error_response(f"生成分享链接失败: {str(e)}", status.HTTP_500_INTERNAL_SERVER_ERROR)
