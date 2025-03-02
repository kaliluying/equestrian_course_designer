from django.db import models
from django.contrib.auth.models import User
import os
from datetime import datetime


def get_file_path(instance, filename, base_path):
    """生成文件路径，添加时间戳确保唯一性"""
    # 获取文件扩展名
    ext = filename.split('.')[-1]
    # 生成时间戳
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    # 如果实例已经有ID（即更新操作），使用ID作为目录名
    if instance.id:
        # 新的文件名：标题_时间戳.扩展名
        new_filename = f"{instance.title}_{timestamp}.{ext}"
        # 返回完整路径，包含设计ID
        return os.path.join(f'user_{instance.author.id}', base_path, f'{instance.id}', new_filename)
    else:
        # 新的文件名：标题_时间戳.扩展名
        new_filename = f"{instance.title}_{timestamp}.{ext}"
        # 返回完整路径
        return os.path.join(f'user_{instance.author.id}', base_path, new_filename)


def user_directory_path(instance, filename):
    # 文件将被上传到 MEDIA_ROOT/user_<id>/<filename>
    return f'user_{instance.author.id}/{filename}'


def user_design_image_path(instance, filename):
    """设计图片存储路径"""
    return get_file_path(instance, filename, 'designs/images')


def user_design_file_path(instance, filename):
    """设计文件存储路径"""
    base_path = 'designs'

    # 对于设计数据文件，我们保持固定文件名以便前端能够预测URL
    if instance.id:
        # 如果是更新操作，使用固定的design.json文件名并放在以设计ID命名的目录中
        return os.path.join(f'user_{instance.author.id}', base_path, f'{instance.id}', 'design.json')
    else:
        # 如果是新建操作，使用get_file_path生成路径
        return get_file_path(instance, filename, 'designs/files')

# 设计图


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
        verbose_name='下载链接'
    )

    def __str__(self):
        return self.title

    class Meta:
        verbose_name = '设计图'
        verbose_name_plural = '设计图'
        ordering = ['-create_time']  # 按创建时间倒序排列
