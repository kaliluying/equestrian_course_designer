"""
Share Link View for WebSocket Collaboration

This module provides the ShareLinkView class for generating share tokens
that allow anonymous users to join collaboration sessions via share links.
"""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from .models import CollaborationShareLink, Design
from .serializers import (
    ShareLinkCreateResponseSerializer,
    ShareLinkCreateSerializer,
    ShareLinkRevokeResponseSerializer,
)
from .services.collaboration_share_links import create_share_link, revoke_share_link
from .throttles import ShareLinkRateThrottle
from .utils import error_response

logger = logging.getLogger(__name__)


class ShareLinkView(APIView):
    """生成协作分享链接视图。"""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ShareLinkRateThrottle]

    @extend_schema(
        request=ShareLinkCreateSerializer,
        responses={200: ShareLinkCreateResponseSerializer},
        summary="生成协作分享链接",
    )
    def post(self, request, design_id):
        try:
            design = get_object_or_404(Design, id=design_id)

            if design.author != request.user:
                logger.warning(
                    "用户尝试为非自己的设计生成分享链接: user_id=%s, design_id=%s",
                    request.user.id,
                    design_id,
                )
                return error_response("只有设计作者才能生成分享链接", status.HTTP_403_FORBIDDEN)

            request_serializer = ShareLinkCreateSerializer(data=request.data)
            if not request_serializer.is_valid():
                return error_response(request_serializer.errors, status.HTTP_400_BAD_REQUEST)
            request_data = request_serializer.validated_data
            ttl_seconds = request_data.get(
                "expires_in_seconds",
                getattr(settings, "COLLAB_SHARE_TOKEN_TTL_SECONDS", 3600),
            )
            role = request_data.get("role", "editor")
            password = request_data.get("password", "")
            share_link, share_token = create_share_link(
                design=design,
                created_by=request.user,
                role=role,
                expires_in_seconds=ttl_seconds,
                password=password,
            )

            host = request.get_host()
            ws_protocol = "wss" if request.is_secure() else "ws"
            share_url = f"{ws_protocol}://{host}/ws/collaboration/{design_id}/?share_token={share_token}"

            logger.info(
                "用户 %s 生成设计 %s 的协作分享链接，share_link_id=%s",
                request.user.id,
                design_id,
                share_link.id,
            )

            response_data = {
                "shareUrl": share_url,
                "shareToken": share_token,
                "expiresAt": share_link.expires_at.isoformat(),
                "ttlSeconds": ttl_seconds,
                "role": role,
                "passwordProtected": bool(password),
            }
            return Response(
                {
                    "success": True,
                    "message": "分享链接已生成",
                    "data": response_data,
                }
            )
        except Http404:
            return error_response("设计不存在", status.HTTP_404_NOT_FOUND)
        except (TypeError, ValueError):
            return error_response("分享链接参数无效", status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("生成协作分享链接失败")
            return error_response("生成分享链接失败，请稍后重试", status.HTTP_500_INTERNAL_SERVER_ERROR)


    @extend_schema(
        request=None,
        responses={200: ShareLinkRevokeResponseSerializer},
        summary="撤销协作分享链接",
    )
    def delete(self, request, design_id):
        try:
            design = get_object_or_404(Design, id=design_id)
            if design.author != request.user:
                return error_response("只有设计作者才能撤销分享链接", status.HTTP_403_FORBIDDEN)
            revoked_link_ids = list(
                CollaborationShareLink.objects.filter(
                    design=design,
                    created_by=request.user,
                    is_revoked=False,
                ).values_list("id", flat=True)
            )
            revoked_count = revoke_share_link(design=design, created_by=request.user)
            if revoked_link_ids:
                try:
                    channel_layer = get_channel_layer()
                    if channel_layer is not None:
                        async_to_sync(channel_layer.group_send)(
                            f"collaboration_{design.id}",
                            {
                                "type": "share_link_revoked",
                                "share_link_ids": revoked_link_ids,
                            },
                        )
                except Exception:
                    # 数据库撤销已经完成，通知失败时由 Consumer 的逐消息复核兜底。
                    logger.exception(
                        "广播分享链接撤销事件失败: design_id=%s",
                        design.id,
                    )
            return Response(
                {
                    "success": True,
                    "message": "分享链接已撤销",
                    "data": {"revoked_count": revoked_count},
                }
            )
        except Http404:
            return error_response("设计不存在", status.HTTP_404_NOT_FOUND)
        except Exception:
            logger.exception("撤销协作分享链接失败")
            return error_response("撤销分享链接失败，请稍后重试", status.HTTP_500_INTERNAL_SERVER_ERROR)
