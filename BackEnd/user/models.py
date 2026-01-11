from django.db import models
from django.contrib.auth.models import User
import os
import uuid
from django.utils import timezone
from datetime import datetime, timedelta


def get_file_path(instance, filename, base_path):
    """
    生成文件路径，确保文件名唯一
    """
    # 获取文件扩展名
    ext = filename.split('.')[-1]
    
    # 提取原始文件名（去掉扩展名）
    base_name = '.'.join(filename.split('.')[:-1]) if '.' in filename else filename
    
    # 如果文件名不是默认的 'design'，使用原始文件名（路线名称）
    if base_name and base_name != 'design':
        route_name = base_name
    else:
        route_name = None

    # 生成新的文件名
    if hasattr(instance, 'id') and instance.id:
        # 如果实例已有ID（更新），使用ID作为文件名的一部分
        if route_name:
            new_filename = f"{route_name}_{instance.id}.{ext}"
        else:
            new_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{instance.id}.{ext}"
    else:
        # 如果是新创建的实例，使用UUID
        if route_name:
            new_filename = f"{route_name}_{uuid.uuid4().hex[:8]}.{ext}"
        else:
            new_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}.{ext}"

    # 返回完整路径
    return os.path.join(base_path, new_filename)


def user_directory_path(instance, filename):
    # 文件将被上传到 MEDIA_ROOT/user_<id>/<filename>
    return f'user_{instance.author.id}/{filename}'


def user_design_image_path(instance, filename):
    # 设计图片将被上传到 MEDIA_ROOT/user_<id>/designs/<id>/image.<ext>
    return get_file_path(instance, filename, f'user_{instance.author.id}/designs/images')


def user_design_file_path(instance, filename):
    # 设计文件将被上传到 MEDIA_ROOT/user_<id>/designs/<id>/design.<ext>
    # 对于更新操作，保持固定文件名，这样前端可以预测URL
    if hasattr(instance, 'id') and instance.id:
        # 如果是更新，使用固定文件名
        ext = filename.split('.')[-1]
        return f'user_{instance.author.id}/designs/{instance.id}/design.{ext}'
    else:
        # 如果是新建，使用唯一文件名
        return get_file_path(instance, filename, f'user_{instance.author.id}/designs/files')


class Design(models.Model):
    title = models.CharField(max_length=100, verbose_name='设计图标题')
    image = models.ImageField(
        upload_to=user_design_image_path,
        verbose_name='设计图图片'
    )
    create_time = models.DateTimeField(
        auto_now_add=True,
        verbose_name='创建时间'
    )
    update_time = models.DateTimeField(
        auto_now=True,
        verbose_name='更新时间'
    )
    author = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        verbose_name='作者'
    )
    download = models.FileField(
        upload_to=user_design_file_path,
        verbose_name='设计图文件',
        blank=True,
        null=True
    )
    # 添加分享状态字段
    is_shared = models.BooleanField(
        default=False,
        verbose_name='是否分享'
    )
    # 添加描述字段
    description = models.TextField(
        verbose_name='设计描述',
        blank=True,
        null=True
    )
    # 添加点赞数字段
    likes_count = models.PositiveIntegerField(
        default=0,
        verbose_name='点赞数'
    )
    # 添加下载数字段
    downloads_count = models.PositiveIntegerField(
        default=0,
        verbose_name='下载数'
    )

    def __str__(self):
        return self.title

    class Meta:
        verbose_name = '设计图'
        verbose_name_plural = '设计图'
        ordering = ['-create_time']  # 按创建时间倒序排列


# 添加点赞记录模型
class DesignLike(models.Model):
    """设计点赞记录模型"""
    design = models.ForeignKey(
        Design,
        on_delete=models.CASCADE,
        related_name='likes',
        verbose_name='设计'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='liked_designs',
        verbose_name='用户'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='点赞时间'
    )

    class Meta:
        verbose_name = '设计点赞'
        verbose_name_plural = '设计点赞'
        # 确保一个用户只能给一个设计点赞一次
        unique_together = ('design', 'user')
        ordering = ['-created_at']


class PasswordResetToken(models.Model):
    """密码重置令牌模型"""
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='reset_tokens',
        verbose_name='用户'
    )
    token = models.CharField(
        max_length=100,
        unique=True,
        verbose_name='重置令牌'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='创建时间'
    )
    expires_at = models.DateTimeField(
        verbose_name='过期时间'
    )
    is_used = models.BooleanField(
        default=False,
        verbose_name='是否已使用'
    )

    def __str__(self):
        return f"{self.user.username}的密码重置令牌"

    def save(self, *args, **kwargs):
        """保存时自动设置过期时间为24小时后"""
        if not self.expires_at:
            self.expires_at = datetime.now() + timedelta(hours=24)
        super().save(*args, **kwargs)

    def is_valid(self):
        """检查令牌是否有效"""
        return not self.is_used and self.expires_at > datetime.now()

    class Meta:
        verbose_name = '密码重置令牌'
        verbose_name_plural = '密码重置令牌'
        ordering = ['-created_at']


# 添加会员计划模型
class MembershipPlan(models.Model):
    """会员计划模型，定义不同的会员类型、价格和权限"""
    name = models.CharField(
        max_length=50,
        verbose_name='会员计划名称'
    )
    code = models.CharField(
        max_length=20,
        unique=True,
        verbose_name='会员计划代码'
    )
    monthly_price = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=15.00,
        verbose_name='月度价格'
    )
    yearly_price = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=150.00,
        verbose_name='年度价格'
    )
    storage_limit = models.PositiveIntegerField(
        default=100,
        verbose_name='存储限制(设计数量)'
    )
    custom_obstacle_limit = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='自定义障碍物限制(个)',
        help_text='null表示无限制'
    )
    description = models.TextField(
        blank=True,
        null=True,
        verbose_name='会员计划描述'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='是否激活'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='创建时间'
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='更新时间'
    )

    def __str__(self):
        return f"{self.name} (¥{self.monthly_price}/月)"

    class Meta:
        verbose_name = '会员计划'
        verbose_name_plural = '会员计划'
        ordering = ['monthly_price']


# 添加用户资料模型
class UserProfile(models.Model):
    """用户资料模型，扩展Django内置的User模型"""
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile',
        verbose_name='用户'
    )
    is_premium = models.BooleanField(
        default=False,
        verbose_name='是否为会员'
    )
    premium_expire_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='会员过期时间'
    )
    membership_plan = models.ForeignKey(
        MembershipPlan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        verbose_name='会员计划'
    )
    storage_limit = models.PositiveIntegerField(
        default=5,
        verbose_name='存储限制(设计数量)'
    )

    # 待生效的会员计划信息（用于处理会员降级）
    pending_membership_plan = models.ForeignKey(
        MembershipPlan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pending_users',
        verbose_name='待生效会员计划'
    )
    pending_membership_start_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='待生效会员开始时间'
    )
    pending_membership_expire_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='待生效会员过期时间'
    )

    def __str__(self):
        return f"{self.user.username}的资料"

    def is_premium_active(self):
        """检查会员是否有效"""
        if not self.is_premium:
            return False
        if not self.premium_expire_date:
            return False
        return self.premium_expire_date > timezone.now()

    def get_storage_limit(self):
        """获取存储限制"""
        if self.is_premium_active() and self.membership_plan:
            return self.membership_plan.storage_limit
        return 5  # 免费用户默认限制5个设计

    class Meta:
        verbose_name = '用户资料'
        verbose_name_plural = '用户资料'


class CustomObstacle(models.Model):
    """自定义障碍物模型，存储用户创建的自定义障碍物"""
    name = models.CharField(
        max_length=100,
        verbose_name='障碍物名称',
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='custom_obstacles',
        verbose_name='用户'
    )
    obstacle_data = models.JSONField(
        verbose_name='障碍物数据'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='创建时间'
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='更新时间'
    )
    is_shared = models.BooleanField(
        default=False,
        verbose_name='是否共享'
    )

    def __str__(self):
        return f"{self.user.username}的自定义障碍物 - {self.name}"

    class Meta:
        verbose_name = '自定义障碍物'
        verbose_name_plural = '自定义障碍物'
        ordering = ['-created_at']
        # 确保同一用户不能创建同名障碍物
        unique_together = ('user', 'name')


# 会员订单模型
class MembershipOrder(models.Model):
    """会员订单模型，记录会员购买记录"""
    ORDER_STATUS_CHOICES = (
        ('pending', '待支付'),
        ('paid', '已支付'),
        ('canceled', '已取消'),
        ('refunded', '已退款'),
        ('failed', '支付失败'),
    )

    PAYMENT_CHANNEL_CHOICES = (
        ('alipay', '支付宝'),
        ('wechat', '微信支付'),
        ('creditcard', '信用卡'),
        ('other', '其他'),
    )

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='membership_orders',
        verbose_name='用户'
    )
    order_id = models.CharField(
        max_length=64,
        unique=True,
        verbose_name='订单号'
    )
    membership_plan = models.ForeignKey(
        MembershipPlan,
        on_delete=models.SET_NULL,
        null=True,
        related_name='orders',
        verbose_name='会员计划'
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='订单金额'
    )
    payment_channel = models.CharField(
        max_length=20,
        choices=PAYMENT_CHANNEL_CHOICES,
        default='alipay',
        verbose_name='支付渠道'
    )
    status = models.CharField(
        max_length=20,
        choices=ORDER_STATUS_CHOICES,
        default='pending',
        verbose_name='订单状态'
    )
    trade_no = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        verbose_name='第三方交易号'
    )
    billing_cycle = models.CharField(
        max_length=10,
        choices=(('month', '月度'), ('year', '年度')),
        default='month',
        verbose_name='计费周期'
    )
    payment_url = models.TextField(
        blank=True,
        null=True,
        verbose_name='支付链接'
    )
    payment_time = models.DateTimeField(
        blank=True,
        null=True,
        verbose_name='支付时间'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='创建时间'
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='更新时间'
    )

    class Meta:
        verbose_name = '会员订单'
        verbose_name_plural = '会员订单'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.order_id} - {self.user.username} - {self.amount}元"

    def save(self, *args, **kwargs):
        # 如果没有订单号，则生成一个
        if not self.order_id:
            import datetime
            import random
            now = datetime.datetime.now()
            order_id = f"ECD{now.strftime('%Y%m%d%H%M%S')}{random.randint(1000, 9999)}"
            self.order_id = order_id
        super().save(*args, **kwargs)
