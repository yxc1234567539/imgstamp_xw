"""CLI 子命令测试。"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from imgstamp_xw.cli import main

STAMP = "cli stamp"


def _make_image(tmp_path: Path) -> Path:
    img = Image.new("RGB", (32, 32), (10, 20, 30))
    path = tmp_path / "img.png"
    img.save(path, format="PNG")
    return path


def test_embed_extract_verify_roundtrip(tmp_path: Path, capsys) -> None:
    path = _make_image(tmp_path)
    assert main(["embed", STAMP, str(path)]) == 0
    capsys.readouterr()  # 清掉 embed 的输出
    assert main(["extract", str(path)]) == 0
    assert capsys.readouterr().out.strip() == STAMP
    assert main(["verify", str(path), STAMP]) == 0


def test_extract_no_stamp_returns_1(tmp_path: Path, capsys) -> None:
    path = _make_image(tmp_path)
    assert main(["extract", str(path)]) == 1


def test_verify_mismatch_returns_1(tmp_path: Path) -> None:
    path = _make_image(tmp_path)
    main(["embed", STAMP, str(path)])
    assert main(["verify", str(path), "other"]) == 1


def test_embed_unsupported_returns_2(tmp_path: Path, capsys) -> None:
    path = tmp_path / "data.bin"
    path.write_bytes(b"\x00\x01 not an image")
    assert main(["embed", STAMP, str(path)]) == 2
