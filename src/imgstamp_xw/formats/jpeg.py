"""JPEG 无损标记:在 SOI(``FF D8``)之后插入 ``COM``(``FF FE``)注释段。

COM 段 payload 为 ``KEYWORD \\x00 <原始字节>``,前缀用于识别本库写入的
标记,重复 embed 时覆盖旧标记。熵编码数据(图像主体)原样保留。
"""

from __future__ import annotations

from .base import KEYWORD, BaseHandler, UnsupportedFormatError, registry

SOI = b"\xff\xd8"
COM_MARKER = 0xFE

_PREFIX = KEYWORD + b"\x00"

#: 无长度字段的 marker: TEM(0x01)、RST0-7(0xD0-0xD7)、SOI(0xD8)、EOI(0xD9)
_NO_LENGTH_MARKERS = (0x01,) + tuple(range(0xD0, 0xDA))


def _com_segment(payload: bytes) -> bytes:
    length = len(payload) + 2  # 长度字段包含自身 2 字节
    return bytes([0xFF, COM_MARKER]) + length.to_bytes(2, "big") + payload


def _iter_segments(data: bytes):
    """从 SOI 之后逐个产出 ``(marker, payload, start, end)``。

    最后产出 ``(None, None, start, end)`` 表示图像数据等尾部原始字节。
    """
    offset = 2
    while offset < len(data):
        if data[offset] != 0xFF:
            # 熵编码数据开始(图像主体),原样保留到结尾
            yield None, None, offset, len(data)
            return
        start = offset
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset >= len(data):
            yield None, None, start, len(data)
            return
        marker = data[offset]
        offset += 1
        if marker in _NO_LENGTH_MARKERS:
            yield marker, b"", start, offset
            if marker == 0xD9:  # EOI: 结尾
                yield None, None, offset, len(data)
                return
            continue
        if offset + 2 > len(data):
            raise UnsupportedFormatError("JPEG 文件不完整: 段长度字段被截断")
        length = int.from_bytes(data[offset : offset + 2], "big")
        payload_start = offset + 2
        payload_end = payload_start + (length - 2)
        if payload_end > len(data):
            raise UnsupportedFormatError("JPEG 文件不完整: 段数据被截断")
        yield marker, data[payload_start:payload_end], start, payload_end
        offset = payload_end


class JPEGHandler(BaseHandler):
    name = "jpeg"
    magic = (b"\xff\xd8\xff",)

    def embed(self, data: bytes, stamp: bytes) -> bytes:
        if not data.startswith(SOI):
            raise UnsupportedFormatError("不是有效的 JPEG 文件")
        segments = list(_iter_segments(data))  # 先完整解析以校验结构
        new_segment = _com_segment(_PREFIX + stamp)
        kept = bytearray()
        for marker, payload, start, end in segments:
            if marker == COM_MARKER and payload.startswith(_PREFIX):
                continue  # 覆盖旧的同名标记
            kept += data[start:end]
        return SOI + new_segment + bytes(kept)

    def extract(self, data: bytes) -> bytes | None:
        if not data.startswith(SOI):
            raise UnsupportedFormatError("不是有效的 JPEG 文件")
        for marker, payload, _start, _end in _iter_segments(data):
            if marker == COM_MARKER and payload.startswith(_PREFIX):
                return payload[len(_PREFIX) :]
        return None


registry.register(JPEGHandler())
