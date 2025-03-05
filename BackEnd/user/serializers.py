from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from .models import Design, DesignLike, UserProfile, MembershipPlan


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


class DesignListSerializer(serializers.ModelSerializer):
    """设计列表序列化器（用于公开分享列表）"""
    author_username = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = Design
        fields = ('id', 'title', 'image', 'create_time', 'update_time',
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
