"""设计版本快照服务。"""

import json

from django.core.files.base import ContentFile

from user.models import Design, DesignVersion


def _read_course_data(design: Design):
    """从设计 JSON 文件中读取路线数据。"""
    if not design.download:
        return {}
    try:
        with design.download.open('rb') as fp:
            content = fp.read().decode('utf-8')
        return json.loads(content) if content else {}
    except Exception:
        return {}


def _next_version_number(design: Design) -> int:
    latest = DesignVersion.objects.filter(design=design).order_by('-version_number').first()
    return 1 if latest is None else latest.version_number + 1


def create_design_version(design: Design, source: str = 'manual') -> DesignVersion:
    """为当前设计创建版本快照。"""
    return DesignVersion.objects.create(
        design=design,
        author=design.author,
        version_number=_next_version_number(design),
        source=source,
        title=design.title,
        description=design.description,
        course_data=_read_course_data(design),
    )


def restore_design_version(design: Design, version: DesignVersion) -> DesignVersion:
    """恢复版本到当前设计并创建 restore 快照。"""
    design.title = version.title
    design.description = version.description
    if version.course_data is not None:
        design.download.save(
            'design.json',
            ContentFile(json.dumps(version.course_data, ensure_ascii=False).encode('utf-8')),
            save=False,
        )
    design.save()
    return create_design_version(design, source='restore')


def copy_design_version(version: DesignVersion) -> Design:
    """将指定版本复制为新设计。"""
    source_design = version.design
    new_design = Design(
        title=f"{version.title} 副本",
        description=version.description,
        author=version.author,
        is_shared=False,
    )
    if source_design.image:
        new_design.image = source_design.image
    if version.course_data is not None:
        new_design.download.save(
            'design.json',
            ContentFile(json.dumps(version.course_data, ensure_ascii=False).encode('utf-8')),
            save=False,
        )
    new_design.save()
    create_design_version(new_design, source='manual')
    return new_design
