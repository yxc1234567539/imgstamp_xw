"""imgstamp_xw —— 在图片文件头无损添加自定义字符串标记。

支持 PNG / JPEG / GIF 三种格式,标记写入图片格式自带的元数据机制,
图片本身不受影响,任何看图软件都能正常打开。

快速上手::

    from imgstamp_xw import embed_image, extract_stamp, verify

    embed_image("photo.png", "hello world")          # 原地标记
    extract_stamp("photo.png")                        # -> "hello world"
    verify("photo.png", "hello world")                # -> True
"""

from __future__ import annotations

from .api import (
    UnsupportedFormatError,
    embed_image,
    embed_many,
    extract_stamp,
    verify,
)

__version__ = "0.1.3"

__all__ = [
    "UnsupportedFormatError",
    "embed_image",
    "embed_many",
    "extract_stamp",
    "verify",
    "__version__",
]
