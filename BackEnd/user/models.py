from django.db import models
from django.contrib.auth.models import User
import os
import uuid
from datetime import datetime, timedelta


def get_file_path(instance, filename, base_path):
    """
    生成文件路径，确保文件名唯一
    """
    # 获取文件扩展名
    ext = filename.split('.')[-1]

    # 生成新的文件名
    if hasattr(instance, 'id') and instance.id:
        # 如果实例已有ID（更新），使用ID作为文件名的一部分
        new_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{instance.id}.{ext}"
    else:
        # 如果是新创建的实例，使用UUID
        new_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}.{ext}"

    # 返回完整路径
    return os.path.join(base_path, new_filename)


def user_directory_path(instance, filename):
    # 文件将被上传到 MEDIA_ROOT/user_<id>/<filename>
    return f'user_{instance.author.id}/{filename}'


def user_design_image_path(instance, filename):
    # 设计图片将被上传到 MEDIA_ROOT/user_<id>/designs/<id>/image.<ext>
    return get_file_path(instance, filename, f'user_{instance.author.id}/designs/images')


def user_design_file_path(instance, filename):
    # 设计文件将被上传到 MEDIA_ROOT/user_<id>/designs/<id>/design.<ext>
    # 对于更新操作，保持固定文件名，这样前端可以预测URL
    if hasattr(instance, 'id') and instance.id:
        # 如果是更新，使用固定文件名
        ext = filename.split('.')[-1]
        return f'user_{instance.author.id}/designs/{instance.id}/design.{ext}'
    else:
        # 如果是新建，使用唯一文件名
        return get_file_path(instance, filename, f'user_{instance.author.id}/designs/files')


class Design(models.Model):
    title = models.CharField(max_length=100, verbose_name='设计图标题')
    image = models.ImageField(
        upload_to=user_design_image_path,
        verbose_name='设计图图片'
    )
    create_time = models.DateTimeField(
        auto_now_add=True,
        verbose_name='创建时间'
    )
    update_time = models.DateTimeField(
        auto_now=True,
        verbose_name='更新时间'
    )
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        verbose_name='作者'
    )
    download = models.FileField(
        upload_to=user_design_file_path,
        verbose_name='设计图文件',
        blank=True,
        null=True
    )

    def __str__(self):
        return self.title

    class Meta:
        verbose_name = '设计图'
        verbose_name_plural = '设计图'
        ordering = ['-create_time']  # 按创建时间倒序排列


class PasswordResetToken(models.Model):
    """密码重置令牌模型"""
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='reset_tokens',
        verbose_name='用户'
    )
    token = models.CharField(
        max_length=100,
        unique=True,
        verbose_name='重置令牌'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='创建时间'
    )
    expires_at = models.DateTimeField(
        verbose_name='过期时间'
    )
    is_used = models.BooleanField(
        default=False,
        verbose_name='是否已使用'
    )

    def __str__(self):
        return f"{self.user.username}的密码重置令牌"

    def save(self, *args, **kwargs):
        """保存时自动设置过期时间为24小时后"""
        if not self.expires_at:
            self.expires_at = datetime.now() + timedelta(hours=24)
        super().save(*args, **kwargs)

    def is_valid(self):
        """检查令牌是否有效"""
        return not self.is_used and self.expires_at > datetime.now()

    class Meta:
        verbose_name = '密码重置令牌'
        verbose_name_plural = '密码重置令牌'
        ordering = ['-created_at']
