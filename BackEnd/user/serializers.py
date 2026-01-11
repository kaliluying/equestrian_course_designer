from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from .models import Design, DesignLike, UserProfile, MembershipPlan, CustomObstacle, MembershipOrder
from .utils import get_absolute_media_url


class UserRegisterSerializer(serializers.ModelSerializer):
    """用户注册序列化器"""
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        validators=[validate_password]
    )
    confirmPassword = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    is_staff = serializers.BooleanField(
        default=False,
        required=False,
        help_text='是否可以访问后台'
    )

    class Meta:
        model = User
        fields = ('username', 'password',
                  'confirmPassword', 'email', 'is_staff')
        extra_kwargs = {
            'email': {
                'required': True,
                'error_messages': {
                    'required': '请输入邮箱地址',
                    'invalid': '请输入有效的邮箱地址',
                }
            },
            'username': {
                'help_text': '用户名',
                'label': '用户名',
                'error_messages': {
                    'required': '请输入用户名',
                    'blank': '用户名不能为空',
                    'unique': '该用户名已被使用',
                }
            },
        }

    def validate_username(self, value):
        """验证用户名"""
        if len(value) < 2:
            raise serializers.ValidationError('用户名长度不能小于2位')
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('该用户名已被使用')
        return value

    def validate_email(self, value):
        """验证邮箱"""
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('该邮箱已被注册')
        return value

    def validate(self, attrs):
        """验证两次密码是否一致"""
        if attrs['password'] != attrs['confirmPassword']:
            raise serializers.ValidationError(
                {"confirmPassword": ["两次输入的密码不一致"]})

        # 验证密码复杂度
        password = attrs['password']
        if len(password) < 8:
            raise serializers.ValidationError({"password": ["密码长度不能小于8位"]})
        if not any(char.isdigit() for char in password):
            raise serializers.ValidationError({"password": ["密码必须包含数字"]})
        if not any(char.isalpha() for char in password):
            raise serializers.ValidationError({"password": ["密码必须包含字母"]})

        return attrs

    def create(self, validated_data):
        """创建用户"""
        validated_data.pop('confirmPassword')  # 删除confirmPassword字段
        is_staff = validated_data.pop('is_staff', False)  # 获取并移除is_staff字段

        # 创建用户
        user = User.objects.create_user(**validated_data)

        # 设置后台访问权限
        if is_staff:
            user.is_staff = True
            user.save()

        # 获取免费会员计划
        try:
            free_plan = MembershipPlan.objects.get(code='free')
        except MembershipPlan.DoesNotExist:
            # 如果免费计划不存在，创建一个
            free_plan = MembershipPlan.objects.create(
                name='免费用户',
                code='free',
                monthly_price=0,
                yearly_price=0,
                storage_limit=5,
                custom_obstacle_limit=10,
                description='免费用户计划，限制存储5个设计'
            )

        # 创建用户资料并绑定免费会员计划
        UserProfile.objects.create(
            user=user,
            membership_plan=free_plan
        )

        return user


class UserLoginSerializer(serializers.Serializer):
    """用户登录序列化器"""
    username = serializers.CharField(
        label="用户名",
        help_text="用户名",
        required=True,
        allow_blank=False,
        error_messages={
            'required': '请输入用户名',
            'blank': '用户名不能为空'
        }
    )
    password = serializers.CharField(
        label="密码",
        help_text="密码",
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        error_messages={
            'required': '请输入密码',
            'blank': '密码不能为空'
        }
    )

    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')

        if username and password:
            try:
                user = User.objects.get(username=username)
                if not user.check_password(password):
                    raise serializers.ValidationError('用户名或密码错误')
            except User.DoesNotExist:
                # 为了安全性，不应该暴露具体是用户不存在还是密码错误
                raise serializers.ValidationError('用户名或密码错误')

            attrs['user'] = user
            return attrs
        else:
            raise serializers.ValidationError('请输入用户名和密码')


class DesignSerializer(serializers.ModelSerializer):
    """设计序列化器"""
    author_username = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Design
        fields = '__all__'
        read_only_fields = ('author', 'create_time',
                            'update_time', 'likes_count', 'downloads_count')

    def get_author_username(self, obj):
        """获取作者用户名"""
        return obj.author.username if obj.author else None

    def get_is_liked(self, obj):
        """当前用户是否已点赞"""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return DesignLike.objects.filter(design=obj, user=request.user).exists()
        return False

    def get_image_url(self, obj):
        """获取正确的图片URL"""
        if obj.image:
            return get_absolute_media_url(obj.image.url)
        return None

    def get_download_url(self, obj):
        """获取正确的下载URL"""
        if obj.download:
            return get_absolute_media_url(obj.download.url)
        return None

    def to_representation(self, instance):
        """重写序列化方法，确保使用正确的URL"""
        ret = super().to_representation(instance)
        # 确保前端能够正确获取图片和下载地址
        ret['image'] = self.get_image_url(instance)
        ret['download'] = self.get_download_url(instance)
        return ret


class DesignListSerializer(serializers.ModelSerializer):
    """设计列表序列化器（用于公开分享列表）"""
    author_username = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Design
        fields = ('id', 'title', 'image', 'image_url', 'create_time', 'update_time',
                  'author', 'author_username', 'likes_count', 'downloads_count',
                  'is_shared', 'description', 'is_liked')
        read_only_fields = fields

    def get_author_username(self, obj):
        """获取作者用户名"""
        return obj.author.username if obj.author else None

    def get_is_liked(self, obj):
        """当前用户是否已点赞"""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return DesignLike.objects.filter(design=obj, user=request.user).exists()
        return False

    def get_image_url(self, obj):
        """获取正确的图片URL"""
        if obj.image:
            return get_absolute_media_url(obj.image.url)
        return None

    def to_representation(self, instance):
        """重写序列化方法，确保使用正确的URL"""
        ret = super().to_representation(instance)
        # 确保前端能够正确获取图片地址
        ret['image'] = self.get_image_url(instance)
        return ret


class ForgotPasswordSerializer(serializers.Serializer):
    """忘记密码序列化器"""
    username = serializers.CharField(
        required=True,
        error_messages={
            'required': '请输入用户名',
            'blank': '用户名不能为空',
        }
    )
    email = serializers.EmailField(
        required=True,
        error_messages={
            'required': '请输入邮箱地址',
            'invalid': '请输入有效的邮箱地址',
        }
    )

    def validate(self, attrs):
        """验证用户名和邮箱是否匹配"""
        username = attrs.get('username')
        email = attrs.get('email')

        # 检查用户是否存在
        try:
            user = User.objects.get(username=username)
            # 检查邮箱是否匹配
            if user.email != email:
                # 为了安全，不透露具体错误原因
                raise serializers.ValidationError('用户名或邮箱不正确')
        except User.DoesNotExist:
            # 为了安全，不透露具体错误原因
            raise serializers.ValidationError('用户名或邮箱不正确')

        return attrs


class ResetPasswordSerializer(serializers.Serializer):
    """重置密码序列化器"""
    token = serializers.CharField(
        required=True,
        error_messages={
            'required': '重置令牌不能为空',
        }
    )
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        error_messages={
            'required': '请输入新密码',
        }
    )
    confirmPassword = serializers.CharField(
        write_only=True,
        required=True,
        error_messages={
            'required': '请确认新密码',
        }
    )

    def validate(self, attrs):
        """验证两次密码是否一致"""
        if attrs['password'] != attrs['confirmPassword']:
            raise serializers.ValidationError(
                {"confirmPassword": ["两次输入的密码不一致"]}
            )

        # 验证密码复杂度
        password = attrs['password']
        if len(password) < 8:
            raise serializers.ValidationError({"password": ["密码长度不能小于8位"]})
        if not any(char.isdigit() for char in password):
            raise serializers.ValidationError({"password": ["密码必须包含数字"]})
        if not any(char.isalpha() for char in password):
            raise serializers.ValidationError({"password": ["密码必须包含字母"]})

        return attrs


class CustomObstacleSerializer(serializers.ModelSerializer):
    """自定义障碍物序列化器"""
    user_username = serializers.SerializerMethodField()

    class Meta:
        model = CustomObstacle
        fields = ('id', 'name', 'obstacle_data', 'user',
                  'user_username', 'created_at', 'updated_at', 'is_shared')
        read_only_fields = ('user', 'user_username',
                            'created_at', 'updated_at')

    def get_user_username(self, obj):
        """获取用户名"""
        return obj.user.username

    def validate_obstacle_data(self, value):
        """验证障碍物数据"""
        # 确保必要的字段存在
        required_fields = ['type', 'poles', 'width', 'height']
        for field in required_fields:
            if field not in value:
                raise serializers.ValidationError(f"障碍物数据缺少必要字段: {field}")


        return value

    def create(self, validated_data):
        """创建自定义障碍物"""
        user = self.context['request'].user
        # 从会员计划中获取自定义障碍物数量限制
        max_obstacles = 10  # 默认限制（免费用户）
        if hasattr(user, 'profile') and user.profile.membership_plan:
            plan_limit = user.profile.membership_plan.custom_obstacle_limit
            if plan_limit is not None:
                max_obstacles = plan_limit
            # null 表示无限制，不检查

        current_count = CustomObstacle.objects.filter(user=user).count()
        if max_obstacles is not None and current_count >= max_obstacles:
            raise serializers.ValidationError(
                f"您已达到自定义障碍物的最大数量限制: {max_obstacles}")

        # 检查障碍物名称是否重复
        if CustomObstacle.objects.filter(name=validated_data['name'], user=user).exists():
            raise serializers.ValidationError("障碍物名称已存在")

        validated_data['user'] = user
        return super().create(validated_data)


# 会员订单序列化器
class MembershipOrderSerializer(serializers.ModelSerializer):
    plan_name = serializers.SerializerMethodField()
    user_username = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    payment_channel_display = serializers.SerializerMethodField()
    billing_cycle_display = serializers.SerializerMethodField()

    class Meta:
        model = MembershipOrder
        fields = [
            'id', 'order_id', 'user', 'user_username', 'membership_plan', 'plan_name',
            'amount', 'payment_channel', 'payment_channel_display', 'status', 'status_display',
            'trade_no', 'billing_cycle', 'billing_cycle_display', 'payment_url',
            'payment_time', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'order_id', 'trade_no',
                            'payment_time', 'created_at', 'updated_at']

    def get_plan_name(self, obj):
        return obj.membership_plan.name if obj.membership_plan else '未知计划'

    def get_user_username(self, obj):
        return obj.user.username

    def get_status_display(self, obj):
        return obj.get_status_display()

    def get_payment_channel_display(self, obj):
        return obj.get_payment_channel_display()

    def get_billing_cycle_display(self, obj):
        return obj.get_billing_cycle_display()


# 创建会员订单请求序列化器
class CreateMembershipOrderSerializer(serializers.Serializer):
    plan_id = serializers.IntegerField(required=True)
    billing_cycle = serializers.ChoiceField(
        choices=['month', 'year'], required=True)

    def validate_plan_id(self, value):
        try:
            plan = MembershipPlan.objects.get(id=value, is_active=True)
            return value
        except MembershipPlan.DoesNotExist:
            raise serializers.ValidationError("指定的会员计划不存在或已停用")

    def validate(self, data):
        # 获取计划
        plan = MembershipPlan.objects.get(id=data['plan_id'])
        # 根据计费周期获取价格
        if data['billing_cycle'] == 'month':
            data['amount'] = plan.monthly_price
        else:
            data['amount'] = plan.yearly_price
        return data
