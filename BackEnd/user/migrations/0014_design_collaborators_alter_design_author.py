# Generated by Django 4.2 on 2025-03-15 07:51

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('user', '0013_rename_premium_expiry_userprofile_premium_expire_date_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='design',
            name='collaborators',
            field=models.ManyToManyField(blank=True, related_name='collaborated_designs', to=settings.AUTH_USER_MODEL, verbose_name='协作者'),
        ),
        migrations.AlterField(
            model_name='design',
            name='author',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='authored_designs', to=settings.AUTH_USER_MODEL, verbose_name='作者'),
        ),
    ]
