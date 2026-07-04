# Membership Access Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize membership status refresh, quotas, capacity checks, and collaboration entitlement into a single backend access service and expose a consistent frontend entitlement snapshot.

**Architecture:** Add a backend `MembershipAccessService` that returns an immutable entitlement snapshot after refreshing membership status. Migrate design creation, custom obstacle count/create, collaboration permission checks, and profile response assembly to this service while preserving existing response fields for compatibility. Add frontend entitlement types and store synchronization so profile, collaboration, and quota-aware UI consume consistent fields.

**Tech Stack:** Django 5.1 + DRF, Django Channels, Vue 3 + TypeScript + Pinia, Vitest, Django TestCase.

---

## File Structure

- Create: `BackEnd/user/services/__init__.py`
  - Exposes service imports for `user.services`.

- Create: `BackEnd/user/services/membership_access.py`
  - Owns `EntitlementSnapshot`, `MembershipAccessError`, `MembershipAccessService`, and module-level helper functions.

- Modify: `BackEnd/user/views/design_views.py`
  - Replaces inline design storage capacity checks with service calls.

- Modify: `BackEnd/user/views/obstacle_views.py`
  - Replaces obstacle count and capacity logic with service calls.

- Modify: `BackEnd/user/serializers.py`
  - Removes duplicated custom obstacle membership limit logic from serializer create path.

- Modify: `BackEnd/user/consumers.py`
  - Replaces hard-coded premium collaboration check with service helper.

- Modify: `BackEnd/user/views/user_views.py`
  - Keeps `check_and_update_membership` as the state-refresh primitive, but profile response uses service snapshot fields.

- Modify: `BackEnd/user/tests.py`
  - Adds tests for service snapshots, capacity errors, profile consistency, obstacle capacity, design capacity, and collaboration permission.

- Modify: `FrontEnd/src/types/user.ts`
  - Adds `MembershipPlanSummary`, `EntitlementSnapshot`, and profile response type extensions.

- Modify: `FrontEnd/src/stores/user.ts`
  - Stores and refreshes `entitlements` while preserving `is_premium_active` compatibility.

- Modify: `FrontEnd/src/views/UserProfile.vue`
  - Displays entitlements when present and falls back to existing fields.

- Modify: `FrontEnd/src/components/CustomObstacleManager.vue`
  - Uses entitlement snapshot fields for limit messaging where available.

- Modify: `FrontEnd/src/components/CollaborationPanel.vue`
  - Uses entitlement snapshot collaboration permission where available.

- Create or modify frontend tests depending on existing coverage:
  - `FrontEnd/src/stores/__tests__/user.test.ts`
  - `FrontEnd/src/views/__tests__/UserProfile.test.ts` if current test setup supports view mounting.

---

### Task 1: Add backend service tests for entitlement snapshots

**Files:**
- Modify: `BackEnd/user/tests.py`
- Create later: `BackEnd/user/services/membership_access.py`

- [ ] **Step 1: Write failing tests**

Add this test class to `BackEnd/user/tests.py` near existing membership tests:

```python
class MembershipAccessServiceTest(TestCase):
    """会员权益服务测试"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="access_user",
            email="access@example.com",
            password="Password123",
        )
        self.free_plan = MembershipPlan.objects.create(
            name="免费用户",
            code="free",
            monthly_price=0,
            yearly_price=0,
            storage_limit=5,
            custom_obstacle_limit=10,
        )
        self.standard_plan = MembershipPlan.objects.create(
            name="标准会员",
            code="standard",
            monthly_price=15,
            yearly_price=150,
            storage_limit=100,
            custom_obstacle_limit=50,
        )
        self.premium_plan = MembershipPlan.objects.create(
            name="高级会员",
            code="premium",
            monthly_price=30,
            yearly_price=300,
            storage_limit=500,
            custom_obstacle_limit=None,
        )
        self.profile, _ = UserProfile.objects.get_or_create(user=self.user)

    def test_free_user_entitlement_snapshot_uses_free_limits(self):
        """免费用户权益快照应返回免费额度和无协作权限"""
        from user.services.membership_access import get_entitlements

        self.profile.is_premium = False
        self.profile.membership_plan = self.free_plan
        self.profile.storage_limit = self.free_plan.storage_limit
        self.profile.save()

        snapshot = get_entitlements(self.user)

        self.assertEqual(snapshot.plan_code, "free")
        self.assertFalse(snapshot.is_premium_active)
        self.assertEqual(snapshot.design_limit, 5)
        self.assertEqual(snapshot.custom_obstacle_limit, 10)
        self.assertFalse(snapshot.custom_obstacle_unlimited)
        self.assertFalse(snapshot.can_collaborate)

    def test_premium_user_entitlement_snapshot_has_unlimited_obstacles_and_collaboration(self):
        """高级会员权益快照应包含无限自定义障碍和协作权限"""
        from user.services.membership_access import get_entitlements

        self.profile.is_premium = True
        self.profile.membership_plan = self.premium_plan
        self.profile.premium_expire_date = timezone.now() + timezone.timedelta(days=30)
        self.profile.storage_limit = self.premium_plan.storage_limit
        self.profile.save()

        snapshot = get_entitlements(self.user)

        self.assertEqual(snapshot.plan_code, "premium")
        self.assertTrue(snapshot.is_premium_active)
        self.assertEqual(snapshot.design_limit, 500)
        self.assertIsNone(snapshot.custom_obstacle_limit)
        self.assertTrue(snapshot.custom_obstacle_unlimited)
        self.assertTrue(snapshot.can_collaborate)

    def test_expired_premium_with_pending_standard_snapshot_activates_pending_plan(self):
        """权益快照读取应触发待生效计划并返回更新后的统一权益"""
        from user.services.membership_access import get_entitlements

        expired_at = timezone.now() - timezone.timedelta(minutes=1)
        self.profile.is_premium = True
        self.profile.membership_plan = self.premium_plan
        self.profile.premium_expire_date = expired_at
        self.profile.storage_limit = self.premium_plan.storage_limit
        self.profile.pending_membership_plan = self.standard_plan
        self.profile.pending_membership_start_date = expired_at
        self.profile.pending_membership_expire_date = expired_at + timezone.timedelta(days=30)
        self.profile.save()

        snapshot = get_entitlements(self.user)

        self.assertEqual(snapshot.plan_code, "standard")
        self.assertTrue(snapshot.is_premium_active)
        self.assertEqual(snapshot.design_limit, 100)
        self.assertEqual(snapshot.custom_obstacle_limit, 50)
        self.assertFalse(snapshot.can_collaborate)
        self.profile.refresh_from_db()
        self.assertIsNone(self.profile.pending_membership_plan)
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd BackEnd
.venv/bin/python manage.py test user.tests.MembershipAccessServiceTest -v 2
```

Expected: FAIL with `ModuleNotFoundError: No module named 'user.services'` or import error for `membership_access`.

- [ ] **Step 3: Implement minimal service**

Create `BackEnd/user/services/__init__.py`:

```python
"""用户服务层。"""
```

Create `BackEnd/user/services/membership_access.py`:

```python
"""会员权益与容量检查服务。"""

from dataclasses import dataclass
from typing import Optional

from django.contrib.auth.models import User
from rest_framework import status

from user.models import AIGenerationQuota, CustomObstacle, Design, UserProfile
from user.views.user_views import check_and_update_membership


@dataclass(frozen=True)
class PlanSummary:
    """会员计划摘要。"""

    id: int
    name: str
    code: str
    storage_limit: int
    custom_obstacle_limit: Optional[int]


@dataclass(frozen=True)
class EntitlementSnapshot:
    """当前用户权益快照。"""

    user_id: int
    plan_code: str
    plan_name: str
    is_premium_active: bool
    design_count: int
    design_limit: int
    custom_obstacle_count: int
    custom_obstacle_limit: Optional[int]
    custom_obstacle_unlimited: bool
    ai_remaining_quota: int
    can_collaborate: bool
    pending_plan: Optional[PlanSummary]

    def to_dict(self):
        """转换为接口响应字典。"""
        return {
            "user_id": self.user_id,
            "plan_code": self.plan_code,
            "plan_name": self.plan_name,
            "is_premium_active": self.is_premium_active,
            "design_count": self.design_count,
            "design_limit": self.design_limit,
            "custom_obstacle_count": self.custom_obstacle_count,
            "custom_obstacle_limit": self.custom_obstacle_limit,
            "custom_obstacle_unlimited": self.custom_obstacle_unlimited,
            "ai_remaining_quota": self.ai_remaining_quota,
            "can_collaborate": self.can_collaborate,
            "pending_plan": None if self.pending_plan is None else self.pending_plan.__dict__,
        }


class MembershipAccessError(Exception):
    """会员权益检查失败。"""

    def __init__(self, message: str, status_code=status.HTTP_403_FORBIDDEN, data=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.data = data or {}


def _plan_summary(plan):
    if plan is None:
        return None
    return PlanSummary(
        id=plan.id,
        name=plan.name,
        code=plan.code,
        storage_limit=plan.storage_limit,
        custom_obstacle_limit=plan.custom_obstacle_limit,
    )


def get_entitlements(user: User) -> EntitlementSnapshot:
    """获取用户当前权益快照。"""
    check_and_update_membership(user)
    profile, _ = UserProfile.objects.select_related(
        "membership_plan", "pending_membership_plan"
    ).get_or_create(user=user)

    is_active = profile.is_premium_active()
    plan = profile.membership_plan
    plan_code = plan.code if plan else "free"
    plan_name = plan.name if plan else "免费用户"
    design_limit = profile.get_storage_limit()
    custom_limit = 10
    custom_unlimited = False
    if plan and plan.custom_obstacle_limit is None and is_active:
        custom_limit = None
        custom_unlimited = True
    elif plan and plan.custom_obstacle_limit is not None:
        custom_limit = plan.custom_obstacle_limit

    quota, _ = AIGenerationQuota.objects.get_or_create(user_profile=profile)
    can_collaborate = is_active and plan_code == "premium"

    return EntitlementSnapshot(
        user_id=user.id,
        plan_code=plan_code,
        plan_name=plan_name,
        is_premium_active=is_active,
        design_count=Design.objects.filter(author=user).count(),
        design_limit=design_limit,
        custom_obstacle_count=CustomObstacle.objects.filter(user=user).count(),
        custom_obstacle_limit=custom_limit,
        custom_obstacle_unlimited=custom_unlimited,
        ai_remaining_quota=quota.remaining_quota,
        can_collaborate=can_collaborate,
        pending_plan=_plan_summary(profile.pending_membership_plan),
    )
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
cd BackEnd
.venv/bin/python manage.py test user.tests.MembershipAccessServiceTest -v 2
```

Expected: PASS for 3 tests.

- [ ] **Step 5: Commit**

```bash
git add BackEnd/user/services BackEnd/user/tests.py
git commit -m "test: cover membership entitlement snapshots"
```

---

### Task 2: Add backend capacity checks and migrate design creation

**Files:**
- Modify: `BackEnd/user/services/membership_access.py`
- Modify: `BackEnd/user/views/design_views.py`
- Modify: `BackEnd/user/tests.py`

- [ ] **Step 1: Write failing tests**

Add to `MembershipAccessServiceTest`:

```python
    def test_assert_design_capacity_raises_unified_error_when_limit_reached(self):
        """设计数量达到额度时应抛出统一容量错误"""
        from user.services.membership_access import (
            MembershipAccessError,
            assert_design_capacity,
        )

        self.profile.is_premium = False
        self.profile.membership_plan = self.free_plan
        self.profile.storage_limit = self.free_plan.storage_limit
        self.profile.save()
        for index in range(5):
            Design.objects.create(author=self.user, title=f"设计{index}")

        with self.assertRaises(MembershipAccessError) as context:
            assert_design_capacity(self.user)

        self.assertEqual(context.exception.status_code, 403)
        self.assertTrue(context.exception.data["is_limit_reached"])
        self.assertEqual(context.exception.data["current_count"], 5)
        self.assertEqual(context.exception.data["limit"], 5)
        self.assertEqual(context.exception.data["plan_code"], "free")
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd BackEnd
.venv/bin/python manage.py test user.tests.MembershipAccessServiceTest.test_assert_design_capacity_raises_unified_error_when_limit_reached -v 2
```

Expected: FAIL with import error for `assert_design_capacity`.

- [ ] **Step 3: Implement capacity helper**

Append to `BackEnd/user/services/membership_access.py`:

```python
def assert_design_capacity(user: User) -> EntitlementSnapshot:
    """检查用户是否还能创建设计。"""
    snapshot = get_entitlements(user)
    if snapshot.design_count >= snapshot.design_limit:
        raise MembershipAccessError(
            f"您已达到存储限制（{snapshot.design_limit}个设计）。升级为会员可获得更多存储空间！",
            data={
                "is_limit_reached": True,
                "current_count": snapshot.design_count,
                "limit": snapshot.design_limit,
                "plan_code": snapshot.plan_code,
                "is_premium_active": snapshot.is_premium_active,
            },
        )
    return snapshot
```

- [ ] **Step 4: Migrate design view**

In `BackEnd/user/views/design_views.py`, import:

```python
from ..services.membership_access import MembershipAccessError, assert_design_capacity
```

Replace the manual storage limit block in `DesignViewSet.create` with:

```python
        try:
            assert_design_capacity(user)
        except MembershipAccessError as exc:
            return error_response(exc.message, exc.status_code, exc.data)
```

Leave `check_and_update_membership` import temporarily if other methods still need it; remove only if unused.

- [ ] **Step 5: Run tests**

Run:

```bash
cd BackEnd
.venv/bin/python manage.py test user.tests.MembershipAccessServiceTest.test_assert_design_capacity_raises_unified_error_when_limit_reached user.tests.MembershipDowngradeActivationTest.test_design_creation_uses_activated_pending_plan_storage_limit -v 2
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add BackEnd/user/services/membership_access.py BackEnd/user/views/design_views.py BackEnd/user/tests.py
git commit -m "refactor: centralize design capacity checks"
```

---

### Task 3: Migrate custom obstacle capacity and count

**Files:**
- Modify: `BackEnd/user/services/membership_access.py`
- Modify: `BackEnd/user/views/obstacle_views.py`
- Modify: `BackEnd/user/serializers.py`
- Modify: `BackEnd/user/tests.py`

- [ ] **Step 1: Write failing test**

Add to `MembershipAccessServiceTest`:

```python
    def test_assert_custom_obstacle_capacity_uses_standard_limit(self):
        """标准会员自定义障碍容量检查应使用统一权益服务"""
        from user.models import CustomObstacle
        from user.services.membership_access import (
            MembershipAccessError,
            assert_custom_obstacle_capacity,
        )

        self.profile.is_premium = True
        self.profile.membership_plan = self.standard_plan
        self.profile.premium_expire_date = timezone.now() + timezone.timedelta(days=30)
        self.profile.storage_limit = self.standard_plan.storage_limit
        self.profile.save()
        for index in range(50):
            CustomObstacle.objects.create(
                user=self.user,
                name=f"障碍{index}",
                obstacle_data={"type": "vertical", "poles": [], "width": 1, "height": 1},
            )

        with self.assertRaises(MembershipAccessError) as context:
            assert_custom_obstacle_capacity(self.user)

        self.assertEqual(context.exception.data["current_count"], 50)
        self.assertEqual(context.exception.data["limit"], 50)
        self.assertEqual(context.exception.data["plan_code"], "standard")

    def test_assert_custom_obstacle_capacity_allows_premium_unlimited(self):
        """高级会员自定义障碍无限制"""
        from user.models import CustomObstacle
        from user.services.membership_access import assert_custom_obstacle_capacity

        self.profile.is_premium = True
        self.profile.membership_plan = self.premium_plan
        self.profile.premium_expire_date = timezone.now() + timezone.timedelta(days=30)
        self.profile.storage_limit = self.premium_plan.storage_limit
        self.profile.save()
        for index in range(60):
            CustomObstacle.objects.create(
                user=self.user,
                name=f"高级障碍{index}",
                obstacle_data={"type": "vertical", "poles": [], "width": 1, "height": 1},
            )

        snapshot = assert_custom_obstacle_capacity(self.user)

        self.assertTrue(snapshot.custom_obstacle_unlimited)
        self.assertIsNone(snapshot.custom_obstacle_limit)
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd BackEnd
.venv/bin/python manage.py test user.tests.MembershipAccessServiceTest.test_assert_custom_obstacle_capacity_uses_standard_limit user.tests.MembershipAccessServiceTest.test_assert_custom_obstacle_capacity_allows_premium_unlimited -v 2
```

Expected: FAIL with import error for `assert_custom_obstacle_capacity`.

- [ ] **Step 3: Implement obstacle capacity helper**

Append to `BackEnd/user/services/membership_access.py`:

```python
def assert_custom_obstacle_capacity(user: User) -> EntitlementSnapshot:
    """检查用户是否还能创建自定义障碍。"""
    snapshot = get_entitlements(user)
    if snapshot.custom_obstacle_unlimited:
        return snapshot
    if snapshot.custom_obstacle_limit is not None and snapshot.custom_obstacle_count >= snapshot.custom_obstacle_limit:
        raise MembershipAccessError(
            f"您已达到自定义障碍物的最大数量限制: {snapshot.custom_obstacle_limit}",
            status_code=status.HTTP_400_BAD_REQUEST,
            data={
                "is_limit_reached": True,
                "current_count": snapshot.custom_obstacle_count,
                "limit": snapshot.custom_obstacle_limit,
                "plan_code": snapshot.plan_code,
                "is_premium_active": snapshot.is_premium_active,
            },
        )
    return snapshot
```

- [ ] **Step 4: Migrate obstacle view and serializer**

In `BackEnd/user/views/obstacle_views.py`, import:

```python
from ..services.membership_access import (
    MembershipAccessError,
    assert_custom_obstacle_capacity,
    get_entitlements,
)
```

Change `perform_create`:

```python
    def perform_create(self, serializer):
        """创建自定义障碍物时，自动关联当前用户"""
        try:
            assert_custom_obstacle_capacity(self.request.user)
        except MembershipAccessError as exc:
            from rest_framework.exceptions import ValidationError

            raise ValidationError(exc.message)
        serializer.save(user=self.request.user)
```

Change `get_obstacle_count` to use snapshot:

```python
        snapshot = get_entitlements(user)
        return Response(
            {
                "count": snapshot.custom_obstacle_count,
                "max_count": snapshot.custom_obstacle_limit,
                "is_unlimited": snapshot.custom_obstacle_unlimited,
                "is_premium": snapshot.is_premium_active,
                "plan_code": snapshot.plan_code,
            }
        )
```

In `BackEnd/user/serializers.py`, remove capacity logic from `CustomObstacleSerializer.create`; keep duplicate-name validation and save:

```python
    def create(self, validated_data):
        """创建自定义障碍物"""
        user = self.context['request'].user

        if CustomObstacle.objects.filter(name=validated_data['name'], user=user).exists():
            raise serializers.ValidationError("障碍物名称已存在")

        validated_data['user'] = user
        return super().create(validated_data)
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd BackEnd
.venv/bin/python manage.py test user.tests.MembershipAccessServiceTest.test_assert_custom_obstacle_capacity_uses_standard_limit user.tests.MembershipAccessServiceTest.test_assert_custom_obstacle_capacity_allows_premium_unlimited user.tests.MembershipDowngradeActivationTest.test_obstacle_count_activates_pending_plan_permission_limit user.tests.MembershipDowngradeActivationTest.test_obstacle_create_activates_pending_plan_before_permission_check -v 2
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add BackEnd/user/services/membership_access.py BackEnd/user/views/obstacle_views.py BackEnd/user/serializers.py BackEnd/user/tests.py
git commit -m "refactor: centralize custom obstacle entitlements"
```

---

### Task 4: Migrate profile and collaboration permissions to snapshot

**Files:**
- Modify: `BackEnd/user/services/membership_access.py`
- Modify: `BackEnd/user/views/user_views.py`
- Modify: `BackEnd/user/consumers.py`
- Modify: `BackEnd/user/tests.py`

- [ ] **Step 1: Write profile response test**

Add to `MembershipAccessServiceTest`:

```python
    def test_my_profile_includes_entitlement_snapshot(self):
        """个人中心应返回统一权益快照"""
        client = APIClient()
        client.force_authenticate(user=self.user)
        self.profile.is_premium = True
        self.profile.membership_plan = self.standard_plan
        self.profile.premium_expire_date = timezone.now() + timezone.timedelta(days=30)
        self.profile.storage_limit = self.standard_plan.storage_limit
        self.profile.save()

        response = client.get("/user/users/my_profile/")

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("entitlements", data)
        self.assertEqual(data["entitlements"]["plan_code"], "standard")
        self.assertEqual(data["entitlements"]["design_limit"], 100)
        self.assertEqual(data["entitlements"]["custom_obstacle_limit"], 50)
        self.assertFalse(data["entitlements"]["can_collaborate"])
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd BackEnd
.venv/bin/python manage.py test user.tests.MembershipAccessServiceTest.test_my_profile_includes_entitlement_snapshot -v 2
```

Expected: FAIL because `entitlements` is missing.

- [ ] **Step 3: Add collaboration helper**

Append to `BackEnd/user/services/membership_access.py`:

```python
def can_collaborate(user: User) -> bool:
    """判断用户是否具备直接创建协作会话的权限。"""
    return get_entitlements(user).can_collaborate
```

- [ ] **Step 4: Migrate profile response**

In `BackEnd/user/views/user_views.py`, import:

```python
from ..services.membership_access import get_entitlements
```

In `my_profile`, after `profile` and `design_count`, add:

```python
        entitlements = get_entitlements(user)
```

Add to `data`:

```python
            "entitlements": entitlements.to_dict(),
```

Keep existing fields such as `design_storage_limit`, `membership_plan`, and `pending_membership_plan` for compatibility.

- [ ] **Step 5: Migrate consumer**

In `BackEnd/user/consumers.py`, import:

```python
from .services.membership_access import can_collaborate
```

Replace the direct premium check:

```python
profile.membership_plan is not None and profile.membership_plan.name == "高级会员"
```

with:

```python
can_collaborate(self.user)
```

If the code is async and direct ORM access is unsafe, wrap the call using `database_sync_to_async` following existing consumer patterns.

- [ ] **Step 6: Run tests**

Run:

```bash
cd BackEnd
.venv/bin/python manage.py test user.tests.MembershipAccessServiceTest.test_my_profile_includes_entitlement_snapshot user.tests.MembershipDowngradeActivationTest -v 2
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add BackEnd/user/services/membership_access.py BackEnd/user/views/user_views.py BackEnd/user/consumers.py BackEnd/user/tests.py
git commit -m "refactor: expose unified membership entitlements"
```

---

### Task 5: Add frontend entitlement types and user store synchronization

**Files:**
- Modify: `FrontEnd/src/types/user.ts`
- Modify: `FrontEnd/src/stores/user.ts`
- Test: `FrontEnd/src/stores/__tests__/user.test.ts`

- [ ] **Step 1: Write failing frontend store test**

If `FrontEnd/src/stores/__tests__/user.test.ts` exists, append; otherwise create it with Pinia test setup:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '@/stores/user'

vi.mock('@/api/user', () => ({
  getUserProfile: vi.fn(async () => ({
    success: true,
    is_premium_active: true,
    entitlements: {
      user_id: 1,
      plan_code: 'premium',
      plan_name: '高级会员',
      is_premium_active: true,
      design_count: 3,
      design_limit: 500,
      custom_obstacle_count: 4,
      custom_obstacle_limit: null,
      custom_obstacle_unlimited: true,
      ai_remaining_quota: 2,
      can_collaborate: true,
      pending_plan: null,
    },
  })),
}))

describe('user store entitlements', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('刷新用户资料时同步权益快照', async () => {
    const store = useUserStore()
    store.currentUser = { id: 1, username: 'demo' }
    store.isAuthenticated = true

    const success = await store.updateUserProfile()

    expect(success).toBe(true)
    expect(store.currentUser?.entitlements?.plan_code).toBe('premium')
    expect(store.currentUser?.entitlements?.can_collaborate).toBe(true)
    expect(store.currentUser?.is_premium_active).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd FrontEnd
npm run test:run -- src/stores/__tests__/user.test.ts
```

Expected: FAIL because `entitlements` type/property is missing or not synchronized.

- [ ] **Step 3: Add frontend types**

In `FrontEnd/src/types/user.ts`, add:

```typescript
export interface MembershipPlanSummary {
  id: number
  name: string
  code: string
  storage_limit: number
  custom_obstacle_limit: number | null
}

export interface EntitlementSnapshot {
  user_id: number
  plan_code: string
  plan_name: string
  is_premium_active: boolean
  design_count: number
  design_limit: number
  custom_obstacle_count: number
  custom_obstacle_limit: number | null
  custom_obstacle_unlimited: boolean
  ai_remaining_quota: number
  can_collaborate: boolean
  pending_plan: MembershipPlanSummary | null
}
```

- [ ] **Step 4: Update user store**

In `FrontEnd/src/stores/user.ts`, import:

```typescript
import type { EntitlementSnapshot } from '@/types/user'
```

Extend `User`:

```typescript
interface User {
  id: number
  username: string
  is_premium_active?: boolean
  membership_plan?: MembershipPlan | null
  design_storage_limit?: number
  entitlements?: EntitlementSnapshot | null
}
```

Extend `UserProfileResponse` inside `updateUserProfile`:

```typescript
entitlements?: EntitlementSnapshot | null
```

Update assignment:

```typescript
currentUser.value = {
  ...currentUser.value,
  is_premium_active: response.is_premium_active,
  membership_plan: response.membership_plan || null,
  design_storage_limit: response.design_storage_limit || response.entitlements?.design_limit || 5,
  entitlements: response.entitlements || null,
}
```

- [ ] **Step 5: Run frontend store test**

Run:

```bash
cd FrontEnd
npm run test:run -- src/stores/__tests__/user.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add FrontEnd/src/types/user.ts FrontEnd/src/stores/user.ts FrontEnd/src/stores/__tests__/user.test.ts
git commit -m "refactor: sync frontend entitlement snapshot"
```

---

### Task 6: Update visible UI consumers and verify full Phase 1

**Files:**
- Modify: `FrontEnd/src/views/UserProfile.vue`
- Modify: `FrontEnd/src/components/CustomObstacleManager.vue`
- Modify: `FrontEnd/src/components/CollaborationPanel.vue`

- [ ] **Step 1: Update UserProfile display**

In `FrontEnd/src/views/UserProfile.vue`, prefer entitlement values:

```typescript
const activeDesignLimit = computed(() => {
  return userProfile.value.entitlements?.design_limit || userProfile.value.design_storage_limit
})

const activePlanName = computed(() => {
  return userProfile.value.entitlements?.plan_name || userProfile.value.membership_plan?.name || '免费用户'
})
```

Use `activeDesignLimit` in storage display and progress calculation. Keep existing `membership_plan` display compatible.

- [ ] **Step 2: Update CustomObstacleManager display**

Where it displays max count, prefer:

```typescript
const entitlementLimit = userStore.currentUser?.entitlements?.custom_obstacle_limit
const isUnlimited = userStore.currentUser?.entitlements?.custom_obstacle_unlimited
```

If unavailable, keep existing obstacle store count API fallback.

- [ ] **Step 3: Update CollaborationPanel display**

Replace direct premium-active-only checks with:

```typescript
const canUseCollaboration = computed(() => {
  return Boolean(userStore.currentUser?.entitlements?.can_collaborate || userStore.currentUser?.is_premium_active || isViaLink)
})
```

For compatibility, preserve existing via-link behavior.

- [ ] **Step 4: Run frontend type check**

Run:

```bash
cd FrontEnd
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Run backend Phase 1 tests**

Run:

```bash
cd BackEnd
.venv/bin/python manage.py test user.tests.MembershipAccessServiceTest user.tests.MembershipDowngradeActivationTest -v 2
```

Expected: PASS.

- [ ] **Step 6: Run full current test surface**

Run:

```bash
cd BackEnd
.venv/bin/python manage.py test user.tests -v 2
cd ../FrontEnd
npm run type-check
npm run test:run -- src/stores/__tests__/user.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add FrontEnd/src/views/UserProfile.vue FrontEnd/src/components/CustomObstacleManager.vue FrontEnd/src/components/CollaborationPanel.vue
git commit -m "refactor: consume unified entitlements in UI"
```

---

## Plan Self-Review

- Spec coverage: Phase 1 design requirements are covered by Tasks 1-6: backend service, migrated call sites, frontend types/store, UI consumers, and tests.
- Completeness scan: no unfinished markers or deferred-work wording remains.
- Type consistency: backend uses `EntitlementSnapshot` and frontend uses `EntitlementSnapshot`; serialized keys use snake_case from API and are consumed directly by frontend types.
- Scope control: this plan intentionally implements Phase 1 only. Phase 2 and Phase 3 should receive separate plans after Phase 1 is merged and verified.
