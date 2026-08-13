// 测试辅助:动态构造 PNG / GIF,内嵌 base64 JPEG(不提交二进制文件)。

import { deflateSync } from "node:zlib";

import { crc32 } from "../formats/png.js";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** 构造 1x1 RGBA 纯红 PNG。 */
export function makePng() {
  const raw = Buffer.from([0, 255, 0, 0, 255]); // filter 0 + RGBA
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 构造 1x1 GIF89a(2 色全局颜色表,红色像素)。 */
export function makeGif() {
  const header = Buffer.from("GIF89a", "latin1");
  const lsd = Buffer.alloc(7);
  lsd.writeUInt16LE(1, 0); // width
  lsd.writeUInt16LE(1, 2); // height
  lsd[4] = 0x80; // 有全局颜色表,2 色(6 字节)
  const gct = Buffer.from([255, 0, 0, 0, 0, 0]);
  const desc = Buffer.alloc(10);
  desc[0] = 0x2c;
  desc.writeUInt16LE(0, 1);
  desc.writeUInt16LE(0, 3);
  desc.writeUInt16LE(1, 5);
  desc.writeUInt16LE(1, 7);
  // LZW 最小码长 2 + 子块(长度 2,数据 0x44 0x01)+ 终止 0 + trailer 0x3b
  const img = Buffer.from([2, 2, 0x44, 0x01, 0, 0x3b]);
  return Buffer.concat([header, lsd, gct, desc, img]);
}

/** 1x1 白色 JPEG(Pillow 生成,base64 内嵌)。 */
export const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";

/** 校验 PNG 所有 chunk 的 CRC 均正确。 */
export function checkPngCrcs(buf) {
  let off = 8;
  while (off < buf.length) {
    const length = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + length);
    const expected = buf.readUInt32BE(off + 8 + length);
    if (crc32(Buffer.concat([type, data])) !== expected) {
      throw new Error(`PNG CRC mismatch @ ${off}`);
    }
    off += 12 + length;
  }
}
