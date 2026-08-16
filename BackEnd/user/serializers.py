import json
import re

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.files.base import ContentFile
from django.db import transaction
from django.urls import reverse
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import CollaborationEvent, CollaborationRole, CourseTemplate, CourseTemplateFavorite, Design, DesignComment, DesignLike, DesignVersion, MembershipInvoice, UserProfile, MembershipPlan, CustomObstacle, MembershipOrder

MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_ROUTE_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_ROUTE_DATA_BYTES = 512 * 1024
MAX_CUSTOM_OBSTACLE_DATA_BYTES = 256 * 1024
MAX_JSON_DEPTH = 12


def _json_depth(value, depth=0):
    """计算 JSON 嵌套深度，避免异常深度数据消耗解析资源。"""
    if depth > MAX_JSON_DEPTH:
        return depth
    if isinstance(value, dict):
        return max((_json_depth(item, depth + 1) for item in value.values()), default=depth)
    if isinstance(value, list):
        return max((_json_depth(item, depth + 1) for item in value), default=depth)
    return depth


def _validate_json_data(value, maximum_bytes, label):
    """限制 JSON 数据体积和嵌套深度。"""
    try:
        serialized = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise serializers.ValidationError(f"{label}必须是可序列化的 JSON 数据") from exc
    if len(serialized) > maximum_bytes:
        raise serializers.ValidationError(f"{label}大小不能超过 {maximum_bytes // 1024}KB")
    if _json_depth(value) > MAX_JSON_DEPTH:
        raise serializers.ValidationError(f"{label}嵌套层级过深")


def _validate_image_upload(value, label):
    """校验图片大小、格式和像素总量。"""
    if value.size > MAX_IMAGE_UPLOAD_BYTES:
        raise serializers.ValidationError(f"{label}大小不能超过 10MB")
    try:
        value.seek(0)
        with Image.open(value) as image:
            image.verify()
            image_format = image.format
            width, height = image.size
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as exc:
        raise serializers.ValidationError(f"{label}不是有效图片") from exc
    finally:
        value.seek(0)
    if image_format not in {"PNG", "JPEG", "WEBP"}:
        raise serializers.ValidationError(f"{label}只支持 PNG、JPEG 或 WEBP 格式")
    if width * height > 25_000_000:
        raise serializers.ValidationError(f"{label}像素总量过大")


def _validate_route_file(value):
    """校验设计路线文件，拒绝超大或非对象 JSON。"""
    if value.size > MAX_ROUTE_UPLOAD_BYTES:
        raise serializers.ValidationError("路线文件大小不能超过 2MB")
    try:
        value.seek(0)
        raw_data = value.read(MAX_ROUTE_UPLOAD_BYTES + 1)
        if len(raw_data) > MAX_ROUTE_UPLOAD_BYTES:
            raise serializers.ValidationError("路线文件大小不能超过 2MB")
        parsed = json.loads(raw_data.decode("utf-8"))
    except UnicodeDecodeError as exc:
        raise serializers.ValidationError("路线文件必须使用 UTF-8 编码") from exc
    except json.JSONDecodeError as exc:
        raise serializers.ValidationError("路线文件必须是有效 JSON") from exc
    finally:
        value.seek(0)
    if not isinstance(parsed, dict):
        raise serializers.ValidationError("路线文件必须是 JSON 对象")
    _validate_json_data(parsed, MAX_ROUTE_DATA_BYTES, "路线数据")


class RouteValidationRequestSerializer(serializers.Serializer):
    """路线校验和修复接口的统一请求校验器。"""

    obstacles = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )
    field_width = serializers.FloatField(required=False, default=90, min_value=0.000001, max_value=1000)
    field_height = serializers.FloatField(required=False, default=60, min_value=0.000001, max_value=1000)
    difficulty = serializers.ChoiceField(
        choices=('easy', 'medium', 'hard'),
        required=False,
        default='medium',
    )
    path = serializers.DictField(required=False, allow_null=True, default=dict)

    def to_internal_value(self, data):
        """在丢弃未知字段前限制原始请求体大小和嵌套深度。"""
        raw_data = data.dict() if hasattr(data, 'dict') else data
        if isinstance(raw_data, dict):
            try:
                _validate_json_data(raw_data, MAX_ROUTE_DATA_BYTES, '路线请求数据')
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({'request': exc.detail}) from exc
        return super().to_internal_value(data)

    def validate(self, attrs):
        """限制路线请求的 JSON 体积、深度和障碍数量。"""
        _validate_json_data(attrs, MAX_ROUTE_DATA_BYTES, '路线请求数据')
        if len(attrs['obstacles']) > 200:
            raise serializers.ValidationError('路线障碍物数量不能超过 200')
        return attrs


class RouteValidationIssueSerializer(serializers.Serializer):
    """路线规则问题。"""

    code = serializers.CharField()
    severity = serializers.CharField()
    message = serializers.CharField()
    obstacle_ids = serializers.ListField(child=serializers.CharField())
    suggested_action = serializers.CharField()
    auto_fixable = serializers.BooleanField()


class RouteValidationResultSerializer(serializers.Serializer):
    """路线校验结果。"""

    score = serializers.FloatField()
    is_valid = serializers.BooleanField()
    issues = RouteValidationIssueSerializer(many=True)
    warnings = RouteValidationIssueSerializer(many=True)
    auto_fixed = serializers.ListField(child=serializers.CharField())
    summary = serializers.CharField()


class RouteValidationResponseSerializer(serializers.Serializer):
    """路线校验接口统一响应。"""

    success = serializers.BooleanField()
    message = serializers.CharField()
    data = RouteValidationResultSerializer()


class RouteFixPatchSerializer(serializers.Serializer):
    """路线自动修复补丁说明。"""

    code = serializers.CharField()
    obstacle_ids = serializers.ListField(child=serializers.CharField())
    message = serializers.CharField()


class RouteFixResultSerializer(serializers.Serializer):
    """路线自动修复结果。"""

    patches = RouteFixPatchSerializer(many=True)
    updated_obstacles = serializers.ListField(child=serializers.DictField())
    updated_path = serializers.DictField(allow_null=True)
    validation = RouteValidationResultSerializer()
    explanation = serializers.CharField()


class RouteFixResponseSerializer(serializers.Serializer):
    """路线修复接口统一响应。"""

    success = serializers.BooleanField()
    message = serializers.CharField()
    data = RouteFixResultSerializer()


class ShareLinkCreateSerializer(serializers.Serializer):
    """协作分享链接创建请求。"""

    role = serializers.ChoiceField(
        choices=('editor', 'viewer', 'commenter'),
        required=False,
        default='editor',
    )
    expires_in_seconds = serializers.IntegerField(required=False, min_value=60)
    password = serializers.CharField(required=False, allow_blank=True, max_length=128, write_only=True)


class ShareLinkDataSerializer(serializers.Serializer):
    """协作分享链接数据。"""

    shareUrl = serializers.CharField()
    shareToken = serializers.CharField()
    expiresAt = serializers.DateTimeField()
    ttlSeconds = serializers.IntegerField()
    role = serializers.ChoiceField(choices=('editor', 'viewer', 'commenter'))
    passwordProtected = serializers.BooleanField()


class ShareLinkCreateResponseSerializer(serializers.Serializer):
    """协作分享链接创建响应。"""

    success = serializers.BooleanField()
    message = serializers.CharField()
    data = ShareLinkDataSerializer()


class ShareLinkRevokeDataSerializer(serializers.Serializer):
    """协作分享链接撤销结果。"""

    revoked_count = serializers.IntegerField()


class ShareLinkRevokeResponseSerializer(serializers.Serializer):
    """协作分享链接撤销响应。"""

    success = serializers.BooleanField()
    message = serializers.CharField()
    data = ShareLinkRevokeDataSerializer()


class UserRegisterSerializer(serializers.ModelSerializer):
    """用户注册序列化器"""
    is_staff = serializers.BooleanField(read_only=True, default=False)
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
    class Meta:
        model = User
        fields = ('username', 'password',
                  'confirmPassword', 'email', 'is_staff')
        read_only_fields = ('is_staff',)
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
        # 创建用户
        user = User.objects.create_user(**validated_data)

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


class UserAdminSerializer(serializers.ModelSerializer):
    """管理员用户管理序列化器。

    普通注册和后台用户管理使用不同的序列化器，避免公开 create 路径接收
    ``is_staff``、``is_superuser`` 等权限字段。
    """

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
        )
        # 权限字段只能通过 Django Admin 的超级管理员流程维护，不能由普通
        # staff 通过这个 API 将自己或他人提升为后台/超级管理员。
        read_only_fields = (
            "id",
            "date_joined",
            "last_login",
            "is_active",
            "is_staff",
            "is_superuser",
        )


class SetPremiumSerializer(serializers.Serializer):
    """管理员设置会员状态的请求校验。"""

    is_premium = serializers.BooleanField(required=False, default=False)
    duration_days = serializers.IntegerField(
        required=False,
        default=30,
        min_value=1,
        max_value=3650,
    )
    membership_plan_id = serializers.PrimaryKeyRelatedField(
        queryset=MembershipPlan.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        """启用会员时必须绑定一个当前有效的会员计划。"""
        plan = attrs.get("membership_plan_id")
        if attrs.get("is_premium") and (
            not plan or plan.code == "free"
        ):
            raise serializers.ValidationError(
                {"membership_plan_id": ["开启会员必须指定非免费会员计划"]}
            )
        return attrs


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
                user = User.objects.get(username=username, is_active=True)
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
    image = serializers.ImageField(required=False, allow_null=True)
    course_data = serializers.JSONField(required=False, write_only=True)
    author_username = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Design
        fields = '__all__'
        read_only_fields = ('author', 'create_time', 'update_time',
                            'likes_count', 'downloads_count', 'is_shared')

    def validate_course_data(self, value):
        """校验 JSON 路线数据，并限制其体积和嵌套深度。"""
        if not isinstance(value, dict):
            raise serializers.ValidationError('路线数据必须是对象')
        _validate_json_data(value, MAX_ROUTE_DATA_BYTES, '路线数据')
        obstacles = value.get('obstacles')
        if obstacles is not None and (not isinstance(obstacles, list) or len(obstacles) > 200):
            raise serializers.ValidationError('路线障碍物数量不能超过 200')
        return value

    def create(self, validated_data):
        """创建设计，并将内联路线数据写入受保护的 JSON 文件。"""
        course_data = validated_data.pop('course_data', None)
        instance = super().create(validated_data)
        try:
            if course_data is not None:
                instance.download.save(
                    'design.json',
                    ContentFile(json.dumps(course_data, ensure_ascii=False).encode('utf-8')),
                    save=True,
                )
        except Exception:
            if instance.image:
                instance.image.delete(save=False)
            if instance.download:
                instance.download.delete(save=False)
            instance.delete()
            raise
        return instance

    def update(self, instance, validated_data):
        """更新设计，并在请求包含路线数据时同步更新 JSON 文件。"""
        course_data = validated_data.pop('course_data', None)
        old_files = {
            'image': (
                instance.image.storage,
                instance.image.name,
            ) if instance.image else None,
            'download': (
                instance.download.storage,
                instance.download.name,
            ) if instance.download else None,
        }
        try:
            with transaction.atomic():
                instance = super().update(instance, validated_data)
                if course_data is not None:
                    instance.download.save(
                        'design.json',
                        ContentFile(json.dumps(course_data, ensure_ascii=False).encode('utf-8')),
                        save=True,
                    )
        except Exception:
            for field_name, old_file in old_files.items():
                current_file = getattr(instance, field_name, None)
                if not old_file or not current_file or current_file.name == old_file[1]:
                    continue
                try:
                    current_file.storage.delete(current_file.name)
                except Exception:
                    pass
            raise

        for field_name, old_file in old_files.items():
            current_file = getattr(instance, field_name, None)
            if not old_file or not current_file or current_file.name == old_file[1]:
                continue
            old_storage, old_name = old_file
            transaction.on_commit(
                lambda storage=old_storage, name=old_name: storage.delete(name),
                robust=True,
            )
        return instance

    def get_author_username(self, obj) -> str | None:
        """获取作者用户名"""
        return obj.author.username if obj.author else None

    def get_is_liked(self, obj) -> bool:
        """当前用户是否已点赞"""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return DesignLike.objects.filter(design=obj, user=request.user).exists()
        return False

    def get_image_url(self, obj) -> str | None:
        """返回受权限保护的图片接口地址。"""
        if obj.image:
            return self._asset_url(obj, "image")
        return None

    def get_download_url(self, obj) -> str | None:
        """返回受权限保护的路线文件接口地址。"""
        if obj.download:
            return self._asset_url(obj, "json")
        return None

    def _asset_url(self, obj, asset_type: str) -> str:
        """构建设计资源接口地址，避免直接暴露 MEDIA_ROOT 文件。"""
        path = f"{reverse('design-asset', kwargs={'pk': obj.pk})}?type={asset_type}"
        request = self.context.get("request")
        return request.build_absolute_uri(path) if request else path

    def to_representation(self, instance):
        """重写序列化方法，确保使用正确的URL"""
        ret = super().to_representation(instance)
        # 确保前端能够正确获取图片和下载地址
        ret['image'] = self.get_image_url(instance)
        ret['download'] = self.get_download_url(instance)
        return ret

    def validate_image(self, value):
        """校验设计图片，避免恶意文件和超大像素图进入图片处理链路。"""
        _validate_image_upload(value, "设计图片")
        return value

    def validate_download(self, value):
        """校验设计路线 JSON 文件。"""
        if value:
            _validate_route_file(value)
        return value


class DesignResponseEnvelopeSerializer(serializers.Serializer):
    """设计操作统一响应。"""

    success = serializers.BooleanField()
    message = serializers.CharField()
    data = DesignSerializer()


class DesignCommentSerializer(serializers.ModelSerializer):
    """设计评论序列化器。"""
    user_username = serializers.SerializerMethodField()
    content = serializers.CharField(max_length=2000)

    class Meta:
        model = DesignComment
        fields = ('id', 'design', 'user', 'user_username', 'content', 'obstacle_id', 'x', 'y', 'is_resolved', 'created_at', 'updated_at')
        read_only_fields = ('design', 'user', 'user_username', 'is_resolved', 'created_at', 'updated_at')

    def get_user_username(self, obj):
        return obj.user.username if obj.user else None


class CollaborationEventSerializer(serializers.ModelSerializer):
    """协作事件序列化器。"""
    user_username = serializers.SerializerMethodField()

    class Meta:
        model = CollaborationEvent
        fields = ('id', 'design', 'user', 'user_username', 'event_type', 'object_id', 'payload', 'created_at')
        read_only_fields = fields

    def get_user_username(self, obj):
        return obj.user.username if obj.user else None


class CollaborationRoleSerializer(serializers.ModelSerializer):
    """协作角色序列化器。"""
    can_edit = serializers.BooleanField(read_only=True)
    can_comment = serializers.BooleanField(read_only=True)

    class Meta:
        model = CollaborationRole
        fields = ('id', 'design', 'user', 'role', 'can_edit', 'can_comment', 'created_at', 'updated_at')
        read_only_fields = ('created_at', 'updated_at')


class DesignVersionSerializer(serializers.ModelSerializer):
    """设计版本序列化器"""

    class Meta:
        model = DesignVersion
        fields = (
            'id',
            'design',
            'version_number',
            'source',
            'title',
            'description',
            'remark',
            'course_data',
            'created_at',
        )
        read_only_fields = fields


class DesignVersionUpdateSerializer(serializers.Serializer):
    """设计版本可编辑字段。"""

    title = serializers.CharField(required=False, max_length=100, allow_blank=False)
    remark = serializers.CharField(required=False, allow_null=True, allow_blank=True)


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

    def get_author_username(self, obj) -> str | None:
        """获取作者用户名"""
        return obj.author.username if obj.author else None

    def get_is_liked(self, obj) -> bool:
        """当前用户是否已点赞"""
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return DesignLike.objects.filter(design=obj, user=request.user).exists()
        return False

    def get_image_url(self, obj) -> str | None:
        """返回受权限保护的图片接口地址。"""
        if obj.image:
            path = f"{reverse('design-asset', kwargs={'pk': obj.pk})}?type=image"
            request = self.context.get("request")
            return request.build_absolute_uri(path) if request else path
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
        """只校验输入格式，账号匹配由视图统一处理。"""
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

    def get_user_username(self, obj) -> str:
        """获取用户名"""
        return obj.user.username

    def validate_obstacle_data(self, value):
        """验证障碍物数据"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("障碍物数据必须是对象")
        _validate_json_data(value, MAX_CUSTOM_OBSTACLE_DATA_BYTES, "障碍物数据")
        # 确保必要的字段存在
        required_fields = ['type', 'poles', 'width', 'height']
        for field in required_fields:
            if field not in value:
                raise serializers.ValidationError(f"障碍物数据缺少必要字段: {field}")

        decoration_properties = value.get("decorationProperties") or {}
        if not isinstance(decoration_properties, dict):
            raise serializers.ValidationError("装饰属性格式无效")
        svg_data = decoration_properties.get("svgData")
        if svg_data is not None:
            if not isinstance(svg_data, str) or len(svg_data) > 200_000:
                raise serializers.ValidationError("SVG 数据格式或大小无效")
            if re.search(
                r"<\s*(script|foreignObject|iframe)|on[a-z]+\s*=|javascript:|data:",
                svg_data,
                re.IGNORECASE,
            ):
                raise serializers.ValidationError("SVG 包含不允许的脚本或外部资源")

        return value

    def create(self, validated_data):
        """创建自定义障碍物"""
        user = self.context['request'].user

        # 检查障碍物名称是否重复
        if CustomObstacle.objects.filter(name=validated_data['name'], user=user).exists():
            raise serializers.ValidationError("障碍物名称已存在")

        validated_data['user'] = user
        return super().create(validated_data)


class CourseTemplateSerializer(serializers.ModelSerializer):
    """路线模板序列化器。"""
    author_username = serializers.SerializerMethodField()
    is_favorited = serializers.SerializerMethodField()

    class Meta:
        model = CourseTemplate
        fields = (
            'id', 'title', 'description', 'difficulty', 'field_width', 'field_height',
            'obstacle_count', 'course_data', 'cover_image', 'is_public', 'is_official',
            'author', 'author_username', 'copy_count', 'favorite_count', 'is_favorited',
            'created_at', 'updated_at'
        )
        read_only_fields = (
            'author', 'copy_count', 'favorite_count', 'created_at', 'updated_at', 'is_official'
        )

    def get_author_username(self, obj) -> str | None:
        return obj.author.username if obj.author else None

    def get_is_favorited(self, obj) -> bool:
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return CourseTemplateFavorite.objects.filter(template=obj, user=request.user).exists()
        return False

    def validate_course_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('路线数据必须是对象')
        _validate_json_data(value, MAX_ROUTE_DATA_BYTES, '路线数据')
        obstacles = value.get('obstacles')
        if obstacles is not None and (not isinstance(obstacles, list) or len(obstacles) > 200):
            raise serializers.ValidationError('路线障碍物数量不能超过 200')
        return value

    def validate_cover_image(self, value):
        """校验模板封面图片。"""
        if value:
            _validate_image_upload(value, '模板封面图片')
        return value


class MembershipInvoiceSerializer(serializers.ModelSerializer):
    """会员订单发票序列化器。"""

    title = serializers.CharField(max_length=100, required=True, allow_blank=False)
    tax_number = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    email = serializers.EmailField(max_length=254, required=True)

    class Meta:
        model = MembershipInvoice
        fields = ('id', 'order', 'title', 'tax_number', 'email', 'status', 'invoice_number', 'created_at', 'updated_at')
        read_only_fields = ('order', 'status', 'invoice_number', 'created_at', 'updated_at')


class InvoiceIssueSerializer(serializers.Serializer):
    """后台开票结果请求。"""

    invoice_number = serializers.CharField(max_length=50, required=False, allow_blank=False)


# 会员订单序列化器
class MembershipOrderSerializer(serializers.ModelSerializer):
    plan_name = serializers.SerializerMethodField()
    user_username = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    payment_channel_display = serializers.SerializerMethodField()
    billing_cycle_display = serializers.SerializerMethodField()
    invoice = serializers.SerializerMethodField()

    class Meta:
        model = MembershipOrder
        fields = [
            'id', 'order_id', 'user', 'user_username', 'membership_plan', 'plan_name',
            'amount', 'payment_channel', 'payment_channel_display', 'status', 'status_display',
            'refund_status', 'trade_no', 'billing_cycle', 'billing_cycle_display', 'payment_url',
            'payment_time', 'invoice', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'order_id', 'trade_no',
                            'payment_time', 'created_at', 'updated_at']


    @extend_schema_field(MembershipInvoiceSerializer)
    def get_invoice(self, obj):
        invoice = getattr(obj, 'invoice', None)
        return MembershipInvoiceSerializer(invoice).data if invoice else None

    def get_plan_name(self, obj) -> str:
        return obj.membership_plan.name if obj.membership_plan else '未知计划'

    def get_user_username(self, obj) -> str:
        return obj.user.username

    def get_status_display(self, obj) -> str:
        return obj.get_status_display()

    def get_payment_channel_display(self, obj) -> str:
        return obj.get_payment_channel_display()

    def get_billing_cycle_display(self, obj) -> str:
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
