"""公开 API:embed_image / embed_many / extract_stamp / verify。"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable, Union

from .formats.base import UnsupportedFormatError, registry

PathLike = Union[str, os.PathLike[str]]
Stamp = Union[str, bytes]


def _encode_stamp(stamp: Stamp) -> bytes:
    return stamp.encode("utf-8") if isinstance(stamp, str) else stamp


def _decode_stamp(raw: bytes) -> str:
    return raw.decode("utf-8")


def _load_handler(path: PathLike):
    data = Path(path).read_bytes()
    return registry.detect(data), data


def embed_image(
    path: PathLike,
    stamp: Stamp,
    output: PathLike | None = None,
) -> Path:
    """在图片头部写入标记。

    默认**原地修改**原文件;传入 ``output`` 时写入新文件并保留原文件。

    :param path: 输入图片路径
    :param stamp: 要写入的标记(字符串或原始字节)
    :param output: 输出路径,None 表示原地修改
    :return: 实际写入的文件路径
    :raises UnsupportedFormatError: 文件不是受支持的图片格式
    :raises OSError: 文件读取/写入失败
    """
    handler, data = _load_handler(path)
    new_data = handler.embed(data, _encode_stamp(stamp))
    dst = Path(output) if output is not None else Path(path)
    dst.write_bytes(new_data)
    return dst


def embed_many(
    paths: Iterable[PathLike],
    stamp: Stamp,
    output_dir: PathLike | None = None,
) -> list[Path]:
    """批量标记多张图片。

    默认全部**原地修改**;传入 ``output_dir`` 时,处理结果写入该目录
    (保留原文件名,重名文件会被覆盖)。

    :return: 实际写入的文件路径列表(按输入顺序)
    """
    results: list[Path] = []
    out_root = Path(output_dir) if output_dir is not None else None
    for path in paths:
        if out_root is not None:
            out_root.mkdir(parents=True, exist_ok=True)
            dst = out_root / Path(path).name
        else:
            dst = None
        results.append(embed_image(path, stamp, output=dst))
    return results


def extract_stamp(path: PathLike) -> str | None:
    """从图片中提取此前写入的标记。

    :return: 标记字符串;图片中没有标记时返回 ``None``
    :raises UnsupportedFormatError: 文件不是受支持的图片格式
    :raises ValueError: 标记字节不是合法的 UTF-8 文本
    """
    handler, data = _load_handler(path)
    raw = handler.extract(data)
    if raw is None:
        return None
    try:
        return _decode_stamp(raw)
    except UnicodeDecodeError as exc:
        raise ValueError("标记字节不是合法的 UTF-8 文本") from exc


def verify(path: PathLike, stamp: Stamp) -> bool:
    """校验图片中的标记是否与给定值一致。

    文件不是受支持的图片格式或读取失败时返回 ``False``(视为校验不通过)。
    """
    try:
        return extract_stamp(path) == (
            stamp if isinstance(stamp, str) else _decode_stamp(stamp)
        )
    except (UnsupportedFormatError, OSError, ValueError):
        return False


__all__ = [
    "UnsupportedFormatError",
    "embed_image",
    "embed_many",
    "extract_stamp",
    "verify",
]
