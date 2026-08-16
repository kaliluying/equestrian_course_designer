"""默认 Django 测试发现入口，覆盖用户安全回归测试。"""

from django.test import SimpleTestCase

import equestrian.settings as project_settings

from user.security_tests import *  # noqa: F401,F403


class ExternalURLValidationTests(SimpleTestCase):
    """外部 URL 配置不能携带可误导解析结果的组件。"""

    def test_rejects_userinfo_query_fragment_and_invalid_port(self):
        invalid_urls = (
            "https://user:password@example.com",
            "https://example.com?next=/admin",
            "https://example.com#fragment",
            "https://example.com:not-a-port",
            "https://example.com:65536",
        )

        for value in invalid_urls:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    project_settings._parse_http_url(value, "TEST_URL", allow_path=False)
