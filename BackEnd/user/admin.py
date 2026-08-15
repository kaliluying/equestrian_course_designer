import os
import json
import math
import re

from django.contrib import admin
from django.contrib.admin import SimpleListFilter
from django.contrib.auth.admin import GroupAdmin, UserAdmin as BaseUserAdmin
from django.contrib.auth.models import Group, User
from django.urls import reverse
from django.utils.html import format_html, format_html_join

from .models import (
    AIGenerationHistory,
    AIGenerationQuota,
    CustomObstacle,
    Design,
    DesignLike,
    MembershipOrder,
    MembershipPlan,
    PasswordResetToken,
    UserProfile,
)

admin.site.site_header = '用户中心'
admin.site.site_title = '用户中心'
admin.site.index_title = '欢迎使用用户中心'


# 注册UserProfile模型
class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = '用户资料'

# 扩展User管理


# class UserAdmin(BaseUserAdmin):
#     inlines = (UserProfileInline,)


class MembershipPlanFilter(SimpleListFilter):
    """会员计划过滤器"""
    title = '会员计划'  # 过滤器标题
    parameter_name = 'membership_plan'  # URL中的参数名

    def lookups(self, request, model_admin):
        """返回过滤选项"""
        from .models import MembershipPlan
        plans = MembershipPlan.objects.all()
        return [(plan.id, plan.name) for plan in plans]

    def queryset(self, request, queryset):
        """根据选择的选项过滤查询集"""
        if self.value():
            if self.value() == 'none':
                return queryset.filter(profile__membership_plan__isnull=True)
            return queryset.filter(profile__membership_plan_id=self.value())
        return queryset


class CustomUserAdmin(BaseUserAdmin):
    """自定义用户管理页面"""
    list_display = ('username', 'email', 'is_staff',
                    'get_membership_plan', 'get_membership_plan_date',)
    list_filter = (MembershipPlanFilter,)
    search_fields = ('username', 'email', )
    ordering = ('-date_joined',)

    inlines = (UserProfileInline,)

    def get_groups(self, obj):
        """获取用户组名称"""
        return ", ".join([group.name for group in obj.groups.all()])
    get_groups.short_description = '用户组'

    def get_membership_plan(self, obj):
        """获取会员计划"""
        return obj.profile.membership_plan.name if obj.profile and obj.profile.membership_plan else '无'
    get_membership_plan.short_description = '会员计划'

    def get_membership_plan_date(self, obj):
        """获取会员计划到期时间"""
        return obj.profile.premium_expire_date if obj.profile and obj.profile.premium_expire_date else '无'
    get_membership_plan_date.short_description = '会员计划到期时间'

    # 修改分组显示名称
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('个人信息', {'fields': ('email',)}),
        ('权限设置', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
        }),
        # ('重要日期', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'password1', 'password2'),
        }),
    )

    def get_queryset(self, request):
        """普通用户只能看到自己的信息"""
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(id=request.user.id)

    def get_readonly_fields(self, request, obj=None):
        """普通用户只能修改有限的字段"""
        if not request.user.is_superuser:
            return ('username', 'is_staff', 'is_superuser', 'groups', 'user_permissions',
                    'date_joined', 'last_login')
        return super().get_readonly_fields(request, obj)

    def has_delete_permission(self, request, obj=None):
        """禁止删除用户"""
        return False

    def has_add_permission(self, request):
        """只有超级管理员可以添加用户"""
        return request.user.is_superuser


# 重新注册User
admin.site.unregister(User)
admin.site.register(User, CustomUserAdmin)


@admin.register(Design)
class DesignAdmin(admin.ModelAdmin):
    # 列表显示字段
    list_display = ('title', 'author', 'display_image', 'create_time',
                    'update_time', 'download_button', 'export_button')
    list_filter = ('author',)
    search_fields = ('title', 'author__username')
    readonly_fields = ('create_time', 'update_time',
                       'display_image', 'download_button', 'export_button')

    list_display_links = None

    def display_image(self, obj):
        """显示缩略图"""
        if obj.image:
            return format_html(
                '<div class="image-preview-container">'
                '<img src="{}" width="100" height="100" style="object-fit: cover; cursor: pointer;" '
                'class="design-image-preview" data-admin-action="preview" '
                'data-image-url="{}" data-title="{}" />'
                '</div>',
                obj.image.url, obj.image.url, obj.title,
            )
        return "无图片"
    display_image.short_description = '缩略图'

    def download_button(self, obj):
        """下载按钮"""
        if obj.image:
            # 获取图片文件名
            filename = os.path.basename(obj.image.name)
            return format_html(
                '<button type="button" class="el-button el-button--primary el-button--small" '
                'data-admin-action="download" data-url="{}" data-filename="{}">下载图片</button>',
                obj.image.url,
                filename,
            )
        return "无图片"
    download_button.short_description = '下载'

    def export_button(self, obj):
        """导出按钮"""
        if obj.download:
            # 获取JSON文件名
            filename = os.path.basename(obj.download.name)
            return format_html(
                '<button type="button" class="el-button el-button--success el-button--small" '
                'data-admin-action="download" data-url="{}" data-filename="{}">导出数据</button>',
                obj.download.url,
                filename,
            )
        return "无数据"
    export_button.short_description = '导出'

    class Media:
        css = {
            'all': ('css/admin.css',)  # 添加自定义 CSS 文件
        }
        js = ('js/design_admin.js',)  # 添加自定义 JavaScript 文件

    def get_queryset(self, request):
        """限制用户只能看到自己的设计图"""
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(author=request.user)

    def save_model(self, request, obj, form, change):
        """保存时自动设置作者为当前用户"""
        if not change:  # 只在创建新记录时设置作者
            obj.author = request.user
        super().save_model(request, obj, form, change)

    def has_change_permission(self, request, obj=None):
        """只允许作者修改自己的设计图"""
        if obj is None:
            return True
        return request.user.is_superuser or obj.author == request.user

    def has_delete_permission(self, request, obj=None):
        """只允许作者删除自己的设计图"""
        if obj is None:
            return True
        return request.user.is_superuser or obj.author == request.user


# 修改 Group 的显示名称
class CustomGroupAdmin(GroupAdmin):
    list_display = ['name']
    search_fields = ['name']
    ordering = ['name']

    # 修改分组显示名称
    fieldsets = (
        (None, {'fields': ('name',)}),
        ('权限设置', {'fields': ('permissions',)}),
    )

    def get_queryset(self, request):
        """普通用户不能查看用户组"""
        if not request.user.is_superuser:
            return Group.objects.none()
        return super().get_queryset(request)

    def has_add_permission(self, request):
        """只有超级管理员可以添加用户组"""
        return request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        """只有超级管理员可以修改用户组"""
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        """只有超级管理员可以删除用户组"""
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        """只有超级管理员可以查看用户组"""
        return request.user.is_superuser


# 重新注册 Group 模型
admin.site.unregister(Group)
admin.site.register(Group, CustomGroupAdmin)

# 修改应用名称
# admin.site.get_app_list = lambda request: [
#     *([{
#         'name': '用户中心',
#         'app_label': 'auth',
#         'models': [
#             {
#                 'name': '用户',
#                 'object_name': 'User',
#                 'perms': {'add': True, 'change': True, 'delete': True, 'view': True},
#                 'admin_url': '/admin/auth/user/',
#             },
#             {
#                 'name': '用户组',
#                 'object_name': 'Group',
#                 'perms': {'add': True, 'change': True, 'delete': True, 'view': True},
#                 'admin_url': '/admin/auth/group/',
#             },
#         ],
#     }] if request.user.is_superuser else []),
#     {
#         'name': '设计管理',
#         'app_label': 'user',
#         'models': [
#             {
#                 'name': '设计图',
#                 'object_name': 'Design',
#                 'perms': {'add': True, 'change': True, 'delete': True, 'view': True},
#                 'admin_url': '/admin/user/design/',
#             },
#         ],
#     },
# ]

# 注册会员计划模型


@admin.register(MembershipPlan)
class MembershipPlanAdmin(admin.ModelAdmin):
    """会员计划管理"""
    list_display = ('name', 'code', 'monthly_price', 'yearly_price',
                    'storage_limit', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'code', 'description')
    ordering = ('monthly_price',)
    fieldsets = (
        (None, {'fields': ('name', 'code', 'is_active')}),
        ('价格信息', {'fields': ('monthly_price', 'yearly_price')}),
        ('权限设置', {'fields': ('storage_limit', 'description')}),
    )


# 注册自定义模型到管理后台
# admin.site.register(DesignLike)
# admin.site.register(PasswordResetToken)
# admin.site.register(UserProfile)


@admin.register(CustomObstacle)
class CustomObstacleAdmin(admin.ModelAdmin):
    """自定义障碍物管理"""
    list_display = ('name', 'user', 'preview_obstacle',
                    'is_shared', 'created_at', 'updated_at')
    list_filter = ('user', 'is_shared')
    search_fields = ('name', 'user__username')
    readonly_fields = ('created_at', 'updated_at', 'preview_obstacle')
    fieldsets = (
        ('基本信息', {
            'fields': ('name', 'user', 'is_shared')
        }),
        ('障碍物预览', {
            'fields': ('preview_obstacle',),
        }),
        ('障碍物数据', {
            'fields': ('obstacle_data',),
            'classes': ('collapse',),
        }),
        ('时间信息', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    def preview_obstacle(self, obj):
        """生成障碍物预览，并对所有来自 JSON 的值做白名单化处理。"""
        def safe_number(value, default, maximum):
            try:
                number = float(value)
            except (TypeError, ValueError):
                return default
            if not math.isfinite(number):
                return default
            return round(max(0, min(number, maximum)), 2)

        def safe_color(value, default):
            if isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{3,8}", value):
                return value
            return default

        def join_parts(parts):
            return format_html_join("", "{}", ((part,) for part in parts))

        try:
            obstacle_data = obj.obstacle_data
            if isinstance(obstacle_data, str):
                try:
                    obstacle_data = json.loads(obstacle_data)
                except json.JSONDecodeError:
                    return format_html('<div style="color: red;">JSON解析失败</div>')
            if not isinstance(obstacle_data, dict):
                return format_html('<div style="color: red;">障碍物数据格式无效</div>')

            base_type = str(obstacle_data.get("baseType") or "").upper()
            if not base_type:
                if "decorationProperties" in obstacle_data:
                    base_type = "DECORATION"
                elif "gap" in obstacle_data:
                    base_type = "DOUBLE"
                elif "width" in obstacle_data and "height" in obstacle_data:
                    base_type = "SINGLE"
                elif isinstance(obstacle_data.get("color"), str) and obstacle_data["color"].startswith("#"):
                    base_type = "SINGLE"

            parts = [format_html(
                '<div class="obstacle-preview-container" style="width: 200px; height: 150px; border: 1px solid #ddd; position: relative; background-color: #f5f5f5; overflow: hidden; border-radius: 4px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: 0 auto;">'
            )]

            def add_block(left, top, width, height, color, extra_style=""):
                parts.append(format_html(
                    '<div style="position: absolute; left: {}px; top: {}px; width: {}px; height: {}px; background-color: {};{}"></div>',
                    left,
                    top,
                    width,
                    height,
                    color,
                    extra_style,
                ))

            if base_type == "SINGLE":
                width = safe_number(obstacle_data.get("width"), 100, 180)
                height = safe_number(obstacle_data.get("height"), 20, 40)
                add_block(
                    (200 - width) / 2,
                    (150 - height) / 2,
                    width,
                    height,
                    safe_color(obstacle_data.get("color"), "#8B4513"),
                )
            elif base_type == "DOUBLE":
                width = safe_number(obstacle_data.get("width"), 100, 180)
                height = safe_number(obstacle_data.get("height"), 20, 30)
                gap = safe_number(obstacle_data.get("gap"), 30, 50)
                left = (200 - width) / 2
                top = (150 - (2 * height + gap)) / 2
                color = safe_color(obstacle_data.get("color"), "#8B4513")
                add_block(left, top, width, height, color)
                add_block(left, top + height + gap, width, height, color)
            elif base_type == "WALL":
                width = safe_number(obstacle_data.get("width"), 120, 180)
                height = safe_number(obstacle_data.get("height"), 80, 100)
                add_block(
                    (200 - width) / 2,
                    (150 - height) / 2,
                    width,
                    height,
                    safe_color(obstacle_data.get("color"), "#A52A2A"),
                    "border: 2px solid #333;",
                )
            elif base_type == "LIVERPOOL":
                width = safe_number(obstacle_data.get("width"), 100, 180)
                height = safe_number(obstacle_data.get("height"), 20, 30)
                left = (200 - width) / 2
                top = (150 - height) / 2
                add_block(left, top, width, height, safe_color(obstacle_data.get("color"), "#8B4513"))
                add_block(left, top + height, width, 30, "#ADD8E6", "border: 1px solid #0000FF;")
            elif base_type == "DECORATION":
                decoration_props = obstacle_data.get("decorationProperties") or {}
                if isinstance(decoration_props, str):
                    try:
                        decoration_props = json.loads(decoration_props)
                    except json.JSONDecodeError:
                        decoration_props = {}
                if not isinstance(decoration_props, dict):
                    decoration_props = {}
                category = str(decoration_props.get("category") or "PLANT").upper()
                width = safe_number(decoration_props.get("width"), 50, 100)
                height = safe_number(decoration_props.get("height"), 50, 100)
                extra_style = {
                    "PLANT": "border-radius: 50%;",
                    "FENCE": "border: 2px dashed #333;",
                }.get(category, "border: 1px solid #333;")
                add_block(
                    (200 - width) / 2,
                    (150 - height) / 2,
                    width,
                    height,
                    safe_color(decoration_props.get("color"), "#228B22"),
                    extra_style,
                )
            else:
                add_block(75, 50, 50, 50, "#ccc", "border-radius: 5px;")
                parts.append(format_html(
                    '<div style="position: absolute; left: 60px; top: 110px; text-align: center; width: 80px; font-size: 12px;">未知类型</div>'
                ))

            parts.append(format_html("</div>"))
            type_name = {
                "SINGLE": "单横木",
                "DOUBLE": "双横木",
                "WALL": "砖墙",
                "LIVERPOOL": "利物浦",
                "DECORATION": "装饰物",
            }.get(base_type, "未知类型")
            parts.append(format_html(
                '<div style="margin-top: 5px; font-size: 12px; text-align: center; color: #606266; font-weight: bold;">{}</div>',
                type_name,
            ))
            parts.append(format_html(
                '<div style="font-size: 10px; color: #999; margin-top: 5px; display: none;">数据类型: {}</div>',
                type(obstacle_data).__name__,
            ))

            if type_name == "未知类型":
                data_preview = json.dumps(obstacle_data, ensure_ascii=False, default=str)
                data_preview = data_preview[:100] + ("..." if len(data_preview) > 100 else "")
                parts.append(format_html(
                    '<div style="font-size: 10px; color: #999; margin-top: 5px;">数据预览: {}</div>',
                    data_preview,
                ))
                parts.append(format_html(
                    '<div style="font-size: 11px; margin-top: 5px; color: #31708f; background-color: #d9edf7; padding: 10px; border-radius: 4px; border: 1px solid #bce8f1;">提示: 请编辑障碍物数据，添加 <span style="background-color: #f8f8f8; padding: 2px 4px; border-radius: 3px; font-family: monospace;">baseType</span> 字段，可选值: SINGLE, DOUBLE, WALL, LIVERPOOL, DECORATION</div>'
                ))

            return join_parts(parts)
        except Exception:
            return format_html('<div style="color: red;">预览生成失败，请检查障碍物数据。</div>')

    preview_obstacle.short_description = '障碍物预览'

    class Media:
        css = {
            'all': ('css/admin.css',)
        }
        js = ('js/custom_obstacle_admin.js',)


@admin.register(MembershipOrder)
class MembershipOrderAdmin(admin.ModelAdmin):
    list_display = ('user', 'order_id', 'membership_plan',
                    'amount', 'payment_channel', 'status', 'payment_time')
    list_filter = ('status', 'user')
    search_fields = ('user__username', 'order_id', 'membership_plan__name')
    ordering = ('-payment_time',)


@admin.register(AIGenerationQuota)
class AIGenerationQuotaAdmin(admin.ModelAdmin):
    list_display = ('user_profile', 'free_quota', 'purchased_quota', 'used_quota', 'remaining_quota', 'updated_at')
    list_filter = ('updated_at',)
    search_fields = ('user_profile__user__username',)
    readonly_fields = ('remaining_quota', 'created_at', 'updated_at')


@admin.register(AIGenerationHistory)
class AIGenerationHistoryAdmin(admin.ModelAdmin):
    list_display = ('user_profile', 'prompt', 'status', 'token_used', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('user_profile__user__username', 'prompt')
    readonly_fields = ('created_at',)
    ordering = ('-created_at',)
