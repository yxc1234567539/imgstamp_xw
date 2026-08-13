"""三种格式的嵌入/提取/校验测试(测试图片用 Pillow 现生成)。"""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image

from imgstamp_xw import (
    UnsupportedFormatError,
    embed_image,
    embed_many,
    extract_stamp,
    verify,
)

STAMP = "你好, world! \U0001F389 stamp"


def _make_image(tmp_path: Path, fmt: str, name: str = "img") -> Path:
    img = Image.new("RGB", (64, 48), (200, 30, 60))
    path = tmp_path / f"{name}.{fmt.lower()}"
    img.save(path, format=fmt)
    return path


@pytest.mark.parametrize("fmt", ["PNG", "JPEG", "GIF"])
def test_embed_extract_roundtrip(tmp_path: Path, fmt: str) -> None:
    path = _make_image(tmp_path, fmt)
    before = Image.open(path).convert("RGB").tobytes()

    embed_image(path, STAMP)

    # 图片仍可正常打开,且像素逐字节一致
    with Image.open(path) as im:
        im.load()
    assert im.convert("RGB").tobytes() == before

    # 提取与写入一致,校验通过
    assert extract_stamp(path) == STAMP
    assert verify(path, STAMP)


@pytest.mark.parametrize("fmt", ["PNG", "JPEG", "GIF"])
def test_embed_bytes_stamp(tmp_path: Path, fmt: str) -> None:
    path = _make_image(tmp_path, fmt)
    raw = b"\x01 hello \xe4\xbd\xa0"  # 合法 UTF-8 字节(含"你")
    embed_image(path, raw)
    # bytes 模式按原始字节存储;提取返回 UTF-8 解码结果
    assert extract_stamp(path) == raw.decode("utf-8")


@pytest.mark.parametrize("fmt", ["PNG", "JPEG", "GIF"])
def test_no_stamp_returns_none(tmp_path: Path, fmt: str) -> None:
    path = _make_image(tmp_path, fmt)
    assert extract_stamp(path) is None
    assert not verify(path, "anything")


@pytest.mark.parametrize("fmt", ["PNG", "JPEG", "GIF"])
def test_reembed_overwrites(tmp_path: Path, fmt: str) -> None:
    path = _make_image(tmp_path, fmt)
    embed_image(path, "first")
    embed_image(path, "second")
    assert extract_stamp(path) == "second"
    # 不应堆积多个标记
    data = path.read_bytes()
    assert data.count(b"first") == 0


def test_output_to_new_file(tmp_path: Path) -> None:
    path = _make_image(tmp_path, "PNG")
    original = path.read_bytes()
    out = tmp_path / "stamped.png"

    embed_image(path, STAMP, output=out)

    assert path.read_bytes() == original  # 原文件未动
    assert extract_stamp(out) == STAMP


def test_embed_many(tmp_path: Path) -> None:
    paths = [_make_image(tmp_path, "PNG", "a"), _make_image(tmp_path, "JPEG", "b")]
    results = embed_many(paths, STAMP, output_dir=tmp_path / "out")
    assert len(results) == 2
    for p in results:
        assert p.exists()
        assert extract_stamp(p) == STAMP
    # 原文件不受影响
    assert extract_stamp(paths[0]) is None


def test_unsupported_format(tmp_path: Path) -> None:
    path = tmp_path / "data.bin"
    path.write_bytes(b"\x00\x01\x02 not an image")
    with pytest.raises(UnsupportedFormatError):
        embed_image(path, STAMP)
    with pytest.raises(UnsupportedFormatError):
        extract_stamp(path)
    assert verify(path, STAMP) is False  # verify 对坏文件返回 False


def test_empty_stamp(tmp_path: Path) -> None:
    path = _make_image(tmp_path, "PNG")
    embed_image(path, "")
    assert extract_stamp(path) == ""


def test_long_stamp(tmp_path: Path) -> None:
    """GIF 分块边界:超过 255 字节的标记。"""
    path = _make_image(tmp_path, "GIF")
    long_stamp = "x" * 1000
    embed_image(path, long_stamp)
    assert extract_stamp(path) == long_stamp


def test_jpeg_stamp_too_long(tmp_path: Path) -> None:
    """JPEG COM 段 payload 上限 65533 字节,超出应明确报错。"""
    path = _make_image(tmp_path, "JPEG")
    with pytest.raises(ValueError, match="JPEG 标记过长"):
        embed_image(path, "x" * 65534)


def test_extract_invalid_utf8_raises(tmp_path: Path) -> None:
    """嵌入的字节不是合法 UTF-8 时,提取应抛清晰的 ValueError。"""
    path = _make_image(tmp_path, "PNG")
    embed_image(path, b"\xff\xfe invalid")  # 非 UTF-8 字节
    with pytest.raises(ValueError, match="UTF-8"):
        extract_stamp(path)
    assert verify(path, "anything") is False  # verify 返回 False 而非 traceback
