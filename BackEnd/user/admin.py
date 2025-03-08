from django.contrib import admin
from .models import Design, DesignLike, PasswordResetToken, UserProfile, MembershipPlan, CustomObstacle
from django.contrib.auth.models import User
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin, GroupAdmin
from django.contrib.auth.models import Group
from django.utils.html import format_html
import os
from django.urls import reverse
from django.utils.safestring import mark_safe
import json

admin.site.site_header = '用户中心'
admin.site.site_title = '用户中心'
admin.site.index_title = '欢迎使用用户中心'


class CustomUserAdmin(BaseUserAdmin):
    """自定义用户管理页面"""
    list_display = ('username', 'email', 'get_groups', 'is_staff',
                    'get_membership_plan')
    list_filter = ('is_staff', 'is_active', 'groups')
    search_fields = ('username', 'email', 'groups__name')
    ordering = ('-date_joined',)

    def get_groups(self, obj):
        """获取用户组名称"""
        return ", ".join([group.name for group in obj.groups.all()])
    get_groups.short_description = '用户组'

    def get_membership_plan(self, obj):
        """获取会员计划"""
        return obj.profile.membership_plan.name if obj.profile and obj.profile.membership_plan else '无'
    get_membership_plan.short_description = '会员计划'

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


@admin.register(Design)
class DesignAdmin(admin.ModelAdmin):
    # 列表显示字段
    list_display = ('title', 'author', 'display_image', 'create_time',
                    'update_time', 'download_button', 'export_button', 'edit_button')
    list_filter = ('author',)
    search_fields = ('title', 'author__username')
    readonly_fields = ('create_time', 'update_time',
                       'display_image', 'download_button', 'export_button', 'edit_button')

    list_display_links = None

    def display_image(self, obj):
        """显示缩略图"""
        if obj.image:
            return format_html(
                '<div class="image-preview-container">'
                '<img src="{}" width="100" height="100" style="object-fit: cover; cursor: pointer;" '
                'onclick="showImagePreview(\'{}\', \'{}\')" />'
                '</div>',
                obj.image.url, obj.image.url, obj.title
            )
        return "无图片"
    display_image.short_description = '缩略图'

    def download_button(self, obj):
        """下载按钮"""
        if obj.image:
            # 获取图片文件名
            filename = os.path.basename(obj.image.name)
            return format_html(
                '<button class="el-button el-button--primary el-button--small" onclick="downloadFile(\'{}\', \'{}\'); return false;">下载图片</button>',
                obj.image.url,
                filename
            )
        return "无图片"
    download_button.short_description = '下载'

    def export_button(self, obj):
        """导出按钮"""
        if obj.download:
            # 获取JSON文件名
            filename = os.path.basename(obj.download.name)
            return format_html(
                '<button class="el-button el-button--success el-button--small" onclick="downloadFile(\'{}\', \'{}\'); return false;">导出数据</button>',
                obj.download.url,
                filename
            )
        return "无数据"
    export_button.short_description = '导出'

    def edit_button(self, obj):
        """修改按钮"""
        if obj.download:
            return format_html(
                '<button class="el-button el-button--warning el-button--small" onclick="editDesign(\'{}\', \'{}\', \'{}\'); return false;">修改设计</button>',
                obj.download.url,
                obj.title,
                obj.id
            )
        return "无数据"
    edit_button.short_description = '修改'

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


# 注册UserProfile模型
class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = '用户资料'

# 扩展User管理


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)


# 重新注册User
admin.site.unregister(User)
admin.site.register(User, UserAdmin)

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
        """生成障碍物预览"""
        try:
            # 解析障碍物数据
            obstacle_data = obj.obstacle_data

            # 确保obstacle_data是字典类型
            if isinstance(obstacle_data, str):
                try:
                    obstacle_data = json.loads(obstacle_data)
                except json.JSONDecodeError:
                    return mark_safe('<div style="color: red;">JSON解析失败</div>')

            # 调试信息，使用较小的字体和颜色避免干扰视觉
            debug_info = f'<div style="font-size: 10px; color: #999; margin-top: 5px; display: none;">数据类型: {type(obstacle_data).__name__}</div>'

            # 尝试推断障碍物类型
            base_type = obstacle_data.get('baseType', '')

            # 如果没有baseType，尝试从数据结构推断
            if not base_type:
                if isinstance(obstacle_data, dict):
                    if 'decorationProperties' in obstacle_data:
                        base_type = 'DECORATION'
                    elif 'gap' in obstacle_data:
                        base_type = 'DOUBLE'
                    elif 'width' in obstacle_data and 'height' in obstacle_data:
                        base_type = 'SINGLE'
                    elif 'color' in obstacle_data and obstacle_data.get('color', '').startswith('#'):
                        # 如果有颜色属性，可能是单横木
                        base_type = 'SINGLE'

            # 生成预览HTML - 使用绝对定位容器确保内容正确显示
            preview_html = f'<div class="obstacle-preview-container" style="width: 200px; height: 150px; border: 1px solid #ddd; position: relative; background-color: #f5f5f5; overflow: hidden; border-radius: 4px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: 0 auto;">'

            if base_type == 'SINGLE':
                # 单横木障碍物
                color = obstacle_data.get('color', '#8B4513')
                width = min(obstacle_data.get('width', 100), 180)
                height = min(obstacle_data.get('height', 20), 40)

                # 计算居中位置
                left = (200 - width) / 2
                top = (150 - height) / 2

                preview_html += f'<div style="position: absolute; left: {left}px; top: {top}px; width: {width}px; height: {height}px; background-color: {color};"></div>'

            elif base_type == 'DOUBLE':
                # 双横木障碍物
                color = obstacle_data.get('color', '#8B4513')
                width = min(obstacle_data.get('width', 100), 180)
                height = min(obstacle_data.get('height', 20), 30)
                gap = min(obstacle_data.get('gap', 30), 50)

                # 计算居中位置
                left = (200 - width) / 2
                top = (150 - (2 * height + gap)) / 2

                # 上横木
                preview_html += f'<div style="position: absolute; left: {left}px; top: {top}px; width: {width}px; height: {height}px; background-color: {color};"></div>'

                # 下横木
                preview_html += f'<div style="position: absolute; left: {left}px; top: {top + height + gap}px; width: {width}px; height: {height}px; background-color: {color};"></div>'

            elif base_type == 'WALL':
                # 砖墙障碍物
                color = obstacle_data.get('color', '#A52A2A')
                width = min(obstacle_data.get('width', 120), 180)
                height = min(obstacle_data.get('height', 80), 100)

                # 计算居中位置
                left = (200 - width) / 2
                top = (150 - height) / 2

                preview_html += f'<div style="position: absolute; left: {left}px; top: {top}px; width: {width}px; height: {height}px; background-color: {color}; border: 2px solid #333;"></div>'

            elif base_type == 'LIVERPOOL':
                # 利物浦障碍物
                color = obstacle_data.get('color', '#8B4513')
                width = min(obstacle_data.get('width', 100), 180)
                height = min(obstacle_data.get('height', 20), 30)

                # 计算居中位置
                left = (200 - width) / 2
                top = (150 - height) / 2

                # 横木
                preview_html += f'<div style="position: absolute; left: {left}px; top: {top}px; width: {width}px; height: {height}px; background-color: {color};"></div>'

                # 水池
                preview_html += f'<div style="position: absolute; left: {left}px; top: {top + height}px; width: {width}px; height: 30px; background-color: #ADD8E6; border: 1px solid #0000FF;"></div>'

            elif base_type == 'DECORATION':
                # 装饰物
                decoration_props = obstacle_data.get(
                    'decorationProperties', {})
                if isinstance(decoration_props, str):
                    try:
                        decoration_props = json.loads(decoration_props)
                    except:
                        decoration_props = {}

                category = decoration_props.get('category', 'PLANT')
                color = decoration_props.get('color', '#228B22')
                width = min(decoration_props.get('width', 50), 100)
                height = min(decoration_props.get('height', 50), 100)

                # 计算居中位置
                left = (200 - width) / 2
                top = (150 - height) / 2

                if category == 'PLANT':
                    # 植物装饰
                    preview_html += f'<div style="position: absolute; left: {left}px; top: {top}px; width: {width}px; height: {height}px; background-color: {color}; border-radius: 50%;"></div>'
                elif category == 'FENCE':
                    # 栅栏装饰
                    preview_html += f'<div style="position: absolute; left: {left}px; top: {top}px; width: {width}px; height: {height}px; background-color: {color}; border: 2px dashed #333;"></div>'
                else:
                    # 其他装饰
                    preview_html += f'<div style="position: absolute; left: {left}px; top: {top}px; width: {width}px; height: {height}px; background-color: {color}; border: 1px solid #333;"></div>'

            else:
                # 未知类型，显示默认图形，确保显示正确
                preview_html += '<div style="position: absolute; left: 75px; top: 50px; width: 50px; height: 50px; background-color: #ccc; border-radius: 5px;"></div>'
                preview_html += '<div style="position: absolute; left: 60px; top: 110px; text-align: center; width: 80px; font-size: 12px;">未知类型</div>'

                # 添加数据预览，帮助调试
                data_preview = str(obstacle_data)
                if len(data_preview) > 100:
                    data_preview = data_preview[:100] + '...'
                debug_info += f'<div style="font-size: 10px; color: #999; margin-top: 5px;">数据预览: {data_preview}</div>'

            preview_html += '</div>'

            # 添加障碍物类型和名称标签 - 确保标签样式内联，不依赖外部CSS
            type_name = {
                'SINGLE': '单横木',
                'DOUBLE': '双横木',
                'WALL': '砖墙',
                'LIVERPOOL': '利物浦',
                'DECORATION': '装饰物',
            }.get(base_type, '未知类型')

            preview_html += f'<div style="margin-top: 5px; font-size: 12px; text-align: center; color: #606266; font-weight: bold;">{type_name}</div>'
            preview_html += debug_info

            # 添加修复提示
            if type_name == '未知类型':
                preview_html += '<div style="font-size: 11px; margin-top: 5px; color: #31708f; background-color: #d9edf7; padding: 10px; border-radius: 4px; border: 1px solid #bce8f1;">'
                preview_html += '提示: 请编辑障碍物数据，添加 <span style="background-color: #f8f8f8; padding: 2px 4px; border-radius: 3px; font-family: monospace;">baseType</span> 字段，可选值: SINGLE, DOUBLE, WALL, LIVERPOOL, DECORATION'
                preview_html += '</div>'

            return mark_safe(preview_html)
        except Exception as e:
            # 返回详细的错误信息，帮助调试
            error_html = f'<div style="color: red;">预览生成失败: {str(e)}</div>'
            error_html += f'<div style="color: #666; font-size: 12px;">数据类型: {type(obj.obstacle_data).__name__}</div>'

            # 尝试显示部分数据
            try:
                if isinstance(obj.obstacle_data, dict):
                    data_preview = json.dumps(obj.obstacle_data)[:100] + '...'
                elif isinstance(obj.obstacle_data, str):
                    data_preview = obj.obstacle_data[:100] + '...'
                else:
                    data_preview = str(obj.obstacle_data)[:100] + '...'
                error_html += f'<div style="color: #666; font-size: 12px;">数据预览: {data_preview}</div>'
            except:
                error_html += '<div style="color: #666; font-size: 12px;">无法显示数据预览</div>'

            return mark_safe(error_html)

    preview_obstacle.short_description = '障碍物预览'

    class Media:
        css = {
            'all': ('css/admin.css',)
        }
        js = ('js/custom_obstacle_admin.js',)
