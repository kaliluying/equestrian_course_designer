# Generated manually for design version remark

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0019_designversion'),
    ]

    operations = [
        migrations.AddField(
            model_name='designversion',
            name='remark',
            field=models.TextField(blank=True, null=True, verbose_name='版本备注'),
        ),
    ]
