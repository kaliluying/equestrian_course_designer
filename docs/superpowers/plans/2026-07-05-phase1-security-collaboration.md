# 第一阶段安全与协作修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不重做整体协作 UI 的前提下，修复分享链接协作准入、支付落账幂等性和敏感日志问题，并完成前端最小配套适配。

**Architecture:** 后端新增轻量协作分享链接模型，把分享 token 从“自包含密码 hash”改为“引用型 token + 服务端记录校验”，并把 WebSocket 协作权限从 `Design.is_shared` 中剥离。支付回调与状态轮询统一收敛到单一事务化落账入口，前端只适配分享链接生成、通过链接加入协作和错误提示映射，不重构整体协作界面。

**Tech Stack:** Django 5.1 + DRF + Channels + Redis + MySQL，Vue 3 + TypeScript + Pinia + Element Plus + Vite，SimpleJWT，支付宝 SDK。

## Global Constraints

- 所有代码、注释、文档使用中文。
- 前端导入顺序：外部包 → `@/` 别名 → 相对路径。
- 后端导入顺序：标准库 → 第三方库 → 本地应用。
- 禁止使用 `any`，可选值使用 `null` 而非 `undefined`。
- 本阶段不做 `course.ts`、`websocket.ts`、`CollaborationPanel.vue` 的结构性重构。
- `Design.is_shared` 保留，但不再作为实时协作准入条件。
- 分享 token payload 只允许包含 `share_link_id`、`design_id`、`scope`。
- 支付回调与轮询必须共用单一幂等落账入口，并使用事务与行锁。
- 先写失败测试，再实现最小代码使测试通过。

---

## File Structure

### 后端新增文件
- Create: `BackEnd/user/migrations/0024_collaborationsharelink.py` — 新增协作分享链接模型迁移。
- Create: `BackEnd/user/services/collaboration_share_links.py` — 分享链接创建、撤销、token 编码与校验辅助。
- Create: `BackEnd/user/services/payment_settlement.py` — 统一支付幂等落账入口。

### 后端修改文件
- Modify: `BackEnd/user/models.py` — 添加 `CollaborationShareLink` 模型。
- Modify: `BackEnd/user/share_link_view.py` — 改为基于服务端分享链接记录生成/撤销。
- Modify: `BackEnd/user/consumers.py` — 使用分享链接记录校验 token，调整协作准入。
- Modify: `BackEnd/user/views/payment_views.py` — 回调与轮询改为调用统一结算入口。
- Modify: `BackEnd/user/authentication.py` — 收敛敏感日志。
- Modify: `BackEnd/equestrian/settings.py` — 降低生产环境协作日志噪声（如需代码化配置）。

### 前端修改文件
- Modify: `FrontEnd/src/api/design.ts` — 统一分享链接返回类型，保留兼容字段。
- Modify: `FrontEnd/src/stores/websocket.ts` — 映射新的协作错误原因，连接 URL 保持兼容。
- Modify: `FrontEnd/src/composables/useCollaborationEvents.ts` — 适配通过链接加入协作时的新错误反馈。
- Modify: `FrontEnd/src/components/CollaborationPanel.vue` — 继续用现有入口生成链接和传密码，显示更明确错误提示。
- Modify: `FrontEnd/src/utils/apiErrorMessage.ts` — 若有集中错误映射，则补充分支。

### 测试文件
- Modify: `BackEnd/user/security_tests.py` — 分享链接与 token 校验安全测试。
- Modify: `BackEnd/user/tests/test_collaboration.py` — 分享链接/协作加入/角色准入测试。
- Modify: `BackEnd/user/tests/test_membership.py` 或 `BackEnd/user/tests/test_payments.py` — 支付幂等落账测试；如无独立文件则新建。
- Modify/Create: `FrontEnd/src/api/__tests__/design.test.ts` — 分享链接接口返回与错误映射测试。
- Modify/Create: `FrontEnd/src/composables/__tests__/useCollaborationEvents.test.ts` — 协作加入失败原因映射测试。

---

### Task 1: 建立协作分享链接模型与服务层

**Files:**
- Create: `BackEnd/user/services/collaboration_share_links.py`
- Modify: `BackEnd/user/models.py:377-421`
- Create: `BackEnd/user/migrations/0024_collaborationsharelink.py`
- Test: `BackEnd/user/security_tests.py`

**Interfaces:**
- Consumes: `Design`, `User`, `django.core.signing`, `django.contrib.auth.hashers.make_password/check_password`
- Produces:
  - `class CollaborationShareLink(models.Model)`
  - `def create_share_link(*, design: Design, created_by: User, role: str, expires_in_seconds: int, password: str | None) -> tuple[CollaborationShareLink, str]`
  - `def revoke_share_link(*, design: Design, created_by: User) -> int`
  - `def build_share_token(*, share_link_id: int, design_id: int) -> str`
  - `def decode_share_token(token: str) -> dict`

- [ ] **Step 1: 写失败测试，约束 token 只包含引用字段且密码不入 token**

```python
from django.contrib.auth.models import User
from django.core import signing
from django.test import TestCase
from user.models import Design
from user.services.collaboration_share_links import create_share_link


class CollaborationShareLinkServiceTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner", password="Password123")
        self.design = Design.objects.create(title="协作设计", author=self.owner, is_shared=False)

    def test_create_share_link_stores_password_hash_and_token_is_reference_only(self):
        share_link, token = create_share_link(
            design=self.design,
            created_by=self.owner,
            role="commenter",
            expires_in_seconds=3600,
            password="abc123",
        )

        payload = signing.loads(token, salt="collab-share")

        self.assertEqual(payload["design_id"], self.design.id)
        self.assertEqual(payload["scope"], "collaboration:join")
        self.assertEqual(payload["share_link_id"], share_link.id)
        self.assertNotIn("password_hash", payload)
        self.assertTrue(share_link.password_hash)
        self.assertNotEqual(share_link.password_hash, "abc123")
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd BackEnd && python manage.py test user.security_tests.CollaborationShareLinkServiceTests.test_create_share_link_stores_password_hash_and_token_is_reference_only -v 2`
Expected: FAIL，提示 `CollaborationShareLink` 或 `create_share_link` 不存在。

- [ ] **Step 3: 在模型中添加轻量分享链接实体**

```python
class CollaborationShareLink(models.Model):
    ROLE_CHOICES = (
        ("editor", "编辑者"),
        ("viewer", "查看者"),
        ("commenter", "评论者"),
    )

    design = models.ForeignKey(
        Design,
        on_delete=models.CASCADE,
        related_name="share_links",
        verbose_name="设计",
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="created_collaboration_share_links",
        verbose_name="创建者",
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="editor", verbose_name="角色")
    expires_at = models.DateTimeField(verbose_name="过期时间")
    password_hash = models.CharField(max_length=255, blank=True, default="", verbose_name="密码哈希")
    is_revoked = models.BooleanField(default=False, verbose_name="是否已撤销")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="创建时间")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        verbose_name = "协作分享链接"
        verbose_name_plural = "协作分享链接"
        ordering = ["-created_at"]
```

- [ ] **Step 4: 在服务层实现最小创建/撤销/token 构建逻辑**

```python
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.utils import timezone

from user.models import CollaborationShareLink


def build_share_token(*, share_link_id: int, design_id: int) -> str:
    payload = {
        "share_link_id": share_link_id,
        "design_id": design_id,
        "scope": "collaboration:join",
    }
    return signing.dumps(payload, salt="collab-share")


def decode_share_token(token: str) -> dict:
    return signing.loads(token, salt="collab-share")


def create_share_link(*, design, created_by, role, expires_in_seconds, password=None):
    expires_at = timezone.now() + timedelta(seconds=expires_in_seconds)
    share_link = CollaborationShareLink.objects.create(
        design=design,
        created_by=created_by,
        role=role,
        expires_at=expires_at,
        password_hash=make_password(password) if password else "",
    )
    token = build_share_token(share_link_id=share_link.id, design_id=design.id)
    return share_link, token


def revoke_share_link(*, design, created_by) -> int:
    return CollaborationShareLink.objects.filter(
        design=design,
        created_by=created_by,
        is_revoked=False,
    ).update(is_revoked=True)


def verify_share_link_password(*, share_link, password: str | None) -> bool:
    if not share_link.password_hash:
        return True
    return check_password(password or "", share_link.password_hash)
```

- [ ] **Step 5: 创建迁移并检查内容**

Run: `cd BackEnd && python manage.py makemigrations user`
Expected: 生成 `0024_collaborationsharelink.py`，只包含新模型创建。

- [ ] **Step 6: 运行测试，确认通过**

Run: `cd BackEnd && python manage.py test user.security_tests.CollaborationShareLinkServiceTests -v 2`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add BackEnd/user/models.py BackEnd/user/services/collaboration_share_links.py BackEnd/user/migrations/0024_collaborationsharelink.py BackEnd/user/security_tests.py
git commit -m "feat: add collaboration share link model"
```

### Task 2: 改造分享链接接口与 WebSocket token 校验

**Files:**
- Modify: `BackEnd/user/share_link_view.py:30-107`
- Modify: `BackEnd/user/consumers.py:55-139`
- Modify: `BackEnd/user/security_tests.py:24-176`
- Test: `BackEnd/user/security_tests.py`

**Interfaces:**
- Consumes:
  - `create_share_link(design, created_by, role, expires_in_seconds, password)`
  - `revoke_share_link(design, created_by)`
  - `decode_share_token(token)`
  - `verify_share_link_password(share_link, password)`
- Produces:
  - `def validate_share_token(token: str, design_id: str, password: str | None = None) -> tuple[bool, int | None, str | None, CollaborationShareLink | None]`
  - `ShareLinkView.post()` 返回现有字段：`shareUrl`, `shareToken`, `expiresAt`, `ttlSeconds`, `role`, `passwordProtected`

- [ ] **Step 1: 写失败测试，约束撤销后 token 失效、密码错误不可加入**

```python
from django.contrib.auth.models import User
from django.test import TestCase
from user.models import Design
from user.services.collaboration_share_links import create_share_link, revoke_share_link
from user.consumers import CLOSE_CODE_INVALID_SHARE_TOKEN, validate_share_token


class ShareTokenValidationRecordTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner", password="Password123")
        self.design = Design.objects.create(title="设计A", author=self.owner, is_shared=False)

    def test_revoked_share_link_cannot_be_used(self):
        share_link, token = create_share_link(
            design=self.design,
            created_by=self.owner,
            role="editor",
            expires_in_seconds=3600,
            password="",
        )
        revoke_share_link(design=self.design, created_by=self.owner)

        is_valid, error_code, error_reason, _ = validate_share_token(token, str(self.design.id))

        self.assertFalse(is_valid)
        self.assertEqual(error_code, CLOSE_CODE_INVALID_SHARE_TOKEN)
        self.assertEqual(error_reason, "revoked_share_token")

    def test_wrong_password_cannot_use_share_link(self):
        share_link, token = create_share_link(
            design=self.design,
            created_by=self.owner,
            role="commenter",
            expires_in_seconds=3600,
            password="abc123",
        )

        is_valid, error_code, error_reason, _ = validate_share_token(
            token,
            str(self.design.id),
            password="wrong-pass",
        )

        self.assertFalse(is_valid)
        self.assertEqual(error_reason, "invalid_share_password")
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd BackEnd && python manage.py test user.security_tests.ShareTokenValidationRecordTests -v 2`
Expected: FAIL，`validate_share_token` 返回值或逻辑不匹配。

- [ ] **Step 3: 改造 `ShareLinkView.post()`，使用服务端记录创建分享链接**

```python
from .services.collaboration_share_links import create_share_link, revoke_share_link


def post(self, request, design_id):
    design = get_object_or_404(Design, id=design_id)
    if design.author != request.user:
        return error_response("只有设计作者才能生成分享链接", status.HTTP_403_FORBIDDEN)

    ttl_seconds = int(request.data.get("expires_in_seconds") or getattr(settings, "COLLAB_SHARE_TOKEN_TTL_SECONDS", 3600))
    role = request.data.get("role") or "editor"
    if role not in {"editor", "viewer", "commenter"}:
        role = "editor"

    password = request.data.get("password") or ""
    share_link, share_token = create_share_link(
        design=design,
        created_by=request.user,
        role=role,
        expires_in_seconds=ttl_seconds,
        password=password,
    )

    design.is_shared = True
    design.save(update_fields=["is_shared"])
```

- [ ] **Step 4: 改造 `ShareLinkView.delete()`，撤销所有未撤销分享记录**

```python
def delete(self, request, design_id):
    design = get_object_or_404(Design, id=design_id)
    if design.author != request.user:
        return error_response("只有设计作者才能撤销分享链接", status.HTTP_403_FORBIDDEN)

    revoke_share_link(design=design, created_by=request.user)
    design.is_shared = False
    design.save(update_fields=["is_shared"])
    return success_response("分享链接已撤销", {"is_shared": False})
```

- [ ] **Step 5: 改造 `validate_share_token()`，改为回查分享链接记录**

```python
from django.utils import timezone
from user.models import CollaborationShareLink
from user.services.collaboration_share_links import decode_share_token, verify_share_link_password


def validate_share_token(token, design_id, password=None):
    if not token:
        return False, CLOSE_CODE_VIA_LINK_DEPRECATED, "via_link_deprecated", None

    try:
        payload = decode_share_token(token)
        share_link_id = payload.get("share_link_id")
        token_design_id = str(payload.get("design_id"))
        scope = payload.get("scope")

        if token_design_id != str(design_id) or scope != "collaboration:join":
            return False, CLOSE_CODE_INVALID_SHARE_TOKEN, "invalid_share_token", None

        share_link = CollaborationShareLink.objects.select_related("design", "created_by").get(id=share_link_id)

        if share_link.is_revoked:
            return False, CLOSE_CODE_INVALID_SHARE_TOKEN, "revoked_share_token", None
        if share_link.design_id != int(design_id):
            return False, CLOSE_CODE_INVALID_SHARE_TOKEN, "invalid_share_token", None
        if timezone.now() > share_link.expires_at:
            return False, CLOSE_CODE_INVALID_SHARE_TOKEN, "expired_share_token", None
        if not verify_share_link_password(share_link=share_link, password=password):
            return False, CLOSE_CODE_INVALID_SHARE_TOKEN, "invalid_share_password", None

        return True, None, None, share_link
    except CollaborationShareLink.DoesNotExist:
        return False, CLOSE_CODE_INVALID_SHARE_TOKEN, "missing_share_link", None
    except signing.BadSignature:
        return False, CLOSE_CODE_INVALID_SHARE_TOKEN, "invalid_share_token", None
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `cd BackEnd && python manage.py test user.security_tests.ShareLinkViewTests user.security_tests.ShareTokenValidationRecordTests -v 2`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add BackEnd/user/share_link_view.py BackEnd/user/consumers.py BackEnd/user/security_tests.py
git commit -m "fix: validate collaboration share links via server records"
```

### Task 3: 收紧协作准入，不再依赖 `design.is_shared`

**Files:**
- Modify: `BackEnd/user/consumers.py:55-75`
- Modify: `BackEnd/user/consumers.py:257-318`
- Modify: `BackEnd/user/tests/test_collaboration.py`
- Test: `BackEnd/user/tests/test_collaboration.py`

**Interfaces:**
- Consumes:
  - `validate_share_token(...) -> (bool, code, reason, share_link)`
  - `CollaborationRole`
- Produces:
  - `def check_design_access(user, design_id) -> tuple[bool, bool, str | None]`
  - 协作准入规则：作者 / 显式协作者 / 有效分享链接

- [ ] **Step 1: 写失败测试，约束“仅 is_shared=true 不足以加入协作”**

```python
from django.contrib.auth.models import User
from django.test import TestCase
from user.models import CollaborationRole, Design
from user.consumers import check_design_access


class CollaborationAccessRuleTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner", password="Password123")
        self.other = User.objects.create_user("other", password="Password123")
        self.design = Design.objects.create(title="协作设计", author=self.owner, is_shared=True)

    def test_non_owner_cannot_access_by_is_shared_only(self):
        has_access, is_owner, role = check_design_access.__wrapped__(self.other, self.design.id)

        self.assertFalse(has_access)
        self.assertFalse(is_owner)
        self.assertIsNone(role)

    def test_explicit_collaboration_role_can_access(self):
        CollaborationRole.objects.create(design=self.design, user=self.other, role="commenter")

        has_access, is_owner, role = check_design_access.__wrapped__(self.other, self.design.id)

        self.assertTrue(has_access)
        self.assertFalse(is_owner)
        self.assertEqual(role, "commenter")
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd BackEnd && python manage.py test user.tests.test_collaboration.CollaborationAccessRuleTests -v 2`
Expected: FAIL，`check_design_access` 仍把 `is_shared` 当协作权限。

- [ ] **Step 3: 改造 `check_design_access()` 返回作者/显式协作者信息**

```python
@database_sync_to_async
def check_design_access(user, design_id):
    from .models import CollaborationRole, Design

    if not user or not user.is_authenticated:
        return False, False, None

    try:
        design = Design.objects.get(id=design_id)
        is_owner = design.author_id == user.id
        if is_owner:
            return True, True, "owner"

        collaboration_role = CollaborationRole.objects.filter(
            design_id=design.id,
            user_id=user.id,
        ).first()
        if collaboration_role:
            return True, False, collaboration_role.role

        return False, False, None
    except Design.DoesNotExist:
        return False, False, None
```

- [ ] **Step 4: 在 `connect()` 中使用新的返回值，链接访问走独立分支**

```python
has_access, is_owner, collaboration_role = await check_design_access(self.user, self.design_id)
if not has_access:
    await self.accept()
    await self.send(text_data=json.dumps({
        "type": "error",
        "message": "您没有权限访问此设计",
        "reason": "collaboration_access_denied",
        "timestamp": timezone.now().isoformat(),
    }))
    await self.close(code=4004)
    return
```

并保持匿名用户只能通过 `share_token` 分支进入，不再因为 `design.is_shared` 直接放行。

- [ ] **Step 5: 运行测试，确认通过**

Run: `cd BackEnd && python manage.py test user.tests.test_collaboration.CollaborationAccessRuleTests -v 2`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add BackEnd/user/consumers.py BackEnd/user/tests/test_collaboration.py
git commit -m "fix: require explicit collaboration access"
```

### Task 4: 统一支付幂等落账入口

**Files:**
- Create: `BackEnd/user/services/payment_settlement.py`
- Modify: `BackEnd/user/views/payment_views.py:73-95`
- Modify: `BackEnd/user/views/payment_views.py:267-313`
- Modify: `BackEnd/user/views/payment_views.py:321-375`
- Test: `BackEnd/user/tests/test_payments.py`（若不存在则创建）

**Interfaces:**
- Consumes: `MembershipOrder`, `settle_paid_order(order)`, `transaction.atomic`, `select_for_update`
- Produces:
  - `def settle_order_payment(*, order_id: str, trade_no: str | None, payment_time) -> tuple[MembershipOrder, bool]`
    - 返回 `(order, was_settled_now)`

- [ ] **Step 1: 写失败测试，约束重复结算不重复加 AI 配额**

```python
from decimal import Decimal
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from user.models import AIGenerationQuota, MembershipOrder, UserProfile
from user.services.payment_settlement import settle_order_payment


class PaymentSettlementTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("payer", password="Password123")
        self.profile = UserProfile.objects.create(user=self.user)
        self.order = MembershipOrder.objects.create(
            user=self.user,
            membership_plan=None,
            amount=Decimal("9.90"),
            billing_cycle="month",
            payment_channel="alipay",
            status="pending",
        )

    def test_settle_order_payment_is_idempotent_for_ai_quota(self):
        order, first_settled = settle_order_payment(
            order_id=self.order.order_id,
            trade_no="TRADE-001",
            payment_time=timezone.now(),
        )
        order, second_settled = settle_order_payment(
            order_id=self.order.order_id,
            trade_no="TRADE-001",
            payment_time=timezone.now(),
        )

        quota = AIGenerationQuota.objects.get(user_profile=self.profile)
        self.assertTrue(first_settled)
        self.assertFalse(second_settled)
        self.assertEqual(quota.purchased_quota, 10)
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd BackEnd && python manage.py test user.tests.test_payments.PaymentSettlementTests -v 2`
Expected: FAIL，`payment_settlement` 模块不存在。

- [ ] **Step 3: 实现统一事务化落账函数**

```python
from django.db import transaction

from user.models import MembershipOrder
from user.views.payment_views import settle_paid_order


def settle_order_payment(*, order_id: str, trade_no: str | None, payment_time):
    with transaction.atomic():
        order = MembershipOrder.objects.select_for_update().select_related(
            "user",
            "membership_plan",
            "user__profile",
        ).get(order_id=order_id)

        if order.status == "paid":
            return order, False

        order.status = "paid"
        order.trade_no = trade_no or order.trade_no
        order.payment_time = payment_time
        order.save(update_fields=["status", "trade_no", "payment_time", "updated_at"])

        settle_paid_order(order)
        order.refresh_from_db()
        return order, True
```

- [ ] **Step 4: 在回调与轮询查询中改用统一入口**

```python
from ..services.payment_settlement import settle_order_payment

# get_order_status 中
order, was_settled_now = settle_order_payment(
    order_id=order.order_id,
    trade_no=query_result.get("trade_no"),
    payment_time=timezone.now(),
)

# alipay_notify 中
order, was_settled_now = settle_order_payment(
    order_id=out_trade_no,
    trade_no=data.get("trade_no"),
    payment_time=timezone.now(),
)
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `cd BackEnd && python manage.py test user.tests.test_payments.PaymentSettlementTests -v 2`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add BackEnd/user/services/payment_settlement.py BackEnd/user/views/payment_views.py BackEnd/user/tests/test_payments.py
git commit -m "fix: make payment settlement idempotent"
```

### Task 5: 收敛认证与协作敏感日志

**Files:**
- Modify: `BackEnd/user/authentication.py:23-63`
- Modify: `BackEnd/user/consumers.py:164-218`
- Modify: `BackEnd/equestrian/settings.py:370-380`
- Test: `BackEnd/user/security_tests.py`

**Interfaces:**
- Consumes: Python `logging`
- Produces: 生产环境不输出 cookie 细节、token 存在性与 `scope` 全量日志

- [ ] **Step 1: 写失败测试，约束认证日志不再记录 cookie 列表与 token 长度**

```python
from unittest.mock import patch
from django.test import TestCase, RequestFactory
from user.authentication import CookieJWTAuthentication


class AuthenticationLoggingTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @patch("user.authentication.logger")
    def test_authenticate_does_not_log_cookie_inventory(self, mock_logger):
        request = self.factory.get("/user/designs/")
        request.COOKIES["access_token"] = "token-value"

        auth = CookieJWTAuthentication()
        with patch.object(auth, "get_validated_token", side_effect=Exception("skip")):
            auth.authenticate(request)

        logged_messages = " ".join(str(call.args[0]) for call in mock_logger.info.call_args_list if call.args)
        self.assertNotIn("Request cookies", logged_messages)
        self.assertNotIn("length", logged_messages)
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd BackEnd && python manage.py test user.security_tests.AuthenticationLoggingTests -v 2`
Expected: FAIL，现有日志仍输出 cookie 相关信息。

- [ ] **Step 3: 删除敏感日志，只保留最小必要字段**

```python
# authentication.py
access_token = request.COOKIES.get("access_token")
if access_token:
    try:
        validated_token = self.get_validated_token(access_token)
        user = self.get_user(validated_token)
        logger.debug("Cookie 鉴权成功", extra={"user_id": user.id})
        return (user, validated_token)
    except (InvalidToken, TokenError, InvalidTokenError):
        logger.warning("Cookie 鉴权失败")

# consumers.py
logger.info(
    "WebSocket连接请求 user=%s design=%s via_link=%s",
    self.user.id if self.user and self.user.is_authenticated else None,
    self.design_id,
    bool(self.share_token),
)
```

- [ ] **Step 4: 如有必要，调低协作 logger 级别**

```python
"django.channels": {
    "handlers": ["console", "file"],
    "level": "INFO" if DEBUG else "WARNING",
    "propagate": False,
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `cd BackEnd && python manage.py test user.security_tests.AuthenticationLoggingTests -v 2`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add BackEnd/user/authentication.py BackEnd/user/consumers.py BackEnd/equestrian/settings.py BackEnd/user/security_tests.py
git commit -m "fix: reduce sensitive auth logs"
```

### Task 6: 前端最小配套——分享链接类型与错误提示适配

**Files:**
- Modify: `FrontEnd/src/api/design.ts:265-320`
- Modify: `FrontEnd/src/stores/websocket.ts:1186-1439`
- Modify: `FrontEnd/src/composables/useCollaborationEvents.ts:352-421`
- Modify: `FrontEnd/src/components/CollaborationPanel.vue:432-513`
- Modify/Create: `FrontEnd/src/api/__tests__/design.test.ts`
- Modify/Create: `FrontEnd/src/composables/__tests__/useCollaborationEvents.test.ts`

**Interfaces:**
- Consumes:
  - 后端 `share-link` 返回字段：`shareUrl`, `shareToken`, `expiresAt`, `ttlSeconds`, `role`, `passwordProtected`
  - WebSocket close reason / error reason：`revoked_share_token`, `expired_share_token`, `invalid_share_password`, `collaboration_access_denied`
- Produces:
  - `interface CreateShareLinkResponse`
  - `function mapCollaborationErrorReason(reason: string): string`

- [ ] **Step 1: 写失败测试，约束错误原因映射为明确中文提示**

```ts
import { describe, expect, it } from 'vitest'
import { mapCollaborationErrorReason } from '@/stores/websocket'

describe('mapCollaborationErrorReason', () => {
  it('maps revoked share token to readable message', () => {
    expect(mapCollaborationErrorReason('revoked_share_token')).toBe('分享链接已撤销')
  })

  it('maps expired share token to readable message', () => {
    expect(mapCollaborationErrorReason('expired_share_token')).toBe('分享链接已过期')
  })

  it('maps invalid share password to readable message', () => {
    expect(mapCollaborationErrorReason('invalid_share_password')).toBe('访问密码错误')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd FrontEnd && npx vitest run src/api/__tests__/design.test.ts src/composables/__tests__/useCollaborationEvents.test.ts`
Expected: FAIL，映射函数不存在。

- [ ] **Step 3: 在 API 层补齐分享链接响应类型**

```ts
export interface CreateShareLinkRequest {
  role?: 'editor' | 'viewer' | 'commenter'
  expires_in_seconds?: number
  password?: string
}

export interface CreateShareLinkResponse {
  success: boolean
  message: string
  data: {
    shareUrl: string
    shareToken: string
    expiresAt: string
    ttlSeconds: number
    role: 'editor' | 'viewer' | 'commenter'
    passwordProtected: boolean
  }
  shareUrl: string
  shareToken: string
  expiresAt: string
  ttlSeconds: number
  role: 'editor' | 'viewer' | 'commenter'
  passwordProtected: boolean
}
```

- [ ] **Step 4: 在 `websocket.ts` 中添加错误原因映射函数并用于关闭事件**

```ts
export const mapCollaborationErrorReason = (reason: string): string => {
  switch (reason) {
    case 'revoked_share_token':
      return '分享链接已撤销'
    case 'expired_share_token':
      return '分享链接已过期'
    case 'invalid_share_password':
      return '访问密码错误'
    case 'collaboration_access_denied':
      return '您没有权限加入此协作'
    default:
      return '协作连接失败，请稍后重试'
  }
}
```

在关闭事件或错误事件处理中，优先读取后端 `reason` 字段并映射为中文提示。

- [ ] **Step 5: 在 `CollaborationPanel.vue` 与 `useCollaborationEvents.ts` 中复用新的提示**

```ts
const errorMessage = mapCollaborationErrorReason(errorReason)
ElMessage.error(errorMessage)
```

并保持现有密码输入与分享链接生成入口不变，只调整错误反馈与加入逻辑。

- [ ] **Step 6: 运行测试，确认通过**

Run: `cd FrontEnd && npx vitest run src/api/__tests__/design.test.ts src/composables/__tests__/useCollaborationEvents.test.ts`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add FrontEnd/src/api/design.ts FrontEnd/src/stores/websocket.ts FrontEnd/src/composables/useCollaborationEvents.ts FrontEnd/src/components/CollaborationPanel.vue FrontEnd/src/api/__tests__/design.test.ts FrontEnd/src/composables/__tests__/useCollaborationEvents.test.ts
git commit -m "fix: improve collaboration share link UX"
```

### Task 7: 端到端回归与文档同步

**Files:**
- Modify: `BackEnd/user/security_tests.py`
- Modify: `BackEnd/user/tests/test_collaboration.py`
- Modify: `BackEnd/user/tests/test_payments.py`
- Modify: `FrontEnd/src/api/__tests__/design.test.ts`
- Modify: `FrontEnd/src/composables/__tests__/useCollaborationEvents.test.ts`
- Modify: `docs/API.md`（仅当接口行为文档需要更新）

**Interfaces:**
- Consumes: 前 6 个任务产出的所有接口与行为
- Produces: 可重复执行的后端 + 前端回归验证清单

- [ ] **Step 1: 跑后端协作与安全相关测试**

Run: `cd BackEnd && python manage.py test user.security_tests user.tests.test_collaboration user.tests.test_payments -v 2`
Expected: PASS。

- [ ] **Step 2: 跑前端相关测试**

Run: `cd FrontEnd && pnpm test:run`
Expected: PASS。

- [ ] **Step 3: 跑前端类型检查**

Run: `cd FrontEnd && pnpm type-check`
Expected: PASS。

- [ ] **Step 4: 手工验证分享链接与协作接入**

Run:
```bash
cd BackEnd && python manage.py runserver
cd FrontEnd && pnpm dev
```

手测清单：
- 作者生成带密码分享链接成功
- 未登录用户通过正确密码可加入协作
- 错误密码提示“访问密码错误”
- 撤销后原链接提示“分享链接已撤销”
- 仅 `is_shared=true` 但无分享链接的用户不能加入协作
- 支付成功订单重复查询不会重复加配额

Expected: 所有手测项通过。

- [ ] **Step 5: 如接口行为有变化，更新 API 文档**

```md
### 协作分享链接
- 分享 token 为引用型 token，不再包含密码 hash
- WebSocket 协作错误原因可能返回：`revoked_share_token`、`expired_share_token`、`invalid_share_password`
```

- [ ] **Step 6: Commit**

```bash
git add BackEnd/user/security_tests.py BackEnd/user/tests/test_collaboration.py BackEnd/user/tests/test_payments.py FrontEnd/src/api/__tests__/design.test.ts FrontEnd/src/composables/__tests__/useCollaborationEvents.test.ts docs/API.md
git commit -m "test: cover collaboration security flow"
```

## Self-Review

- **Spec coverage:**
  - 协作分享授权模型 → Task 1
  - 分享 token 改为引用型 → Task 1, Task 2
  - WebSocket 权限不再依赖 `design.is_shared` → Task 3
  - 支付幂等落账 → Task 4
  - 敏感日志收敛 → Task 5
  - 前端最小配套改动 → Task 6
  - 后端与前端测试补强 → Task 1-7
- **Placeholder scan:** 已移除 TBD / TODO / “类似 Task N” 之类占位描述；每个任务都包含具体代码与命令。
- **Type consistency:** `validate_share_token` 的新签名、`settle_order_payment`、`CreateShareLinkResponse`、`mapCollaborationErrorReason` 已在对应任务中完整定义并保持一致。
