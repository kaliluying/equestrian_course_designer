# Generated manually for design version history

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0018_aigenerationhistory_user_aigene_created_234577_idx'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='DesignVersion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('version_number', models.PositiveIntegerField(verbose_name='版本号')),
                ('source', models.CharField(choices=[('manual', '手动保存'), ('autosave', '自动保存'), ('ai', 'AI生成'), ('restore', '版本恢复')], default='manual', max_length=20, verbose_name='版本来源')),
                ('title', models.CharField(max_length=100, verbose_name='设计标题')),
                ('description', models.TextField(blank=True, null=True, verbose_name='设计描述')),
                ('course_data', models.JSONField(default=dict, verbose_name='路线数据')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('author', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='design_versions', to=settings.AUTH_USER_MODEL, verbose_name='作者')),
                ('design', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='versions', to='user.design', verbose_name='设计')),
            ],
            options={
                'verbose_name': '设计版本',
                'verbose_name_plural': '设计版本',
                'ordering': ['-version_number'],
                'unique_together': {('design', 'version_number')},
            },
        ),
    ]
