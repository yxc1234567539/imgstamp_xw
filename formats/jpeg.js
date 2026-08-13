// JPEG 无损标记:在 SOI(FF D8)之后插入 COM(FF FE)注释段。

import { KEYWORD, UnsupportedFormatError } from "./base.js";

const SOI = Buffer.from([0xff, 0xd8]);
const COM_MARKER = 0xfe;
const PREFIX = Buffer.concat([Buffer.from(KEYWORD), Buffer.from([0])]);

// 无长度字段的 marker: TEM(0x01)、RST0-7(0xD0-0xD7)、SOI(0xD8)、EOI(0xD9)
const NO_LENGTH_MARKERS = new Set([0x01, ...[...Array(10).keys()].map((i) => 0xd0 + i)]);

function comSegment(payload) {
  const out = Buffer.alloc(4 + payload.length);
  out[0] = 0xff;
  out[1] = COM_MARKER;
  out.writeUInt16BE(payload.length + 2, 2); // 长度字段包含自身 2 字节
  Buffer.from(payload).copy(out, 4);
  return out;
}

/**
 * 从 SOI 之后逐个产出段;最后产出 marker 为 null 的尾部原始字节。
 * payload 为 null 表示尾部(熵编码数据等)。
 */
function* iterSegments(buf) {
  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) {
      yield { marker: null, payload: null, start: offset, end: buf.length };
      return;
    }
    const start = offset;
    while (offset < buf.length && buf[offset] === 0xff) offset++;
    if (offset >= buf.length) {
      yield { marker: null, payload: null, start, end: buf.length };
      return;
    }
    const marker = buf[offset];
    offset += 1;
    if (NO_LENGTH_MARKERS.has(marker)) {
      yield { marker, payload: Buffer.alloc(0), start, end: offset };
      if (marker === 0xd9) {
        // EOI: 结尾
        yield { marker: null, payload: null, start: offset, end: buf.length };
        return;
      }
      continue;
    }
    if (offset + 2 > buf.length) {
      throw new UnsupportedFormatError("JPEG 文件不完整: 段长度字段被截断");
    }
    const length = buf.readUInt16BE(offset);
    if (length < 2) {
      throw new UnsupportedFormatError(`JPEG 段长度非法: ${length}`);
    }
    const payloadStart = offset + 2;
    const payloadEnd = payloadStart + (length - 2);
    if (payloadEnd > buf.length) {
      throw new UnsupportedFormatError("JPEG 文件不完整: 段数据被截断");
    }
    yield { marker, payload: buf.subarray(payloadStart, payloadEnd), start, end: payloadEnd };
    offset = payloadEnd;
    if (marker === 0xda) {
      // SOS: 熵编码数据开始,原样保留到结尾
      yield { marker: null, payload: null, start: offset, end: buf.length };
      return;
    }
  }
}

export const jpegHandler = {
  name: "jpeg",
  magic: [Buffer.from([0xff, 0xd8, 0xff])],

  embed(buf, stamp) {
    if (!buf.subarray(0, SOI.length).equals(SOI)) {
      throw new UnsupportedFormatError("不是有效的 JPEG 文件");
    }
    if (PREFIX.length + stamp.length > 65533) {
      throw new RangeError(
        `JPEG 标记过长: COM 段 payload 最多 65533 字节,实际 ${stamp.length} 字节`
      );
    }
    const segments = [...iterSegments(buf)]; // 先完整解析以校验结构
    const newSegment = comSegment(Buffer.concat([PREFIX, Buffer.from(stamp)]));
    const parts = [SOI, newSegment];
    for (const seg of segments) {
      if (
        seg.marker === COM_MARKER &&
        seg.payload.subarray(0, PREFIX.length).equals(PREFIX)
      ) {
        continue; // 覆盖旧的同名标记
      }
      parts.push(buf.subarray(seg.start, seg.end));
    }
    return Buffer.concat(parts);
  },

  extract(buf) {
    if (!buf.subarray(0, SOI.length).equals(SOI)) {
      throw new UnsupportedFormatError("不是有效的 JPEG 文件");
    }
    for (const seg of iterSegments(buf)) {
      if (
        seg.marker === COM_MARKER &&
        seg.payload.subarray(0, PREFIX.length).equals(PREFIX)
      ) {
        return Buffer.from(seg.payload.subarray(PREFIX.length));
      }
    }
    return null;
  },
};
