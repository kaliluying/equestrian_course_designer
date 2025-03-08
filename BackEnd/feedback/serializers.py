from rest_framework import serializers
from .models import Feedback


class FeedbackSerializer(serializers.ModelSerializer):
    """反馈序列化器"""

    class Meta:
        model = Feedback
        fields = ['id', 'type', 'title', 'content', 'contact', 'created_at']
        read_only_fields = ['id', 'created_at']

    def create(self, validated_data):
        """创建反馈时，如果用户已登录，则关联用户信息"""
        request = self.context.get('request')

        # 如果用户已登录，则关联用户信息
        if request and request.user.is_authenticated:
            validated_data['user'] = request.user

        return super().create(validated_data)
