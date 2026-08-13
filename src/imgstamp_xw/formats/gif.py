"""GIF 无损标记:在 GIF 头(文件头 + 逻辑屏幕描述符 + 全局颜色表)之后
插入 Comment Extension(``21 FE``)。

Comment Extension 内容为 ``KEYWORD \\x00 <原始字节>``,按 GIF 规范
以 255 字节为上限分块写入,前缀用于识别与覆盖旧标记。
"""

from __future__ import annotations

from .base import KEYWORD, BaseHandler, UnsupportedFormatError, registry

_MAGIC = (b"GIF87a", b"GIF89a")
_PREFIX = KEYWORD + b"\x00"

_EXT_INTRODUCER = 0x21
_COMMENT_LABEL = 0xFE
_IMAGE_DESCRIPTOR = 0x2C
_TRAILER = 0x3B


def _comment_extension(payload: bytes) -> bytes:
    """构造 Comment Extension,数据分块(每块 <=255 字节),0 长度子块终止。"""
    out = bytearray((_EXT_INTRODUCER, _COMMENT_LABEL))
    for i in range(0, len(payload), 255):
        chunk = payload[i : i + 255]
        out.append(len(chunk))
        out += chunk
    out.append(0)
    return bytes(out)


def _gif_header_end(data: bytes) -> int:
    """返回头部(文件头 + LSD + 全局颜色表)结束偏移。"""
    if len(data) < 13 or not data.startswith(_MAGIC):
        raise UnsupportedFormatError("不是有效的 GIF 文件")
    packed = data[10]
    gct_size = 3 * (2 << (packed & 0x07)) if packed & 0x80 else 0
    header_end = 13 + gct_size
    if header_end > len(data):
        raise UnsupportedFormatError("GIF 文件不完整: 全局颜色表被截断")
    return header_end


def _read_sub_blocks(data: bytes, offset: int) -> tuple[bytes, int]:
    """读取子块序列,返回 ``(拼接后的数据, 结束偏移)``。"""
    parts: list[bytes] = []
    while True:
        if offset >= len(data):
            raise UnsupportedFormatError("GIF 文件不完整: 子块被截断")
        size = data[offset]
        offset += 1
        if size == 0:
            return b"".join(parts), offset
        if offset + size > len(data):
            raise UnsupportedFormatError("GIF 文件不完整: 子块数据被截断")
        parts.append(data[offset : offset + size])
        offset += size


def _comment_payload(raw: bytes) -> bytes:
    """从 Comment Extension 原始字节中提取内容。"""
    _payload, _end = _read_sub_blocks(raw, 2)
    return _payload


def _iter_blocks(data: bytes):
    """从头部之后逐个产出 ``(kind, start, end)``。

    ``kind`` 为 ``"comment"``(Comment Extension)或 ``"other"``。
    trailer 及其后的原始字节作为 ``"other"`` 产出后结束。
    """
    offset = _gif_header_end(data)
    while offset < len(data):
        marker = data[offset]
        if marker == _TRAILER:
            yield "other", offset, len(data)
            return
        start = offset
        if marker == _EXT_INTRODUCER:
            offset += 1
            if offset >= len(data):
                raise UnsupportedFormatError("GIF 文件不完整: 扩展标签缺失")
            label = data[offset]
            offset += 1
            _payload, offset = _read_sub_blocks(data, offset)
            yield ("comment" if label == _COMMENT_LABEL else "other"), start, offset
        elif marker == _IMAGE_DESCRIPTOR:
            offset += 1 + 9  # 0x2C marker + 图像描述符体(9 字节)
            if offset > len(data):
                raise UnsupportedFormatError("GIF 文件不完整: 图像描述符被截断")
            packed = data[start + 9]
            if packed & 0x80:  # 局部颜色表
                offset += 3 * (2 << (packed & 0x07))
                if offset > len(data):
                    raise UnsupportedFormatError("GIF 文件不完整: 局部颜色表被截断")
            offset += 1  # LZW 最小码长
            _payload, offset = _read_sub_blocks(data, offset)
            yield "other", start, offset
        else:
            raise UnsupportedFormatError(
                f"GIF 解析失败: 未知块标记 0x{marker:02X} @ {offset}"
            )


class GIFHandler(BaseHandler):
    name = "gif"
    magic = _MAGIC

    def embed(self, data: bytes, stamp: bytes) -> bytes:
        if not data.startswith(_MAGIC):
            raise UnsupportedFormatError("不是有效的 GIF 文件")
        blocks = list(_iter_blocks(data))  # 先完整解析以校验结构
        out = bytearray(data[: _gif_header_end(data)])
        out += _comment_extension(_PREFIX + stamp)
        for kind, start, end in blocks:
            if kind == "comment" and _comment_payload(data[start:end]).startswith(_PREFIX):
                continue  # 覆盖旧的同名标记
            out += data[start:end]
        return bytes(out)

    def extract(self, data: bytes) -> bytes | None:
        if not data.startswith(_MAGIC):
            raise UnsupportedFormatError("不是有效的 GIF 文件")
        for kind, start, end in _iter_blocks(data):
            if kind == "comment":
                payload = _comment_payload(data[start:end])
                if payload.startswith(_PREFIX):
                    return payload[len(_PREFIX) :]
        return None


registry.register(GIFHandler())
