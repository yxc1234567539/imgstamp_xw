"""图片格式探测与处理器注册框架。

新增格式支持时,实现 :class:`BaseHandler` 子类并在模块级调用
``registry.register(handler)`` 即可,无需改动上层 API。
"""

from __future__ import annotations

import abc

#: PNG tEXt chunk 中使用的 keyword,同时作为 GIF 注释内容的前缀,
#: 用于区分「本库写入的标记」与图片自带的其他注释。
KEYWORD = b"imgstamp_xw"


class UnsupportedFormatError(ValueError):
    """数据不是受支持的图片格式,或格式内容无法解析。"""


class BaseHandler(abc.ABC):
    """单个图片格式的 embed / extract 处理器。"""

    #: 人类可读的格式名,如 ``"png"``。
    name: str = ""
    #: 用于探测的魔数序列(任一匹配即命中)。
    magic: tuple[bytes, ...] = ()

    @abc.abstractmethod
    def embed(self, data: bytes, stamp: bytes) -> bytes:
        """将 ``stamp`` 原始字节写入图片头部区域,返回新图片字节。"""

    @abc.abstractmethod
    def extract(self, data: bytes) -> bytes | None:
        """从图片中取出此前写入的原始字节;不存在时返回 ``None``。"""


class _Registry:
    def __init__(self) -> None:
        self._handlers: list[BaseHandler] = []

    def register(self, handler: BaseHandler) -> None:
        if not handler.name or not handler.magic:
            raise ValueError(f"handler 缺少 name 或 magic: {handler!r}")
        self._handlers.append(handler)

    def detect(self, data: bytes) -> BaseHandler:
        """按魔数探测数据的图片格式。"""
        for handler in self._handlers:
            if any(data.startswith(m) for m in handler.magic):
                return handler
        head = data[:8].hex(" ")
        raise UnsupportedFormatError(
            f"无法识别的图片格式(文件头: {head!r});"
            f" 支持: {', '.join(h.name for h in self._handlers)}"
        )


#: 全局处理器注册表。``formats`` 包导入时会自动注册各格式。
registry = _Registry()
