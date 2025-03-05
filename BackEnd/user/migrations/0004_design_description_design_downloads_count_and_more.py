# Generated by Django 4.2 on 2025-03-05 06:29

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('user', '0003_alter_design_download_passwordresettoken'),
    ]

    operations = [
        migrations.AddField(
            model_name='design',
            name='description',
            field=models.TextField(blank=True, null=True, verbose_name='设计描述'),
        ),
        migrations.AddField(
            model_name='design',
            name='downloads_count',
            field=models.PositiveIntegerField(default=0, verbose_name='下载数'),
        ),
        migrations.AddField(
            model_name='design',
            name='is_shared',
            field=models.BooleanField(default=False, verbose_name='是否分享'),
        ),
        migrations.AddField(
            model_name='design',
            name='likes_count',
            field=models.PositiveIntegerField(default=0, verbose_name='点赞数'),
        ),
        migrations.CreateModel(
            name='DesignLike',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='点赞时间')),
                ('design', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='likes', to='user.design', verbose_name='设计')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='liked_designs', to=settings.AUTH_USER_MODEL, verbose_name='用户')),
            ],
            options={
                'verbose_name': '设计点赞',
                'verbose_name_plural': '设计点赞',
                'ordering': ['-created_at'],
                'unique_together': {('design', 'user')},
            },
        ),
    ]
