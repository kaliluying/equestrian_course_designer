from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User


class Feedback(models.Model):
    """用户反馈模型"""

    # 反馈类型选项
    FEEDBACK_TYPES = (
        ('feature', '功能建议'),
        ('bug', '问题报告'),
        ('ux', '用户体验'),
        ('other', '其他'),
    )

    # 反馈状态选项
    STATUS_CHOICES = (
        ('pending', '待处理'),
        ('in_progress', '处理中'),
        ('resolved', '已解决'),
        ('closed', '已关闭'),
    )

    type = models.CharField('反馈类型', max_length=20, choices=FEEDBACK_TYPES)
    title = models.CharField('标题', max_length=100)
    content = models.TextField('详细描述')
    contact = models.CharField('联系方式', max_length=100, blank=True, null=True)

    # 用户信息（可选，未登录用户也可以提交反馈）
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='feedbacks',
        verbose_name='用户'
    )

    # 管理字段
    status = models.CharField(
        '状态', max_length=20, choices=STATUS_CHOICES, default='pending')
    admin_notes = models.TextField('管理员备注', blank=True, null=True)
    created_at = models.DateTimeField('创建时间', default=timezone.now)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        verbose_name = '用户反馈'
        verbose_name_plural = '用户反馈'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_type_display()}: {self.title}"
