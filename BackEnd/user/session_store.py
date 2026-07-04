"""
协作会话存储模块

提供基于 Redis (Django cache) 的协作会话状态存储，替代进程内 dict。
支持多进程 / 多 worker 部署时的状态共享。

用法（直接操作，常见 dict/list 变更会自动写回）：
    from user.session_store import active_sessions

    # 读取
    session = active_sessions[design_id]

    # 写入整个 session
    active_sessions[design_id] = session_data

    # 就地修改常见 list/dict 字段会自动写回 Redis
    session = active_sessions[design_id]
    session["collaborators"].append(new_user)

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


def _to_plain_data(value):
    """将自动保存代理还原为可序列化的普通 dict/list。"""
    if isinstance(value, dict):
        return {key: _to_plain_data(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_plain_data(item) for item in value]
    return value


class _AutoSaveList(list):
    """列表变更后自动写回 Redis，覆盖协作者列表 append/赋值等场景。"""

    def __init__(self, values, save_callback):
        super().__init__(values)
        self._save_callback = save_callback

    def _save(self):
        self._save_callback()

    def append(self, item):
        super().append(item)
        self._save()

    def extend(self, items):
        super().extend(items)
        self._save()

    def insert(self, index, item):
        super().insert(index, item)
        self._save()

    def remove(self, item):
        super().remove(item)
        self._save()

    def pop(self, index=-1):
        item = super().pop(index)
        self._save()
        return item

    def clear(self):
        super().clear()
        self._save()

    def __setitem__(self, index, value):
        super().__setitem__(index, value)
        self._save()

    def __delitem__(self, index):
        super().__delitem__(index)
        self._save()


class _AutoSaveDict(dict):
    """字典变更后自动写回 Redis，保持原 consumers.py 的 dict 用法。"""

    def __init__(self, design_id, values, store):
        super().__init__(values)
        self._design_id = design_id
        self._store = store

    def _save(self):
        self._store[self._design_id] = _to_plain_data(self)

    def __getitem__(self, key):
        value = super().__getitem__(key)
        if isinstance(value, list) and not isinstance(value, _AutoSaveList):
            value = _AutoSaveList(value, self._save)
            super().__setitem__(key, value)
        elif isinstance(value, dict) and not isinstance(value, _AutoSaveDict):
            value = _AutoSaveDict(self._design_id, value, self._store)
            super().__setitem__(key, value)
        return value

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        self._save()

    def __delitem__(self, key):
        super().__delitem__(key)
        self._save()

    def update(self, *args, **kwargs):
        super().update(*args, **kwargs)
        self._save()


class RedisSessionStore:
    """
    基于 Django cache (Redis) 的会话存储。
    提供类 dict 接口，与现有 consumers.py 代码兼容。

    重要：Redis 存储的是序列化副本。本存储会为读取出的 dict/list 包装
    自动保存代理，覆盖 collaborators append、字段赋值等现有消费者用法。
    """

    def __getitem__(self, design_id):
        key = _make_key(design_id)
        data = cache.get(key)
        if data is None:
            raise KeyError(design_id)
        return _AutoSaveDict(design_id, data, self)

    def __setitem__(self, design_id, value):
        key = _make_key(design_id)
        cache.set(key, _to_plain_data(value), timeout=_SESSION_TTL)

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
