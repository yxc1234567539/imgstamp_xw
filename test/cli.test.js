// CLI 子命令测试。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { makePng } from "./helpers.js";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "cli.js");

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

function withTmp(fn) {
  return (t) => {
    const dir = mkdtempSync(join(tmpdir(), "imgstamp-cli-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    return fn(t, dir);
  };
}

test("cli embed/extract/verify 往返", withTmp((_t, dir) => {
  const p = join(dir, "a.png");
  writeFileSync(p, makePng());
  let r = run(["embed", "stamp123", p]);
  assert.equal(r.status, 0);
  r = run(["extract", p]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "stamp123");
  r = run(["verify", p, "stamp123"]);
  assert.equal(r.status, 0);
  r = run(["verify", p, "wrong"]);
  assert.equal(r.status, 1);
}));

test("cli embed -o 输出目录", withTmp((_t, dir) => {
  const p = join(dir, "a.png");
  writeFileSync(p, makePng());
  const outDir = join(dir, "out");
  const r = run(["embed", "s", p, "-o", outDir]);
  assert.equal(r.status, 0);
  const stamped = join(outDir, "a.png");
  const rr = run(["extract", stamped]);
  assert.equal(rr.stdout.trim(), "s");
}));

test("cli extract 无标记返回 1", withTmp((_t, dir) => {
  const p = join(dir, "a.png");
  writeFileSync(p, makePng());
  const r = run(["extract", p]);
  assert.equal(r.status, 1);
}));

test("cli embed 不支持格式返回 2", withTmp((_t, dir) => {
  const p = join(dir, "data.bin");
  writeFileSync(p, Buffer.from([0x00, 0x01, 0x02]));
  const r = run(["embed", "s", p]);
  assert.equal(r.status, 2);
}));

test("cli 未知命令返回 2", () => {
  const r = run(["frobnicate"]);
  assert.equal(r.status, 2);
});
