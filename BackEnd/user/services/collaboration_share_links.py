"""协作分享链接的创建、撤销和服务端校验。"""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.utils import timezone

from user.models import CollaborationShareLink

SHARE_SCOPE = 'collaboration:join'
VALID_ROLES = frozenset({'editor', 'viewer', 'commenter'})


def _validate_ttl(expires_in_seconds: int) -> int:
    """限制分享链接有效期，避免生成永不过期或极短的链接。"""
    minimum = 60
    maximum = int(getattr(settings, 'COLLAB_SHARE_TOKEN_MAX_TTL_SECONDS', 7 * 24 * 3600))
    if expires_in_seconds < minimum or expires_in_seconds > maximum:
        raise ValueError(f'分享链接有效期必须在 {minimum} 秒到 {maximum} 秒之间')
    return expires_in_seconds


def build_share_token(*, share_link_id: int, design_id: int) -> str:
    """构建只包含服务端引用字段的签名 token。"""
    return signing.dumps(
        {
            'share_link_id': share_link_id,
            'design_id': design_id,
            'scope': SHARE_SCOPE,
        },
        salt='collab-share',
    )


def create_share_link(*, design, created_by, role: str, expires_in_seconds: int, password: str | None = None):
    """创建分享链接并只在数据库保存密码哈希。"""
    if role not in VALID_ROLES:
        raise ValueError('无效的协作角色')
    ttl_seconds = _validate_ttl(int(expires_in_seconds))
    share_link = CollaborationShareLink.objects.create(
        design=design,
        created_by=created_by,
        role=role,
        expires_at=timezone.now() + timedelta(seconds=ttl_seconds),
        password_hash=make_password(password) if password else '',
    )
    return share_link, build_share_token(share_link_id=share_link.id, design_id=design.id)


def revoke_share_link(*, design, created_by) -> int:
    """撤销设计作者创建的所有有效分享链接。"""
    return CollaborationShareLink.objects.filter(
        design=design,
        created_by=created_by,
        is_revoked=False,
    ).update(is_revoked=True, updated_at=timezone.now())


def resolve_share_token(
    *,
    token: str,
    design_id,
    password: str | None = None,
    verify_password: bool = True,
):
    """校验 token 并返回分享记录及错误原因。

    ``verify_password=False`` 只用于 WebSocket 建连后的首个密码认证阶段，
    让密码不会出现在查询字符串中；调用方仍必须在授予协作权限前再次校验密码。
    """
    if not token:
        return None, 'via_link_deprecated'
    try:
        payload = signing.loads(token, salt='collab-share')
    except signing.BadSignature:
        return None, 'invalid_share_token'

    if not isinstance(payload, dict) or payload.get('scope') != SHARE_SCOPE:
        return None, 'share_scope_mismatch'
    if str(payload.get('design_id')) != str(design_id):
        return None, 'share_design_mismatch'

    try:
        share_link = CollaborationShareLink.objects.select_related('design').get(
            id=payload.get('share_link_id'),
        )
    except (CollaborationShareLink.DoesNotExist, TypeError, ValueError):
        return None, 'share_link_not_found'

    if str(share_link.design_id) != str(design_id):
        return None, 'share_design_mismatch'

    if share_link.is_revoked:
        return None, 'revoked_share_token'
    if share_link.expires_at <= timezone.now():
        return None, 'expired_share_token'
    if (
        verify_password
        and share_link.password_hash
        and not check_password(password or '', share_link.password_hash)
    ):
        return None, 'invalid_share_password'
    return share_link, None


def verify_share_link_password(*, share_link, password: str | None = None) -> bool:
    """校验分享链接密码。"""
    return not share_link.password_hash or check_password(password or '', share_link.password_hash)
