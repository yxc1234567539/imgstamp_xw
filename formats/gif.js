// GIF 无损标记:在文件头 + LSD + 全局颜色表之后插入 Comment Extension(21 FE)。

import { KEYWORD, UnsupportedFormatError } from "./base.js";

const PREFIX = Buffer.concat([Buffer.from(KEYWORD), Buffer.from([0])]);
const GIF_MAGIC = ["GIF87a", "GIF89a"];

/** 返回头部(文件头 + LSD + 全局颜色表)结束偏移。 */
function gifHeaderEnd(buf) {
  const head = buf.subarray(0, 6).toString("latin1");
  if (buf.length < 13 || !GIF_MAGIC.includes(head)) {
    throw new UnsupportedFormatError("不是有效的 GIF 文件");
  }
  const packed = buf[10];
  const gctSize = packed & 0x80 ? 3 * (2 << (packed & 0x07)) : 0;
  const headerEnd = 13 + gctSize;
  if (headerEnd > buf.length) {
    throw new UnsupportedFormatError("GIF 文件不完整: 全局颜色表被截断");
  }
  return headerEnd;
}

/** 读取子块序列,返回 { payload, offset }。 */
function readSubBlocks(buf, offset) {
  const parts = [];
  for (;;) {
    if (offset >= buf.length) {
      throw new UnsupportedFormatError("GIF 文件不完整: 子块被截断");
    }
    const size = buf[offset];
    offset += 1;
    if (size === 0) {
      return { payload: Buffer.concat(parts), offset };
    }
    if (offset + size > buf.length) {
      throw new UnsupportedFormatError("GIF 文件不完整: 子块数据被截断");
    }
    parts.push(buf.subarray(offset, offset + size));
    offset += size;
  }
}

/** 构造 Comment Extension,数据分块(每块 <=255 字节),0 长度子块终止。 */
function commentExtension(payload) {
  const parts = [Buffer.from([0x21, 0xfe])];
  for (let i = 0; i < payload.length; i += 255) {
    const c = Buffer.from(payload).subarray(i, i + 255);
    parts.push(Buffer.from([c.length]), c);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

/** 从 Comment Extension 原始字节中提取内容。 */
function commentPayload(raw) {
  return readSubBlocks(raw, 2).payload;
}

/** 从头部之后逐个产出 { kind, start, end };kind 为 comment 或 other。 */
function* iterBlocks(buf) {
  let offset = gifHeaderEnd(buf);
  while (offset < buf.length) {
    const marker = buf[offset];
    if (marker === 0x3b) {
      // trailer 及其后的原始字节原样保留
      yield { kind: "other", start: offset, end: buf.length };
      return;
    }
    const start = offset;
    if (marker === 0x21) {
      offset += 1;
      if (offset >= buf.length) {
        throw new UnsupportedFormatError("GIF 文件不完整: 扩展标签缺失");
      }
      const label = buf[offset];
      offset += 1;
      const next = readSubBlocks(buf, offset).offset;
      yield { kind: label === 0xfe ? "comment" : "other", start, end: next };
      offset = next;
    } else if (marker === 0x2c) {
      offset += 1 + 9; // 0x2C marker + 图像描述符体(9 字节)
      if (offset > buf.length) {
        throw new UnsupportedFormatError("GIF 文件不完整: 图像描述符被截断");
      }
      const packed = buf[start + 9];
      if (packed & 0x80) {
        // 局部颜色表
        offset += 3 * (2 << (packed & 0x07));
        if (offset > buf.length) {
          throw new UnsupportedFormatError("GIF 文件不完整: 局部颜色表被截断");
        }
      }
      offset += 1; // LZW 最小码长
      const next = readSubBlocks(buf, offset).offset;
      yield { kind: "other", start, end: next };
      offset = next;
    } else {
      throw new UnsupportedFormatError(
        `GIF 解析失败: 未知块标记 0x${marker.toString(16)} @ ${offset}`
      );
    }
  }
}

export const gifHandler = {
  name: "gif",
  magic: [Buffer.from("GIF87a"), Buffer.from("GIF89a")],

  embed(buf, stamp) {
    const headerEnd = gifHeaderEnd(buf); // 先校验头部
    const blocks = [...iterBlocks(buf)]; // 再完整解析以校验结构
    const newComment = commentExtension(Buffer.concat([PREFIX, Buffer.from(stamp)]));
    const parts = [buf.subarray(0, headerEnd), newComment];
    for (const blk of blocks) {
      if (blk.kind === "comment") {
        const payload = commentPayload(buf.subarray(blk.start, blk.end));
        if (payload.subarray(0, PREFIX.length).equals(PREFIX)) {
          continue; // 覆盖旧的同名标记
        }
      }
      parts.push(buf.subarray(blk.start, blk.end));
    }
    return Buffer.concat(parts);
  },

  extract(buf) {
    for (const blk of iterBlocks(buf)) {
      if (blk.kind === "comment") {
        const payload = commentPayload(buf.subarray(blk.start, blk.end));
        if (payload.subarray(0, PREFIX.length).equals(PREFIX)) {
          return Buffer.from(payload.subarray(PREFIX.length));
        }
      }
    }
    return null;
  },
};
