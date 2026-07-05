# Generated manually for course templates

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0020_designversion_remark'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CourseTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=120, verbose_name='模板标题')),
                ('description', models.TextField(blank=True, null=True, verbose_name='模板描述')),
                ('difficulty', models.CharField(choices=[('easy', '初级'), ('medium', '中级'), ('hard', '高级')], default='medium', max_length=20, verbose_name='难度')),
                ('field_width', models.PositiveIntegerField(default=90, verbose_name='场地宽度')),
                ('field_height', models.PositiveIntegerField(default=60, verbose_name='场地高度')),
                ('obstacle_count', models.PositiveIntegerField(default=0, verbose_name='障碍数量')),
                ('course_data', models.JSONField(default=dict, verbose_name='路线数据')),
                ('cover_image', models.ImageField(blank=True, null=True, upload_to='templates/covers', verbose_name='封面图')),
                ('is_public', models.BooleanField(default=True, verbose_name='是否公开')),
                ('is_official', models.BooleanField(default=False, verbose_name='是否官方')),
                ('copy_count', models.PositiveIntegerField(default=0, verbose_name='复制次数')),
                ('favorite_count', models.PositiveIntegerField(default=0, verbose_name='收藏次数')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('author', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='course_templates', to=settings.AUTH_USER_MODEL, verbose_name='作者')),
            ],
            options={
                'verbose_name': '路线模板',
                'verbose_name_plural': '路线模板',
                'ordering': ['-is_official', '-copy_count', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='CourseTemplateFavorite',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('template', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='favorites', to='user.coursetemplate', verbose_name='模板')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='favorite_templates', to=settings.AUTH_USER_MODEL, verbose_name='用户')),
            ],
            options={
                'verbose_name': '路线模板收藏',
                'verbose_name_plural': '路线模板收藏',
                'unique_together': {('template', 'user')},
            },
        ),
    ]
