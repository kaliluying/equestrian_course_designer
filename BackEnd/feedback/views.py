from django.shortcuts import render
from rest_framework import viewsets, permissions
from rest_framework.response import Response
from rest_framework import status
from .models import Feedback
from .serializers import FeedbackSerializer

# Create your views here.


class FeedbackViewSet(viewsets.ModelViewSet):
    """反馈视图集"""
    queryset = Feedback.objects.all()
    serializer_class = FeedbackSerializer

    def get_permissions(self):
        """
        根据不同的操作设置不同的权限：
        - 创建反馈：允许所有用户（包括未登录用户）
        - 其他操作：仅管理员可操作
        """
        if self.action == 'create':
            permission_classes = [permissions.AllowAny]
        else:
            permission_classes = [permissions.IsAdminUser]
        return [permission() for permission in permission_classes]

    def create(self, request, *args, **kwargs):
        """创建反馈"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(
            {"message": "反馈提交成功，感谢您的反馈！", "data": serializer.data},
            status=status.HTTP_201_CREATED,
            headers=headers
        )
