"""路线模板库与公开模板市场视图。"""

import json

from django.db import transaction
from django.db.models import F, Q
from django.core.files.base import ContentFile
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import CourseTemplate, CourseTemplateFavorite, Design
from ..serializers import CourseTemplateSerializer, DesignSerializer
from ..utils import error_response
from ..services.membership_access import (
    MembershipAccessError,
    assert_design_capacity,
    assert_template_publish_capacity,
)
from ..services.design_version import create_design_version


class CourseTemplateViewSet(viewsets.ModelViewSet):
    """路线模板视图集。"""

    queryset = CourseTemplate.objects.all()
    serializer_class = CourseTemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = CourseTemplate.objects.filter(Q(is_public=True) | Q(author=user)).select_related('author')
        difficulty = self.request.query_params.get('difficulty')
        search = self.request.query_params.get('search')
        ordering = self.request.query_params.get('ordering')

        if difficulty:
            queryset = queryset.filter(difficulty=difficulty)
        for field_name in ('obstacle_count', 'field_width', 'field_height'):
            value = self.request.query_params.get(field_name)
            if not value:
                continue
            try:
                value = int(value)
            except (TypeError, ValueError):
                raise ValidationError({field_name: '必须是非负整数'})
            if value < 0:
                raise ValidationError({field_name: '必须是非负整数'})
            queryset = queryset.filter(**{field_name: value})
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(description__icontains=search))
        if ordering in {'latest', '-created_at'}:
            queryset = queryset.order_by('-created_at')
        elif ordering in {'popular', 'copy_count', '-copy_count'}:
            queryset = queryset.order_by('-copy_count', '-favorite_count', '-created_at')
        return queryset

    def get_object(self):
        obj = super().get_object()
        if not obj.is_public and obj.author_id != self.request.user.id:
            from django.http import Http404
            raise Http404
        return obj

    def perform_create(self, serializer):
        with transaction.atomic():
            if serializer.validated_data.get('is_public', True):
                assert_template_publish_capacity(self.request.user)
            serializer.save(author=self.request.user)

    def perform_update(self, serializer):
        template = self.get_object()
        if template.author_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('您无权编辑此模板')
        with transaction.atomic():
            is_becoming_public = (
                serializer.validated_data.get('is_public') is True
                and not template.is_public
            )
            if is_becoming_public:
                assert_template_publish_capacity(self.request.user)
            serializer.save(author=template.author)

    def destroy(self, request, *args, **kwargs):
        template = self.get_object()
        if template.author_id != request.user.id:
            return error_response('您无权删除此模板', status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='favorite')
    def favorite(self, request, pk=None):
        self.get_object()
        with transaction.atomic():
            template = CourseTemplate.objects.select_for_update().get(pk=pk)
            favorite = CourseTemplateFavorite.objects.filter(
                template=template, user=request.user
            ).first()
            if favorite:
                favorite.delete()
                template.favorite_count = max(0, template.favorite_count - 1)
                is_favorited = False
            else:
                CourseTemplateFavorite.objects.create(template=template, user=request.user)
                template.favorite_count += 1
                is_favorited = True
            template.save(update_fields=['favorite_count', 'updated_at'])
        return Response({'is_favorited': is_favorited, 'favorite_count': template.favorite_count})

    @action(detail=True, methods=['post'], url_path='create-design')
    def create_design(self, request, pk=None):
        template = self.get_object()
        design = None
        try:
            with transaction.atomic():
                assert_design_capacity(request.user)
                design = Design.objects.create(
                    title=f"{template.title} 设计",
                    description=template.description,
                    author=request.user,
                    is_shared=False,
                )
                design.download.save(
                    "design.json",
                    ContentFile(
                        json.dumps(template.course_data, ensure_ascii=False).encode("utf-8")
                    ),
                    save=True,
                )
                create_design_version(design, source="manual")
                CourseTemplate.objects.filter(id=template.id).update(
                    copy_count=F("copy_count") + 1
                )
        except MembershipAccessError as exc:
            return error_response(exc.message, exc.status_code, exc.data)
        except Exception:
            # 数据库事务不能回滚对象存储，失败时主动清理可能已经写入的
            # 新文件，避免出现无主文件和“复制成功但文件缺失”的设计。
            if design is not None and design.download:
                design.download.delete(save=False)
            if design is not None:
                design.delete()
            return error_response(
                "从模板创建设计失败，请稍后重试",
                status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        data = DesignSerializer(design, context={'request': request}).data
        data['template_id'] = template.id
        return Response(data, status=status.HTTP_201_CREATED)
