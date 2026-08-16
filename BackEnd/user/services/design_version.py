"""设计版本快照服务。"""

import json
import logging
import os

from django.core.files.base import ContentFile
from django.db import transaction

from user.models import Design, DesignVersion

MAX_VERSIONS_PER_DESIGN = 50
logger = logging.getLogger(__name__)


class DesignVersionSnapshotError(ValueError):
    """版本缺少可恢复的图片快照。"""


class DesignVersionCourseDataError(ValueError):
    """版本无法读取可恢复的路线数据。"""


def _delete_storage_file(storage, name: str | None) -> None:
    """删除存储文件；删除失败只记录日志，避免掩盖已完成的数据库提交。"""
    if not name:
        return
    try:
        storage.delete(name)
    except Exception:
        logger.exception("删除设计版本文件失败: name=%s", name)


def _delete_storage_file_on_commit(storage, name: str | None) -> None:
    """仅在数据库事务提交后删除旧文件。"""
    if name:
        transaction.on_commit(
            lambda: _delete_storage_file(storage, name),
            robust=True,
        )


def _read_course_data(design: Design):
    """从设计 JSON 文件中读取路线数据。"""
    if not design.download:
        return {}
    try:
        with design.download.open('rb') as fp:
            content = fp.read().decode('utf-8')
        return json.loads(content)
    except Exception as exc:
        raise DesignVersionCourseDataError(
            '设计路线文件损坏或无法读取，无法创建版本快照'
        ) from exc


def _prune_old_versions(design: Design) -> None:
    """只保留每个设计最近的版本快照。"""
    versions_to_delete = list(
        DesignVersion.objects.filter(design=design)
        .order_by('-version_number')
        .values('id', 'image_snapshot')[MAX_VERSIONS_PER_DESIGN:]
    )
    if not versions_to_delete:
        return
    snapshot_names = [
        version['image_snapshot']
        for version in versions_to_delete
        if version.get('image_snapshot')
    ]
    DesignVersion.objects.filter(
        id__in=[version['id'] for version in versions_to_delete]
    ).delete()
    storage = DesignVersion.image_snapshot.field.storage
    for snapshot_name in snapshot_names:
        _delete_storage_file_on_commit(storage, snapshot_name)


def _next_version_number(design: Design) -> int:
    latest = DesignVersion.objects.filter(design=design).order_by('-version_number').first()
    return 1 if latest is None else latest.version_number + 1


def _read_file(field_file):
    """读取已存在的存储文件，返回字节内容和原始文件名。"""
    if not field_file or not field_file.name:
        return None, None
    if not field_file.storage.exists(field_file.name):
        return None, None
    with field_file.open('rb') as file_obj:
        return file_obj.read(), os.path.basename(field_file.name)


def _read_version_image_snapshot(version: DesignVersion):
    """读取完整版本图片快照，缺失时拒绝混用当前设计文件。"""
    content, filename = _read_file(version.image_snapshot)
    if content is None:
        raise DesignVersionSnapshotError(
            '该版本缺少图片快照，无法安全执行恢复或复制'
        )
    return content, filename


def _save_image_snapshot(version: DesignVersion, design: Design) -> None:
    """把当前设计图片复制到版本独立快照中。"""
    content, filename = _read_file(design.image)
    if content is None:
        return
    try:
        version.image_snapshot.save(
            filename or 'design.png',
            ContentFile(content),
            save=False,
        )
        version.save(update_fields=['image_snapshot'])
    except Exception:
        if version.image_snapshot.name:
            _delete_storage_file(version.image_snapshot.storage, version.image_snapshot.name)
        raise


def create_design_version(design: Design, source: str = 'manual') -> DesignVersion:
    """为当前设计创建版本快照。"""
    snapshot_name = None
    try:
        with transaction.atomic():
            locked_design = Design.objects.select_for_update().get(pk=design.pk)
            version = DesignVersion.objects.create(
                design=locked_design,
                author=locked_design.author,
                version_number=_next_version_number(locked_design),
                source=source,
                title=locked_design.title,
                description=locked_design.description,
                course_data=_read_course_data(locked_design),
            )
            _save_image_snapshot(version, locked_design)
            snapshot_name = version.image_snapshot.name
            _prune_old_versions(locked_design)
            return version
    except Exception:
        if snapshot_name:
            _delete_storage_file(DesignVersion.image_snapshot.field.storage, snapshot_name)
        raise


def restore_design_version(design: Design, version: DesignVersion) -> DesignVersion:
    """恢复版本到当前设计并创建 restore 快照。"""
    new_image_name = None
    new_download_name = None
    old_image_name = None
    old_download_name = None
    image_storage = None
    download_storage = None
    try:
        with transaction.atomic():
            locked_design = Design.objects.select_for_update().get(pk=design.pk)
            locked_version = DesignVersion.objects.get(pk=version.pk, design=locked_design)
            old_image_name = locked_design.image.name if locked_design.image else None
            old_download_name = locked_design.download.name if locked_design.download else None
            image_storage = locked_design.image.storage
            download_storage = locked_design.download.storage

            locked_design.title = locked_version.title
            locked_design.description = locked_version.description
            if locked_version.course_data is not None:
                locked_design.download.save(
                    'design.json',
                    ContentFile(
                        json.dumps(locked_version.course_data, ensure_ascii=False).encode('utf-8')
                    ),
                    save=False,
                )
                new_download_name = locked_design.download.name

            image_content, image_filename = _read_version_image_snapshot(locked_version)
            locked_design.image.save(
                image_filename or 'design.png',
                ContentFile(image_content),
                save=False,
            )
            new_image_name = locked_design.image.name if locked_design.image else None
            new_download_name = locked_design.download.name if locked_design.download else None
            locked_design.save()

            if old_image_name and old_image_name != new_image_name:
                _delete_storage_file_on_commit(image_storage, old_image_name)
            if old_download_name and old_download_name != new_download_name:
                _delete_storage_file_on_commit(download_storage, old_download_name)

            return create_design_version(locked_design, source='restore')
    except Exception:
        if new_image_name and new_image_name != old_image_name:
            _delete_storage_file(image_storage, new_image_name)
        if new_download_name and new_download_name != old_download_name:
            _delete_storage_file(download_storage, new_download_name)
        raise


def copy_design_version(version: DesignVersion, author=None) -> Design:
    """将指定版本复制为新设计，并将作者绑定到发起复制的用户。"""
    with transaction.atomic():
        source_version = DesignVersion.objects.select_related('design').get(pk=version.pk)
        target_author = author or source_version.author
        image_content, image_filename = _read_version_image_snapshot(source_version)

        new_design = Design.objects.create(
            title=f"{source_version.title} 副本",
            description=source_version.description,
            author=target_author,
            is_shared=False,
        )
        try:
            if image_content is not None:
                new_design.image.save(
                    image_filename or 'design.png',
                    ContentFile(image_content),
                    save=False,
                )
            if source_version.course_data is not None:
                new_design.download.save(
                    'design.json',
                    ContentFile(
                        json.dumps(source_version.course_data, ensure_ascii=False).encode('utf-8')
                    ),
                    save=False,
                )
            new_design.save()
            create_design_version(new_design, source='manual')
        except Exception:
            if new_design.image:
                new_design.image.delete(save=False)
            if new_design.download:
                new_design.download.delete(save=False)
            new_design.delete()
            raise
        return new_design
