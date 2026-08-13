"""PNG 无损标记:在 IHDR chunk 之后插入 ``tEXt`` chunk。

tEXt 数据格式为 ``keyword \\x00 text``,keyword 使用 :data:`KEYWORD`,
text 直接存放原始字节,字节级无损,支持任意 UTF-8 字符串。
"""

from __future__ import annotations

import zlib

from .base import KEYWORD, BaseHandler, UnsupportedFormatError, registry

SIGNATURE = b"\x89PNG\r\n\x1a\n"
CHUNK_IHDR = b"IHDR"
CHUNK_TEXT = b"tEXt"

_CRC_MASK = 0xFFFFFFFF


def _chunk(chunk_type: bytes, data: bytes) -> bytes:
    """构造一个完整 PNG chunk(长度 + 类型 + 数据 + CRC)。"""
    return (
        len(data).to_bytes(4, "big")
        + chunk_type
        + data
        + (zlib.crc32(chunk_type + data) & _CRC_MASK).to_bytes(4, "big")
    )


def _iter_chunks(data: bytes):
    """解析 PNG chunk 序列,产出 ``(chunk_type, chunk_data, end_offset)``。"""
    offset = len(SIGNATURE)
    while offset < len(data):
        if offset + 8 > len(data):
            raise UnsupportedFormatError("PNG 文件不完整:chunk 头被截断")
        length = int.from_bytes(data[offset : offset + 4], "big")
        chunk_type = data[offset + 4 : offset + 8]
        payload_start = offset + 8
        payload_end = payload_start + length
        if payload_end + 4 > len(data):
            raise UnsupportedFormatError("PNG 文件不完整:chunk 数据被截断")
        yield chunk_type, data[payload_start:payload_end], payload_end + 4
        offset = payload_end + 4


class PNGHandler(BaseHandler):
    name = "png"
    magic = (SIGNATURE,)

    def embed(self, data: bytes, stamp: bytes) -> bytes:
        if not data.startswith(SIGNATURE):
            raise UnsupportedFormatError("不是有效的 PNG 文件")
        chunks = list(_iter_chunks(data))
        if not chunks or chunks[0][0] != CHUNK_IHDR:
            raise UnsupportedFormatError("PNG 缺少 IHDR 起始 chunk")

        rebuilt = bytearray(SIGNATURE)
        inserted = False
        for chunk_type, chunk_data, _end in chunks:
            # 覆盖旧的同名标记,避免重复 embed 时堆积
            if chunk_type == CHUNK_TEXT and chunk_data.startswith(KEYWORD + b"\x00"):
                continue
            rebuilt += _chunk(chunk_type, chunk_data)
            if not inserted and chunk_type == CHUNK_IHDR:
                rebuilt += _chunk(CHUNK_TEXT, KEYWORD + b"\x00" + stamp)
                inserted = True
        return bytes(rebuilt)

    def extract(self, data: bytes) -> bytes | None:
        if not data.startswith(SIGNATURE):
            raise UnsupportedFormatError("不是有效的 PNG 文件")
        for chunk_type, chunk_data, _end in _iter_chunks(data):
            if chunk_type == CHUNK_TEXT and chunk_data.startswith(KEYWORD + b"\x00"):
                return chunk_data[len(KEYWORD) + 1 :]
        return None


registry.register(PNGHandler())
