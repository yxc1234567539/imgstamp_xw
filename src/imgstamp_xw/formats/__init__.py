"""内置图片格式处理器。

导入本包即可完成所有格式的自动注册。
"""

from __future__ import annotations

from . import gif, jpeg, png  # noqa: F401  (导入即注册)

__all__ = ["gif", "jpeg", "png"]
