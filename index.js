// imgstamp-xw 公开 API:embedImage / embedMany / extractStamp / verify。
// 与 Python 版 imgstamp_xw 功能等价。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { UnsupportedFormatError } from "./formats/base.js";
import { gifHandler } from "./formats/gif.js";
import { jpegHandler } from "./formats/jpeg.js";
import { pngHandler } from "./formats/png.js";

export { UnsupportedFormatError };
export const VERSION = "0.1.1";

const HANDLERS = [pngHandler, jpegHandler, gifHandler];
const DECODER = new TextDecoder("utf-8", { fatal: true });

/** 按魔数探测图片格式;未命中抛 UnsupportedFormatError。 */
function detectFormat(buf) {
  for (const handler of HANDLERS) {
    for (const magic of handler.magic) {
      if (buf.length >= magic.length && buf.subarray(0, magic.length).equals(magic)) {
        return handler;
      }
    }
  }
  const head = buf.subarray(0, 8).toString("hex").replace(/(..)/g, "$1 ");
  throw new UnsupportedFormatError(
    `无法识别的图片格式(文件头: ${head}); 支持: ${HANDLERS.map((h) => h.name).join(", ")}`
  );
}

/** stamp 参数归一为 Buffer:string 按 UTF-8 编码,Uint8Array 原样。 */
function toBuffer(stamp) {
  return typeof stamp === "string" ? Buffer.from(stamp, "utf8") : Buffer.from(stamp);
}

/** 提取的字节按 UTF-8 严格解码;非法字节抛带说明的错误。 */
function decodeStamp(raw) {
  try {
    return DECODER.decode(raw);
  } catch {
    throw new Error("标记字节不是合法的 UTF-8 文本");
  }
}

/**
 * 在图片头部写入标记。
 * @param {string} path 输入图片路径
 * @param {string|Uint8Array} stamp 要写入的标记
 * @param {{output?: string}} [options] output 为输出路径,缺省原地修改
 * @returns {string} 实际写入的文件路径
 */
export function embedImage(path, stamp, { output } = {}) {
  const data = readFileSync(path);
  const handler = detectFormat(data);
  const newData = handler.embed(data, toBuffer(stamp));
  const dst = output ?? path;
  writeFileSync(dst, newData);
  return dst;
}

/**
 * 批量标记多张图片。
 * @param {Iterable<string>} paths 输入图片路径
 * @param {string|Uint8Array} stamp 要写入的标记
 * @param {{outputDir?: string}} [options] outputDir 输出目录,缺省全部原地修改
 * @returns {string[]} 实际写入的文件路径(按输入顺序)
 */
export function embedMany(paths, stamp, { outputDir } = {}) {
  if (outputDir !== undefined) {
    mkdirSync(outputDir, { recursive: true });
  }
  const results = [];
  for (const p of paths) {
    const output = outputDir === undefined ? undefined : join(outputDir, basename(p));
    results.push(embedImage(p, stamp, { output }));
  }
  return results;
}

/**
 * 从图片中提取此前写入的标记。
 * @returns {string|null} 标记字符串;无标记时返回 null
 */
export function extractStamp(path) {
  const data = readFileSync(path);
  const handler = detectFormat(data);
  const raw = handler.extract(data);
  return raw === null ? null : decodeStamp(raw);
}

/**
 * 校验图片中的标记是否与给定值一致。
 * 文件不是受支持的图片格式或读取失败时返回 false。
 * @param {string|Uint8Array} stamp 期望的标记
 */
export function verify(path, stamp) {
  try {
    const expected = typeof stamp === "string" ? stamp : decodeStamp(toBuffer(stamp));
    return extractStamp(path) === expected;
  } catch {
    return false;
  }
}
