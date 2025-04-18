from django.contrib import admin
from .models import Feedback


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    """反馈管理员配置"""
    list_display = ('title', 'type', 'status',
                    'user', 'contact', 'created_at')
    list_filter = ('type', 'status', 'created_at')
    search_fields = ('title', 'content', 'contact')
    readonly_fields = ('created_at', 'updated_at')
    list_per_page = 20

    fieldsets = (
        ('基本信息', {
            'fields': ('type', 'title', 'content', 'contact')
        }),
        ('用户信息', {
            'fields': ('user',)
        }),
        ('管理信息', {
            'fields': ('status', 'admin_notes', 'created_at', 'updated_at')
        }),
    )

