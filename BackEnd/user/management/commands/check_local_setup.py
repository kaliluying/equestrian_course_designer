"""本地开发环境检查命令。"""

import os
import sys

from django.conf import settings
from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.db import connections

from user.utils import ExternalServiceConfigError, validate_alipay_config


class Command(BaseCommand):
    """检查本地后端启动所需的关键依赖。"""

    help = "检查数据库、Redis、目录、AI 和支付配置"

    def add_arguments(self, parser):
        parser.add_argument(
            "--strict",
            action="store_true",
            help="存在错误时以非零状态退出",
        )

    def handle(self, *args, **options):
        strict = options["strict"]
        errors = []
        warnings = []

        def ok(message):
            self.stdout.write(self.style.SUCCESS(f"✓ {message}"))

        def warn(message):
            warnings.append(message)
            self.stdout.write(self.style.WARNING(f"⚠ {message}"))

        def fail(message):
            errors.append(message)
            self.stdout.write(self.style.ERROR(f"✗ {message}"))

        if sys.version_info >= (3, 12):
            ok(f"Python 版本: {sys.version.split()[0]}")
        else:
            fail(f"Python 版本过低: {sys.version.split()[0]}，建议使用 3.12+")

        for directory in (settings.MEDIA_ROOT, settings.STATIC_ROOT, settings.LOGS_DIR):
            if os.path.isdir(directory):
                ok(f"目录存在: {directory}")
            else:
                warn(f"目录不存在，将在运行时自动创建或需要手动创建: {directory}")

        try:
            connections["default"].ensure_connection()
            ok("MySQL 数据库连接正常")
        except Exception as exc:
            fail(f"MySQL 数据库连接失败: {exc}")

        try:
            cache.set("local_setup_check", "ok", timeout=10)
            if cache.get("local_setup_check") == "ok":
                ok("Redis 缓存连接正常")
            else:
                fail("Redis 缓存读写失败")
        except Exception as exc:
            fail(f"Redis 缓存连接失败: {exc}")

        ai_missing = [
            name
            for name in ("API_KEY", "MODEL", "BASE_URL")
            if not os.getenv(name)
        ]
        if ai_missing:
            warn(
                "AI Provider 配置不完整，AI 生成会回退到规则引擎: "
                + ", ".join(ai_missing)
            )
        else:
            ok("AI Provider 环境变量已配置")

        try:
            validate_alipay_config()
            ok("支付宝配置可用")
        except ExternalServiceConfigError as exc:
            warn(f"支付宝配置不可用，支付接口会返回 503: {exc}")

        if errors:
            self.stdout.write("")
            self.stdout.write(self.style.ERROR(f"检查完成，发现 {len(errors)} 个错误"))
            if strict:
                raise SystemExit(1)
        else:
            self.stdout.write("")
            ok("本地环境检查完成")

        if warnings:
            self.stdout.write(self.style.WARNING(f"共有 {len(warnings)} 个警告"))
