# Generated manually for commercial operations

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0022_collaboration_models'),
    ]

    operations = [
        migrations.AddField(
            model_name='membershipplan',
            name='can_collaborate',
            field=models.BooleanField(default=False, verbose_name='是否允许协作'),
        ),
        migrations.AddField(
            model_name='membershipplan',
            name='ai_monthly_quota',
            field=models.PositiveIntegerField(default=0, verbose_name='每月AI配额'),
        ),
        migrations.AddField(
            model_name='membershipplan',
            name='template_publish_limit',
            field=models.PositiveIntegerField(default=3, verbose_name='模板发布限制'),
        ),
        migrations.AddField(
            model_name='membershiporder',
            name='refund_status',
            field=models.CharField(choices=[('none', '无退款'), ('requested', '已申请'), ('approved', '已同意'), ('rejected', '已拒绝'), ('refunded', '已退款')], default='none', max_length=20, verbose_name='退款状态'),
        ),
        migrations.AddField(
            model_name='aigenerationhistory',
            name='model_name',
            field=models.CharField(blank=True, max_length=100, null=True, verbose_name='模型名称'),
        ),
        migrations.AddField(
            model_name='aigenerationhistory',
            name='quota_used',
            field=models.PositiveIntegerField(default=0, verbose_name='消耗配额'),
        ),
        migrations.CreateModel(
            name='MembershipInvoice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=100, verbose_name='发票抬头')),
                ('tax_number', models.CharField(blank=True, max_length=50, null=True, verbose_name='税号')),
                ('email', models.EmailField(max_length=254, verbose_name='接收邮箱')),
                ('status', models.CharField(choices=[('submitted', '已提交'), ('issued', '已开具')], default='submitted', max_length=20, verbose_name='状态')),
                ('invoice_number', models.CharField(blank=True, max_length=50, null=True, verbose_name='发票号码')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('order', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='invoice', to='user.membershiporder', verbose_name='订单')),
            ],
            options={
                'verbose_name': '会员发票',
                'verbose_name_plural': '会员发票',
            },
        ),
    ]
