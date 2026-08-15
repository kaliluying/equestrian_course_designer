# 手工生成：设计版本图片快照。

from django.db import migrations, models

import user.models


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0024_collaborationsharelink'),
    ]

    operations = [
        migrations.AddField(
            model_name='designversion',
            name='image_snapshot',
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=user.models.design_version_image_path,
                verbose_name='设计图片快照',
            ),
        ),
    ]
