"""
协作会话存储模块

提供基于 Redis (Django cache) 的协作会话状态存储，替代进程内 dict。
支持多进程 / 多 worker 部署时的状态共享。

用法（直接操作，需手动 save）：
    from user.session_store import active_sessions

    # 读取
    session = active_sessions[design_id]

    # 写入整个 session
    active_sessions[design_id] = session_data

    # 就地修改后必须手动 save
    session = active_sessions[design_id]
    session["collaborators"].append(new_user)
    active_sessions[design_id] = session  # 写回 Redis

    # 检查 / 删除
    design_id in active_sessions
    del active_sessions[design_id]
"""

import logging
from django.core.cache import cache

logger = logging.getLogger("django.channels")

# Redis key 前缀，避免与其他缓存冲突
_KEY_PREFIX = "collab_session:"
# 会话过期时间（秒），24 小时未活动自动清理
_SESSION_TTL = 24 * 60 * 60


def _make_key(design_id):
    return f"{_KEY_PREFIX}{design_id}"


class RedisSessionStore:
    """
    基于 Django cache (Redis) 的会话存储。
    提供类 dict 接口，与现有 consumers.py 代码兼容。

    重要：Redis 存储的是序列化副本。就地修改 session dict 中的列表等
    可变对象后，必须重新赋值 active_sessions[id] = session 才能同步。
    """

    def __getitem__(self, design_id):
        key = _make_key(design_id)
        data = cache.get(key)
        if data is None:
            raise KeyError(design_id)
        return data

    def __setitem__(self, design_id, value):
        key = _make_key(design_id)
        cache.set(key, value, timeout=_SESSION_TTL)

    def __delitem__(self, design_id):
        key = _make_key(design_id)
        cache.delete(key)

    def __contains__(self, design_id):
        key = _make_key(design_id)
        return cache.get(key) is not None

    def get(self, design_id, default=None):
        try:
            return self[design_id]
        except KeyError:
            return default


# 全局单例 —— 直接替换原有的 active_sessions = {}
active_sessions = RedisSessionStore()
