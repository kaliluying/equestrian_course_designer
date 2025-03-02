from django.contrib import admin
from .models import Design
from django.contrib.auth.models import User
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin, GroupAdmin
from django.contrib.auth.models import Group
from django.utils.html import format_html
import os

admin.site.site_header = '用户中心'
admin.site.site_title = '用户中心'
admin.site.index_title = '欢迎使用用户中心'


class CustomUserAdmin(BaseUserAdmin):
    """自定义用户管理页面"""
    list_display = ('username', 'email', 'get_groups', 'is_staff',
                    'last_login', 'date_joined')
    list_filter = ('is_staff', 'is_active', 'groups')
    search_fields = ('username', 'email', 'groups__name')
    ordering = ('-date_joined',)

    def get_groups(self, obj):
        """获取用户组名称"""
        return ", ".join([group.name for group in obj.groups.all()])
    get_groups.short_description = '用户组'

    # 修改分组显示名称
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('个人信息', {'fields': ('email',)}),
        ('权限设置', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
        }),
        ('重要日期', {'fields': ('last_login', 'date_joined')}),
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
    list_filter = ('create_time', 'update_time')
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


# 重新注册 User 和 Group 模型
admin.site.unregister(User)
admin.site.unregister(Group)
admin.site.register(User, CustomUserAdmin)
admin.site.register(Group, CustomGroupAdmin)

# 修改应用名称
admin.site.get_app_list = lambda request: [
    *([{
        'name': '用户中心',
        'app_label': 'auth',
        'models': [
            {
                'name': '用户',
                'object_name': 'User',
                'perms': {'add': True, 'change': True, 'delete': True, 'view': True},
                'admin_url': '/admin/auth/user/',
            },
            {
                'name': '用户组',
                'object_name': 'Group',
                'perms': {'add': True, 'change': True, 'delete': True, 'view': True},
                'admin_url': '/admin/auth/group/',
            },
        ],
    }] if request.user.is_superuser else []),
    {
        'name': '设计管理',
        'app_label': 'user',
        'models': [
            {
                'name': '设计图',
                'object_name': 'Design',
                'perms': {'add': True, 'change': True, 'delete': True, 'view': True},
                'admin_url': '/admin/user/design/',
            },
        ],
    },
]
