// 三格式嵌入/提取/校验测试(测试图片动态构造,不提交二进制)。

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  UnsupportedFormatError,
  embedImage,
  embedMany,
  extractStamp,
  verify,
} from "../index.js";
import { crc32 } from "../formats/png.js";
import {
  JPEG_B64,
  checkPngCrcs,
  makeGif,
  makeGifWithLct,
  makePng,
} from "./helpers.js";

const STAMP = "你好, world! \u{1F389} stamp";

const SAMPLES = [
  ["png", makePng],
  ["gif", makeGif],
  ["jpg", () => Buffer.from(JPEG_B64, "base64")],
];

function withTmp(fn) {
  return (t) => {
    const dir = mkdtempSync(join(tmpdir(), "imgstamp-test-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return fn(t, dir);
  };
}

for (const [ext, make] of SAMPLES) {
  test(`roundtrip ${ext}: 嵌入→提取一致,verify 通过`, withTmp((_t, dir) => {
    const p = join(dir, `a.${ext}`);
    writeFileSync(p, make());
    embedImage(p, STAMP);
    assert.equal(extractStamp(p), STAMP);
    assert.equal(verify(p, STAMP), true);
    assert.equal(verify(p, "other"), false);
    if (ext === "png") checkPngCrcs(readFileSync(p));
  }));

  test(`no stamp ${ext}: 无标记返回 null`, withTmp((_t, dir) => {
    const p = join(dir, `a.${ext}`);
    writeFileSync(p, make());
    assert.equal(extractStamp(p), null);
  }));

  test(`re-embed ${ext}: 重复嵌入覆盖旧标记`, withTmp((_t, dir) => {
    const p = join(dir, `a.${ext}`);
    writeFileSync(p, make());
    embedImage(p, "first");
    embedImage(p, "second");
    assert.equal(extractStamp(p), "second");
    assert.equal(readFileSync(p).includes(Buffer.from("first")), false);
  }));

  test(`bytes stamp ${ext}: Uint8Array 按原始字节存储`, withTmp((_t, dir) => {
    const p = join(dir, `a.${ext}`);
    writeFileSync(p, make());
    const raw = new Uint8Array([0x01, 0x20, 0x68, 0x65, 0x6c, 0x6c, 0x6f]); // "\x01 hello"
    embedImage(p, raw);
    assert.equal(extractStamp(p), "\u0001 hello");
  }));

  test(`empty stamp ${ext}`, withTmp((_t, dir) => {
    const p = join(dir, `a.${ext}`);
    writeFileSync(p, make());
    embedImage(p, "");
    assert.equal(extractStamp(p), "");
  }));
}

test("crc32 已知向量: crc32(\"123456789\") === 0xCBF43926", () => {
  // 标准 CRC-32 校验向量,防止查表实现多项式错误而"自证"通过
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("long stamp gif: 超过 255 字节(分块边界)", withTmp((_t, dir) => {
  const p = join(dir, "a.gif");
  writeFileSync(p, makeGif());
  const longStamp = "x".repeat(1000);
  embedImage(p, longStamp);
  assert.equal(extractStamp(p), longStamp);
}));

test("jpeg stamp too long: 超限抛 RangeError", withTmp((_t, dir) => {
  const p = join(dir, "a.jpg");
  writeFileSync(p, Buffer.from(JPEG_B64, "base64"));
  assert.throws(() => embedImage(p, "x".repeat(65534)), /JPEG 标记过长/);
}));

test("jpeg stamp 合法上限(65521 字节)成功", withTmp((_t, dir) => {
  const p = join(dir, "a.jpg");
  writeFileSync(p, Buffer.from(JPEG_B64, "base64"));
  const s = "x".repeat(65521); // 65533 - KEYWORD 前缀 12 字节(11 字符 + null)
  embedImage(p, s);
  assert.equal(extractStamp(p), s);
}));

test("gif 带局部颜色表: roundtrip 正常", withTmp((_t, dir) => {
  const p = join(dir, "a.gif");
  writeFileSync(p, makeGifWithLct());
  embedImage(p, STAMP);
  assert.equal(extractStamp(p), STAMP);
}));

test("invalid utf-8 bytes: 提取抛错,verify 返回 false", withTmp((_t, dir) => {
  const p = join(dir, "a.png");
  writeFileSync(p, makePng());
  embedImage(p, new Uint8Array([0xff, 0xfe]));
  assert.throws(() => extractStamp(p), /UTF-8/);
  assert.equal(verify(p, "anything"), false);
}));

test("output 新文件:原文件保持不变", withTmp((_t, dir) => {
  const p = join(dir, "a.png");
  writeFileSync(p, makePng());
  const original = readFileSync(p);
  const out = join(dir, "stamped.png");
  embedImage(p, STAMP, { output: out });
  assert.deepEqual(readFileSync(p), original);
  assert.equal(extractStamp(out), STAMP);
}));

test("embedMany: 批量标记到输出目录", withTmp((_t, dir) => {
  const a = join(dir, "a.png");
  const b = join(dir, "b.gif");
  writeFileSync(a, makePng());
  writeFileSync(b, makeGif());
  const results = embedMany([a, b], STAMP, { outputDir: join(dir, "out") });
  assert.equal(results.length, 2);
  for (const p of results) {
    assert.equal(extractStamp(p), STAMP);
  }
  assert.equal(extractStamp(a), null); // 原文件不受影响
}));

test("unsupported format: 抛 UnsupportedFormatError,verify false", withTmp((_t, dir) => {
  const p = join(dir, "data.bin");
  writeFileSync(p, Buffer.from([0x00, 0x01, 0x02]));
  assert.throws(() => embedImage(p, STAMP), UnsupportedFormatError);
  assert.throws(() => extractStamp(p), UnsupportedFormatError);
  assert.equal(verify(p, STAMP), false);
}));
