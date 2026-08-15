# 手工生成：可撤销的协作分享链接。

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0023_commercial_operations'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CollaborationShareLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('editor', '编辑者'), ('viewer', '查看者'), ('commenter', '评论者')], default='editor', max_length=20, verbose_name='角色')),
                ('expires_at', models.DateTimeField(verbose_name='过期时间')),
                ('password_hash', models.CharField(blank=True, default='', max_length=255, verbose_name='密码哈希')),
                ('is_revoked', models.BooleanField(default=False, verbose_name='是否已撤销')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='created_collaboration_share_links', to=settings.AUTH_USER_MODEL, verbose_name='创建者')),
                ('design', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='share_links', to='user.design', verbose_name='设计')),
            ],
            options={
                'verbose_name': '协作分享链接',
                'verbose_name_plural': '协作分享链接',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='collaborationsharelink',
            index=models.Index(fields=['design', 'is_revoked', 'expires_at'], name='user_collab_design__334aa8_idx'),
        ),
    ]
