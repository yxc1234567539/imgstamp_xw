// PNG 无损标记:在 IHDR chunk 之后插入 tEXt chunk(数据为 keyword\0text)。

import { KEYWORD, UnsupportedFormatError } from "./base.js";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// --- CRC32(查表法,零依赖) ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** 计算 Buffer 的 CRC32(与 PNG 规范一致,标准多项式 0xEDB88320)。 */
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** 构造一个完整 PNG chunk(长度 + 类型 + 数据 + CRC)。 */
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "latin1"), data])), 8 + data.length);
  return out;
}

/** 解析 PNG chunk 序列,产出 { type, data }。 */
function* iterChunks(buf) {
  let offset = SIGNATURE.length;
  while (offset < buf.length) {
    if (offset + 8 > buf.length) {
      throw new UnsupportedFormatError("PNG 文件不完整:chunk 头被截断");
    }
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buf.length) {
      throw new UnsupportedFormatError("PNG 文件不完整:chunk 数据被截断");
    }
    yield { type, data: buf.subarray(start, end) };
    offset = end + 4;
  }
}

const TEXT_PREFIX = Buffer.concat([Buffer.from(KEYWORD), Buffer.from([0])]);

export const pngHandler = {
  name: "png",
  magic: [SIGNATURE],

  embed(buf, stamp) {
    if (!buf.subarray(0, SIGNATURE.length).equals(SIGNATURE)) {
      throw new UnsupportedFormatError("不是有效的 PNG 文件");
    }
    const chunks = [...iterChunks(buf)];
    if (chunks.length === 0 || chunks[0].type !== "IHDR") {
      throw new UnsupportedFormatError("PNG 缺少 IHDR 起始 chunk");
    }
    const textChunk = chunk("tEXt", Buffer.concat([TEXT_PREFIX, Buffer.from(stamp)]));
    const parts = [SIGNATURE];
    let inserted = false;
    for (const { type, data } of chunks) {
      // 覆盖旧的同名标记,避免重复 embed 时堆积
      if (type === "tEXt" && data.subarray(0, TEXT_PREFIX.length).equals(TEXT_PREFIX)) {
        continue;
      }
      parts.push(chunk(type, data));
      if (!inserted && type === "IHDR") {
        parts.push(textChunk);
        inserted = true;
      }
    }
    return Buffer.concat(parts);
  },

  extract(buf) {
    if (!buf.subarray(0, SIGNATURE.length).equals(SIGNATURE)) {
      throw new UnsupportedFormatError("不是有效的 PNG 文件");
    }
    for (const { type, data } of iterChunks(buf)) {
      if (type === "tEXt" && data.subarray(0, TEXT_PREFIX.length).equals(TEXT_PREFIX)) {
        return Buffer.from(data.subarray(TEXT_PREFIX.length));
      }
    }
    return null;
  },
};
