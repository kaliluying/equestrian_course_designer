"""用户应用测试包。

保留类导出以兼容 user.tests.<ClassName> 测试路径。
"""

from .test_ai import *  # noqa: F401,F403
from .test_auth import *  # noqa: F401,F403
from .test_collaboration import *  # noqa: F401,F403
from .test_design import *  # noqa: F401,F403
from .test_membership import *  # noqa: F401,F403
from .test_payments import *  # noqa: F401,F403
from .test_route_validation import *  # noqa: F401,F403
