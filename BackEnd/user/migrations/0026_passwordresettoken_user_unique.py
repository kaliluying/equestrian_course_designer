from django.db import migrations, models
from django.db.models import Count


def keep_latest_password_reset_token(apps, schema_editor):
    """清理历史重复令牌，保留每个用户最新创建的一条。"""
    PasswordResetToken = apps.get_model('user', 'PasswordResetToken')
    duplicate_user_ids = (
        PasswordResetToken.objects.values('user_id')
        .annotate(token_count=Count('id'))
        .filter(token_count__gt=1)
        .values_list('user_id', flat=True)
    )

    for user_id in duplicate_user_ids.iterator():
        token_ids = list(
            PasswordResetToken.objects.filter(user_id=user_id)
            .order_by('-created_at', '-id')
            .values_list('id', flat=True)
        )
        PasswordResetToken.objects.filter(id__in=token_ids[1:]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0025_designversion_image_snapshot'),
    ]

    operations = [
        migrations.RunPython(keep_latest_password_reset_token, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='passwordresettoken',
            constraint=models.UniqueConstraint(
                fields=('user',),
                name='unique_password_reset_token_user',
            ),
        ),
    ]
