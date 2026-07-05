# Generated manually for collaboration comments, roles and events

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0021_coursetemplate_coursetemplatefavorite'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='DesignComment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content', models.TextField(verbose_name='评论内容')),
                ('obstacle_id', models.CharField(blank=True, max_length=100, null=True, verbose_name='关联障碍物ID')),
                ('x', models.FloatField(blank=True, null=True, verbose_name='画布X坐标')),
                ('y', models.FloatField(blank=True, null=True, verbose_name='画布Y坐标')),
                ('is_resolved', models.BooleanField(default=False, verbose_name='是否已解决')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('design', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='user.design', verbose_name='设计')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='design_comments', to=settings.AUTH_USER_MODEL, verbose_name='用户')),
            ],
            options={'verbose_name': '设计评论', 'verbose_name_plural': '设计评论', 'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='CollaborationRole',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('owner', '所有者'), ('editor', '编辑者'), ('viewer', '查看者'), ('commenter', '评论者')], default='viewer', max_length=20, verbose_name='角色')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('design', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='collaboration_roles', to='user.design', verbose_name='设计')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='collaboration_roles', to=settings.AUTH_USER_MODEL, verbose_name='用户')),
            ],
            options={'verbose_name': '协作角色', 'verbose_name_plural': '协作角色', 'unique_together': {('design', 'user')}},
        ),
        migrations.CreateModel(
            name='CollaborationEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(max_length=50, verbose_name='事件类型')),
                ('object_id', models.CharField(blank=True, max_length=100, null=True, verbose_name='对象ID')),
                ('payload', models.JSONField(default=dict, verbose_name='事件内容')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('design', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='collaboration_events', to='user.design', verbose_name='设计')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='collaboration_events', to=settings.AUTH_USER_MODEL, verbose_name='用户')),
            ],
            options={'verbose_name': '协作事件', 'verbose_name_plural': '协作事件', 'ordering': ['-created_at']},
        ),
    ]
