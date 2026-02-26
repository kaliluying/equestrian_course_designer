"""
Share Link View for WebSocket Collaboration

This module provides the ShareLinkView class for generating share tokens
that allow anonymous users to join collaboration sessions via share links.
"""

import logging
from django.utils import timezone
from datetime import timedelta
from django.core import signing
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.conf import settings
from .models import Design
from .utils import error_response, success_response

logger = logging.getLogger(__name__)


class ShareLinkView(APIView):
    """
    生成协作分享链接视图

    POST /user/designs/<int:design_id>/share-link/

    仅设计作者可以生成分享链接。
    返回包含 share_token 的 WebSocket URL，用于匿名用户加入协作。
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, design_id):
        """
        生成协作分享链接

        参数:
            design_id: 设计ID

        返回:
            JSON响应包含 shareUrl, shareToken, expiresAt
        """
        try:
            # 获取设计
            design = get_object_or_404(Design, id=design_id)

            # 验证是否为设计作者
            if design.author != request.user:
                logger.warning(
                    f"用户 {request.user.username} 尝试为非自己的设计生成分享链接: "
                    f"design_id={design_id}"
                )
                return error_response(
                    "只有设计作者才能生成分享链接", status.HTTP_403_FORBIDDEN
                )

            # 获取TTL设置
            ttl_seconds = getattr(
                settings,
                "COLLAB_SHARE_TOKEN_TTL_SECONDS",
                3600,  # 默认1小时
            )

            # 生成过期时间
            expires_at = timezone.now() + timedelta(seconds=ttl_seconds)

            # 构建token payload
            payload = {
                "design_id": design_id,
                "scope": "collaboration:join",
                "exp": int(expires_at.timestamp()),
            }

            # 使用Django signing生成签名token
            share_token = signing.dumps(payload, salt="collab-share")

            # 标记设计为已分享
            design.is_shared = True
            design.save(update_fields=["is_shared"])

            # 构建WebSocket URL
            host = request.get_host()
            # 根据请求协议确定WebSocket协议
            ws_protocol = "wss" if request.is_secure() else "ws"
            share_url = (
                f"{ws_protocol}://{host}/ws/collaboration/{design_id}/"
                f"?share_token={share_token}"
            )

            logger.info(
                f"用户 {request.user.username} 生成了设计 {design_id} 的分享链接，"
                f"过期时间: {expires_at.isoformat()}"
            )

            return success_response(
                "分享链接已生成",
                {
                    "shareUrl": share_url,
                    "shareToken": share_token,
                    "expiresAt": expires_at.isoformat(),
                    "ttlSeconds": ttl_seconds,
                },
            )

        except Design.DoesNotExist:
            return error_response("设计不存在", status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"生成分享链接时出错: {str(e)}")
            return error_response(
                f"生成分享链接失败: {str(e)}", status.HTTP_500_INTERNAL_SERVER_ERROR
            )
