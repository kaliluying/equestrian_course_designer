# Generated by Django 4.2 on 2025-03-10 06:11

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('user', '0011_customobstacle_is_shared'),
    ]

    operations = [
        migrations.CreateModel(
            name='MembershipOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order_id', models.CharField(max_length=64, unique=True, verbose_name='订单号')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10, verbose_name='订单金额')),
                ('payment_channel', models.CharField(choices=[('alipay', '支付宝'), ('wechat', '微信支付'), ('creditcard', '信用卡'), ('other', '其他')], default='alipay', max_length=20, verbose_name='支付渠道')),
                ('status', models.CharField(choices=[('pending', '待支付'), ('paid', '已支付'), ('canceled', '已取消'), ('refunded', '已退款'), ('failed', '支付失败')], default='pending', max_length=20, verbose_name='订单状态')),
                ('trade_no', models.CharField(blank=True, max_length=64, null=True, verbose_name='第三方交易号')),
                ('billing_cycle', models.CharField(choices=[('month', '月度'), ('year', '年度')], default='month', max_length=10, verbose_name='计费周期')),
                ('payment_url', models.TextField(blank=True, null=True, verbose_name='支付链接')),
                ('payment_time', models.DateTimeField(blank=True, null=True, verbose_name='支付时间')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('membership_plan', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='orders', to='user.membershipplan', verbose_name='会员计划')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='membership_orders', to=settings.AUTH_USER_MODEL, verbose_name='用户')),
            ],
            options={
                'verbose_name': '会员订单',
                'verbose_name_plural': '会员订单',
                'ordering': ['-created_at'],
            },
        ),
    ]
