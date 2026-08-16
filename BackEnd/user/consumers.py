"""
协作WebSocket管理模块

该模块实现了基于Django Channels的WebSocket消费者，用于处理马术障碍赛路线设计器的实时协作功能。
主要功能包括：
- 管理WebSocket连接的建立和断开
- 处理用户加入和离开协作会话
- 转发协作消息（障碍物更新、路径更新、光标移动等）
- 维护协作会话状态和协作者列表
- 支持通过分享链接加入协作（需要有效的share_token）
"""

import hashlib
import json  # 用于JSON数据的序列化和反序列化
import logging  # 用于日志记录
import re
import time
import uuid  # 用于生成唯一标识符
from urllib.parse import parse_qs

from channels.db import database_sync_to_async  # 用于在异步环境中执行同步数据库操作
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.cache import cache
from django.contrib.auth.models import User  # Django用户模型
from django.utils import timezone  # 用于时区感知的日期和时间处理

# 设置日志记录器
logger = logging.getLogger("django.channels")

from user.session_store import active_sessions
from user.services.collaboration_share_links import resolve_share_token

# 协作连接关闭码
CLOSE_CODE_INVALID_SHARE_TOKEN = 4006
CLOSE_CODE_VIA_LINK_DEPRECATED = 4007
CLOSE_CODE_DESIGN_NOT_FOUND = 4008
CLOSE_CODE_RATE_LIMITED = 4009
CLOSE_CODE_SESSION_FULL = 4010
CLOSE_CODE_COLLABORATION_ACCESS_DENIED = 4004
SHARE_AUTH_MAX_ATTEMPTS = 3
WEBSOCKET_CONNECTION_LIMIT = 30
WEBSOCKET_CONNECTION_WINDOW = 60
WEBSOCKET_MAX_MESSAGE_BYTES = 2 * 1024 * 1024
WEBSOCKET_MAX_MESSAGE_RATE = 120
WEBSOCKET_MAX_CHAT_LENGTH = 2000
SYNC_REQUEST_TTL_SECONDS = 30
MAX_SESSION_COLLABORATORS = 20


def _json_depth(value, depth=0):
    """限制协作消息嵌套深度，避免恶意 JSON 消耗过多解析资源。"""
    if depth > 20:
        return depth
    if isinstance(value, dict):
        return max((_json_depth(item, depth + 1) for item in value.values()), default=depth)
    if isinstance(value, list):
        return max((_json_depth(item, depth + 1) for item in value), default=depth)
    return depth


def _safe_collaborator_color(value):
    """只接受十六进制颜色，避免把客户端字符串写入前端 style。"""
    if isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        return value
    return None


def _has_session_capacity(session):
    """限制单个协作会话的协作者数量，避免会话和广播无限膨胀。"""
    collaborators = session.get("collaborators")
    return isinstance(collaborators, list) and len(collaborators) < MAX_SESSION_COLLABORATORS


def _allow_websocket_connection(scope):
    """按客户端地址限制 WebSocket 建连频率。"""
    client = scope.get("client") or ("unknown", 0)
    client_ip = str(client[0])
    key_suffix = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()[:24]
    key = f"collaboration:connect:{key_suffix}"
    try:
        if cache.add(key, 1, timeout=WEBSOCKET_CONNECTION_WINDOW):
            return True
        count = cache.incr(key)
        return count <= WEBSOCKET_CONNECTION_LIMIT
    except Exception:
        # 限流存储不可用时拒绝建连，避免故障期间被利用为无限连接入口。
        logger.exception("WebSocket 限流存储不可用，拒绝建连")
        return False

# 添加获取用户资料的异步方法


@database_sync_to_async
def get_user_profile_info(user):
    """异步获取用户协作权限。"""
    if not user or not user.is_authenticated:
        return False
    try:
        from .services.membership_access import can_collaborate

        return can_collaborate(user)
    except Exception as e:
        logger.error(f"获取用户协作权限失败: {str(e)}")
        return False


@database_sync_to_async
def check_design_access(user, design_id):
    """
    检查用户是否有权访问该设计
    返回: (has_access, is_owner, role)
    """
    from .models import Design

    if not user or not user.is_authenticated:
        return False, False, None
    try:
        design = Design.objects.get(id=design_id)
        is_owner = design.author_id == user.id
        role_record = None if is_owner else design.collaboration_roles.filter(user=user).first()
        role = "owner" if is_owner else (role_record.role if role_record else None)
        has_access = is_owner or role_record is not None
        return has_access, is_owner, role
    except Design.DoesNotExist:
        return False, False, None
    except Exception as e:
        logger.error(f"检查设计访问权限失败: {str(e)}")
        return False, False, None


@database_sync_to_async
def get_design_by_id(design_id):
    """异步获取设计"""
    from .models import Design

    try:
        return Design.objects.get(id=design_id)
    except Design.DoesNotExist:
        return None


def validate_share_token(token, design_id, password=None):
    """
    验证分享令牌

    参数:
        token: 分享令牌字符串
        design_id: 设计ID

    返回:
        tuple: (is_valid: bool, error_code: int | None, error_reason: str | None)
    """
    if not token:
        return False, CLOSE_CODE_VIA_LINK_DEPRECATED, "via_link_deprecated"

    _, error_reason = resolve_share_token(token=token, design_id=design_id, password=password)
    if error_reason:
        error_code = (
            CLOSE_CODE_VIA_LINK_DEPRECATED
            if error_reason == "via_link_deprecated"
            else CLOSE_CODE_INVALID_SHARE_TOKEN
        )
        return False, error_code, error_reason
    return True, None, None


@database_sync_to_async
def resolve_active_share_token(token, design_id):
    """重新查询分享链接状态，确保撤销或过期立即阻止后续操作。"""
    return resolve_share_token(
        token=token,
        design_id=design_id,
        verify_password=False,
    )


class CollaborationConsumer(AsyncWebsocketConsumer):
    """
    协作WebSocket消费者类

    负责处理WebSocket连接的生命周期和消息处理，包括：
    - 连接建立和断开
    - 消息接收和发送
    - 协作会话状态管理
    - 协作者信息管理

    该类支持认证用户和匿名用户（通过链接加入）的协作。
    """

    async def connect(self):
        """
        处理WebSocket连接请求
        - 验证用户权限
        - 验证分享令牌（如果提供）
        - 初始化会话
        - 建立连接
        - 处理协作者加入
        """
        try:
            # 1. 获取基本信息
            self.design_id = self.scope["url_route"]["kwargs"]["design_id"]
            self.room_group_name = f"collaboration_{self.design_id}"
            self.user = self.scope.get("user", None)
            self._connection_accepted = getattr(self, "_connection_accepted", False)
            self._share_auth_pending = getattr(self, "_share_auth_pending", False)
            self._share_auth_attempts = getattr(self, "_share_auth_attempts", 0)
            self._share_password_verified = getattr(self, "_share_password_verified", False)
            self._message_times = []
            if not self._share_password_verified and not await database_sync_to_async(
                _allow_websocket_connection
            )(self.scope):
                await self.accept()
                self._connection_accepted = True
                await self.close(code=CLOSE_CODE_RATE_LIMITED)
                return

            # 2. 解析查询字符串
            query_string = self.scope.get("query_string", b"").decode("utf-8")
            query_params = {
                key: values[0]
                for key, values in parse_qs(query_string, keep_blank_values=True).items()
                if values
            }

            self.share_token = query_params.get("share_token", None)
            self.is_via_link = query_params.get("via_link") == "true"
            self.share_link = None
            self.permission_role = None
            self.session_member_id = None
            self.session_member_name = "分享访客"

            # 3. 验证分享令牌
            if self.share_token:
                self.share_link, error_reason = await database_sync_to_async(resolve_share_token)(
                    token=self.share_token,
                    design_id=self.design_id,
                    verify_password=False,
                )
                if error_reason:
                    error_code = (
                        CLOSE_CODE_VIA_LINK_DEPRECATED
                        if error_reason == "via_link_deprecated"
                        else CLOSE_CODE_INVALID_SHARE_TOKEN
                    )
                    logger.warning("WebSocket协作连接校验失败: design_id=%s", self.design_id)
                    await self._close_with_protocol_error(error_code, error_reason)
                    return
                self.permission_role = self.share_link.role
                if self.share_link.password_hash and not self._share_password_verified:
                    # 密码只能通过已经建立的 WebSocket 连接提交，禁止出现在 URL、
                    # 代理访问日志和浏览器历史中。
                    self._share_auth_pending = True
                    if not self._connection_accepted:
                        await self.accept()
                        self._connection_accepted = True
                    await self.send(
                        text_data=json.dumps(
                            {
                                "type": "share_auth_required",
                                "message": "请输入协作链接密码",
                                "payload": {
                                    "attempts_remaining": SHARE_AUTH_MAX_ATTEMPTS,
                                },
                            }
                        )
                    )
                    return
            elif self.is_via_link:
                # via_link=true 但没有 share_token，拒绝连接
                await self._close_with_protocol_error(
                    CLOSE_CODE_VIA_LINK_DEPRECATED,
                    "via_link_deprecated",
                )
                return

            # 5. 权限检查（非匿名访问需要认证）
            if not self.share_token:
                if not self.user or not self.user.is_authenticated:
                    await self.accept()
                    await self.send(
                        text_data=json.dumps(
                            {
                                "type": "error",
                                "message": "请先登录或使用有效的分享链接",
                                "payload": {
                                    "code": "authentication_required",
                                    "reason": "authentication_required",
                                    "message": "请先登录或使用有效的分享链接",
                                },
                                "timestamp": timezone.now().isoformat(),
                            }
                        )
                    )
                    await self.close(code=4001)  # 未认证
                    return

                # 检查设计访问权限
                has_access, is_owner, user_role = await check_design_access(
                    self.user, self.design_id
                )
                if not has_access:
                    logger.warning(
                        "协作访问被拒绝: user_id=%s, design_id=%s",
                        self.user.id,
                        self.design_id,
                    )
                    await self.accept()
                    await self.send(
                        text_data=json.dumps(
                            {
                                "type": "error",
                                "message": "您没有权限访问此设计",
                                "payload": {
                                    "code": "collaboration_access_denied",
                                    "reason": "collaboration_access_denied",
                                    "message": "您没有权限访问此设计",
                                },
                                "timestamp": timezone.now().isoformat(),
                            }
                        )
                    )
                    await self.close(code=CLOSE_CODE_COLLABORATION_ACCESS_DENIED)
                    return

                self.permission_role = user_role

                # 只有设计作者在创建新的协作会话时需要会员协作权益；已经
                # 授权的协作者可以加入作者已建立的会话。
                if is_owner and self.design_id not in active_sessions and not await get_user_profile_info(self.user):
                    logger.warning("用户 %s 无协作权益", self.user.id)
                    await self.accept()
                    await self.send(
                        text_data=json.dumps(
                            {
                                "type": "error",
                                "message": "只有具备协作权益的会员才能发起协作",
                                "payload": {
                                    "code": "collaboration_membership_required",
                                    "reason": "collaboration_membership_required",
                                    "message": "只有具备协作权益的会员才能发起协作",
                                },
                                "timestamp": timezone.now().isoformat(),
                            }
                        )
                    )
                    await self.close(code=4003)
                    return

            else:
                # 通过分享链接访问，检查设计是否存在
                design = await get_design_by_id(self.design_id)
                if design is None:
                    logger.warning(f"分享链接指向不存在的设计: {self.design_id}")
                    await self._close_with_protocol_error(
                        CLOSE_CODE_DESIGN_NOT_FOUND,
                        "design_not_found",
                    )
                    return

            # 6. 加入房间组
            await self.channel_layer.group_add(self.room_group_name, self.channel_name)

            # 7. 初始化或获取会话。创建动作由 Redis 锁保护，避免并发连接覆盖
            # 已经创建的 session 元数据。
            active_sessions.create_if_absent(
                self.design_id,
                {
                    "id": str(uuid.uuid4()),
                    "design_id": self.design_id,
                    "collaborators": [],
                    "sync_requests": {},
                    "owner": None,
                    "initiator": None,
                    "created_at": timezone.now().isoformat(),
                },
            )

            # 7. 接受连接
            if not self._connection_accepted:
                await self.accept()
                self._connection_accepted = True

            self.session_member_id = (
                str(self.user.id)
                if self.user and self.user.is_authenticated
                else f"link:{self.share_link.id}:{uuid.uuid4().hex[:12]}"
            )
            self.session_member_name = (
                self.user.username
                if self.user and self.user.is_authenticated
                else "分享访客"
            )

            # 8. 发送连接成功消息
            await self.send(
                text_data=json.dumps(
                    {
                        "type": "connection_established",
                        "message": "连接已建立",
                        "timestamp": timezone.now().isoformat(),
                        "design_id": self.design_id,
                        "member_id": self.session_member_id,
                        "session": {
                            "id": active_sessions[self.design_id]["id"],
                            "design_id": self.design_id,
                            "collaborators": active_sessions[self.design_id][
                                "collaborators"
                            ],
                            "owner": active_sessions[self.design_id]["owner"],
                            "initiator": active_sessions[self.design_id]["initiator"],
                            "created_at": active_sessions[self.design_id]["created_at"],
                        },
                    }
                )
            )

            # 9. 处理用户加入。匿名分享访客也记录为独立连接，避免其拥有
            # 写入权限时无法被审计和断开清理。
            if self.session_member_id:
                user_role = self.permission_role or "viewer"
                now = timezone.now().isoformat()

                def add_collaborator(session):
                    """在锁内加入协作者并返回是否为新连接。"""
                    if (
                        not self.share_token
                        and user_role == "owner"
                        and not session["initiator"]
                    ):
                        session_role = "initiator"
                    else:
                        session_role = user_role

                    existing = next(
                        (
                            item
                            for item in session["collaborators"]
                            if item["id"] == self.session_member_id
                        ),
                        None,
                    )
                    if existing:
                        existing["last_active"] = now
                        try:
                            connection_count = int(existing.get("connection_count", 1))
                        except (TypeError, ValueError):
                            connection_count = 1
                        existing["connection_count"] = max(connection_count, 1) + 1
                        return False, session, session_role

                    if not _has_session_capacity(session):
                        return False, session, None

                    session["collaborators"].append(
                        {
                            "id": self.session_member_id,
                            "username": self.session_member_name,
                            "color": self._generate_color(),
                            "role": session_role,
                            "last_active": now,
                            "connection_count": 1,
                        }
                    )
                    if (
                        not session["owner"]
                        and user_role == "owner"
                        and self.user
                        and self.user.is_authenticated
                    ):
                        session["owner"] = self.session_member_id
                    if session_role == "initiator" and not session["initiator"]:
                        session["initiator"] = self.session_member_id
                    return True, session, session_role

                result = active_sessions.mutate(self.design_id, add_collaborator)
                if result is not None:
                    is_new, session, session_role = result
                    if session_role is None:
                        self.session_member_id = None
                        await self.channel_layer.group_discard(
                            self.room_group_name, self.channel_name
                        )
                        await self._close_with_protocol_error(
                            CLOSE_CODE_SESSION_FULL,
                            "collaboration_session_full",
                        )
                        return
                    if is_new:
                        await self.channel_layer.group_send(
                            self.room_group_name,
                            {
                                "type": "collaboration_message",
                                "message": {
                                    "type": "join",
                                    "senderId": self.session_member_id,
                                    "senderName": self.session_member_name,
                                    "sessionId": session["id"],
                                    "timestamp": now,
                                    "payload": {
                                        "session": session,
                                        "user_role": session_role,
                                    },
                                },
                            },
                        )

        except Exception:
            logger.exception("WebSocket连接错误: design_id=%s", getattr(self, "design_id", None))

            try:
                if not self._connection_accepted:
                    await self.accept()
                    self._connection_accepted = True

                # 发送错误消息
                await self.send(
                    text_data=json.dumps(
                        {
                            "type": "error",
                            "message": "连接失败，请稍后重试",
                            "payload": {
                                "code": "connection_failed",
                                "reason": "connection_failed",
                                "message": "连接失败，请稍后重试",
                            },
                            "timestamp": timezone.now().isoformat(),
                        }
                    )
                )

                # 延迟关闭连接
                await self.close(code=4000)
            except Exception:
                logger.exception("发送 WebSocket 错误消息失败")

    async def _handle_share_auth(self, message):
        """处理首条分享密码消息，密码不进入 URL 或日志。"""
        if not isinstance(message, dict) or message.get("type") != "share_auth":
            await self.send(
                text_data=json.dumps(
                    {
                        "type": "share_auth_failed",
                        "message": "请先验证协作链接密码",
                        "payload": {"code": "share_password_required"},
                    }
                )
            )
            return

        payload = message.get("payload")
        password = payload.get("password") if isinstance(payload, dict) else None
        if not isinstance(password, str) or len(password) > 128:
            share_link = None
            error_reason = "invalid_share_password"
        else:
            share_link, error_reason = await database_sync_to_async(resolve_share_token)(
                token=self.share_token,
                design_id=self.design_id,
                password=password,
                verify_password=True,
            )

        if error_reason:
            self._share_auth_attempts += 1
            remaining = max(0, SHARE_AUTH_MAX_ATTEMPTS - self._share_auth_attempts)
            error_messages = {
                "invalid_share_password": "协作链接密码错误",
                "revoked_share_token": "分享链接已撤销",
                "expired_share_token": "分享链接已过期",
                "invalid_share_token": "分享链接无效",
                "share_link_not_found": "分享链接不存在",
                "share_design_mismatch": "分享链接与设计不匹配",
                "share_scope_mismatch": "分享链接用途无效",
            }
            error_message = error_messages.get(error_reason, "分享链接无效")
            await self.send(
                text_data=json.dumps(
                    {
                        "type": "share_auth_failed",
                        "message": error_message,
                        "payload": {
                            "code": error_reason,
                            "reason": error_reason,
                            "message": error_message,
                            "attempts_remaining": remaining,
                        },
                    }
                )
            )
            if (
                error_reason != "invalid_share_password"
                or self._share_auth_attempts >= SHARE_AUTH_MAX_ATTEMPTS
            ):
                await self.close(code=CLOSE_CODE_INVALID_SHARE_TOKEN)
            return

        self.share_link = share_link
        self.permission_role = share_link.role
        self._share_auth_pending = False
        self._share_password_verified = True
        await self.connect()

    async def disconnect(self, close_code):
        """
        处理WebSocket连接断开

        主要步骤：
        1. 如果用户已认证，将其从协作者列表中移除
        2. 广播离开消息
        3. 如果没有剩余协作者，清理会话
        4. 离开房间组

        参数:
            close_code: WebSocket关闭代码
        """
        try:
            logger.info(
                "处理WebSocket断开连接: design_id=%s, member_id=%s, close_code=%s",
                self.design_id,
                getattr(self, "session_member_id", None),
                close_code,
            )

            # 将认证用户和匿名分享访客都从协作者列表中移除。
            if getattr(self, "session_member_id", None):
                session = active_sessions.remove_collaborator(
                    self.design_id,
                    self.session_member_id,
                )
                if session is None:
                    await self.channel_layer.group_discard(
                        self.room_group_name, self.channel_name
                    )
                    return

                # 同一用户的其他标签页仍在线时，不广播离开消息。
                if not any(
                    item.get("id") == self.session_member_id
                    for item in session.get("collaborators", [])
                ):
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            "type": "collaboration_message",
                            "message": {
                                "type": "leave",
                                "senderId": self.session_member_id,
                                "senderName": self.session_member_name,
                                "sessionId": session["id"],
                                "timestamp": timezone.now().isoformat(),
                                "payload": {"session": session},
                            },
                        },
                    )

            # 离开房间组
            await self.channel_layer.group_discard(
                self.room_group_name, self.channel_name
            )

            logger.info("WebSocket连接已断开: design_id=%s, code=%s", self.design_id, close_code)
        except Exception as e:
            # 处理断开连接过程中的任何异常
            logger.error(f"断开连接时出错: {str(e)}", exc_info=True)

    def _can_send_message(self, message_type):
        """按分享角色限制 WebSocket 消息类型。"""
        if self.permission_role in {"owner", "editor"}:
            return True
        if message_type in {"join", "sync_request", "cursor_move"}:
            return True
        return self.permission_role == "commenter" and message_type == "chat"

    async def _ensure_active_share_link(self):
        """在每条消息前复核分享链接或登录用户的当前权限。"""
        if not self.share_token:
            has_access, _, user_role = await check_design_access(self.user, self.design_id)
            if not has_access:
                await self._close_with_protocol_error(
                    CLOSE_CODE_COLLABORATION_ACCESS_DENIED,
                    "collaboration_access_denied",
                )
                return False
            self.permission_role = user_role
            return True

        share_link, error_reason = await resolve_active_share_token(
            self.share_token,
            self.design_id,
        )
        if error_reason:
            await self._close_with_protocol_error(
                CLOSE_CODE_INVALID_SHARE_TOKEN,
                error_reason,
            )
            return False

        self.share_link = share_link
        self.permission_role = share_link.role
        return True

    async def _send_protocol_error(self, message):
        """向当前连接返回不包含内部异常的协议错误。"""
        await self.send(
            text_data=json.dumps(
                {
                    "type": "error",
                    "message": message,
                    "payload": {"message": message},
                    "timestamp": timezone.now().isoformat(),
                }
            )
        )

    async def _close_with_protocol_error(self, code, reason):
        """发送稳定的业务错误原因后关闭连接。"""
        messages = {
            "revoked_share_token": "分享链接已撤销",
            "expired_share_token": "分享链接已过期",
            "invalid_share_password": "访问密码错误",
            "invalid_share_token": "分享链接无效",
            "share_link_not_found": "分享链接不存在",
            "share_design_mismatch": "分享链接与设计不匹配",
            "share_scope_mismatch": "分享链接用途无效",
            "via_link_deprecated": "分享链接无效，请重新生成",
            "design_not_found": "设计不存在",
            "collaboration_access_denied": "您没有权限访问此设计",
        }
        if not self._connection_accepted:
            await self.accept()
            self._connection_accepted = True
        message = messages.get(reason, "协作连接失败，请稍后重试")
        await self.send(
            text_data=json.dumps(
                {
                    "type": "error",
                    "message": message,
                    "payload": {"code": reason, "reason": reason, "message": message},
                    "timestamp": timezone.now().isoformat(),
                }
            )
        )
        await self.close(code=code)

    async def receive(self, text_data):
        """校验、规范化并转发协作消息。"""
        try:
            if (
                not isinstance(text_data, str)
                or len(text_data.encode("utf-8")) > WEBSOCKET_MAX_MESSAGE_BYTES
            ):
                await self._send_protocol_error("协作消息过大")
                return

            now_monotonic = time.monotonic()
            self._message_times = [
                item for item in self._message_times
                if now_monotonic - item < 60
            ]
            if len(self._message_times) >= WEBSOCKET_MAX_MESSAGE_RATE:
                await self._send_protocol_error("协作消息过于频繁")
                return
            self._message_times.append(now_monotonic)

            message = json.loads(text_data)
            if not await self._ensure_active_share_link():
                return
            if getattr(self, "_share_auth_pending", False):
                await self._handle_share_auth(message)
                return
            if not isinstance(message, dict):
                await self._send_protocol_error("消息格式无效")
                return

            message_type = message.get("type")
            allowed_types = {
                "join", "update_obstacle", "add_obstacle", "remove_obstacle",
                "update_path", "cursor_move", "sync_request", "sync_response", "chat",
            }
            if message_type not in allowed_types:
                await self._send_protocol_error("不支持的协作消息类型")
                return
            if not self._can_send_message(message_type):
                await self._send_protocol_error("当前协作角色无权执行此操作")
                return
            if self.design_id not in active_sessions:
                await self._send_protocol_error("协作会话已结束")
                return


            payload = message.get("payload")
            if not isinstance(payload, dict):
                await self._send_protocol_error("消息 payload 必须是对象")
                return
            if _json_depth(payload) > 20:
                await self._send_protocol_error("消息嵌套层级过深")
                return
            if len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) > WEBSOCKET_MAX_MESSAGE_BYTES:
                await self._send_protocol_error("消息 payload 过大")
                return
            if message_type == "chat":
                content = payload.get("content")
                if (
                    not isinstance(content, str)
                    or not content.strip()
                    or len(content) > WEBSOCKET_MAX_CHAT_LENGTH
                ):
                    await self._send_protocol_error("聊天内容格式无效或过长")
                    return

            now = timezone.now().isoformat()
            normalized_message = {
                "type": message_type,
                "senderId": self.session_member_id,
                "senderName": self.session_member_name,
                "sessionId": active_sessions[self.design_id]["id"],
                "timestamp": now,
                "payload": payload,
            }

            if message_type == "join":
                def update_join(session):
                    """在锁内更新协作者并返回最新会话。"""
                    collaborator = next(
                        (
                            item
                            for item in session["collaborators"]
                            if item["id"] == self.session_member_id
                        ),
                        None,
                    )
                    if collaborator is None:
                        session["collaborators"].append(
                            {
                                "id": self.session_member_id,
                                "username": self.session_member_name,
                                "color": _safe_collaborator_color(payload.get("color"))
                                or self._generate_color(),
                                "role": self.permission_role or "viewer",
                                "last_active": now,
                            }
                        )
                    else:
                        collaborator["last_active"] = now
                    return session

                session = active_sessions.mutate(self.design_id, update_join)
                if session is None:
                    await self._send_protocol_error("协作会话已结束")
                    return
                normalized_message["payload"] = {
                    "session": session,
                    "user_role": self.permission_role,
                }
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {"type": "collaboration_message", "message": normalized_message},
                )
                return

            if message_type == "sync_request":
                # 将请求广播给可能持有最新画布的编辑者。request_id 和
                # requester_id 均由服务端生成，响应方不能伪造目标连接。
                request_id = uuid.uuid4().hex
                request_payload = dict(payload)
                request_payload.pop("targetUserId", None)
                request_payload.pop("targetUser", None)
                request_payload["requestId"] = request_id
                request_payload["requesterId"] = self.session_member_id
                session = active_sessions.mutate(
                    self.design_id,
                    lambda current: self._register_sync_request(
                        current,
                        request_id,
                        self.session_member_id,
                    ),
                )
                if session is None:
                    await self._send_protocol_error("协作会话已结束")
                    return
                normalized_message["payload"] = request_payload
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {"type": "collaboration_message", "message": normalized_message},
                )
                return

            if message_type == "sync_response":
                # viewer/commenter 不能伪造画布快照。编辑者主动广播可以不带
                # requestId；定向响应必须消费服务端登记的请求记录。
                response_payload = dict(payload)
                request_id = response_payload.get("requestId")
                response_payload.pop("targetUserId", None)
                response_payload.pop("targetUser", None)
                if request_id is not None:
                    if not isinstance(request_id, str) or len(request_id) > 64:
                        await self._send_protocol_error("同步请求标识无效")
                        return
                    target_id = active_sessions.mutate(
                        self.design_id,
                        lambda current: self._consume_sync_request(current, request_id),
                    )
                    if not target_id:
                        await self._send_protocol_error("同步请求已失效")
                        return
                    response_payload["targetUserId"] = target_id
                normalized_message["payload"] = response_payload
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {"type": "collaboration_message", "message": normalized_message},
                )
                return

            def touch_collaborator(session):
                """在锁内更新当前连接的活跃时间。"""
                for collaborator in session["collaborators"]:
                    if collaborator["id"] == self.session_member_id:
                        collaborator["last_active"] = now
                        break

            active_sessions.mutate(self.design_id, touch_collaborator)

            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "collaboration_message", "message": normalized_message},
            )
        except json.JSONDecodeError:
            await self._send_protocol_error("无效的 JSON 数据")
        except Exception:
            logger.exception("处理协作消息失败: design_id=%s", getattr(self, "design_id", None))
            await self._send_protocol_error("处理协作消息失败，请重新连接")

    async def collaboration_message(self, event):
        """
        处理从房间组接收到的协作消息并发送给客户端

        这个方法由channel_layer.group_send调用，用于将消息发送给特定的WebSocket连接。

        参数:
            event: 包含消息内容的事件对象
        """
        try:
            # 从事件中获取消息
            message = event["message"]

            payload = message.get("payload")
            target_id = None
            if isinstance(payload, dict):
                target_id = payload.get("targetUserId") or payload.get("targetUser")
            if target_id is not None and str(target_id) != str(self.session_member_id):
                return

            # 发送消息到WebSocket客户端
            await self.send(text_data=json.dumps(message))
        except Exception:
            # 处理发送消息过程中的异常
            logger.exception("发送协作消息时出错")
            # 尝试发送错误消息
            try:
                await self.send(
                    text_data=json.dumps(
                        {
                            "type": "error",
                            "message": "发送协作消息失败，请重新连接",
                            "payload": {
                                "code": "message_delivery_failed",
                                "reason": "message_delivery_failed",
                                "message": "发送协作消息失败，请重新连接",
                            },
                            "timestamp": timezone.now().isoformat(),
                        }
                    )
                )
            except Exception:
                logger.exception("发送协作错误消息失败")

    async def share_link_revoked(self, event):
        """收到分享链接撤销事件后，主动关闭对应的在线连接。"""
        revoked_ids = {str(item) for item in event.get("share_link_ids", [])}
        if self.share_link and str(self.share_link.id) in revoked_ids:
            await self._close_with_protocol_error(
                CLOSE_CODE_INVALID_SHARE_TOKEN,
                "revoked_share_token",
            )

    @staticmethod
    def _register_sync_request(session, request_id, requester_id):
        """登记由服务端生成的同步请求，并限制待处理请求数量。"""
        requests = session.setdefault("sync_requests", {})
        now = time.time()
        expired_ids = []
        for key, value in requests.items():
            if not isinstance(value, dict):
                expired_ids.append(key)
                continue
            try:
                is_expired = now - float(value.get("created_at", 0)) > SYNC_REQUEST_TTL_SECONDS
            except (TypeError, ValueError):
                is_expired = True
            if is_expired:
                expired_ids.append(key)
        for key in expired_ids:
            requests.pop(key, None)
        requests[request_id] = {
            "requester_id": requester_id,
            "created_at": now,
        }
        if len(requests) > 50:
            oldest_request_id = next(iter(requests))
            requests.pop(oldest_request_id, None)
        return session

    @staticmethod
    def _consume_sync_request(session, request_id):
        """消费同步请求并返回服务端登记的目标连接 ID。"""
        request = session.setdefault("sync_requests", {}).pop(request_id, None)
        if not request:
            return None
        try:
            if time.time() - float(request.get("created_at", 0)) > SYNC_REQUEST_TTL_SECONDS:
                return None
        except (TypeError, ValueError):
            return None
        return request.get("requester_id")

    def _generate_color(self):
        """
        为用户生成随机颜色

        使用用户ID的哈希值来确保同一用户始终获得相同的颜色。

        返回:
            str: 十六进制颜色代码
        """
        colors = [
            "#FF6B6B",
            "#4ECDC4",
            "#45B7D1",
            "#FFA5A5",
            "#A5FFD6",
            "#FFC145",
            "#FF6B8B",
            "#845EC2",
            "#D65DB1",
            "#FF9671",
        ]
        return colors[hash(str(getattr(self, "session_member_id", None))) % len(colors)]
