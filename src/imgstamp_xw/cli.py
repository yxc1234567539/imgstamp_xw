"""命令行入口:imgstamp_xw embed / extract / verify。"""

from __future__ import annotations

import argparse
import sys
from typing import Sequence

from .api import embed_many, extract_stamp, verify
from .formats.base import UnsupportedFormatError


def cmd_embed(args: argparse.Namespace) -> int:
    failures = 0
    for path in args.paths:
        try:
            embed_many([path], args.stamp, output_dir=args.output_dir)
        except (UnsupportedFormatError, OSError, ValueError) as exc:
            print(f"跳过 {path}: {exc}", file=sys.stderr)
            failures += 1
    ok = len(args.paths) - failures
    msg = f"已标记 {ok} 个文件"
    if args.output_dir is not None:
        msg += f", 输出到 {args.output_dir}"
    if failures:
        msg += f", 失败 {failures} 个"
        print(msg, file=sys.stderr)
        return 2
    print(msg)
    return 0


def cmd_extract(args: argparse.Namespace) -> int:
    stamp = extract_stamp(args.path)
    if stamp is None:
        print(f"{args.path}: 未找到标记")
        return 1
    print(stamp)
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    if verify(args.path, args.stamp):
        print("OK: 标记一致")
        return 0
    print("FAIL: 标记不存在或不一致")
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="imgstamp_xw",
        description="在图片文件头无损添加自定义字符串标记(支持 PNG / JPEG / GIF)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_embed = sub.add_parser("embed", help="写入标记(原地修改,或 -o 输出到目录)")
    p_embed.add_argument("stamp", metavar="STAMP", help="要写入的字符串")
    p_embed.add_argument("paths", nargs="+", metavar="PATH", help="图片文件(可多个)")
    p_embed.add_argument(
        "-o", "--output-dir", metavar="DIR", help="输出目录,默认原地修改"
    )
    p_embed.set_defaults(func=cmd_embed)

    p_extract = sub.add_parser("extract", help="提取图片中的标记")
    p_extract.add_argument("path", metavar="PATH", help="图片文件")
    p_extract.set_defaults(func=cmd_extract)

    p_verify = sub.add_parser("verify", help="校验标记是否存在且一致")
    p_verify.add_argument("path", metavar="PATH", help="图片文件")
    p_verify.add_argument("stamp", metavar="STAMP", help="期望的字符串")
    p_verify.set_defaults(func=cmd_verify)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except UnsupportedFormatError as exc:
        print(f"错误: {exc}", file=sys.stderr)
        return 2
    except (OSError, ValueError) as exc:
        print(f"错误: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
