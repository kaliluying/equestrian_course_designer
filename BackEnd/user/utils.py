from django.conf import settings
from urllib.parse import urljoin


def get_absolute_media_url(path):
    """
    生成绝对媒体URL，确保在不同环境中使用正确的域名

    Args:
        path: 相对路径

    Returns:
        完整的URL路径
    """
    # 构建协议
    protocol = 'https' if settings.USE_HTTPS else 'http'

    # 构建基础URL
    base_url = f"{protocol}://{settings.SITE_DOMAIN}"

    # 确保路径以'/'开头
    if not path.startswith('/'):
        path = '/' + path

    # 返回完整URL
    return urljoin(base_url, path)
